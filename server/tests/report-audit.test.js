import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,stat,utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateMove,emptyBoard} from '../../src/rules.js';
import {auditReport} from '../report-audit.js';
import {ReportStore,REPORT_TTL_MS} from '../report-store.js';
import {MatchEngine} from '../match-engine.js';

const placements=digits=>[...digits].map((digit,i)=>({row:7,col:7+i,digit:Number(digit)}));
function gameReport(digits='268',ruleset='legacy-0.2'){
  const move=placements(digits),calculated=validateMove(emptyBoard(),move);
  return {mode:'bot',ruleset,partial:false,initialBoard:emptyBoard(),initialScores:[0,0],
    events:[{type:'move',player:0,accepted:true,placements:move,points:calculated.points,
      equations:calculated.equations,breakdown:calculated.equationBreakdown}],
    finalBoard:calculated.board,finalScores:[calculated.points,0]};
}

test('independent audit replays positions, equations, bonus and score',()=>{
  const report=gameReport();
  assert.equal(auditReport(report).ok,true);
  report.events[0].points++;
  const issues=auditReport(report).issues.map(i=>i.type);
  assert.ok(issues.includes('points'));
  assert.ok(issues.includes('totals'));
  report.events[0].points--;
  report.events[0].equations=['279'];
  assert.ok(auditReport(report).issues.some(i=>i.type==='equations'));
  report.events[0].equations=['268'];
  report.events[0].breakdown[0].points++;
  assert.ok(auditReport(report).issues.some(i=>i.type==='bonuses'));
});

test('the same attempted legal move rejected by the game is flagged',()=>{
  const report=gameReport();
  report.events=[{type:'move',player:0,accepted:false,placements:placements('268')}];
  report.finalBoard=emptyBoard();report.finalScores=[0,0];
  assert.deepEqual(auditReport(report).issues.map(i=>i.type),['rejected-valid']);
});

test('62 alone is invalid, even when the game incorrectly marks it accepted',()=>{
  const report=gameReport();
  report.events=[{type:'move',player:0,accepted:true,placements:placements('62'),points:8,equations:['62']}];
  report.finalBoard=emptyBoard();
  for(const p of placements('62'))report.finalBoard[p.row][p.col]=p.digit;
  report.finalScores=[8,0];
  assert.ok(auditReport(report).issues.some(i=>i.type==='accepted-invalid'));
});

test('rulesets are kept separate so future powers do not mislabel the old game',()=>{
  const report=gameReport();
  const move=placements('24');
  report.events=[{type:'move',player:0,accepted:true,placements:move,points:12,equations:['24']}];
  report.finalBoard=emptyBoard();
  for(const p of move)report.finalBoard[p.row][p.col]=p.digit;
  report.finalScores=[12,0];
  assert.ok(auditReport(report).issues.some(i=>i.type==='accepted-invalid'));
  report.ruleset='classic-powers-roots';
  assert.equal(auditReport(report).ok,true);
});

test('strict rules reject 9724 as a whole while historical checks keep their original scoring',()=>{
  const placed=placements('9724');
  const board=emptyBoard();
  for(const p of placed)board[p.row][p.col]=p.digit;
  const report={mode:'bot',ruleset:'classic-powers-roots-strict',partial:false,
    initialBoard:emptyBoard(),initialScores:[0,0],
    events:[{type:'move',player:0,accepted:true,placements:placed,
      points:42,equations:['972','24']}],
    finalBoard:board,finalScores:[42,0]};
  assert.ok(auditReport(report).issues.some(i=>i.type==='accepted-invalid'));
  report.ruleset='classic-powers-roots';
  assert.equal(auditReport(report).ok,true,'the old stored game was valid under its own version');
});

test('linked reports score a new equation from the old result without changing strict history',()=>{
  const first=[...('5611')].map((digit,i)=>({row:7,col:5+i,digit:Number(digit)}));
  const second=[{row:7,col:9,digit:2},{row:7,col:10,digit:9}];
  const opening=validateMove(emptyBoard(),first);
  const continuation=validateMove(opening.board,second);
  assert.equal(opening.valid,true);
  assert.equal(continuation.valid,true);
  const report={mode:'bot',ruleset:'classic-powers-roots-linked',partial:false,
    initialBoard:emptyBoard(),initialScores:[0,0],
    events:[{type:'move',player:0,accepted:true,placements:first,
      points:opening.points,equations:opening.equations,breakdown:opening.equationBreakdown},
    {type:'move',player:1,accepted:true,placements:second,
      points:continuation.points,equations:continuation.equations,breakdown:continuation.equationBreakdown}],
    finalBoard:continuation.board,finalScores:[opening.points,continuation.points]};
  assert.equal(auditReport(report).ok,true,JSON.stringify(auditReport(report).issues));
  report.ruleset='classic-powers-roots-strict';
  assert.ok(auditReport(report).issues.some(i=>i.type==='accepted-invalid'));
  const invalid=gameReport('972','classic-powers-roots-linked');
  invalid.events.push({type:'move',player:1,accepted:true,
    placements:[{row:7,col:10,digit:4}],points:10,equations:['24']});
  invalid.finalBoard[7][10]=4;
  invalid.finalScores=[invalid.finalScores[0],10];
  assert.ok(auditReport(invalid).issues.some(i=>i.type==='accepted-invalid'));
});

test('a later-turn power is valid in the new ruleset, unlike an invalid one-turn row',()=>{
  const first=placements('112');
  const extra=[{row:7,col:10,digit:4}];
  const opening=validateMove(emptyBoard(),first);
  const continuation=validateMove(opening.board,extra);
  assert.equal(continuation.valid,true);
  const report={mode:'local',ruleset:'classic-powers-roots-linked-powers',partial:false,
    initialBoard:emptyBoard(),initialScores:[0,0],
    events:[{type:'move',player:0,accepted:true,placements:first,
      points:opening.points,equations:opening.equations,breakdown:opening.equationBreakdown},
    {type:'move',player:1,accepted:true,placements:extra,
      points:continuation.points,equations:continuation.equations,breakdown:continuation.equationBreakdown}],
    finalBoard:continuation.board,finalScores:[opening.points,continuation.points]};
  assert.equal(auditReport(report).ok,true,JSON.stringify(auditReport(report).issues));
  report.ruleset='classic-powers-roots-linked';
  assert.ok(auditReport(report).issues.some(i=>i.type==='accepted-invalid'),
    'older linked reports keep their historical stricter interpretation');
  const allTiles=placements('9724');
  const invalidBoard=emptyBoard();
  for(const p of allTiles)invalidBoard[p.row][p.col]=p.digit;
  const allAtOnce={mode:'bot',ruleset:'classic-powers-roots-linked-powers',partial:false,
    initialBoard:emptyBoard(),initialScores:[0,0],
    events:[{type:'move',player:0,accepted:true,placements:allTiles,
      points:42,equations:['972','24']}],
    finalBoard:invalidBoard,finalScores:[60,0]};
  assert.ok(auditReport(allAtOnce).issues.some(i=>i.type==='accepted-invalid'));
});

test('independent checker agrees with actual powers and roots and their bonus scores',()=>{
  for(const digits of ['24','42','273','749','8512','1248']){
    const report=gameReport(digits,'classic-powers-roots-strict');
    assert.equal(auditReport(report).ok,true,`${digits}: ${JSON.stringify(auditReport(report).issues)}`);
  }
});

test('the checker scores the central bonus exactly as the game does',()=>{
  const report=gameReport('268','classic-powers-roots-linked-powers');
  assert.equal(report.events[0].points,32);
  assert.equal(auditReport(report).ok,true);
});

test('the online server retains the whole game without private profiles or chat',()=>{
  const engine=new MatchEngine({rng:()=>.2});
  engine.connect('private-user-a');engine.connect('private-user-b');
  const match=engine.createMatch('private-user-a','private-user-b');
  match.players[0].rack=[2,6,8,3,1];
  assert.throws(()=>engine.place('private-user-a',[{row:7,col:7,rackIndex:0}]),/Nevznikl/);
  engine.place('private-user-a',[{row:7,col:7,rackIndex:0},
    {row:7,col:8,rackIndex:1},{row:7,col:9,rackIndex:2}]);
  const report=engine.reportFor('private-user-a',match.id);
  assert.deepEqual(report.events.map(e=>e.accepted),[false,true]);
  assert.equal(auditReport(report).ok,true);
  assert.ok(!JSON.stringify(report).includes('private-user'));
  assert.throws(()=>engine.reportFor('private-user-b','wrong-id'),/není dostupná/);
  assert.throws(()=>engine.reportFor('stranger',match.id),/není dostupná/);
});

test('records are private JSON with 24-hour expiry and no arbitrary client fields',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'arena-report-test-'));
  // Only test-specific disposable temporary files are removed.
  t.after(async()=>{const {rm}=await import('node:fs/promises');await rm(dir,{recursive:true,force:true});});
  let now=Date.now();
  const store=new ReportStore({directory:dir,clock:()=>now});
  const report=gameReport();
  report.email='never save this';
  const saved=await store.submit(report);
  const duplicates=await Promise.all([store.submit(report),store.submit(report)]);
  assert.ok(duplicates.every(item=>item.id===saved.id));
  const path=join(dir,saved.id+'.json');
  const raw=await readFile(path,'utf8');
  assert.ok(!raw.includes('never save this'));
  assert.equal((await stat(path)).mode&0o777,0o600);
  assert.equal((await store.list()).length,1);
  assert.equal((await store.get(saved.id)).result.ok,true);
  assert.equal(saved.expiresAt,now+REPORT_TTL_MS);
  const finals=await Promise.all(Array.from({length:3},()=>store.submit({...report,finished:true})));
  const final=finals[0];
  assert.ok(finals.every(item=>item.id===final.id),'concurrent duplicates share one stored record');
  assert.notEqual(final.id,saved.id,'the full end-of-game report is distinct from an earlier snapshot');
  await utimes(path,new Date(now),new Date(now));
  await utimes(join(dir,final.id+'.json'),new Date(now),new Date(now));
  now+=REPORT_TTL_MS+1000;
  assert.equal(await store.cleanup(),2);
  assert.equal((await store.list()).length,0);
  await assert.rejects(()=>store.get('../escape'),/Neplatné/);
});
