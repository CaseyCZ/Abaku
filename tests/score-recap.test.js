import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scoringSteps,getRecapSeconds,setRecapSeconds,RECAP_SECONDS_OPTIONS} from '../src/score-recap.js';
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
  assert.match(js,/const visibleSeconds=getRecapSeconds\(\);/);
  assert.match(js,/if\(getRecapSeconds\(\)===0\)\{\s*onDone\?\.\(\);\s*return;/);
  assert.match(js,/const stepDuration=counterDuration\+visibleSeconds\*1000;/);
  assert.match(js,/const completedDuration=visibleSeconds\*1000;/);
  assert.match(js,/steps\.forEach\(\(item,index\)=>/);
  assert.match(js,/index\*stepDuration/);
  assert.match(js,/animateCount\(before,cumulative\)/);
  assert.match(js,/this\.counter\.textContent=String\(total\)/);
  assert.match(js,/steps\.length\*stepDuration\+completedDuration/);
  assert.match(js,/const next=this\.queue\[0\]\|\|null;/);
  assert.match(js,/const next=this\.queue\[0\]\|\|null;/);
  assert.match(js,/completion=done\?\.\(\)/);
  assert.match(js,/Promise\.resolve\(completion\)\.then/);
  assert.match(js,/if\(next\)\{/);
  assert.doesNotMatch(js,/confirm\(|addEventListener\('click'|<button/i);
});


test('each example duration is configurable and stored for offline and online',()=>{
  const oldStorage=globalThis.localStorage;
  const data=new Map();
  globalThis.localStorage={
    getItem:key=>data.has(key)?data.get(key):null,
    setItem:(key,value)=>data.set(key,String(value))
  };
  try{
    assert.deepEqual(RECAP_SECONDS_OPTIONS,[0,2,3,5,8,10]);
    assert.equal(getRecapSeconds(),3);
    for(const seconds of RECAP_SECONDS_OPTIONS){
      assert.equal(setRecapSeconds(seconds),true);
      assert.equal(getRecapSeconds(),seconds);
    }
    assert.equal(setRecapSeconds(0),true);
    assert.equal(getRecapSeconds(),0);
    assert.equal(setRecapSeconds(11),false);
    assert.equal(getRecapSeconds(),0);
    assert.equal(setRecapSeconds(10),true);
    assert.equal(data.get('abaku-score-recap-seconds-v1'),'10');
  }finally{
    if(oldStorage===undefined)delete globalThis.localStorage;
    else globalThis.localStorage=oldStorage;
  }
});

test('a second scoring event queues rather than cutting short the current example',()=>{
  const js=readFileSync(new URL('../src/score-recap.js',import.meta.url),'utf8');
  assert.match(js,/if\(this\.active\)\{\s*this\.queue\.push\(\{player,breakdown,equations,total,onDone\}\);\s*return;/);
  assert.match(js,/const next=this\.queue\[0\]\|\|null/);
  assert.match(js,/completion=done\?\.\(\)/);
  assert.match(js,/if\(next\)\{/);
});


test('future recaps wait for optional asynchronous board-highlight completion',()=>{
  const js=readFileSync(new URL('../src/score-recap.js',import.meta.url),'utf8');
  assert.match(js,/this\.root\.hidden=true;\s*\/\/ The onDone callback may wait/);
  assert.match(js,/Promise\.resolve\(completion\)\.then\(\(\)=>\{/);
  assert.match(js,/if\(this\.generation!==runId\)return/);
  assert.match(js,/const remainder=this\.queue\.slice\(1\)/);
  assert.match(js,/this\.queue\.push\(\.\.\.remainder\)/);
});


test('Vypnuto skips the recap but still executes the completed-move highlight callback',()=>{
  const js=readFileSync(new URL('../src/score-recap.js',import.meta.url),'utf8');
  const at=js.indexOf('if(getRecapSeconds()===0){');
  const scoring=js.indexOf('const steps=scoringSteps(',at);
  assert.ok(at>=0&&scoring>at);
  assert.match(js.slice(at,scoring),/onDone\?\.\(\);\s*return;/);
});
