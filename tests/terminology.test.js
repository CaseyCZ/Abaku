import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const pages=['index.html','game.html','how-to-play.html','privacy.html','README.md'];
const messaging=['src/main.js','src/online-client.js','src/rules.js','src/tutorial.js','src/preview.js','server/match-engine.js','src/version-data.js'];
const oldTerms=/kámen|kamen(?:y|ů|e|em|i|ů|ům|ech|y)?/iu;

test('game screens, tutorial and player-facing errors consistently call pieces numbers',()=>{
  for(const path of [...pages,...messaging]){
    const content=read('../'+path);
    assert.doesNotMatch(content,oldTerms,'Old word for pieces remains in '+path);
  }
  assert.match(read('../index.html'),/Skládej příklady<br><strong>z čísel\.<\/strong>/);
  assert.match(read('../game.html'),/aria-label="Tvoje čísla"/);
  assert.match(read('../how-to-play.html'),/TVÁ ČÍSLA/);
  assert.match(read('../src/rules.js'),/Polož 1 až 5 čísel\./);
});

test('updated client modules are requested with fresh versioned URLs',()=>{
  const index=read('../index.html'),game=read('../game.html'),tutorial=read('../how-to-play.html');
  const lobby=read('../src/lobby.js'),main=read('../src/main.js'),online=read('../src/online-client.js');
  const preview=read('../src/preview.js');
  assert.match(index,/src\/lobby\.js\?v=[\w.-]+/);
  assert.match(lobby,/online-client\.js\?v=[\w.-]+/);
  // Game logic has its own cache token; visual-only releases should not bump it.
  assert.match(game,/src\/main\.js\?v=[\w.-]+/);
  assert.match(tutorial,/src\/tutorial\.js\?v=[\w.-]+/);
  assert.match(main,/\.\/rules\.js\?v=[\w.-]+/);
  assert.match(online,/\.\/rules\.js\?v=[\w.-]+/);
  assert.match(preview,/\.\/rules\.js\?v=[\w.-]+/);
});

test('tutorial distinguishes local and online rules without changing shared scoring',()=>{
  const tutorial=read('../how-to-play.html');
  assert.match(tutorial,/<a href="#modes">5\. Herní režimy<\/a>/);
  assert.match(tutorial,/id="modes" class="tutorial-section"/);
  assert.match(tutorial,/Místní hra – proti počítači/);
  assert.match(tutorial,/Místní hra – dva hráči/);
  assert.match(tutorial,/30, 60 nebo 90 sekund/);
  assert.match(tutorial,/pevně 60 sekund na tah a 3 sekundy/);
  assert.match(tutorial,/Zvuky, průběh partie a chat si však můžeš zapnout či vypnout nezávisle/);
  assert.match(tutorial,/tahy kontroluje server/);
  assert.match(tutorial,/Pravidla tahů a výpočet bodů zůstávají stejné/);
});
