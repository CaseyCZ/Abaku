import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const css=read('../game-chrome.css');
const game=read('../game.html');
const main=read('../src/main.js');
const tablet=css.slice(
  css.indexOf('/* Tablet portrait: keep all local-game actions beside the digit rack.'),
  css.indexOf('/* Phone landscape (iPhone and Android):')
);

test('tablet-only portrait query does not change the phone or desktop controls',()=>{
  assert.match(tablet,/@media \(min-width:700px\) and \(max-width:1100px\) and \(orientation:portrait\) and \(pointer:coarse\)/);
  assert.match(tablet,/\.game-app \.control-bar\{\s*display:grid!important;/);
  assert.match(tablet,/grid-template-columns:minmax\(0,1fr\) max-content minmax\(0,1fr\)!important;/);
  assert.match(tablet,/\.game-app \.control-bar \.game-mode\{display:none!important\}/);
  assert.match(game,/game-chrome\.css\?v=0\.2\.27/);
});

test('tablet rack stays in centered column with actions occupying the two sides',()=>{
  assert.match(tablet,/\.game-app \.control-bar \.rack-frame\{\s*grid-column:2;grid-row:1 \/ span 2;\s*justify-self:center;align-self:center/);
  assert.match(tablet,/\.game-app \.control-bar \.game-controls\{display:contents!important\}/);
  assert.match(tablet,/#hintButton\{grid-column:1;grid-row:1\}/);
  assert.match(tablet,/#exchangeButton\{grid-column:1;grid-row:2\}/);
  assert.match(tablet,/#passButton\{\s*grid-column:3;grid-row:1 \/ span 2;align-self:stretch/);
  assert.match(tablet,/\.game-app \.control-bar \.game-controls \.gold-button\{[^}]*min-height:32px/);
  const start=game.indexOf('<footer class="control-bar">');
  const bar=game.slice(start,game.indexOf('</footer>',start));
  for(const id of ['undoButton','rack','confirmButton','hintButton','exchangeButton','passButton']){
    assert.equal((bar.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id+' retained exactly once');
  }
  for(const id of ['hintButton','exchangeButton','passButton']){
    assert.match(main,new RegExp(id+'.*addEventListener'));
  }
});
