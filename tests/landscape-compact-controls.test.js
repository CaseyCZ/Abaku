import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const css=read('../game-chrome.css');
const html=read('../game.html');
const landscape=css.slice(
  css.indexOf('/* Landscape tablet/desktop: five compact header slots'),
  css.indexOf('/* Tablet portrait: fit the digit rack')
);

test('wide screens have player scores on either side of the timer',()=>{
  assert.match(landscape,/@media \(min-width:1101px\), \(min-width:900px\) and \(orientation:landscape\) and \(min-height:601px\)/);
  assert.match(landscape,/grid-template-columns:minmax\(0,1fr\) clamp\(118px,12vw,170px\) clamp\(138px,13vw,165px\) clamp\(118px,12vw,170px\) minmax\(0,1fr\)!important/);
  assert.match(landscape,/\.game-app \.top-bar \.game-header-score,[\s\S]*?\.match-scoreboard\{display:contents!important\}/);
  assert.match(landscape,/#player0Card\{\s*grid-column:2;grid-row:1 \/ span 2/);
  assert.match(landscape,/#player1Card\{\s*grid-column:4;grid-row:1 \/ span 2/);
  assert.match(landscape,/\.game-app \.top-bar \.timer-wrap\{\s*grid-column:3;grid-row:1/);
  assert.match(landscape,/flex-direction:column;justify-content:center;align-items:center/);
  assert.match(landscape,/\.game-app \.top-bar > \.bag-count\{\s*grid-column:3;grid-row:2/);
  assert.doesNotMatch(landscape,/\.game-app \.top-bar \.timer-wrap strong\{[^}]*font-size/);
});

test('landscape board is centered, full-height, between compact controls and right panels',()=>{
  assert.match(landscape,/--arena-board-size:min\(1100px,calc\(100dvh - 104px\)/);
  assert.match(landscape,/grid-template-columns:minmax\(0,1fr\) minmax\(0,var\(--arena-board-size\)\) minmax\(0,1fr\)!important/);
  assert.match(landscape,/\.game-app \.center-area\{grid-column:2;grid-row:1\}/);
  assert.match(landscape,/\.game-app \.right-side\{\s*grid-column:3;grid-row:1/);
  assert.match(landscape,/\.game-app \.control-bar\{\s*grid-column:1;grid-row:1;justify-self:stretch;align-self:center/);
  assert.match(landscape,/width:100%;max-width:none;min-height:0;height:auto/);
  assert.match(landscape,/\.game-app \.control-bar \.game-controls\{\s*display:flex;flex-direction:column/);
  assert.match(landscape,/\.game-app \.control-bar \.game-mode\{display:none!important\}/);
});

test('local control bar lives inside the main stage without losing action IDs',()=>{
  const start=html.indexOf('<main class="main-stage">');
  const end=html.indexOf('</main>',start);
  const stage=html.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.match(stage,/<section class="center-area"/);
  assert.match(stage,/<aside class="player-side right-side"/);
  assert.match(stage,/<footer class="control-bar">/);
  for(const id of ['undoButton','rack','confirmButton','hintButton','exchangeButton','passButton']){
    assert.equal((stage.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  }
  assert.match(html,/game-chrome\.css\?v=0\.2\.30/);
});
