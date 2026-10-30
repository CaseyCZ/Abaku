import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('all main navigation actions show a simple, screen-reader-neutral icon',()=>{
  const home=read('../index.html');
  const leaderboard=read('../leaderboard.html');
  const tutorial=read('../how-to-play.html');
  const privacy=read('../privacy.html');
  for(const [page,icons] of [
    [home,['🏆','🧭','⚙️','👥']],
    [leaderboard,['🎮','🏆','📖','⚙️']],
    [tutorial,['🎯','🏠']],
    [privacy,['🏠']]
  ]){
    for(const icon of icons)
      assert.ok(page.includes('<span class="nav-icon" aria-hidden="true">'+icon+'</span>'));
  }
  assert.doesNotMatch(home,/<a class="header-link" href="\.\/how-to-play\.html">/);
});

test('mobile menus center their items, while long tutorial text keeps normal alignment',()=>{
  const homeCss=read('../arena-home.css');
  const gameCss=read('../game-chrome.css');
  const tutorialCss=read('../tutorial.css');
  const sharedCss=read('../arena-modern.css');
  assert.match(homeCss,/\.site-navigation a,\.site-navigation button\{display:flex;align-items:center;text-align:center;justify-content:center/);
  assert.equal((gameCss.match(/display:flex;align-items:center;justify-content:center;\s*width:100%;min-height:44px;text-align:center;/g)||[]).length,2);
  assert.match(tutorialCss,/\.tutorial-header-actions a\{text-decoration:none;text-align:center\}/);
  assert.match(tutorialCss,/\.tutorial-header-actions\{justify-content:center\}/);
  assert.match(sharedCss,/\.nav-icon\{display:inline-block;/);
  assert.doesNotMatch(tutorialCss,/\.tutorial-section p\{text-align:center/);
});
