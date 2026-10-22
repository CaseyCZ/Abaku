import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const landing=file('../index.html');
const game=file('../game.html');
const lobby=file('../src/lobby.js');

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
test('Google and online modes clearly require future server setup',()=>{
  assert.match(landing,/id="googleSignIn"/);
  assert.match(landing,/Online režimy připravujeme/);
  assert.match(lobby,/googleSignIn:'Google přihlášení/);
  assert.match(lobby,/playRandom:'Náhodného/);
});
