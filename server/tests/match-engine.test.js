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
  assert.throws(()=>game.place('a',[{row:7,col:7,rackIndex:100}]),/výběr čísla/);
  assert.throws(()=>game.place('a',[{row:7,col:7,rackIndex:0},{row:7,col:8,rackIndex:0}]),/výběr čísla/);
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
test('online reports accept a few partial snapshots and exactly one final report',async()=>{
  const {game,setTime,out}=rig();
  game.connect('a');game.connect('b');
  const match=game.createMatch('a','b');
  let saved=0;
  const save=async()=>({id:'audit-'+(++saved)});
  game.pass('a');
  const first=await game.submitReport('a',match.id,save);
  const repeated=await game.submitReport('a',match.id,save);
  assert.equal(repeated.id,first.id);
  assert.equal(saved,1);
  assert.equal(game.reportStatus('a').kind,'sent');
  setTime(100000+120000);
  match.deadline=100000+120000+60000;
  game.pass('b');
  await game.submitReport('a',match.id,save);
  setTime(100000+240000);
  match.deadline=100000+240000+60000;
  game.pass('a');
  await game.submitReport('a',match.id,save);
  game.pass('b');
  assert.equal(game.reportStatus('a').kind,'limit');
  game.pass('a');game.pass('b');
  assert.equal(match.finished,true);
  assert.equal(game.reportStatus('a').kind,'ready');
  const final=await game.submitReport('a',match.id,save);
  assert.equal((await game.submitReport('a',match.id,save)).id,final.id);
  assert.equal(saved,4);
  assert.equal(game.reportStatus('a').kind,'sent');
  assert.ok(out.some(event=>event.uid==='a'&&event.type==='match-state'&&event.reportStatus?.kind==='sent'));
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
  game.connect('f');game.connect('g');
  assert.equal(game.createMatch('f','g').seconds,60);
});

test('accepted online move syncs complete previous equation squares to both players',()=>{
  const {game,out}=rig();
  game.connect('a');game.connect('b');
  const match=game.createMatch('a','b',60);
  match.players[0].rack=[2,6,8,1,4];
  game.place('a',[
    {row:7,col:6,rackIndex:0},
    {row:7,col:7,rackIndex:1},
    {row:7,col:8,rackIndex:2}
  ]);
  assert.deepEqual(match.lastMove.equations,['268']);
  assert.deepEqual(match.lastMove.placed,[
    {row:7,col:6},{row:7,col:7},{row:7,col:8}
  ]);
  assert.deepEqual(match.lastMove.cells,[
    {row:7,col:6},{row:7,col:7},{row:7,col:8}
  ]);
  const latest=out.filter(x=>x.type==='match-state'&&x.lastMove);
  assert.equal(latest.length,2);
  assert.deepEqual(latest.map(x=>x.uid).sort(),['a','b']);
  assert.ok(latest.every(x=>x.lastMove.points>0));
  assert.ok(latest.every(x=>!('rack' in x.lastMove)));
});

test('online server accepts a square root and reports it under the updated rules',()=>{
  const {game,out}=rig();
  game.connect('a');game.connect('b');
  const match=game.createMatch('a','b',60);
  match.players[0].rack=[4,2,8,1,9];
  game.place('a',[{row:7,col:7,rackIndex:0},{row:7,col:8,rackIndex:1}]);
  assert.deepEqual(match.lastMove.equations,['42']);
  assert.equal(match.lastMove.equationBreakdown[0].equation,'√4 = 2');
  assert.deepEqual(match.lastMove.cells,[{row:7,col:7},{row:7,col:8}]);
  assert.ok(out.filter(x=>x.type==='match-state'&&x.turns===1).every(x=>x.lastMove.points===match.lastMove.points));
  assert.equal(game.reportFor('a',match.id).ruleset,'classic-powers-roots-linked-powers');
});

test('online scorecards receive safe nicknames and recent move history after reconnect',()=>{
  const events=[];
  const game=new MatchEngine({send:(uid,msg)=>events.push({uid,...msg}),
    rng:()=>.3,clock:()=>100_000,getName:uid=>uid==='alice'?'Alice':'Bob'});
  game.connect('alice');game.connect('bob');
  const match=game.createMatch('alice','bob',60);
  match.players[0].rack=[2,6,8,1,4];
  game.place('alice',[
    {row:7,col:6,rackIndex:0},{row:7,col:7,rackIndex:1},
    {row:7,col:8,rackIndex:2}
  ]);
  const states=events.filter(event=>event.type==='match-state'&&event.turns===1);
  assert.equal(states.length,2);
  for(const state of states){
    assert.deepEqual(state.players.map(player=>player.nickname),['Alice','Bob']);
    assert.equal(state.history.length,1);
    assert.deepEqual(state.history[0].equations,['268']);
    assert.ok(!state.players.some(player=>'uid' in player||'rack' in player));
    assert.equal(state.deadline,160_000);
  }
  events.length=0;
  game.sync('alice');
  assert.equal(events[0].history.length,1);
  assert.deepEqual(events[0].lastMove.equations,['268']);
});


test('active match resume summary is private and disappears after game finishes',()=>{
  const {game,setTime}=rig();
  game.connect('a');game.connect('b');game.connect('c');
  const match=game.createMatch('a','b',60);
  assert.equal(game.activeMatchSummary('c'),null);
  const before=game.activeMatchSummary('a');
  assert.equal(before.matchId,match.id);
  assert.equal(before.mySide,0);
  assert.equal(before.turn,0);
  assert.equal(before.seconds,60);
  assert.deepEqual(before.players.map(x=>x.score),[0,0]);
  assert.ok(before.players.every(x=>!('uid' in x)&&!('rack' in x)));
  game.disconnect('a');
  assert.equal(game.activeMatchSummary('a').matchId,match.id,
    'a dropped socket may still resume the game within the grace period');
  setTime(130_000);
  game.connect('a');
  assert.equal(game.matchOf('a').finished,false);
  assert.equal(game.activeMatchSummary('a').matchId,match.id);
  game.finish(match,'completed');
  assert.equal(game.activeMatchSummary('a'),null);
  assert.equal(game.activeMatchSummary('b'),null);
});


test('resigning an active game immediately awards the win and notifies both players',()=>{
  const {game,out,results}=rig();
  game.connect('a');game.connect('b');
  const match=game.createMatch('a','b',60);
  match.players[0].score=75;match.players[1].score=14;
  game.resign('a');
  assert.equal(match.finished,true);
  assert.equal(match.reason,'resigned');
  assert.equal(match.winner,'b');
  assert.equal(results.length,1);
  assert.equal(results[0].winner,'b');
  assert.deepEqual(out.filter(e=>e.type==='match-end').map(e=>e.uid).sort(),['a','b']);
  assert.deepEqual(out.filter(e=>e.type==='match-state'&&e.finished).map(e=>e.uid).sort(),['a','b']);
  assert.throws(()=>game.resign('a'),/rozehraná/);
});

test('rematch requires acceptance from both players, preserves time and resets score',()=>{
  const {game,out}=rig();
  game.connect('a');game.connect('b');
  const old=game.createMatch('a','b',30);
  game.finish(old,'completed');
  assert.equal(game.rematch('a',true),undefined);
  assert.equal(game.matchOf('a'),old);
  assert.equal(old.rematchVotes.size,1);
  const notices=out.filter(e=>e.type==='rematch-status'&&e.status==='requested');
  assert.deepEqual(notices.map(e=>e.uid).sort(),['a','b']);
  game.rematch('b',true);
  const next=game.matchOf('a');
  assert.notEqual(next,old);
  assert.equal(next,game.matchOf('b'));
  assert.equal(next.seconds,30);
  assert.equal(next.players[0].uid,'b');
  assert.deepEqual(next.players.map(p=>p.score),[0,0]);
  assert.equal(next.finished,false);
  assert.throws(()=>game.rematch('a',true),/dostupná/);
});

test('decline and disconnect revoke pending rematch without creating a game',()=>{
  const {game,out}=rig();
  game.connect('a');game.connect('b');
  const old=game.createMatch('a','b');
  game.finish(old,'completed');
  game.rematch('a',true);
  game.rematch('b',false);
  assert.equal(old.rematchVotes.size,0);
  assert.ok(out.some(e=>e.type==='rematch-status'&&e.status==='declined'&&e.uid==='a'));
  game.rematch('a',true);
  game.disconnect('a');
  assert.equal(old.rematchVotes.size,0);
  assert.equal(game.matchOf('b'),old);
  assert.throws(()=>game.rematch('b',true),/připojen/);
});

test('abandoned games cannot create a new match by rematch',()=>{
  const {game,setTime}=rig();
  game.connect('a');game.connect('b');
  game.createMatch('a','b');
  game.disconnect('a');game.disconnect('b');
  setTime(161_000);game.tick();
  assert.equal(game.matchOf('a').reason,'abandoned');
  game.connect('a');game.connect('b');
  assert.throws(()=>game.rematch('a',true),/dostupná/);
});


test('per-example point breakdown is delivered unchanged to both online players',()=>{
  const {game,out}=rig();
  game.connect('a');game.connect('b');
  const match=game.createMatch('a','b',60);
  match.players[0].rack=[2,6,8,1,4];
  game.place('a',[
    {row:7,col:6,rackIndex:0},
    {row:7,col:7,rackIndex:1},
    {row:7,col:8,rackIndex:2}
  ]);
  const reports=out.filter(msg=>msg.type==='match-state'&&msg.turns===1);
  assert.equal(reports.length,2);
  const details=match.lastMove.equationBreakdown;
  assert.equal(details.length,1);
  assert.equal(details[0].equation,'2 + 6 = 8');
  assert.equal(details.reduce((sum,d)=>sum+d.points,0),match.lastMove.points);
  assert.ok(details.every(x=>x.base*x.multiplier===x.points));
  assert.deepEqual(reports[0].lastMove.equationBreakdown,details);
  assert.deepEqual(reports[1].lastMove.equationBreakdown,details);
  assert.equal(match.players[0].score,details[0].points);
});
