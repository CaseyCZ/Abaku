import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const html=file('../game.html');
const css=file('../style.css');
const js=file('../src/main.js');

test('game is a real mobile-width layout without horizontal desktop minimum',()=>{
  assert.match(css,/body\{min-width:0;width:100%/);
  assert.match(css,/\.main-stage,\.player-side\{display:contents\}/);
  assert.match(css,/\.center-area\{\s*grid-column:1\/-1;grid-row:4/);
  assert.match(css,/\.board\{\s*width:100%;height:auto;aspect-ratio:1/);
  assert.match(css,/\.control-bar\{\s*grid-column:1\/-1;grid-row:5;position:sticky/);
});
test('mobile hint messages are visible even with a collapsed status panel',()=>{
  assert.match(html,/id="mobileGameMessage"/);
  assert.match(js,/mobileMessage\.textContent = message/);
  assert.match(js,/mobileMessage\.className =/);
  assert.match(html,/id="hintButton"/);
  assert.match(html,/id="confirmButton"/);
});
test('status and chat panels expand on demand but keep desktop elements',()=>{
  assert.match(html,/aria-controls="statusPanelContent"/);
  assert.match(html,/aria-controls="chatPanelContent"/);
  assert.match(css,/\.side-panel\.mobile-expanded \.mobile-panel-content/);
  assert.match(js,/panel\.classList\.toggle\('mobile-expanded'\)/);
  assert.match(js,/setAttribute\('aria-expanded',String\(expanded\)\)/);
});
test('mobile assets use cache-busted current version',()=>{
  assert.match(html,/style\.css\?v=0\.1\.5/);
  assert.match(html,/main\.js\?v=0\.1\.6/);
});

test('return to lobby requires confirmation and saves current game',()=>{
  assert.match(html,/id="lobbyButton"/);
  assert.match(js,/lobbyButton'\)\.addEventListener\('click'/);
  assert.match(js,/window\.confirm\('Vrátit se do hlavní nabídky\?/);
  assert.match(js,/if \(!confirmed\) return;\s*save\(\);\s*window\.location\.assign\('\.\/index\.html'\)/);
});
