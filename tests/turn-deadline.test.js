import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTurnDeadline,restoreTurnDeadline,remainingOnlineTurnSeconds} from '../src/turn-deadline.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const main=read('../src/main.js');
const game=read('../game.html');
const css=read('../game-chrome.css');

test('turn deadline is an absolute timestamp and survives page reload',()=>{
  const startedAt=1_800_000_000_000;
  const deadline=createTurnDeadline(30,startedAt);
  assert.equal(deadline,startedAt+30_000);
  assert.equal(restoreTurnDeadline(deadline,30,startedAt+12_000),deadline);
  assert.equal(Math.ceil((restoreTurnDeadline(deadline,30,startedAt+12_000)-(startedAt+12_000))/1000),18);
  assert.equal(restoreTurnDeadline(deadline,30,startedAt+35_000),deadline,'expired turn must not restart');
  assert.equal(createTurnDeadline(60,startedAt),startedAt+60_000);
  assert.equal(createTurnDeadline(90,startedAt),startedAt+90_000);
});

test('old saves migrate once; invalid timestamps cannot block startup',()=>{
  const now=1_800_000_000_000;
  assert.equal(restoreTurnDeadline(undefined,30,now),now+30_000);
  assert.equal(restoreTurnDeadline('invalid',60,now),now+60_000);
  assert.equal(restoreTurnDeadline(Number.POSITIVE_INFINITY,60,now),now+60_000);
  assert.equal(createTurnDeadline(0,now),null);
});

test('online clock stays at 60 seconds through recap, then starts the real countdown',()=>{
  const state={finished:false,seconds:60,turnStartsAt:110_000,deadline:170_000};
  assert.equal(remainingOnlineTurnSeconds(state,100_000),60);
  assert.equal(remainingOnlineTurnSeconds(state,109_999),60);
  assert.equal(remainingOnlineTurnSeconds(state,110_000),60);
  assert.equal(remainingOnlineTurnSeconds(state,120_100),50);
  assert.equal(remainingOnlineTurnSeconds(state,170_001),0);
  assert.equal(remainingOnlineTurnSeconds({...state,finished:true},115_000),0);
  assert.equal(remainingOnlineTurnSeconds({finished:false,seconds:60,deadline:160_000},120_000),40,
    'older server messages still work during deployment');
});

test('game saves deadlines on turn start and after score reveal, never resets on settings save',()=>{
  assert.match(main,/import \{createTurnDeadline, restoreTurnDeadline\} from '\.\/turn-deadline\.js\?v=[\w.-]+'/);
  assert.match(main,/function resetDeadline\(\) \{[\s\S]*?deadline=createTurnDeadline\(settings\.time\);[\s\S]*?game\.turnDeadline=deadline;/);
  assert.match(main,/const restored=restoreTurnDeadline\(game\.turnDeadline,settings\.time\)/);
  assert.match(main,/if\(game\.turnDeadline!==restored\)\{[\s\S]*?game\.turnDeadline=restored;[\s\S]*?save\(\);/);
  assert.match(main,/resetDeadline\(\);save\(\);render\(\);/);
  const settingsSubmit=main.slice(main.indexOf("byId('settingsForm').addEventListener('submit'"),main.indexOf("window.addEventListener('keydown'"));
  assert.match(settingsSubmit,/settings=\{\.\.\.settings,difficulty:/);
  assert.match(settingsSubmit,/save\(\);render\(\);/);
  assert.doesNotMatch(settingsSubmit,/^\s*resetDeadline\(\)/m,
    'saving appearance, sounds or a new turn limit must not extend the current turn');
  // main.js has its own cache token. Landscape-only CSS releases leave its logic unchanged.
  assert.match(game,/src\/main\.js\?v=[\w.-]+/);
});

test('scoreboard is a two-column grid below the centered bag count',()=>{
  assert.match(css,/\.top-bar > \.bag-count\{\s*grid-column:2;grid-row:2;justify-self:center/);
  assert.match(css,/\.game-header-score \.match-scoreboard\{\s*display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(css,/\.score-divider\{flex:0 0 auto;align-self:center;margin:0\}/);
});
