import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const css=read('../arena-layout.css');
const game=read('../game.html');
const home=read('../index.html');
const main=read('../src/main.js');
const online=read('../src/online-client.js');

test('only unoccupied bonus ×2/×3 hints use smaller typography',()=>{
  assert.match(css,/\.board \.cell\.bonus-hint:is\(\.dd,\.td,\.de,\.te\),\s*#onlineDialog \.online-cell\.bonus-hint:is\(\.dd,\.td,\.de,\.te\)\{\s*font-size:clamp\(8px,\.8vw,13px\)/);
  assert.match(css,/#onlineDialog \.online-cell\.bonus-hint:is\(\.dd,\.td,\.de,\.te\)\{font-size:clamp\(8px,1\.9vw,12px\)\}/);
  assert.match(main,/digit !== null \? 'occupied' : 'bonus-hint'/);
  assert.match(online,/digit!==null\?' occupied':' bonus-hint'/);
});
test('both game and online views fetch new stylesheet while tile sizes stay untouched',()=>{
  for(const page of [game,home]) assert.match(page,/arena-layout\.css\?v=[\w.-]+/);
  assert.doesNotMatch(css,/\.tile\.bonus-hint/);
  assert.doesNotMatch(css,/\.online-tile\.bonus-hint/);
});
