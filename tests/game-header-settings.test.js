import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const game=read('../game.html');
const home=read('../index.html');
const css=read('../game-chrome.css');
const main=read('../src/main.js');
const nav=read('../src/site-navigation.js');

test('timer stays live in the top center and the bag count precedes the scoreboard',()=>{
  const header=game.slice(game.indexOf('<header class="top-bar">'),game.indexOf('</header>')+9);
  const footer=game.slice(game.indexOf('<footer class="control-bar">'),game.indexOf('</footer>')+9);
  for(const id of ['timer','bagCount','match-scoreboard','player0Score','player1Score','menuToggle','siteNavigation']){
    const pattern=id==='match-scoreboard'?'class="match-scoreboard"':'id="'+id+'"';
    assert.equal(game.split(pattern).length-1,1,pattern+' must appear exactly once');
    assert.ok(header.includes(pattern),pattern+' belongs in the header');
    assert.ok(!footer.includes(pattern),pattern+' must not remain in the footer');
  }
  assert.ok(header.indexOf('id="bagCount"')<header.indexOf('class="match-scoreboard"'));
  assert.match(main,/byId\('bagCount'\)\.textContent=game\.bag\.length/);
  assert.match(main,/const display=byId\('timer'\)/);
  assert.match(css,/\.game-app \.top-bar \.timer-wrap\{\s*grid-column:2;grid-row:1/);
  assert.match(css,/\.game-app \.top-bar \.timer-wrap\.warning strong\{color:#ff8066\}/);
  assert.match(css,/@media\(max-width:370px\)\{[\s\S]*?\.game-app \.top-bar > \.bag-count\{font-size:11px\}/);
  assert.match(css,/\.game-app \.top-bar \.game-header-score\{\s*grid-column:1\/-1;grid-row:3/);
  assert.match(game,/game-chrome\.css\?v=0\.2\.23/);
});

test('game menu reuses the homepage mobile navigation and keeps actions functional',()=>{
  assert.match(game,/id="menuToggle"[^>]*aria-expanded="false"[^>]*aria-controls="siteNavigation"/);
  assert.match(game,/id="siteNavigation" aria-label="Menu hry"/);
  assert.match(game,/src\/site-navigation\.js\?v=1/);
  assert.match(home,/src\/site-navigation\.js\?v=1/);
  for(const id of ['lobbyButton','rulesButton','settingsButton','newButton']){
    assert.equal(game.split('id="'+id+'"').length-1,1,id);
    assert.match(main,new RegExp(id+"'\\)\\.addEventListener\\('click'"));
  }
  assert.match(nav,/navigation\.classList\.toggle\('is-open'\)/);
  assert.match(nav,/event\.key==='Escape'/);
  assert.match(css,/\.game-app \.top-bar \.game-navigation\.is-open\{display:flex\}/);
  assert.match(css,/@media\(max-width:760px\)/);
});

test('local match settings mirror the compact homepage without changing setting IDs or save behavior',()=>{
  const settings=game.slice(game.indexOf('<dialog id="settingsDialog"'),game.indexOf('</dialog>',game.indexOf('<dialog id="settingsDialog"')));
  assert.match(settings,/class="game-settings-fields"/);
  assert.match(settings,/class="game-settings-toggles"/);
  assert.match(settings,/<details class="game-settings-details">/);
  assert.match(settings,/<details class="game-settings-details game-settings-report">/);
  assert.match(settings,/<details class="version-history" data-version-history>/);
  assert.doesNotMatch(settings,/<details[^>]*\bopen(?:=|>)/);
  for(const id of ['settingsForm','modeSetting','difficultySetting','timeSetting','scoreRecapSecondsSetting','historySetting','chatSetting','soundSetting','reportGameButton','reportGameStatus','reportProblemButton']){
    assert.equal(settings.split('id="'+id+'"').length-1,1,id);
  }
  assert.ok(settings.indexOf('id="reportProblemButton"')>settings.indexOf('value="save"'));
  assert.match(settings,/<button value="cancel"/);
  assert.match(settings,/<button value="save"/);
  assert.match(main,/byId\('settingsForm'\)\.addEventListener\('submit'/);
  assert.match(main,/modeChanged && !confirm/);
  assert.match(main,/setRecapSeconds\(byId\('scoreRecapSecondsSetting'\)\.value\)/);
  assert.match(css,/#settingsDialog \.game-settings-fields\{\s*display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/#settingsDialog \.game-settings-toggles\{\s*display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  const currentVersion=JSON.parse(read('../package.json')).version;
  assert.ok(game.includes('src/version-ui.js?v='+currentVersion));
});

test('bag centered below time and two even score columns on the row below',()=>{
  const header=game.slice(game.indexOf('<header class="top-bar">'),game.indexOf('</header>'));
  assert.ok(header.indexOf('id="timer"') < header.indexOf('id="bagCount"'));
  assert.ok(header.indexOf('id="bagCount"') < header.indexOf('class="match-scoreboard"'));
  assert.match(css,/\.game-app \.top-bar > \.bag-count\{\s*grid-column:2;grid-row:2;justify-self:center/);
  assert.match(css,/\.game-app \.top-bar \.game-header-score\{\s*grid-column:1\/-1;grid-row:3/);
  assert.match(css,/\.game-header-score \.match-scoreboard\{\s*display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/\.game-app \.top-bar:has\(\.game-navigation\.is-open\) > \.bag-count\{grid-row:3\}/);
  assert.match(css,/\.game-app \.top-bar:has\(\.game-navigation\.is-open\) \.game-header-score\{grid-row:4\}/);
  assert.doesNotMatch(header,/score-divider/);
});

test('duplicate board title and preview are hidden but live scoring remains functional',()=>{
  const center=game.slice(game.indexOf('<section class="center-area"'),game.indexOf('</section>',game.indexOf('<section class="center-area"')));
  assert.match(center,/<div class="board-heading" hidden>/);
  assert.match(css,/\.game-app \.center-area > \.board-heading\[hidden\]\{display:none!important\}/);
  for(const id of ['movePreview','previewPoints','previewDetails','board','mobileGameMessage']){
    assert.equal((game.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id+' must be retained once');
  }
  assert.match(main,/function renderMovePreview\(\)/);
  assert.match(main,/describeMovePreview\(game\.board, pending, game\.finished\)/);
  assert.match(main,/byId\('previewPoints'\)/);
  assert.match(main,/byId\('previewDetails'\)/);
  assert.match(main,/confirm\.dataset\.state=preview\.state/);
  assert.match(main,/function showRecentMove\(/);
  assert.doesNotMatch(game,/id="lastMoveReview"/);
});
