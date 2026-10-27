import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const css=read('../game-chrome.css');
const game=read('../game.html');
const main=read('../src/main.js');

test('score is centered in a balanced grid and bag count stays left independently',()=>{
  assert.match(css,/grid-template-columns:minmax\(0,1fr\) minmax\(0,max-content\) minmax\(0,1fr\)/);
  assert.match(css,/\.game-header-score \.bag-count\{\s*grid-column:1;grid-row:1;justify-self:start/);
  assert.match(css,/\.game-header-score \.match-scoreboard\{\s*grid-column:2;grid-row:1;justify-self:center/);
  assert.match(css,/\.match-scoreboard\{[\s\S]*?grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\)/);
  assert.match(css,/@media\(max-width:1000px\)\{[\s\S]*?\.game-header-score\{\s*grid-template-columns:minmax\(0,1fr\);grid-template-rows:auto auto/);
  assert.match(game,/id="bagCount"/);
});

test('long nicknames shrink or wrap, while variable-length scores remain whole',()=>{
  assert.match(css,/\.game-header-score \.match-scoreboard \.player-name\{[\s\S]*?min-width:0;max-width:clamp\(64px,11vw,180px\)/);
  assert.match(css,/\.game-header-score \.match-scoreboard \.player-name\{[\s\S]*?overflow:hidden;text-overflow:ellipsis;white-space:nowrap/);
  assert.match(css,/\.game-header-score \.match-scoreboard \.score strong\{[\s\S]*?font-variant-numeric:tabular-nums;white-space:nowrap/);
  assert.match(css,/@media\(max-width:760px\)\{[\s\S]*?\.game-header-score \.match-scoreboard \.player-name\{[\s\S]*?-webkit-line-clamp:2/);
  assert.match(css,/\.game-header-score \.match-scoreboard \.player-name\{[\s\S]*?white-space:normal;overflow:hidden;overflow-wrap:anywhere/);
  assert.match(css,/@media\(max-width:370px\)\{[\s\S]*?\.score strong\{font-size:clamp\(18px,5\.6vw,24px\)/);
  assert.match(main,/byId\('player0Name'\)\.textContent=playerLabel\(0\)/);
  assert.match(main,/byId\(`player\$\{i\}Score`\)\.textContent=game\.players\[i\]\.score/);
  assert.match(game,/game-chrome\.css\?v=0\.2\.15/);
});
