import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

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
  assert.match(lobby,/playRandom:'Pro náhodný online zápas/);
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
  assert.match(onlineClient,/VYBRAT PŘÍTELE/);
});

test('online profile and friendship management are wired to authenticated Oracle routes',()=>{
  assert.match(landing,/id="manageFriends"/);
  assert.match(landing,/id="friendsDialog"/);
  assert.match(lobby,/updateOnlineProfile\(nickname,avatar\)/);
  assert.match(onlineClient,/api\('\/api\/me','POST'/);
  assert.match(onlineClient,/api\('\/api\/friends'/);
  assert.match(onlineClient,/api\('\/api\/friends\/request','POST'/);
});

test('lobby displays real online and random matchmaking queue counts without inventing availability',()=>{
  assert.match(landing,/id="onlineCount"/);
  assert.match(landing,/id="waitingCount"/);
  assert.match(landing,/id="queueActivity"/);
  assert.match(landing,/id="onlineWaitingCount"/);
  assert.match(onlineClient,/fetch\(apiBase\+'\/api\/presence'/);
  assert.match(onlineClient,/api\('\/api\/presence','POST'\)/);
  assert.match(onlineClient,/setInterval\(refresh,20_000\)/);
  assert.match(landing,/Hledání spojí dva hráče/);
});


test('only online turn time is selectable; default is 60 seconds',()=>{
  assert.match(landing,/id="onlineTurnSeconds"/);
  for(const time of [30,60,90]) assert.match(landing,new RegExp('<option value="'+time+'"'));
  assert.match(landing,/<option value="60" selected>/);
  assert.doesNotMatch(landing,/<option value="90" selected>/);
  assert.match(onlineClient,/Number\(\$\(\x27onlineTurnSeconds\x27\)\.value\) : 60/);
  assert.match(onlineClient,/selectedTurnSeconds/);
  assert.match(onlineClient,/abaku-online-default-60-migrated-v1/);
  assert.match(onlineClient,/send\('matchmake',\{seconds:action\.seconds\}\)/);
  assert.match(onlineClient,/send\('invite',\{seconds:action\.seconds\}\)/);
  assert.match(onlineClient,/connectOnline\(\{type:'random',seconds:selectedTurnSeconds\(\)\}\)/);
});


test('signed-in player may challenge a selected friend directly from accepted friends',()=>{
  assert.match(landing,/id="friendList"/);
  assert.match(landing,/id="friendChallengeDialog"/);
  assert.match(landing,/id="friendChallengeAccept"/);
  assert.match(landing,/id="friendChallengeDecline"/);
  assert.match(landing,/id="friendCreateCode"/);
  assert.match(landing,/id="friendJoinCode"/);
  assert.match(onlineClient,/appendFriend\(friends,player,'⚔ Vyzvat'/);
  assert.match(onlineClient,/send\('challenge-friend',\{targetId:action\.targetId,seconds:action\.seconds\}\)/);
  assert.match(onlineClient,/api\('\/api\/challenges'/);
  assert.match(onlineClient,/api\('\/api\/challenges\/respond','POST'/);
  assert.match(onlineClient,/connectOnline\(\{type:'join',code:data\.code\}\)/);
});

test('official Google button fits measured profile card width',()=>{
  assert.match(onlineClient,/renderResponsiveGoogleButton\(g\)/);
  assert.match(onlineClient,/container\.getBoundingClientRect\(\)\.width/);
  assert.match(onlineClient,/ResizeObserver/);
  assert.doesNotMatch(onlineClient,/width:230,locale:'cs'/);
});

test('online players see complete previous equation and its highlighted squares',()=>{
  assert.match(landing,/id="onlineLastMoveReview"/);
  assert.match(onlineClient,/import \{ formatEquations, bonusAt, TOTAL_TILES \} from/);
  assert.match(onlineClient,/showOnlineReview\(msg\)/);
  assert.match(onlineClient,/recentOnlineMove\.placed\.has\(key\)/);
  assert.match(onlineClient,/recentOnlineMove\.cells\.has\(key\)/);
  assert.match(onlineClient,/until:Date\.now\(\)\+3000/);
  assert.match(onlineClient,/formatEquations\(msg\.equations\)/);
});


test('Google auth is restored silently from tab session after a normal reload',()=>{
  // Saved credentials are limited to the current browser tab and are not
  // treated as trusted until the backend confirms the Google token.
  assert.match(onlineClient,/const authSessionKey='abaku-online-google-session-v1'/);
  assert.match(onlineClient,/sessionStorage\.setItem\(authSessionKey,token\)/);
  assert.match(onlineClient,/sessionStorage\.getItem\(authSessionKey\)/);
  assert.match(onlineClient,/sessionStorage\.removeItem\(authSessionKey\)/);
  assert.match(onlineClient,/const \{profile\}=await api\('\/api\/me'\);\s*saveCredential\(value\);\s*showProfile\(profile\)/);
  assert.match(onlineClient,/const saved=readSavedCredential\(\);\s*if\(saved&&await googleCredential\(saved\)\)return;/);
  assert.match(onlineClient,/if\(saved&&await googleCredential\(saved\)\)return;[\s\S]*?const g=await googleSdk\(\)/);
  assert.match(onlineClient,/const old=connection;connection=null;\s*old\?\.close\(\);\s*socketAuthenticated=false;\s*credential=null;gameState=null;currentProfile=null;[\s\S]*?clearSavedCredential\(\)/);
  assert.doesNotMatch(onlineClient,/localStorage\.setItem\(authSessionKey/);
  assert.match(landing,/Abaku Online 0\.2\.18/);
  assert.match(lobby,/online-client\.js\?v=0\.2\.18/);
});

test('online match mirrors the offline Abaku board layout on phone and desktop',()=>{
  const html=landing;
  const css=file('../online-game.css');
  assert.match(html,/href="\.\/online-game\.css\?v=0\.2\.18"/);
  for(const id of ['onlineProgress','onlinePlayer0Card','onlinePlayer1Card',
    'onlinePlayer0Score','onlinePlayer1Score','onlineTimer','onlineBagCount',
    'onlineBoard','onlineRack','onlineUndo','onlineConfirm','onlineExchange','onlinePass',
    'onlineLastEquation','onlineLastPlayer','onlineLastPoints','onlineMoveHistory',
    'onlineChat','onlineStatus','onlinePreview','onlineLastMoveReview'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(css,/\.online-cell\.dd\{background:#d2eab5\}/);
  assert.match(css,/\.online-cell\.td\{background:#43a839\}/);
  assert.match(css,/\.online-cell\.de\{background:#caf1f9\}/);
  assert.match(css,/\.online-cell\.te\{background:#57b1e3\}/);
  assert.match(css,/\.online-control-bar\{grid-column:1\/-1;grid-row:4\}/);
  assert.match(css,/\.online-match-layout\{\s*display:contents;/);
  assert.match(css,/\.online-player-card\{grid-row:2\}/);
  assert.match(css,/\.online-game-board\{grid-column:1\/-1;grid-row:3\}/);
  assert.match(onlineClient,/bonusAt\(row,col\)/);
  assert.match(onlineClient,/renderOnlineProgress\(s\)/);
  assert.match(onlineClient,/renderOnlineStatus\(s\)/);
  assert.match(onlineClient,/updateOnlineTimer\(\)/);
  assert.match(onlineClient,/panel\.classList\.toggle\('mobile-expanded'\)/);
  assert.match(onlineClient,/formatEquations\(last\.equations,10\)/);
  assert.match(onlineClient,/s\.history/);
  assert.match(onlineClient,/gameState\.deadline/);
});


test('online blue scorecard header follows the actual active player, not always player one',()=>{
  const css=file('../online-game.css');
  assert.match(landing,/online-game\.css\?v=0\.2\.18/);
  assert.match(css,/#onlineDialog \.online-player-card\.active \.online-player-name\{/);
  assert.doesNotMatch(css,/#onlineDialog #onlinePlayer0Card \.online-player-name\{/);
  assert.match(onlineClient,/onlinePlayer'\+side\+'Card'\)\.classList\.toggle\('active',!s\.finished&&s\.turn===side\)/);
});


test('continue online is shown only after the authenticated API confirms an active match',()=>{
  assert.match(landing,/id="onlineResumeCard" hidden/);
  assert.match(landing,/id="onlineResumeButton"/);
  assert.match(landing,/id="onlineResumeDescription"/);
  assert.match(onlineClient,/api\('\/api\/match\/current'\)/);
  assert.match(onlineClient,/card\.hidden=true/);
  assert.match(onlineClient,/card\.hidden=\$\('onlineDialog'\)\.open/);
  assert.match(onlineClient,/await refreshResumeCard\(\)/);
  assert.match(onlineClient,/connectOnline\(\{type:'resume'\}\)/);
  assert.match(onlineClient,/if\(action\.type==='resume'\)send\('sync'\)/);
});
test('online socket reconnects after 5 seconds and offers manual retry without duplicate match',()=>{
  assert.match(landing,/id="onlineReconnectNotice"/);
  assert.match(landing,/id="onlineRetryNow"/);
  assert.match(onlineClient,/reconnectTimer=setTimeout\(\(\)=>\{/);
  assert.match(onlineClient,/retryOnlineConnection\(\);\s*\},5000\)/);
  assert.match(onlineClient,/connectOnline\(next,\{reconnecting:true\}\)/);
  assert.match(onlineClient,/gameState&&!gameState\.finished\?\{type:'resume'\}/);
  assert.match(onlineClient,/socket\.addEventListener\('close',event=>\{/);
  assert.match(onlineClient,/scheduleReconnect\('Spojení přerušeno\.'\)/);
  assert.match(onlineClient,/onlineRetryNow'\)\.addEventListener\('click',retryOnlineConnection\)/);
  assert.match(onlineClient,/socketAuthenticated&&connection\?\.readyState===WebSocket\.OPEN/);
  assert.match(onlineClient,/socketMonitorTimer=setInterval/);
  assert.match(onlineClient,/send\('sync'\)/);
  assert.match(onlineClient,/function leaveOnlineGame\(\)\{\s*clearReconnect\(\);/);
});
test('Oracle health automatically retries after intermittent refresh failures',()=>{
  assert.match(onlineClient,/onlineInitStarted=true/);
  assert.match(onlineClient,/onlineInitRetryTimer=setTimeout\(\(\)=>\{/);
  assert.match(onlineClient,/initOnline\(\);\s*\},5000\)/);
  assert.match(onlineClient,/Oracle dočasně neodpovídá/);
  assert.match(onlineClient,/if\(!configured\|\|onlineServerReady\)return;/);
});


test('online reconnection client remains parseable JavaScript after new state handlers',()=>{
  const withoutImports=onlineClient.replace(/^import\s+.*?;\s*$/gm,'').replace(/\bexport\s+(?=(?:async\s+)?function|const|let|class)/g,'');
  assert.doesNotThrow(()=>new Script(withoutImports,{filename:'online-client.js'}));
});


test('match end displays winner and scores in a dedicated result dialog on all devices',()=>{
  const css=file('../online-game.css');
  for(const id of ['onlineResultDialog','onlineResultTitle','onlineResultDescription',
    'onlineResultScore0','onlineResultScore1','onlineRematch','onlineResultExit',
    'onlineRematchStatus','onlineResultReason'])
    assert.match(landing,new RegExp('id="'+id+'"'));
  assert.match(onlineClient,/function renderOnlineResult\(state\)/);
  assert.match(onlineClient,/if\(!state\?\.finished\|\|resultShownFor===state\.matchId\|\|onlineScoreRecap\.playing\(\)\|\|recentOnlineMove\)return/);
  assert.match(onlineClient,/renderOnlineResult\(msg\)/);
  assert.match(onlineClient,/state\.reason==='abandoned'/);
  assert.match(onlineClient,/state\.reason/);
  assert.match(onlineClient,/send\('resign'\)/);
  assert.match(onlineClient,/send\('rematch',\{accept:true\}\)/);
  assert.match(onlineClient,/send\('rematch',\{accept:false\}\)/);
  assert.match(onlineClient,/msg\.type==='rematch-status'/);
  assert.match(css,/#onlineResultDialog\.online-result-dialog/);
  assert.match(css,/#onlineResultDialog::backdrop/);
});

test('collapsed or out-of-view chat gets a persistent tappable unread notification',()=>{
  const css=file('../online-game.css');
  assert.match(landing,/id="onlineChatToast"[^>]*hidden/);
  assert.match(landing,/id="onlineChatToastPreview"/);
  assert.match(landing,/id="onlineChatToastCount"/);
  assert.match(landing,/id="onlineUnreadBadge"[^>]*hidden/);
  assert.match(onlineClient,/function chatActuallyVisible\(\)/);
  assert.match(onlineClient,/getComputedStyle\(panel\)\.display==='none'/);
  assert.match(onlineClient,/if\(!own&&\!chatActuallyVisible\(\)\)/);
  assert.match(onlineClient,/unreadOnlineChat\+\+/);
  assert.match(onlineClient,/latestUnreadChat=String\(text\|\|''\)\.slice\(0,80\)/);
  assert.match(onlineClient,/function revealOnlineChat\(\)/);
  assert.match(onlineClient,/onlineChatToast'\)\.addEventListener\('click',revealOnlineChat\)/);
  assert.match(onlineClient,/onlineDialog'\)\.addEventListener\('scroll',refreshUnreadChat/);
  assert.match(css,/#onlineDialog \.online-chat-toast\{/);
  assert.match(css,/#onlineDialog \.online-unread-badge\{/);
  assert.match(css,/#onlineDialog \.online-chat-toast\[hidden\]\{display:none!important\}/);
});

test('opponent disconnection shows a prominent message and leaving voluntarily concedes',()=>{
  assert.match(landing,/id="onlineOpponentNotice"/);
  assert.match(onlineClient,/disconnectedOpponent=msg\.status==='disconnected'/);
  assert.match(onlineClient,/Soupeř se odpojil\. Má 60 sekund/);
  assert.match(onlineClient,/Opravdu vzdát online partii\?/);
  assert.match(onlineClient,/if\(socketAuthenticated&&connection\?\.readyState===WebSocket\.OPEN\)/);
});


test('online scoring is a hands-free animation of each server-verified equation before end dialog',()=>{
  const recap=file('../src/score-recap.js');
  const styles=file('../score-recap.css');
  assert.match(landing,/score-recap\.css\?v=0\.2\.15/);
  assert.match(onlineClient,/import \{ScoreRecap,getRecapSeconds,setRecapSeconds\} from '.\/score-recap\.js\?v=0\.2\.17'/);
  assert.match(onlineClient,/new ScoreRecap\(\$\('onlineDialog'\)\)/);
  assert.match(onlineClient,/breakdown:move\.equationBreakdown,equations:move\.equations/);
  assert.match(onlineClient,/total:move\.points/);
  assert.match(onlineClient,/onDone:\(\)=>showOnlineHighlight\(move\)/);
  assert.match(onlineClient,/onlineScoreRecap\.playing\(\)/);
  assert.match(onlineClient,/onlineScoreRecap\.cancel\(\)/);
  assert.match(recap,/steps\.forEach\(\(item,index\)=>/);
  assert.match(recap,/animateCount\(before,cumulative\)/);
  assert.match(recap,/steps\.length\*stepDuration\+completedDuration/);
  assert.match(styles,/\.abaku-score-scroll/);
  assert.doesNotMatch(recap,/<button|addEventListener\('click'/);
});


test('online lobby offers saved per-equation animation seconds shared with offline',()=>{
  assert.match(landing,/id="onlineRecapSeconds"/);
  for(const seconds of [2,3,5,8,10])
    assert.match(landing,new RegExp('<option value="'+seconds+'"[^>]*>'+seconds+' sekund'));
  assert.match(onlineClient,/import \{ScoreRecap,getRecapSeconds,setRecapSeconds\} from/);
  assert.match(onlineClient,/recapSelect\.value=String\(getRecapSeconds\(\)\)/);
  assert.match(onlineClient,/setRecapSeconds\(recapSelect\.value\)/);
  assert.match(onlineClient,/onlineScoreRecap\.play\(\{/);
});


test('online scoring highlight starts after automatic calculations, not under parchment',()=>{
  const reveal=onlineClient.indexOf('function showOnlineHighlight(move){');
  const play=onlineClient.indexOf('onlineScoreRecap.play({');
  const onDone=onlineClient.indexOf('onDone:()=>showOnlineHighlight(move)',play);
  assert.ok(reveal>=0&&play>reveal&&onDone>play);
  assert.match(onlineClient,/showOnlineHighlight\(move\)\{/);
  assert.match(onlineClient,/recentOnlineMoveTimer=setTimeout\(\(\)=>\{/);
  assert.match(onlineClient,/until:Date\.now\(\)\+3000/);
  assert.match(onlineClient,/if\(gameState\?\.finished\)setTimeout\(\(\)=>renderOnlineResult\(gameState\),0\)/);
  assert.match(onlineClient,/onlineScoreRecap\.playing\(\)\|\|recentOnlineMove\)return/);
});

test('in-match online settings are always accessible and persist for the next move',()=>{
  const css=file('../online-game.css');
  assert.match(landing,/id="onlineSettingsButton"/);
  assert.match(landing,/id="onlineGameSettingsDialog"/);
  assert.match(landing,/id="onlineGameRecapSeconds"/);
  assert.match(landing,/id="onlineSettingsSave"/);
  assert.match(landing,/id="onlineSettingsCancel"/);
  assert.match(landing,/id="onlineCancel"/);
  for(const seconds of [2,3,5,8,10])
    assert.match(landing,new RegExp('<option value="'+seconds+'"[^>]*>'+seconds+' sekund'));
  assert.match(onlineClient,/onlineSettingsButton'\)\.addEventListener\('click'/);
  assert.match(onlineClient,/onlineGameRecapSeconds'\)\.value=String\(getRecapSeconds\(\)\)/);
  assert.match(onlineClient,/onlineSettingsSave'\)\.addEventListener\('click'/);
  assert.match(onlineClient,/setRecapSeconds\(choice\)/);
  assert.match(onlineClient,/onlineRecapSeconds'\)\.value=choice/);
  assert.match(css,/#onlineDialog \.online-header-actions/);
  assert.match(css,/#onlineDialog \.online-header-actions #onlineCancel/);
  assert.match(css,/#onlineGameSettingsDialog\.online-game-settings-dialog/);
});
