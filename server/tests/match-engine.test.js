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
  game.joinRandom('a',30); game.joinRandom('b',60);
  const a=game.matchOf('a'),b=game.matchOf('b');
  assert.equal(a,b);
  assert.equal(a.seconds,30);
  assert.equal(a.players[0].rack.length,5);
  const personal=out.filter(x=>x.type==='match-state');
  assert.equal(personal.at(-2).rack.length,5);
  assert.equal(personal.at(-1).rack.length,5);
  assert.ok(!JSON.stringify(personal.at(-1)).includes('"bag":'));
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
