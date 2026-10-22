import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scoringSteps} from '../src/score-recap.js';
import {emptyBoard,validateMove} from '../src/rules.js';

test('accepted examples carry precise scores and bonus multipliers',()=>{
  const board=emptyBoard();
  const placements=[
    {row:7,col:6,digit:2},{row:7,col:7,digit:6},{row:7,col:8,digit:8}
  ];
  const checked=validateMove(board,placements);
  assert.equal(checked.valid,true,checked.reason);
  assert.ok(checked.equationBreakdown.length>=1);
  assert.deepEqual(checked.equationBreakdown.map(x=>x.equation),['2 + 6 = 8']);
  assert.equal(checked.equationBreakdown.reduce((sum,x)=>sum+x.points,0),checked.points);
  assert.ok(checked.equationBreakdown.every(x=>x.base*x.multiplier===x.points));
  assert.ok(checked.equationBreakdown[0].multiplier>1,'centre bonus should be counted');
});

test('multiple calculations remain individual steps, each increasing the running total',()=>{
  const entries=[
    {equation:'6 + 1 = 7',base:7,multiplier:2,points:14},
    {equation:'9 − 7 = 2',base:9,multiplier:1,points:9},
    {equation:'3 × 3 = 9',base:9,multiplier:2,points:18}
  ];
  const steps=scoringSteps(entries,41);
  assert.equal(steps.length,3);
  assert.deepEqual(steps.map(s=>s.equation),entries.map(s=>s.equation));
  assert.deepEqual(steps.map((_,i)=>steps.slice(0,i+1).reduce((sum,s)=>sum+s.points,0)),[14,23,41]);
});

test('if older API omits details, do not invent per-example points',()=>{
  const legacy=scoringSteps(undefined,48,['268','936']);
  assert.equal(legacy.length,1);
  assert.equal(legacy[0].points,48);
  assert.equal(legacy[0].equation,'2 + 6 = 8 · 9 − 3 = 6');
  assert.deepEqual(scoringSteps(null,0,['268']),[]);
});

test('scroll automatically advances with timers, never requires user confirmation',()=>{
  const js=readFileSync(new URL('../src/score-recap.js',import.meta.url),'utf8');
  assert.match(js,/steps\.forEach\(\(item,index\)=>/);
  assert.match(js,/index\*stepDuration/);
  assert.match(js,/animateCount\(before,cumulative\)/);
  assert.match(js,/this\.counter\.textContent=String\(total\)/);
  assert.match(js,/steps\.length\*stepDuration\+completedDuration/);
  assert.match(js,/this\.cancel\(\);\s*done\?\.\(\)/);
  assert.doesNotMatch(js,/confirm\(|addEventListener\('click'|<button/i);
});
