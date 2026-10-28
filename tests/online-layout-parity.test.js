import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const local=read('../game.html');
const online=read('../index.html');
const css=read('../online-chrome.css');
const modern=read('../arena-modern.css');
const sharedSettings=read('../shared-game-settings.css');
const client=read('../src/online-client.js');

test('tablet match header keeps both player cards on the same score row',()=>{
  assert.match(css,/@media \(max-width:1100px\) and \(orientation:portrait\), \(max-width:740px\) \{[\s\S]*?\.online-match-scoreboard #onlinePlayer0Card,[\s\S]*?\.online-match-scoreboard #onlinePlayer1Card \{\s*grid-row:1!important/);
  assert.doesNotMatch(modern,/#onlineDialog #onlinePlayer[01]Card\{grid-column:[12];grid-row:2\}/);
  assert.match(online,/class="online-game-brand"><img class="online-brand-mark" src="\.\/assets\/arena-icon\.png"/);
  assert.match(local,/class="brand"><img class="brand-mark" src="\.\/assets\/arena-icon\.png"/);
  assert.match(css,/#onlineDialog:has\(#onlineBoardWrapper:not\(\[hidden\]\)\) #onlineStatus \{display:none!important\}/);
  assert.match(online,/id="onlineBoardMessage" role="status" aria-live="polite"/);
  assert.match(client,/boardMessage\.textContent=text/);
});

test('online settings share markup classes and one CSS component with local settings',()=>{
  for(const page of [local,online]){
    assert.match(page,/shared-game-settings\.css\?v=1/);
    assert.match(page,/class="game-settings-fields"/);
    assert.match(page,/class="game-settings-toggles"/);
    assert.match(page,/class="game-settings-details game-settings-privacy"/);
  }
  assert.match(sharedSettings,/:is\(#settingsDialog,#onlineGameSettingsDialog\)/);
  for(const id of ['onlineTurnSeconds','onlineRecapSeconds','onlineHistorySetting','onlineChatSetting']){
    assert.equal(online.split('id="'+id+'"').length-1,1);
  }
});
