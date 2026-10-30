import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../store.js';
import { MatchEngine } from '../match-engine.js';
import { FriendChallenges } from '../friend-challenges.js';

function setup(){
  const store=openStore(':memory:');
  for(const uid of ['alice','bob','charlie'])store.ensure(uid);
  store.request('alice',store.get('bob').id);
  store.respond('bob',store.get('alice').id,true);
  let now=100_000;
  const messages=[];
  const push=(uid,message)=>messages.push({uid,...message});
  const engine=new MatchEngine({clock:()=>now,send:push});
  engine.connect('alice');
  engine.connect('bob');
  engine.connect('charlie');
  const challenges=new FriendChallenges({
    engine,clock:()=>now,push,
    resolveFriend:(uid,id)=>store.resolveFriend(uid,id),
    getProfile:uid=>store.get(uid)
  });
  return {store,engine,challenges,messages,setTime:time=>{now=time;}};
}

test('only mutually accepted friends may challenge one another',()=>{
  const s=setup();
  try{
    assert.throws(()=>s.challenges.issue('charlie',s.store.get('bob').id,60),/přáteli/);
    assert.throws(()=>s.challenges.issue('alice',s.store.get('charlie').id,60),/přáteli/);
    assert.equal(s.challenges.pending('bob'),null);
  }finally{s.store.close();}
});

test('direct challenge reaches intended friend and acceptance joins same game',()=>{
  const s=setup();
  try{
    const challengeId=s.challenges.issue('alice',s.store.get('bob').id,60);
    const pending=s.challenges.pending('bob');
    assert.equal(pending.id,challengeId);
    assert.equal(pending.from.nickname,s.store.get('alice').nickname);
    assert.equal(pending.seconds,60);
    assert.equal('code' in pending,false,'private code cannot leak through polling');
    assert.equal('uid' in pending.from,false,'private Google uid cannot leak');
    assert.equal(s.challenges.pending('charlie'),null);
    assert.ok(s.messages.some(x=>x.uid==='bob'&&x.type==='friend-challenge-available'));
    assert.throws(()=>s.challenges.respond('charlie',challengeId,true),/neplatí/);
    const accepted=s.challenges.respond('bob',challengeId,true);
    assert.equal(typeof accepted.code,'string');
    s.engine.joinInvite('bob',accepted.code);
    assert.equal(s.engine.matchOf('alice'),s.engine.matchOf('bob'));
    assert.equal(s.engine.matchOf('bob').seconds,60);
    assert.equal(s.challenges.pending('bob'),null);
    assert.ok(s.messages.some(x=>x.uid==='alice'&&x.type==='friend-challenge-response'&&x.accepted===true));
  }finally{s.store.close();}
});

test('friend may decline, expired and disconnected offers do not appear',()=>{
  const s=setup();
  try{
    const id=s.challenges.issue('alice',s.store.get('bob').id,30);
    const declined=s.challenges.respond('bob',id,false);
    assert.equal(declined.code,null);
    assert.equal(s.challenges.pending('bob'),null);
    s.setTime(120_000);
    s.challenges.issue('alice',s.store.get('bob').id,90);
    s.engine.disconnect('alice');
    assert.equal(s.challenges.pending('bob'),null);
  }finally{s.store.close();}
});

test('challenge offers expire and senders are rate limited',()=>{
  const s=setup();
  try{
    s.challenges.issue('alice',s.store.get('bob').id);
    assert.throws(()=>s.challenges.issue('alice',s.store.get('bob').id),/za několik sekund/);
    s.setTime(100_000+10*60_000+1);
    s.challenges.tick();
    assert.equal(s.challenges.pending('bob'),null);
    assert.equal(s.engine.matchOf('alice'),null);
  }finally{s.store.close();}
});

test('deleting an account forgets its temporary friend challenge',()=>{
  const s=setup();
  try{
    s.challenges.issue('alice',s.store.get('bob').id);
    assert.ok(s.challenges.pending('bob'));
    s.challenges.forget('alice');
    assert.equal(s.challenges.pending('bob'),null);
    assert.equal(s.challenges.lastSent.has('alice'),false);
  }finally{s.store.close();}
});
