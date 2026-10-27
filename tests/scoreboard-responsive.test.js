import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const css=read('../game-chrome.css');
const game=read('../game.html');
const main=read('../src/main.js');

test('balanced side columns put the whole score group in the exact center',()=>{
  assert.match(css,/\.game-header-score\{[\s\S]*?grid-template-columns:minmax\(0,1fr\) max-content minmax\(0,1fr\)/);
  assert.match(css,/\.game-header-score \.bag-count\{\s*grid-column:1;grid-row:1;justify-self:start/);
  assert.match(css,/\.game-header-score \.match-scoreboard\{\s*grid-column:2;grid-row:1;justify-self:center/);
  assert.match(css,/\.game-header-score \.match-scoreboard\{[\s\S]*?display:flex;flex-wrap:nowrap;align-items:center;justify-content:center/);
  assert.match(css,/\.game-header-score \.match-scoreboard \.player-card\{\s*flex:0 1 auto!important;min-width:0;max-width:100%;\s*width:max-content!important/);
  assert.match(css,/\.game-header-score \.score-divider\{flex:0 0 auto;align-self:center;margin:0\}/);
  assert.match(game,/id="bagCount"/);
});

test('mobile keeps a single compact line, truncates long names but never score digits',()=>{
  assert.match(css,/@media\(max-width:760px\)\{[\s\S]*?\.game-header-score \.match-scoreboard\{\s*display:flex;flex-wrap:nowrap;align-items:center;justify-content:center/);
  assert.match(css,/\.game-header-score \.match-scoreboard #player0Card\{\s*flex-direction:row;/);
  assert.match(css,/\.game-header-score \.match-scoreboard #player1Card\{\s*flex-direction:row-reverse;/);
  assert.match(css,/\.game-header-score \.match-scoreboard \.player-name\{[\s\S]*?white-space:nowrap;overflow:hidden;text-overflow:ellipsis/);
  assert.match(css,/\.game-header-score \.match-scoreboard \.score strong\{[\s\S]*?font-variant-numeric:tabular-nums;white-space:nowrap/);
  assert.match(main,/byId\('player0Name'\)\.textContent=playerLabel\(0\)/);
  assert.match(main,/byId\(`player\$\{i\}Score`\)\.textContent=game\.players\[i\]\.score/);
  assert.match(game,/game-chrome\.css\?v=0\.2\.19/);
});
