import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('touchscreen chat fields avoid iOS focus zoom and keep Send beside the input',()=>{
  const css=read('../arena-modern.css');
  const touch=css.slice(css.lastIndexOf('@media (pointer:coarse)'));
  assert.match(touch,/#onlineDialog #onlineChatInput,\.game-app #chatInput\{/);
  assert.match(touch,/font-size:16px!important/);
  assert.match(touch,/#onlineDialog #onlineChatForm,\.game-app #chatForm\{/);
  assert.match(touch,/max-width:100%;min-width:0;flex-wrap:nowrap/);
  assert.match(touch,/\.gold-button\{\s*flex:0 0 auto;white-space:nowrap/);
  const online=read('../index.html');
  const offline=read('../game.html');
  assert.match(online,/<form id="onlineChatForm" class="chat-entry">[\s\S]*?<input id="onlineChatInput"[\s\S]*?<button class="gold-button small" type="submit">Poslat<\/button>/);
  assert.match(offline,/<form id="chatForm" class="chat-entry">[\s\S]*?<input id="chatInput"[\s\S]*?<button id="chatSendButton" type="submit"/);
});
