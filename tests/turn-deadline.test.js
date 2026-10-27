import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTurnDeadline,restoreTurnDeadline} from '../src/turn-deadline.js';

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

test('game saves deadlines on turn start, settings change and after score reveal',()=>{
  assert.match(main,/import \{createTurnDeadline, restoreTurnDeadline\} from '\.\/turn-deadline\.js\?v=0\.2\.18'/);
  assert.match(main,/function resetDeadline\(\) \{[\s\S]*?deadline=createTurnDeadline\(settings\.time\);[\s\S]*?game\.turnDeadline=deadline;/);
  assert.match(main,/const restored=restoreTurnDeadline\(game\.turnDeadline,settings\.time\)/);
  assert.match(main,/if\(game\.turnDeadline!==restored\)\{[\s\S]*?game\.turnDeadline=restored;[\s\S]*?save\(\);/);
  assert.match(main,/resetDeadline\(\);save\(\);render\(\);/);
  assert.match(main,/if\(modeChanged\)newGame\(\);else\{resetDeadline\(\);save\(\);render\(\);\}/);
  assert.match(game,/src\/main\.js\?v=0\.2\.18/);
});

test('scoreboard players and colon have fixed positions on the same row',()=>{
  assert.match(css,/\.game-header-score \.match-scoreboard #player0Card\{grid-column:1;grid-row:1\}/);
  assert.match(css,/\.game-header-score \.match-scoreboard \.score-divider\{grid-column:2;grid-row:1;align-self:center\}/);
  assert.match(css,/\.game-header-score \.match-scoreboard #player1Card\{grid-column:3;grid-row:1\}/);
  assert.match(css,/\.game-header-score\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});
