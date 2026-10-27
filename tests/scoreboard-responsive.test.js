import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const css=read('../game-chrome.css');
const game=read('../game.html');
const main=read('../src/main.js');

test('three equal-width columns keep bag and player scores in one row',()=>{
  assert.match(css,/\.game-header-score\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/\.game-header-score \.bag-count\{\s*grid-column:1;grid-row:1;justify-self:start/);
  assert.match(css,/\.game-header-score \.match-scoreboard\{\s*grid-column:2\/4;grid-row:1;justify-self:stretch/);
  assert.match(css,/\.game-header-score \.match-scoreboard\{[\s\S]*?display:grid;grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\)/);
  assert.match(css,/@media\(max-width:1000px\)\{[\s\S]*?\.game-header-score\{\s*grid-template-columns:repeat\(3,minmax\(0,1fr\)\);/);
  assert.match(game,/id="bagCount"/);
});

test('long nicknames truncate while score and names stay on one row',()=>{
  assert.match(css,/\.game-header-score \.match-scoreboard \.player-name\{[\s\S]*?min-width:0;max-width:clamp\(64px,11vw,180px\)/);
  assert.match(css,/\.game-header-score \.match-scoreboard \.player-name\{[\s\S]*?overflow:hidden;text-overflow:ellipsis;white-space:nowrap/);
  assert.match(css,/\.game-header-score \.match-scoreboard \.score strong\{[\s\S]*?font-variant-numeric:tabular-nums;white-space:nowrap/);
  assert.match(css,/@media\(max-width:760px\)\{[\s\S]*?\.game-header-score \.match-scoreboard\{\s*display:grid;grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\)/);
  assert.match(css,/\.game-header-score \.match-scoreboard #player0Card\{\s*flex-direction:row;/);
  assert.match(css,/\.game-header-score \.match-scoreboard #player1Card\{\s*flex-direction:row-reverse;/);
  assert.match(css,/\.game-header-score \.match-scoreboard \.player-name\{[\s\S]*?white-space:nowrap;overflow:hidden;text-overflow:ellipsis/);
  assert.match(css,/font-size:clamp\(17px,5\.1vw,23px\)/);
  assert.match(main,/byId\('player0Name'\)\.textContent=playerLabel\(0\)/);
  assert.match(main,/byId\(`player\$\{i\}Score`\)\.textContent=game\.players\[i\]\.score/);
  assert.match(game,/game-chrome\.css\?v=0\.2\.17/);
});
