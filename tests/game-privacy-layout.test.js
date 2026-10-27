import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const game=read('../game.html');
const home=read('../index.html');
const css=read('../game-chrome.css');
const analytics=read('../src/analytics.js');

test('score digits have no independent tinted background while the active card retains its highlight',()=>{
  assert.match(css,/\.game-header-score \.match-scoreboard \.score\{[^}]*background:transparent!important;/);
  assert.match(css,/\.game-header-score \.match-scoreboard \.score strong\{[^}]*background:transparent!important;/);
  const boardCSS=read('../arena-layout.css');
  assert.match(boardCSS,/\.match-scoreboard \.player-card\.active/);
  assert.match(game,/id="player0Card"/);
  assert.match(game,/id="player1Card"/);
});

test('game footer is removed completely but homepage footer stays as it was',()=>{
  assert.doesNotMatch(game,/class="fine-print"/);
  assert.doesNotMatch(game,/<footer class="lobby-footer"/);
  assert.match(home,/<footer class="lobby-footer">/);
  assert.match(home,/href="\.\/privacy\.html"/);
  assert.match(game,/<footer class="control-bar">/);
});

test('privacy and consent settings are reachable from the game settings dialog',()=>{
  const start=game.indexOf('<dialog id="settingsDialog"');
  const end=game.indexOf('</dialog>',start);
  const settings=game.slice(start,end);
  assert.match(settings,/<details class="game-settings-details game-settings-privacy">/);
  assert.match(settings,/href="\.\/privacy\.html"/);
  assert.match(settings,/data-cookie-settings/);
  assert.equal((game.match(/data-cookie-settings/g)||[]).length,1);
  assert.match(analytics,/const dialog = button\.closest\('dialog'\);/);
  assert.match(analytics,/if \(dialog\?\.open\) dialog\.close\(\);/);
  assert.match(analytics,/showBanner\(true\);/);
  assert.match(game,/src\/analytics\.js\?v=2/);
  assert.match(css,/#settingsDialog \.game-settings-privacy-actions\{/);
});
