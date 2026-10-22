import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const landing=file('../index.html');
const game=file('../game.html');
const lobby=file('../src/lobby.js');
const onlineClient=file('../src/online-client.js');
const onlineConfig=file('../src/online-config.js');

test('0.2.0 starts from the lobby and keeps the 0.1.4 game available separately',()=>{
  assert.match(landing,/id="playAi"/);
  assert.match(landing,/id="playLocal"/);
  assert.match(landing,/src\/lobby\.js/);
  assert.match(game,/id="board"/);
  assert.match(game,/id="rack"/);
  assert.match(game,/id="lobbyButton"/);
  assert.match(game,/src\/main\.js/);
});
test('game mode selection preserves access to local and AI play',()=>{
  assert.match(lobby,/data-mode/);
  assert.match(lobby,/game\.html\?start=new&mode=/);
  assert.match(file('../src/main.js'),/startRequest\.get\('start'\) === 'new'/);
  assert.match(file('../src/main.js'),/window\.history\.replaceState/);
});
test('Guest mode keeps online auth optional until the Oracle API becomes available',()=>{
  assert.match(landing,/id="googleSignIn"/);
  assert.match(landing,/Online režimy připravujeme/);
  assert.match(lobby,/googleSignIn:'Google přihlášení/);
  assert.match(lobby,/playRandom:'Náhodného/);
});

test('Google OAuth client is configured and only exposed after Oracle API health confirms readiness',()=>{
 assert.match(onlineConfig,/130\.61\.49\.108\/abaku-api/);
 assert.match(onlineConfig,/googleClientId:\s*'[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com'/);
 assert.match(onlineClient,/fetch\(apiBase\+'\/health'/);
 assert.match(onlineClient,/data\?\.status!==['"]ok['"]/);
});

test('a signed-in Google profile switches local labels to online and unlocks match buttons',()=>{
  assert.match(landing,/id="profileSubtitle"/);
  assert.match(landing,/id="onlineInfoText"/);
  assert.match(onlineClient,/profileSubtitle'\)\.textContent='Google účet · online'/);
  assert.match(onlineClient,/HLEDAT SOUPEŘE/);
  assert.match(onlineClient,/VYTVOŘIT \/ ZADAT KÓD/);
});

test('online profile and friendship management are wired to authenticated Oracle routes',()=>{
  assert.match(landing,/id="manageFriends"/);
  assert.match(landing,/id="friendsDialog"/);
  assert.match(lobby,/updateOnlineProfile\(nickname,avatar\)/);
  assert.match(onlineClient,/api\('\/api\/me','POST'/);
  assert.match(onlineClient,/api\('\/api\/friends'/);
  assert.match(onlineClient,/api\('\/api\/friends\/request','POST'/);
});
