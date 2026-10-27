import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyBoard,validateMove} from '../src/rules.js';
import {ensureAudit,recordAudit,localReport} from '../src/report-client.js';
import {auditReport} from '../server/report-audit.js';
import {reportEligibility,addReportReceipt,REPORT_GAP_MS} from '../src/report-policy.js';

test('during the game: do not resend unchanged snapshot, allow changed ones after cooldown',()=>{
  const now=100000;
  let receipts=addReportReceipt([], 'partial-a',1,false,now);
  assert.equal(reportEligibility(receipts,1,false,now).kind,'sent');
  assert.equal(reportEligibility(receipts,2,false,now+1).kind,'cooldown');
  assert.equal(reportEligibility(receipts,2,false,now+REPORT_GAP_MS).kind,'ready');
  receipts=addReportReceipt(receipts,'partial-b',2,false,now+REPORT_GAP_MS);
  receipts=addReportReceipt(receipts,'partial-c',3,false,now+REPORT_GAP_MS*2);
  assert.equal(reportEligibility(receipts,4,false,now+REPORT_GAP_MS*3).kind,'limit');
  assert.equal(reportEligibility(receipts,4,true,now+REPORT_GAP_MS*2).kind,'ready',
    'final report is never blocked by partial report quotas or cooldown');
  receipts=addReportReceipt(receipts,'final-d',4,true,now+REPORT_GAP_MS*2);
  assert.equal(reportEligibility(receipts,4,true,now+REPORT_GAP_MS*4).kind,'sent');
});

test('offline report has the entire ordered turn history without chat or personal details',()=>{
  const game={turns:0,board:emptyBoard(),players:[{score:0},{score:0}],
    chat:[{player:0,text:'Do not upload'}],nickname:'Sensitive'};
  ensureAudit(game);
  const invalid=[{row:7,col:7,digit:6},{row:7,col:8,digit:2}];
  recordAudit(game,{type:'move',player:0,accepted:false,placements:invalid});
  const valid=[{row:7,col:7,digit:2},{row:7,col:8,digit:6},{row:7,col:9,digit:8}];
  const checked=validateMove(game.board,valid);
  assert.equal(checked.valid,true);
  recordAudit(game,{type:'move',player:0,accepted:true,placements:valid,points:checked.points,
    equations:checked.equations,breakdown:checked.equationBreakdown});
  game.board=checked.board;game.players[0].score=checked.points;
  recordAudit(game,{type:'pass',player:1});
  const report=localReport(game,'bot');
  assert.deepEqual(report.events.map(e=>e.type),['move','move','pass']);
  assert.equal(report.events[0].accepted,false);
  assert.equal(auditReport(report).ok,true);
  assert.ok(!JSON.stringify(report).includes('Do not upload'));
  assert.ok(!JSON.stringify(report).includes('Sensitive'));
});

test('already started old games are explicitly marked incomplete',()=>{
  const game={turns:1,board:emptyBoard(),players:[{score:10},{score:3}]};
  ensureAudit(game);
  assert.equal(localReport(game,'local').partial,true);
});

test('changing the ruleset starts a partial audit without resetting saved scores',()=>{
  const game={turns:3,board:emptyBoard(),players:[{score:20},{score:4}],
    audit:{ruleset:'legacy-0.2',partial:false,initialBoard:emptyBoard(),
      initialScores:[0,0],events:[{type:'pass',player:0}]}};
  ensureAudit(game);
  assert.equal(game.audit.ruleset,'classic-powers-roots');
  assert.equal(game.audit.partial,true);
  assert.deepEqual(game.audit.initialScores,[20,4]);
  assert.deepEqual(game.audit.events,[]);
});
