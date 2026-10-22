import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

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
  assert.match(onlineClient,/import \{ formatEquations \} from/);
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
  assert.match(onlineClient,/connection\?\.close\(\);connection=null;credential=null;gameState=null;currentProfile=null;\s*clearSavedCredential\(\)/);
  assert.doesNotMatch(onlineClient,/localStorage\.setItem\(authSessionKey/);
  assert.match(landing,/Abaku Online 0\.2\.10/);
  assert.match(lobby,/online-client\.js\?v=0\.2\.10/);
});
