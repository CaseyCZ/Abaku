import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyBoard,validateMove} from '../src/rules.js';
import {ensureAudit,recordAudit,localReport} from '../src/report-client.js';
import {auditReport} from '../server/report-audit.js';

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
