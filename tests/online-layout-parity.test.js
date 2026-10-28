import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const local=read('../game.html');
const online=read('../index.html');
const css=read('../online-view.css');
const modern=read('../arena-modern.css');
const sharedSettings=read('../shared-game-settings.css');
const client=read('../src/online-client.js');

test('tablet match header keeps both player cards on the same score row',()=>{
  assert.match(css,/#onlinePlayer0Card \{ grid-column:1;grid-row:1; \}/);
  assert.match(css,/#onlinePlayer1Card \{ grid-column:2;grid-row:1; \}/);
  assert.doesNotMatch(modern,/#onlineDialog #onlinePlayer[01]Card\{grid-column:[12];grid-row:2\}/);
  assert.match(online,/class="brand"><img class="brand-mark" src="\.\/assets\/arena-icon\.png"/);
  assert.match(local,/class="brand"><img class="brand-mark" src="\.\/assets\/arena-icon\.png"/);
  assert.match(css,/#onlineDialog:has\(#onlineBoardWrapper:not\(\[hidden\]\)\) #onlineStatus \{ display:none; \}/);
  assert.match(online,/id="onlineBoardMessage" role="status" aria-live="polite"/);
  assert.match(client,/boardMessage\.textContent=text/);
  assert.match(client,/cell\.className='cell '/);
  assert.match(client,/tile\.className='tile'/);
});

test('online settings share markup classes and one CSS component with local settings',()=>{
  for(const page of [local,online]){
    assert.match(page,/shared-game-settings\.css\?v=[\w.-]+/);
    assert.match(page,/class="game-settings-toggles"/);
    assert.match(page,/class="game-settings-details game-settings-privacy"/);
  }
  assert.match(local,/class="game-settings-fields"/);
  assert.match(sharedSettings,/:is\(#settingsDialog,#onlineGameSettingsDialog\)/);
  for(const id of ['onlineHistorySetting','onlineChatSetting','onlineSoundSetting']){
    assert.equal(online.split('id="'+id+'"').length-1,1);
  }
  assert.doesNotMatch(online,/id="onlineTurnSeconds"|id="onlineRecapSeconds"/);
});
