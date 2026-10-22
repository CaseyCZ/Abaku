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
  assert.match(html,/style\.css\?v=0\.1\.8/);
  assert.match(html,/main\.js\?v=0\.1\.8/);
});

test('return to lobby requires confirmation and saves current game',()=>{
  assert.match(html,/id="lobbyButton"/);
  assert.match(js,/lobbyButton'\)\.addEventListener\('click'/);
  assert.match(js,/window\.confirm\('Vrátit se do hlavní nabídky\?/);
  assert.match(js,/if \(!confirmed\) return;\s*save\(\);\s*window\.location\.assign\('\.\/index\.html'\)/);
});

test('local offline games default to 60 seconds, including old 90-second defaults',()=>{
  assert.match(html,/id="timer">01:00/);
  assert.match(html,/<option value="60" selected>60 sekund<\/option>/);
  assert.match(js,/time:60, sound:true/);
  assert.match(js,/retro-abaku-default-60-migrated-v1/);
  assert.match(js,/Number\(settings\.time\)===90\)settings\.time=60/);
});

test('accepted offline move shows full equation and highlighted board tiles for three seconds',()=>{
  assert.match(html,/id="lastMoveReview"/);
  assert.match(js,/formatEquations\(last\.examples,10\)/);
  assert.match(js,/formatEquations\(entry\.examples,2\)/);
  assert.match(js,/showRecentMove\(checked,placements,who\)/);
  assert.match(js,/until:Date\.now\(\)\+3000/);
  assert.match(js,/cell\.classList\.add\('recent-equation'\)/);
  assert.match(js,/cell\.classList\.add\('recent-tile'\)/);
  assert.match(js,/Nápověda:.*formatEquations\(move\.equations\)/);
  assert.match(css,/\.cell\.recent-tile\.occupied/);
  assert.match(css,/\.cell\.recent-equation\.occupied/);
});
