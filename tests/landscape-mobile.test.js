import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const css=read('../game-chrome.css');
const html=read('../game.html');
const js=read('../src/main.js');

const landscape=css.slice(css.indexOf('/* iPhone landscape only:'));
test('landscape phone board follows viewport width, not available height',()=>{
  assert.match(landscape,/@media \(orientation:landscape\) and \(max-width:1100px\) and \(max-height:600px\) and \(pointer:coarse\)/);
  assert.match(landscape,/--arena-board-size:calc\(100vw - 16px - env\(safe-area-inset-left\) - env\(safe-area-inset-right\)\)/);
  assert.match(landscape,/\.game-app \.main-stage\{[^}]*grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(landscape,/\.game-app \.center-area\{[^}]*width:100%;max-width:none/);
  assert.match(landscape,/\.game-app \.board\{[^}]*width:100%;height:auto!important;aspect-ratio:1/);
  assert.match(landscape,/\.game-app \.right-side\{[^}]*grid-column:1;grid-row:2/);
  assert.match(html,/game-chrome\.css\?v=0\.2\.23/);
});

test('landscape score recap is compact and cannot exceed viewport height',()=>{
  assert.match(landscape,/\.abaku-score-recap \.abaku-score-scroll\{[^}]*width:min\(410px,calc\(100vw - 24px\)\)/);
  assert.match(landscape,/max-height:calc\(100dvh - 14px\)/);
  assert.match(landscape,/\.abaku-score-recap \.abaku-score-face\{[^}]*padding:8px 14px 10px/);
  assert.match(landscape,/\.abaku-score-recap \.abaku-score-counter\{[^}]*width:52px;height:52px/);
  assert.match(js,/scoreRecap\.play\(\{player:who,breakdown:checked\.equationBreakdown/);
  assert.match(html,/score-recap\.css\?v=0\.2\.15/);
});

test('portrait rules remain untouched: overrides are only inside landscape media',()=>{
  assert.ok(landscape.indexOf('@media (orientation:landscape)')>0);
  const before=css.slice(0,css.indexOf('/* iPhone landscape only:'));
  assert.match(before,/@media\(max-width:760px\)/);
  assert.match(before,/\.game-app \.top-bar \.game-header-score/);
  assert.doesNotMatch(landscape,/\.game-app \.top-bar\{/);
});
