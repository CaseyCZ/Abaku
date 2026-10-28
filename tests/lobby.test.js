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
  assert.match(landing,/Přihlášení pro online hru/);
  assert.match(lobby,/googleSignIn:'Přihlášení přes Google/);
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


test('Google auth is restored from Oracle device sessions across refresh and tabs',()=>{
  // Google ID tokens are short lived and only used to create revocable Oracle
  // sessions. A verified Oracle session lasts 30 days and is shared by tabs.
  assert.match(onlineClient,/const authSessionKey='abaku-online-google-session-v1'/);
  assert.match(onlineClient,/const durableSessionKey='abaku-online-device-session-v1'/);
  assert.match(onlineClient,/localStorage\.setItem\(durableSessionKey,token\)/);
  assert.match(onlineClient,/localStorage\.getItem\(durableSessionKey\)/);
  assert.match(onlineClient,/localStorage\.removeItem\(durableSessionKey\)/);
  assert.match(onlineClient,/sessionStorage\.removeItem\(authSessionKey\)/);
  assert.match(onlineClient,/const \{sessionToken\}=await api\('\/api\/session','POST'\)/);
  assert.match(onlineClient,/if\(!isAppSession\(sessionToken\)\)throw/);
  assert.match(onlineClient,/credential=sessionToken;\s*saveCredential\(sessionToken\)/);
  assert.match(onlineClient,/const saved=readSavedCredential\(\);\s*if\(saved&&await googleCredential\(saved\)\)return;/);
  assert.match(onlineClient,/if\(saved&&await googleCredential\(saved\)\)return;[\s\S]*?const g=await googleSdk\(\)/);
  assert.match(onlineClient,/const target=isAppSession\(credential\)\?'\/api\/session':'\/api\/presence'/);
  assert.match(onlineClient,/clearSavedCredential\(\)/);
  // Never persist the short-lived Google ID token to persistent storage.
  assert.doesNotMatch(onlineClient,/localStorage\.setItem\(durableSessionKey,value\)/);
  assert.match(landing,/Hráči a partie/);
  assert.match(lobby,/online-client\.js\?v=\d+\.\d+\.\d+/);
});

test('online match mirrors the offline Abaku board layout on phone and desktop',()=>{
  const html=landing;
  const css=file('../online-game.css');
  const chrome=file('../online-chrome.css');
  assert.match(html,/href="\.\/online-game\.css\?v=0\.2\.35"/);
  assert.match(html,/online-chrome\.css\?v=2/);
  assert.match(chrome,/\.online-match > \.online-control-bar/);
  assert.match(chrome,/grid-template-columns:minmax\(0,1fr\) minmax\(0,var\(--arena-board-size\)\) minmax\(0,1fr\)/);
  assert.match(chrome,/\.online-match\[hidden\]/);
  assert.match(chrome,/max-width:1100px\) and \(orientation:portrait\) and \(pointer:coarse/);
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
  assert.match(onlineClient,/revealArenaChat\(\)/);
  assert.match(onlineClient,/formatEquations\(last\.equations,10\)/);
  assert.match(onlineClient,/s\.history/);
  assert.match(onlineClient,/gameState\.deadline/);
});


test('online blue scorecard header follows the actual active player, not always player one',()=>{
  const css=file('../online-game.css');
  assert.match(landing,/online-game\.css\?v=0\.2\.35/);
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
  assert.match(onlineClient,/Server dočasně neodpovídá/);
  assert.match(onlineClient,/if\(!configured\)\{/);
  assert.match(onlineClient,/if\(onlineServerReady\)return;/);
});


test('offline homepage clears stuck loading and disables online choices until recovery',()=>{
  assert.match(landing,/id="retryServerButton"[^>]*hidden/);
  assert.match(onlineClient,/retryServerButton'\)\.addEventListener\('click'/);
  const start=onlineClient.indexOf('function setServerOffline(offline){');
  const end=onlineClient.indexOf('async function refreshPresence(){',start);
  assert.ok(start>=0&&end>start);
  const state={onlineCount:{textContent:'9'},waitingCount:{textContent:'3'},
    queueActivity:{textContent:'Zjišťuji stav čekajících…'},
    onlineWaitingCount:{textContent:'Zjišťuji počet čekajících…'},
    retryServerButton:{hidden:true},
    playRandom:{disabled:false},playFriends:{disabled:false}};
  const indicator={hidden:true};
  const context={document:{querySelector:()=>indicator},$:id=>state[id],lastPresence:{online:9,waiting:3}};
  const code=onlineClient.slice(start,end);
  new Script(code+';setServerOffline(true);').runInNewContext(context);
  assert.equal(indicator.hidden,false);
  assert.equal(state.retryServerButton.hidden,false);
  assert.equal(state.queueActivity.textContent.includes('Server je offline'),true);
  assert.equal(state.onlineCount.textContent,'—');
  assert.equal(state.waitingCount.textContent,'—');
  assert.equal(state.playRandom.disabled,true);
  assert.equal(state.playFriends.disabled,true);
  new Script(code+';setServerOffline(false);').runInNewContext(context);
  assert.equal(indicator.hidden,true);
  assert.equal(state.retryServerButton.hidden,true);
  assert.equal(state.playRandom.disabled,false);
  assert.equal(state.playFriends.disabled,false);
  assert.equal(state.queueActivity.textContent,'Zjišťuji stav čekajících…');
});

test('online reconnection client remains parseable JavaScript after new state handlers',()=>{
  const withoutImports=onlineClient.replace(/^import\s+.*?;\s*$/gm,'').replace(/\bexport\s+(?=(?:async\s+)?function|const|let|class)/g,'');
  assert.doesNotThrow(()=>new Script(withoutImports,{filename:'online-client.js'}));
});


test('match end displays winner and scores in a dedicated result dialog on all devices',()=>{
  const css=file('../result-dialog.css');
  assert.match(landing,/href="\.\/result-dialog\.css\?v=1"/);
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
  assert.match(css,/\.abaku-result-dialog\.online-result-dialog/);
  assert.match(css,/\.abaku-result-dialog::backdrop/);
});

test('collapsed or out-of-view chat gets a persistent tappable unread notification',()=>{
  const css=file('../online-game.css');
  assert.match(landing,/id="onlineChatToast"[^>]*hidden/);
  assert.match(landing,/id="onlineChatToastPreview"/);
  assert.match(landing,/id="onlineChatToastCount"/);
  assert.match(landing,/id="onlineUnreadBadge"[^>]*hidden/);
  assert.match(onlineClient,/function chatActuallyVisible\(\)/);
  assert.match(onlineClient,/getComputedStyle\(panel\)\.display==='none'/);
  assert.match(onlineClient,/if\(!own&&gameState&&\!gameState\.finished\)/);
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
  assert.match(onlineClient,/import \{ScoreRecap,getRecapSeconds,setRecapSeconds\} from '.\/score-recap\.js\?v=0\.2\.37'/);
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
  assert.match(landing,/id="onlineRecapSeconds"[\s\S]*?<option value="0">Vypnuto<\/option>/);
  for(const seconds of [2,3,5,8,10])
    assert.match(landing,new RegExp('<option value="'+seconds+'"[^>]*>'+seconds+' sekund'));
  assert.match(onlineClient,/import \{ScoreRecap,getRecapSeconds,setRecapSeconds\} from/);
  assert.match(onlineClient,/recapSelect\.value=String\(getRecapSeconds\(\)\)/);
  assert.match(onlineClient,/setRecapSeconds\(choice\)/);
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
  assert.match(landing,/id="onlineRecapSeconds"[\s\S]*?<option value="0">Vypnuto<\/option>/);
  assert.match(landing,/id="onlineSettingsButton"/);
  assert.match(landing,/id="onlineGameSettingsDialog"/);
  assert.match(landing,/id="onlineRecapSeconds"/);
  assert.match(landing,/id="onlineSettingsSave"/);
  assert.match(landing,/id="onlineSettingsCancel"/);
  assert.match(landing,/id="onlineCancel"/);
  for(const seconds of [2,3,5,8,10])
    assert.match(landing,new RegExp('<option value="'+seconds+'"[^>]*>'+seconds+' sekund'));
  assert.match(onlineClient,/onlineSettingsButton'\)\.addEventListener\('click',openSettings/);
  assert.match(onlineClient,/lobbySettingsButton'\)\.addEventListener\('click',openSettings/);
  assert.match(onlineClient,/onlineRecapSeconds'\)\.value=String\(getRecapSeconds\(\)\)/);
  assert.match(onlineClient,/onlineSettingsSave'\)\.addEventListener\('click'/);
  assert.match(onlineClient,/setRecapSeconds\(choice\)/);
  assert.match(onlineClient,/localStorage\.setItem\(timeStorageKey,String\(savedTurnSeconds\)\)/);
  assert.match(css,/#onlineDialog \.online-header-actions/);
  assert.match(css,/#onlineDialog \.online-header-actions #onlineCancel/);
  assert.match(css,/#onlineGameSettingsDialog\.online-game-settings-dialog/);
});


test('Vypnuto in-game preserves final board highlight without showing score scroll',()=>{
  const js=file('../src/score-recap.js');
  assert.match(js,/if\(getRecapSeconds\(\)===0\)\{\s*onDone\?\.\(\);\s*return;/);
  assert.match(onlineClient,/onDone:\(\)=>showOnlineHighlight\(move\)/);
});


test('server creates and verifies hashed revocable device sessions on REST and WebSocket',()=>{
  const api=file('../server/index.js');
  const store=file('../server/store.js');
  assert.match(api,/pathname==='\/api\/session'/);
  assert.match(api,/store\.createSession\(uid\)/);
  assert.match(api,/store\.revokeSession\(bearer\.slice\(7\)\)/);
  assert.match(api,/store\.sessionUid\(token\)/);
  assert.match(api,/return verifyGoogle\(token\)/);
  assert.match(api,/uid=await verify\(msg\.idToken\)/);
  assert.match(store,/CREATE TABLE IF NOT EXISTS login_sessions/);
  assert.match(store,/createHash\('sha256'\)/);
  assert.match(store,/const SESSION_TTL=30\*24\*60\*60\*1000/);
  assert.match(store,/const SESSION_RENEW_BELOW=20\*24\*60\*60\*1000/);
});


test('every online match result uses the same shared dialog as the local and AI game',()=>{
  const offline=file('../game.html');
  const css=file('../result-dialog.css');
  assert.match(landing,/id="onlineResultDialog" class="online-result-dialog abaku-result-dialog"/);
  assert.match(offline,/id="onlineResultDialog" class="online-result-dialog abaku-result-dialog"/);
  assert.match(css,/\.abaku-result-dialog \.online-result-scores/);
  assert.match(onlineClient,/renderOnlineResult\(msg\)/);
});


test('PO PŘIHLÁŠENÍ diagonal labels remain fully inside narrow mode cards',()=>{
  const styles=file('../lobby.css');
  assert.equal((landing.match(/class="future-ribbon">PO PŘIHLÁŠENÍ<\/span>/g)||[]).length,2);
  assert.match(landing,/lobby\.css\?v=[\w.-]+/);
  assert.match(styles,/\.future-ribbon\{[\s\S]*?top:44px;[\s\S]*?right:4px;[\s\S]*?width:140px;[\s\S]*?white-space:nowrap;/);
  assert.doesNotMatch(styles,/\.future-ribbon\{[^}]*right:-39px/);
});


test('online authenticated profile updates offline nickname cache and clears it on logout',()=>{
  const identity=file('../src/player-identity.js');
  assert.match(onlineClient,/cacheVerifiedOnlineProfile\(profile\)/);
  assert.match(onlineClient,/clearVerifiedOnlineProfile\(\)/);
  assert.match(onlineClient,/function clearSavedCredential\(\)/);
  assert.match(identity,/const ONLINE_PROFILE_KEY='abaku-online-display-profile-v1'/);
  assert.match(identity,/function validName\(value\)/);
});

test('offline server indicator uses a single display rule at every breakpoint',()=>{
  const css=file('../arena-home.css');
  const selector='.arena-home .lobby-header>.server-state';
  const rule=selector+'{display:flex;color:#ffb5b5;margin-left:auto}';
  assert.ok(css.includes(rule));
  assert.equal(css.split(selector+'{display:').length-1,1,
    'No second display override should silently hide or show the indicator');
  assert.doesNotMatch(css,/\.server-state\{display:none\}/);
  assert.match(css,/@media\(max-width:760px\)\{\s*\.arena-home \.lobby-header>\.server-state\{order:2;flex-basis:100%;margin:0\}/);
  assert.match(file('../lobby.css'),/\[hidden\]\{display:none!important\}/);
  assert.match(landing,/<span class="server-state" role="status" hidden>Server offline<\/span>/);
});


test('keyboard users can skip the homepage navigation without changing its layout',()=>{
  const css=file('../arena-home.css');
  const link='<a class="skip-to-content" href="#mainContent">Přejít na hlavní obsah</a>';
  assert.match(landing,/<body class="arena-home">\s*<a class="skip-to-content" href="#mainContent">Přejít na hlavní obsah<\/a>/);
  assert.ok(landing.includes(link));
  assert.match(landing,/<main class="lobby-main" id="mainContent" tabindex="-1">/);
  assert.ok(landing.indexOf(link)<landing.indexOf('<header class="lobby-header">'));
  assert.match(css,/\.arena-home \.skip-to-content\{[^}]*position:fixed;[^}]*transform:translateY\(-220%\)/);
  assert.match(css,/\.arena-home \.skip-to-content:focus\{transform:none;/);
});

test('homepage text is centered without modifying mode card geometry or responsive columns',()=>{
  const css=file('../arena-home.css');
  const intro='.arena-home .lobby-intro{display:flex;flex-direction:column;align-items:center;gap:14px;min-height:0;margin:0;padding:12px 0;text-align:center}';
  const eyebrow='.arena-home .lobby-intro .eyebrow{align-self:center}';
  const cards='.arena-home .mode-card{min-height:178px;padding:16px;gap:8px;align-items:center;text-align:center}';
  assert.ok(css.includes(intro));
  assert.ok(css.includes(eyebrow));
  assert.ok(css.includes(cards));
  assert.ok(css.includes('.arena-home .mode-copy,.arena-home .mode-queue{width:100%;text-align:center}'));
  assert.ok(css.includes('.arena-home .game-options{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}'));
  assert.ok(css.includes('.home-start{grid-template-columns:minmax(0,1fr);gap:18px}'));
  assert.ok(css.includes('.arena-home .lobby-intro .hero-resume{width:min(100%,430px)'));
  assert.match(landing,/href="\.\/arena-home\.css\?v=\d+\.\d+\.\d+"/);
});

test('home lower sections are centered and saved card bottom aligns with mode grid only on desktop',()=>{
  const css=file('../arena-home.css');
  // Lower home cards and their profile row retain original geometry but center their text.
  assert.match(css,/\.arena-home \.side-card\{padding:18px;text-align:center\}/);
  assert.match(css,/\.arena-home \.side-card \.profile-row\{justify-content:center;text-align:center\}/);
  assert.match(css,/\.arena-home \.side-card #retryServerButton\{display:block;margin:10px auto 0\}/);
  // The Google widget is already horizontally centered and should keep its layout.
  assert.match(file('../lobby.css'),/#googleSignInWidget\{\s*width:100%;max-width:100%;min-width:0;min-height:44px;\s*display:flex;justify-content:center;align-items:center/);
  assert.match(css,/\.arena-home \.quick-rules\{max-width:1500px;margin:24px auto 0;text-align:center\}/);
  assert.match(css,/\.arena-home \.quick-rules \.how-to-link\{justify-self:center;width:100%;text-align:center\}/);
  assert.match(css,/\.arena-home \.quick-rules ol\{padding-left:0;list-style-position:inside;text-align:center\}/);
  // Only align desktop bottom edges when the unified saved/online card is visible.
  assert.match(css,/@media\(min-width:761px\)\{\s*\.arena-home \.home-start:has\(#resumeCard:not\(\[hidden\]\)\)\{align-items:end\}/);
  assert.match(css,/@media\(max-width:760px\)\{[\s\S]*?\.home-start\{grid-template-columns:minmax\(0,1fr\);gap:18px\}/);
  assert.match(landing,/href="\.\/arena-home\.css\?v=\d+\.\d+\.\d+"/);
});
