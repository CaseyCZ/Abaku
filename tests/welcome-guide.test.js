import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shouldShowWelcome} from '../src/welcome-guide.js';

const file=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('guide is automatic only for a new visitor who has not dismissed it or seen it this session',()=>{
  assert.equal(shouldShowWelcome(),true);
  assert.equal(shouldShowWelcome({hidden:true}),false);
  assert.equal(shouldShowWelcome({shownThisSession:true}),false);
  assert.equal(shouldShowWelcome({returningPlayer:true}),false);
});

test('welcome guide links to actual lobby actions and help without adding a new backend',()=>{
  const page=file('../index.html');
  const script=file('../src/welcome-guide.js');
  for(const id of ['welcomeGuide','welcomeGuideOpen','welcomeGuideClose','welcomeGuideDone','welcomeGuideNeverShow'])
    assert.match(page,new RegExp('id="'+id+'"'));
  for(const action of ['login','profile','friends','computer','settings','rules'])
    assert.ok(page.includes('data-welcome-action="'+action+'"'));
  assert.match(page,/href="\.\/how-to-play\.html" data-welcome-action="rules"/);
  assert.match(page,/src="\.\/src\/welcome-guide\.js\?v=[\w.-]+"/);
  assert.match(page,/href="\.\/welcome-guide\.css\?v=[\w.-]+"/);
  assert.match(script,/byId\('playAi'\)\.click\(\)/);
  assert.match(script,/byId\('friendsOpen'\)\.click\(\)/);
  assert.match(script,/byId\('lobbySettingsButton'\)\.click\(\)/);
  assert.match(script,/localStorage\.setItem\(HIDE_KEY,'1'\)/);
});

test('guide stays scrollable and has mobile single-column layout',()=>{
  const css=file('../welcome-guide.css');
  assert.match(css,/max-height:calc\(100dvh - 24px\)/);
  assert.match(css,/overflow:auto/);
  assert.match(css,/@media\(max-width:620px\)/);
  assert.match(css,/\.welcome-guide-steps\{grid-template-columns:1fr\}/);
});

test('guide uses the existing text-size preference and centers headings and actions',()=>{
  const page=file('../index.html');
  const css=file('../welcome-guide.css');
  assert.match(page,/href="\.\/game-text-size\.css\?v=[\w.-]+"/);
  assert.match(css,/\.welcome-guide-step p\{[^}]*var\(--arena-game-text-scale\)/);
  assert.match(css,/\.welcome-guide-links \.gold-button\{[^}]*var\(--arena-game-text-scale\)/);
  assert.match(css,/\.welcome-guide-heading > div\{text-align:center/);
  assert.match(css,/h3\{[^}]*text-align:center/);
  assert.match(css,/\.welcome-guide-links\{[^}]*justify-content:center/);
});

test('guide has a touch-friendly hide control and does not promise offline first load',()=>{
  const page=file('../index.html');
  const css=file('../welcome-guide.css');
  assert.match(css,/\.welcome-guide-remember\{[^}]*min-height:44px/);
  assert.match(page,/Online souboje vyžadují připojení k serveru/);
  assert.doesNotMatch(page,/proti počítači si zahraješ i bez připojení/);
  assert.doesNotMatch(page,/Nemáš připojení\? Zahraj si proti počítači/);
});
