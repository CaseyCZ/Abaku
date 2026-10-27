import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const html=file('../game.html');
const css=file('../style.css');
const js=file('../src/main.js');

test('game is a real mobile-width layout without horizontal desktop minimum',()=>{
  assert.match(css,/body\{min-width:0;width:100%/);
  assert.match(css,/\.main-stage,\.player-side\{display:contents\}/);
  assert.match(css,/\.center-area\{\s*grid-column:1\/-1;grid-row:4/);
  assert.match(css,/\.board\{\s*width:100%;height:auto;aspect-ratio:1/);
  assert.match(css,/\.control-bar\{\s*grid-column:1\/-1;grid-row:5;position:sticky/);
});
test('mobile hint messages are visible even with a collapsed status panel',()=>{
  assert.match(html,/id="mobileGameMessage"/);
  assert.match(js,/mobileMessage\.textContent = message/);
  assert.match(js,/mobileMessage\.className =/);
  assert.match(html,/id="hintButton"/);
  assert.match(html,/id="confirmButton"/);
});
test('status and chat panels expand on demand but keep desktop elements',()=>{
  assert.match(html,/aria-controls="statusPanelContent"/);
  assert.match(html,/aria-controls="chatPanelContent"/);
  assert.match(css,/\.side-panel\.mobile-expanded \.mobile-panel-content/);
  assert.match(js,/panel\.classList\.toggle\('mobile-expanded'\)/);
  assert.match(js,/setAttribute\('aria-expanded',String\(expanded\)\)/);
});
test('mobile assets use cache-busted current version',()=>{
  assert.match(html,/style\.css\?v=0\.1\.9/);
  assert.match(html,/main\.js\?v=0\.1\.19/);
});

test('return to lobby requires confirmation and saves current game',()=>{
  assert.match(html,/id="lobbyButton"/);
  assert.match(js,/lobbyButton'\)\.addEventListener\('click'/);
  assert.match(js,/window\.confirm\('Vrátit se do hlavní nabídky\?/);
  assert.match(js,/if \(!confirmed\) return;\s*save\(\);\s*window\.location\.assign\('\.\/index\.html'\)/);
});

test('local offline games default to 60 seconds, including old 90-second defaults',()=>{
  assert.match(html,/id="timer">01:00/);
  assert.match(html,/<option value="60" selected>60 sekund<\/option>/);
  assert.match(js,/time:60, sound:true/);
  assert.match(js,/retro-abaku-default-60-migrated-v1/);
  assert.match(js,/Number\(settings\.time\)===90\)settings\.time=60/);
});

test('accepted offline move shows full equation and highlighted board tiles for three seconds',()=>{
  assert.match(html,/id="lastMoveReview"/);
  assert.match(js,/formatEquations\(last\.examples,10\)/);
  assert.match(js,/formatEquations\(entry\.examples,2\)/);
  assert.match(js,/showRecentMove\(checked,placements,who,\(\)=>\{/);
  assert.match(js,/until:Date\.now\(\)\+3000/);
  assert.match(js,/cell\.classList\.add\('recent-equation'\)/);
  assert.match(js,/cell\.classList\.add\('recent-tile'\)/);
  assert.match(js,/Nápověda:.*formatEquations\(move\.equations\)/);
  assert.match(css,/\.cell\.recent-tile\.occupied/);
  assert.match(css,/\.cell\.recent-equation\.occupied/);
});


test('offline accepted move starts an automatic one-equation-at-a-time score scroll',()=>{
  const scoreStyle=file('../score-recap.css');
  assert.match(html,/score-recap\.css\?v=0\.2\.15/);
  assert.match(js,/import \{ScoreRecap,getRecapSeconds,setRecapSeconds\} from '.\/score-recap\.js\?v=0\.2\.24'/);
  assert.match(js,/const scoreRecap = new ScoreRecap\(document\.body\)/);
  assert.match(js,/scoreRecap\.play\(\{player:who,breakdown:checked\.equationBreakdown/);
  assert.match(js,/equations:checked\.equations,total:checked\.points/);
  assert.match(js,/scoreRecap\.cancel\(\)/);
  assert.match(scoreStyle,/\.abaku-score-scroll/);
  assert.match(scoreStyle,/\.abaku-score-counter/);
});


test('offline settings allow choosing the same saved score-tally duration as online',()=>{
  assert.match(html,/id="scoreRecapSecondsSetting"/);
  assert.match(html,/<option value="0">Vypnuto<\/option>/);
  for(const seconds of [2,3,5,8,10])
    assert.match(html,new RegExp('<option value="'+seconds+'"[^>]*>'+seconds+' sekund'));
  assert.match(js,/byId\('scoreRecapSecondsSetting'\)\.value=String\(getRecapSeconds\(\)\)/);
  assert.match(js,/setRecapSeconds\(byId\('scoreRecapSecondsSetting'\)\.value\)/);
  assert.match(js,/onDone:\(\)=>new Promise\(resolve=>\{/);
  assert.match(js,/if\(isBotTurn\(\)&&!botBusy\)runBot\(\)/);
  assert.match(js,/if\(scoreRecap\.playing\(\)\|\|recentMove\)return;/);
});


test('offline board highlights placed digits only AFTER the full scoring animation',()=>{
  const start=js.indexOf("scoreRecap.play({player:who,breakdown:checked.equationBreakdown");
  const callback=js.indexOf("showRecentMove(checked,placements,who,()=>{",start);
  assert.ok(start>=0&&callback>start,'Highlight must start inside recap completion callback');
  assert.match(js,/recentMoveTimer=setTimeout\(\(\)=>\{/);
  assert.match(js,/render\(\);\s*onDone\(\);/);
  assert.match(js,/if\(game\?\.finished\)setTimeout\(showOfflineResult,0\);/);
  assert.match(js,/scoreRecap\.playing\(\)\|\|Boolean\(recentMove\)/);
  assert.match(js,/if\(scoreRecap\.playing\(\)\|\|recentMove\)return;/);
});


test('the board becomes interactive again after recap and three-second highlight',()=>{
  assert.match(js,/requestAnimationFrame\(\(\)=>\{if\(game\)render\(\);\}\)/);
  assert.match(js,/scoreRecap\.playing\(\)\|\|Boolean\(recentMove\)/);
  assert.match(js,/showRecentMove\(checked,placements,who,\(\)=>\{/);
});


test('offline completed game reuses the existing online results dialog and styling',()=>{
  const sharedCss=file('../result-dialog.css');
  assert.match(html,/href="\.\/result-dialog\.css\?v=1"/);
  for(const id of [
    'onlineResultDialog','onlineResultTitle','onlineResultDescription',
    'onlineResultPlayer0','onlineResultPlayer1','onlineResultScore0',
    'onlineResultScore1','onlineResultReason','onlineRematchStatus',
    'onlineRematch','onlineResultExit'
  ])assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/id="onlineResultDialog" class="online-result-dialog abaku-result-dialog"/);
  assert.match(sharedCss,/\.abaku-result-dialog\.online-result-dialog/);
  assert.match(sharedCss,/\.abaku-result-dialog::backdrop/);
  assert.match(js,/function showOfflineResult\(\)/);
  assert.match(js,/dialog\.showModal\(\)/);
});

test('offline result always shows winner, actual scores and a rematch or menu choice',()=>{
  assert.match(js,/winner=first===second\?null:first>second\?0:1/);
  assert.match(js,/winner===null\?'Remíza!'/);
  assert.match(js,/winner===0\?'🏆 Vyhrál jsi!':'Počítač vyhrál'/);
  assert.match(js,/'🏆 Vyhrál '\+playerLabel\(winner\)\+'!'/);
  assert.match(js,/byId\('onlineResultScore0'\)\.textContent=String\(first\)/);
  assert.match(js,/byId\('onlineResultScore1'\)\.textContent=String\(second\)/);
  assert.match(js,/byId\('onlineRematch'\)\.addEventListener\('click',\(\)=>newGame\(\)\)/);
  assert.match(js,/byId\('onlineResultExit'\)\.addEventListener\('click'/);
  assert.match(js,/if\(game\.finished\)showOfflineResult\(\)/);
});

test('result window follows animations for last scoring move, but shows immediately after final pass',()=>{
  assert.match(js,/function finish\(reason='Partie skončila podle pravidel\.'\)/);
  assert.match(js,/if\(game\.finished\)return;\s*game\.finished=true;game\.finishReason=reason/);
  assert.match(js,/finish\(game\.passStreak>=6\?/);
  assert.match(js,/showOfflineResult\(\);\s*\}/);
  assert.match(js,/if\(!game\?\.finished\|\|scoreRecap\.playing\(\)\|\|recentMove\)return;/);
  assert.match(js,/if\(game\?\.finished\)setTimeout\(showOfflineResult,0\)/);
  assert.match(js,/if\(resultDialog\.open\)resultDialog\.close\(\)/);
});


test('offline games display the saved authenticated Google nickname as Player 1',()=>{
  assert.match(js,/import \{offlinePlayerName,savedOnlineToken,cacheVerifiedOnlineProfile,clearVerifiedOnlineProfile\}/);
  assert.match(js,/function playerLabel\(index\) \{ return index === 0 \? offlinePlayerName\(\)/);
  assert.match(js,/async function refreshLocalPlayerName\(\)/);
  assert.match(js,/const \{profile\}=await response\.json\(\)/);
  assert.match(js,/cacheVerifiedOnlineProfile\(profile\)/);
  assert.match(js,/window\.addEventListener\('storage',event=>/);
  assert.match(js,/window\.addEventListener\('pageshow'/);
  assert.match(js,/refreshLocalPlayerName\(\);/);
  assert.match(js,/ONLINE_CONFIG\.apiBase\+'\/api\/me'/);
});
