import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const css=read('../arena-home.css');
const landing=read('../index.html');

test('regular home cards and navigation use the same visual tokens',()=>{
  assert.match(css,/--home-card-background:linear-gradient\(150deg,#1b365c 0%,#0d2342 100%\)/);
  assert.match(css,/--home-card-border:#3a5a7e/);
  assert.match(css,/--home-card-shadow:0 8px 24px/);
  assert.match(css,/\.arena-home :is\(\.mode-card,\.side-card,\.quick-rules\)\{\s*background:var\(--home-card-background\);\s*border-color:var\(--home-card-border\);\s*box-shadow:var\(--home-card-shadow\);/);
  assert.match(css,/\.arena-home :is\(\.site-navigation \.header-link,\.site-navigation \.gold-button,\.menu-toggle\)\{\s*background:var\(--home-card-background\);\s*border-color:var\(--home-card-border\);/);
  // Homepage CSS has its own cache token; game-only releases need not bump it.
  assert.match(landing,/href="\.\/arena-home\.css\?v=[\w.-]+"/);
});

test('saved game card remains subtly highlighted without losing mode states',()=>{
  assert.match(css,/\.arena-home \.lobby-intro \.hero-resume\{\s*background:linear-gradient\(150deg,#234263 0%,#163153 100%\);\s*border-color:#607c9e;/);
  assert.match(css,/\.arena-home \.mode-card:hover\{\s*border-color:var\(--arena-gold\);/);
  assert.match(css,/\.arena-home \.mode-card:disabled\{opacity:\.5;/);
  assert.match(css,/@media\(max-width:760px\)\{[\s\S]*?\.home-start\{grid-template-columns:minmax\(0,1fr\);gap:18px\}/);
  assert.match(css,/\.arena-home \.lobby-intro \.hero-resume\{width:min\(100%,430px\)/);
  assert.match(landing,/id="onlineResumeCard" hidden/);
  assert.match(landing,/id="savedCard" hidden/);
});
