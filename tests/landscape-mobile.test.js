import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const css=read('../game-chrome.css');
const html=read('../game.html');
const js=read('../src/main.js');

const landscape=css.slice(css.indexOf('/* Phone landscape (iPhone and Android):'));
test('landscape phone board follows viewport width, not available height',()=>{
  assert.match(landscape,/@media \(orientation:landscape\) and \(max-width:1100px\) and \(max-height:600px\) and \(pointer:coarse\)/);
  assert.match(landscape,/--arena-board-size:calc\(100vw - 16px - env\(safe-area-inset-left\) - env\(safe-area-inset-right\)\)/);
  assert.match(landscape,/\.game-app \.main-stage\{[^}]*grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(landscape,/\.game-app \.center-area\{[^}]*width:100%;max-width:none/);
  assert.match(landscape,/\.game-app \.board-rim\{[^}]*aspect-ratio:1 \/ 1/);
  assert.match(landscape,/\.game-app \.board\{[^}]*width:100%;height:100%!important;/);
  assert.match(landscape,/\.game-app \.right-side\{[^}]*grid-column:1;grid-row:2/);
  assert.match(html,/game-chrome\.css\?v=0\.2\.29/);
});

test('landscape score recap is compact and cannot exceed viewport height',()=>{
  assert.match(landscape,/\.abaku-score-recap \.abaku-score-scroll\{[^}]*width:min\(410px,calc\(100vw - 24px\)\)/);
  assert.match(landscape,/max-height:calc\(100dvh - 14px\)/);
  assert.match(landscape,/\.abaku-score-recap \.abaku-score-face\{[^}]*padding:8px 14px 10px/);
  assert.match(landscape,/\.abaku-score-recap \.abaku-score-counter\{[^}]*width:52px;height:52px/);
  assert.match(js,/scoreRecap\.play\(\{player:who,breakdown:checked\.equationBreakdown/);
  assert.match(html,/score-recap\.css\?v=0\.2\.15/);
});

test('portrait rules remain untouched: overrides are only inside landscape media',()=>{
  assert.ok(landscape.indexOf('@media (orientation:landscape)')>0);
  const before=css.slice(0,css.indexOf('/* Phone landscape (iPhone and Android):'));
  assert.match(before,/@media\(max-width:760px\)/);
  assert.match(before,/\.game-app \.top-bar \.game-header-score/);
  assert.doesNotMatch(landscape,/\.game-app \.top-bar\{/);
});

test('Android and iPhone landscape rack stays centered with controls on either side',()=>{
  assert.match(landscape,/\.game-app \.control-bar\{[\s\S]*?display:grid!important;/);
  assert.match(landscape,/grid-template-columns:minmax\(0,1fr\) max-content minmax\(0,1fr\)/);
  assert.match(landscape,/\.game-app \.control-bar \.rack-frame\{\s*grid-column:2;grid-row:1 \/ span 2;\s*justify-self:center/);
  assert.match(landscape,/\.game-app \.control-bar \.game-controls\{display:contents!important\}/);
  assert.match(landscape,/#hintButton\{grid-column:1;grid-row:1\}/);
  assert.match(landscape,/#exchangeButton\{grid-column:1;grid-row:2\}/);
  assert.match(landscape,/#passButton\{\s*grid-column:3;grid-row:1 \/ span 2/);
  assert.match(landscape,/\.game-app \.control-bar \.game-mode\{display:none!important\}/);
  const start=html.indexOf('<footer class="control-bar">');
  const bar=html.slice(start,html.indexOf('</footer>',start));
  for(const id of ['undoButton','rack','confirmButton','hintButton','exchangeButton','passButton']){
    assert.equal((bar.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id+' remains present');
  }
  assert.match(landscape,/@media \(orientation:landscape\)[^{]*\(pointer:coarse\)/);
});

test('landscape mobile board letters are large enough to read at wide board sizes',()=>{
  assert.match(landscape,/\.game-app \.board \.cell\.occupied,[\s\S]*?\.game-app \.board \.cell\.pending\{\s*font-size:clamp\(19px,2\.5vw,32px\)/);
  assert.match(landscape,/\.game-app \.board \.cell\.bonus-hint:is\(\.dd,\.td,\.de,\.te\)\{\s*font-size:clamp\(11px,1\.55vw,18px\)/);
  // New font rules are restricted to landscape coarse-pointer media.
  assert.match(landscape,/@media \(orientation:landscape\) and \(max-width:1100px\) and \(max-height:600px\) and \(pointer:coarse\)/);
});

test('landscape page scroll exists before game tiles are populated',()=>{
  assert.match(landscape,/html\{\s*height:auto!important;min-height:100%;\s*overflow-x:clip;overflow-y:auto!important/);
  assert.match(landscape,/body\{\s*height:auto!important;min-height:100dvh;\s*overflow-x:clip;overflow-y:visible!important/);
  assert.match(landscape,/\.game-app\{\s*height:auto!important;min-height:100dvh;overflow:visible!important/);
  assert.match(landscape,/\.game-app \.board-rim\{\s*box-sizing:border-box;display:flex;[\s\S]*?aspect-ratio:1 \/ 1/);
  assert.match(landscape,/\.game-app \.board\{[\s\S]*?width:100%;height:100%!important/);
  assert.match(html,/game-chrome\.css\?v=0\.2\.29/);
});

test('landscape phone shows the same accessible toggle menu as portrait',()=>{
  const nav=read('../src/site-navigation.js');
  assert.match(landscape,/\.game-app \.top-bar \.game-menu-toggle\{[\s\S]*?grid-column:3;grid-row:1;justify-self:end;[\s\S]*?display:inline-flex/);
  assert.match(landscape,/\.game-app \.top-bar \.game-navigation\{[\s\S]*?grid-column:1\/-1;grid-row:2;justify-self:stretch;[\s\S]*?display:none;flex-direction:column/);
  assert.match(landscape,/\.game-app \.top-bar \.game-navigation\.is-open\{display:flex\}/);
  assert.match(landscape,/\.game-app \.top-bar:has\(\.game-navigation\.is-open\) > \.bag-count\{grid-row:3\}/);
  assert.match(landscape,/\.game-app \.top-bar:has\(\.game-navigation\.is-open\) \.game-header-score\{grid-row:4\}/);
  assert.match(html,/id="menuToggle"[^>]*aria-expanded="false"[^>]*aria-controls="siteNavigation"/);
  for(const id of ['lobbyButton','rulesButton','settingsButton','newButton']){
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  }
  assert.match(nav,/navigation\.classList\.toggle\('is-open'\)/);
  assert.match(nav,/matchMedia\('\(max-width:760px\), \(orientation:landscape\) and \(max-width:1100px\) and \(max-height:600px\) and \(pointer:coarse\)'\)/);
  assert.match(html,/site-navigation\.js\?v=2/);
});
