import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const css=read('../game-chrome.css');
const game=read('../game.html');
const main=read('../src/main.js');
const tablet=css.slice(
  css.indexOf('/* Tablet portrait: fit the digit rack and every action in one compact row.'),
  css.indexOf('/* Phone landscape (iPhone and Android):')
);

test('tablet-only portrait query keeps actions visible without changing phones or desktops',()=>{
  assert.match(tablet,/@media \(min-width:700px\) and \(max-width:1100px\) and \(orientation:portrait\) and \(pointer:coarse\)/);
  assert.match(tablet,/--arena-board-size:min\(calc\(100vw - 12px\),calc\(100dvh - 330px\)\)/);
  assert.match(tablet,/\.game-app \.center-area\{max-width:var\(--arena-board-size\)\}/);
  assert.match(tablet,/\.game-app \.control-bar\{\s*display:grid!important;/);
  assert.match(tablet,/grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\) max-content minmax\(0,2fr\)!important;/);
  assert.match(tablet,/grid-template-rows:auto;/);
  assert.match(tablet,/\.game-app \.control-bar \.game-mode\{display:none!important\}/);
  assert.match(game,/game-chrome\.css\?v=0\.2\.28/);
});

test('tablet rack and all three actions occupy a single row at digit height',()=>{
  assert.match(tablet,/\.game-app \.control-bar \.rack-frame\{\s*grid-column:3;grid-row:1;\s*justify-self:center;align-self:center/);
  assert.match(tablet,/\.game-app \.control-bar \.game-controls\{display:contents!important\}/);
  assert.match(tablet,/#hintButton\{grid-column:1;grid-row:1\}/);
  assert.match(tablet,/#exchangeButton\{grid-column:2;grid-row:1\}/);
  assert.match(tablet,/#passButton\{\s*grid-column:4;grid-row:1;align-self:center/);
  assert.match(tablet,/\.game-app \.control-bar \.game-controls \.gold-button\{[^}]*height:44px;min-height:44px/);
  const start=game.indexOf('<footer class="control-bar">');
  const bar=game.slice(start,game.indexOf('</footer>',start));
  for(const id of ['undoButton','rack','confirmButton','hintButton','exchangeButton','passButton']){
    assert.equal((bar.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id+' retained exactly once');
  }
  for(const id of ['hintButton','exchangeButton','passButton']){
    assert.match(main,new RegExp(id+'.*addEventListener'));
  }
});
