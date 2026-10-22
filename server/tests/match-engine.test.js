import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchEngine } from '../match-engine.js';

function rig(){
  let now=100_000;const out=[];
  const results=[];
  const game=new MatchEngine({clock:()=>now,send:(uid,msg)=>out.push({uid,...msg}),onResult:result=>results.push(result),rng:()=>.3});
  return {game,out,results,setTime:value=>{now=value;}};
}
test('matchmaking pairs two different players, sends only personal racks',()=>{
  const {game,out}=rig();
  game.connect('a');game.connect('b');
  game.joinRandom('a',30); game.joinRandom('b',30);
  const a=game.matchOf('a'),b=game.matchOf('b');
  assert.equal(a,b);
  assert.equal(a.seconds,30);
  assert.equal(a.players[0].rack.length,5);
  const personal=out.filter(x=>x.type==='match-state');
  assert.equal(personal.at(-2).rack.length,5);
  assert.equal(personal.at(-1).rack.length,5);
  assert.ok(!JSON.stringify(personal.at(-1)).includes('"bag":'));
  assert.ok(!JSON.stringify(personal.at(-1).players).includes('"uid":'), 'opponent Google ID must stay private');
});
test('invalid rack indices and turns are rejected server-side',()=>{
  const {game}=rig();
  game.connect('a');game.connect('b');game.createMatch('a','b');
  assert.throws(()=>game.place('b',[{row:7,col:7,rackIndex:0}]),/na tahu/);
  assert.throws(()=>game.place('a',[{row:7,col:7,rackIndex:100}]),/výběr kamene/);
  assert.throws(()=>game.place('a',[{row:7,col:7,rackIndex:0},{row:7,col:8,rackIndex:0}]),/výběr kamene/);
  assert.equal(game.matchOf('a').players[0].score,0);
});
test('six consecutive passes finish and update statistics exactly once',()=>{
  const {game,results}=rig();
  game.connect('a');game.connect('b');game.createMatch('a','b');
  for(let i=0;i<6;i++)game.pass(i%2?'b':'a');
  assert.equal(game.matchOf('a').finished,true);
  assert.equal(results.length,1);
  assert.equal(results[0].winner,null);
  game.tick();
  assert.equal(results.length,1);
});
test('invite codes are time-limited and never permit self play',()=>{
  const {game,setTime}=rig();
  game.connect('a');game.connect('b');
  const code=game.makeInvite('a');
  assert.throws(()=>game.joinInvite('a',code),/sám/);
  setTime(100_000+10*60_000+1);
  assert.throws(()=>game.joinInvite('b',code),/neplatí/);
});
test('disconnect reconnect keeps match; forfeiting after grace finishes',()=>{
  const {game,results,setTime}=rig();
  game.connect('a');game.connect('b');game.createMatch('a','b');
  game.disconnect('b');
  setTime(130_000);game.connect('b');
  assert.equal(game.matchOf('a').finished,false);
  game.disconnect('b');
  setTime(191_000);game.tick();
  assert.equal(game.matchOf('a').finished,true);
  assert.equal(results[0].winner,'a');
});
test('chat messages are transient and have a length and speed limit',()=>{
  const {game,out,setTime}=rig();
  game.connect('a');game.connect('b');game.createMatch('a','b');
  game.chat('a','Ahoj');
  assert.ok(out.find(x=>x.type==='chat'&&x.uid==='b'&&x.text==='Ahoj'));
  assert.throws(()=>game.chat('a','znovu'),/rychle/);
  setTime(102_000);
  assert.throws(()=>game.chat('a','x'.repeat(161)),/Neplatná/);
  assert.equal(game.matchOf('a').chat,undefined);
});

test('waiting count includes only connected unmatched players and decreases on cancellation',()=>{
  const {game}=rig();
  game.connect('a');game.connect('b');game.connect('c');
  assert.equal(game.waitingCount(),0);
  game.joinRandom('a',90);
  assert.equal(game.waitingCount(),1);
  game.joinRandom('b',90);
  assert.equal(game.waitingCount(),0); // a and b matched, neither is waiting
  game.joinRandom('c',90);
  assert.equal(game.waitingCount(),1);
  game.leaveQueue('c');
  assert.equal(game.waitingCount(),0);
  game.joinRandom('c',90);
  game.disconnect('c');
  assert.equal(game.waitingCount(),0);
});

test('players may queue and be matched again after a completed game',()=>{
  const {game}=rig();
  game.connect('a');game.connect('b');game.connect('c');game.connect('d');
  game.joinRandom('a');game.joinRandom('b');
  const match=game.matchOf('a');
  game.finish(match,'completed');
  game.joinRandom('a');
  assert.equal(game.waitingCount(),1);
  game.joinRandom('c');
  assert.equal(game.waitingCount(),0);
  assert.equal(game.matchOf('a'),game.matchOf('c'));
  game.finish(game.matchOf('a'),'completed');
  game.joinRandom('d');game.joinRandom('b');
  assert.equal(game.matchOf('b'),game.matchOf('d'));
});

test('random matchmaking keeps selected turn times compatible',()=>{
  const {game,out}=rig();
  game.connect('thirty');game.connect('sixty');game.connect('sixty2');game.connect('thirty2');
  game.joinRandom('thirty',30);
  game.joinRandom('sixty',60);
  assert.equal(game.waitingCount(),2);
  assert.equal(game.matchOf('thirty'),null);
  game.joinRandom('sixty2',60);
  assert.equal(game.matchOf('sixty').seconds,60);
  assert.equal(game.matchOf('sixty'),game.matchOf('sixty2'));
  assert.equal(game.waitingCount(),1);
  game.joinRandom('thirty2',30);
  assert.equal(game.matchOf('thirty').seconds,30);
  assert.equal(game.matchOf('thirty'),game.matchOf('thirty2'));
  assert.ok(out.some(x=>x.type==='match-state'&&x.uid==='sixty2'&&x.seconds===60));
});

test('private invite uses creator turn limit, and invalid time defaults to 60 sec',()=>{
  const {game}=rig();
  game.connect('a');game.connect('b');game.connect('c');
  const code=game.makeInvite('a',30);
  game.joinInvite('b',code);
  assert.equal(game.matchOf('a').seconds,30);
  game.joinRandom('c',500);
  assert.equal(game.queue[0].seconds,60);
});

test('all server online match variants default to 60 seconds',()=>{
  const {game}=rig();
  for(const uid of ['a','b','c','d','e'])game.connect(uid);
  game.joinRandom('a');
  assert.equal(game.queue[0].seconds,60);
  game.joinRandom('b');
  assert.equal(game.matchOf('a').seconds,60);
  const code=game.makeInvite('c');
  game.joinInvite('d',code);
  assert.equal(game.matchOf('c').seconds,60);
  assert.equal(game.createMatch('a','e').seconds,60);
});
