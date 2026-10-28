import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const css=read('../game-chrome.css');
const game=read('../game.html');
const main=read('../src/main.js');

test('bag count is centered below time and two player cards are equally wide',()=>{
  assert.match(css,/\.top-bar > \.bag-count\{\s*grid-column:2;grid-row:2;justify-self:center/);
  assert.match(css,/\.top-bar \.game-header-score\{\s*grid-column:1\/-1;grid-row:3/);
  assert.match(css,/\.game-header-score \.match-scoreboard\{\s*display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/\.game-header-score \.match-scoreboard \.player-card,[\s\S]*?#player1Card\{\s*display:flex!important;flex-direction:column!important/);
  assert.match(game,/id="bagCount"/);
  assert.doesNotMatch(game,/class="score-divider"/);
  assert.match(css,/\.game-header-score \.match-scoreboard #player0Card\{grid-column:1;grid-row:1\}/);
  assert.match(css,/\.game-header-score \.match-scoreboard #player1Card\{grid-column:2;grid-row:1\}/);
});

test('long names truncate but scores and active player marking remain unchanged',()=>{
  assert.match(css,/\.game-header-score \.match-scoreboard \.player-name\{[\s\S]*?overflow:hidden;text-overflow:ellipsis;white-space:nowrap/);
  assert.match(css,/\.game-header-score \.match-scoreboard \.score strong\{[\s\S]*?font-variant-numeric:tabular-nums;white-space:nowrap/);
  assert.match(game,/id="player0Card"/);
  assert.match(game,/id="player1Card"/);
  assert.match(main,/byId\('player0Name'\)\.textContent=playerLabel\(0\)/);
  assert.match(main,/byId\(`player\$\{i\}Score`\)\.textContent=game\.players\[i\]\.score/);
  assert.match(game,/game-chrome\.css\?v=0\.2\.26/);
});
