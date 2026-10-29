import {revealArenaChat} from './arena-ui.js?v=0.2.51';
import {syncResumeCard} from './resume-card.js?v=0.2.51';
import { ONLINE_CONFIG } from './online-config.js?v=0.2.51';
import { describeMovePreview } from './preview.js?v=0.2.51';
import { formatEquations, bonusAt, TOTAL_TILES } from './rules.js?v=0.2.51';
import {ScoreRecap} from './score-recap.js?v=0.2.51';
import {createGameAudio} from './game-audio.js?v=0.2.51';
import {cacheVerifiedOnlineProfile,clearVerifiedOnlineProfile} from './player-identity.js?v=0.2.51';
import {bindFeedback} from './feedback-client.js?v=0.2.51';
import {remainingOnlineTurnSeconds} from './turn-deadline.js?v=0.2.51';

const $=id=>document.getElementById(id);
// Display the chess pawn as a text symbol while keeping the stored avatar value.
const displayAvatar=avatar=>avatar==='♟'?'♟\uFE0E':(avatar||'✦');
const ONLINE_TURN_SECONDS=60;
const ONLINE_RECAP_SECONDS=3;
const onlineScoreRecap=new ScoreRecap($('onlineDialog'),{seconds:()=>ONLINE_RECAP_SECONDS});
const ONLINE_SOUND_KEY='arena-online-sound-v1';
let onlineSoundEnabled=true;
try{onlineSoundEnabled=localStorage.getItem(ONLINE_SOUND_KEY)!=='false';}catch{}
const sound=createGameAudio(()=>onlineSoundEnabled);
const safeApiBase=()=>{
  try{
    const url=new URL(ONLINE_CONFIG.apiBase);
    if(url.protocol!=='https:'&&!(url.protocol==='http:'&&url.hostname==='localhost'))return '';
    return url.toString().replace(/\/$/,'');
  }catch{return '';}
};
const apiBase=safeApiBase();
const configured=Boolean(apiBase&&ONLINE_CONFIG.googleClientId);

// A Google ID token lives about one hour. Use it only once to obtain a
// server-issued, revocable 30-day session, shared across this browser's tabs.
// Tab-scoped Google ID tokens are used only to obtain a server session.
// Never save Google IDs in localStorage.
const authSessionKey='arena-online-google-session-v1';
const durableSessionKey='arena-online-device-session-v1';
const isAppSession=token=>typeof token==='string'&&/^arena_[A-Za-z0-9_-]{43}$/.test(token);
function readSavedCredential(){
  try{
    const session=localStorage.getItem(durableSessionKey);
    if(isAppSession(session))return session;
  }catch{}
  try{
    const legacy=sessionStorage.getItem(authSessionKey);
    if(typeof legacy==='string'&&legacy.length>=100&&legacy.length<=5000)return legacy;
  }catch{}
  return null;
}
function saveCredential(token){
  try{
    if(isAppSession(token)){
      localStorage.setItem(durableSessionKey,token);
      sessionStorage.removeItem(authSessionKey);
    }else{
      // If session exchange fails, keep the short-lived Google token in this tab only.
      sessionStorage.setItem(authSessionKey,token);
    }
  }catch{}
}
function clearSavedCredential(){
  try{localStorage.removeItem(durableSessionKey);}catch{}
  try{sessionStorage.removeItem(authSessionKey);}catch{}
  clearVerifiedOnlineProfile();
}
let credential=null,connection=null,gameState=null,selected=null,pending=[],exchanging=false,selectedExchange=new Set();
let onlineName='Hráč';
let recentOnlineMove=null;
let recentOnlineMoveId=null;
let recentOnlineMoveTimer=null;
let onlineTimerTicker=null;
let onlineTurnReadyTimer=null;
let reconnectTimer=null, reconnectAction=null, socketAuthenticated=false;
let reconnects=0, lastSocketMessageAt=0;
let socketMonitorTimer=null, onlineInitRetryTimer=null;
let onlineInitStarted=false, onlineServerReady=false;
let unreadOnlineChat=0, latestUnreadChat='';
let pendingFriendRequestCount=0, knownFriendRequestIds=new Set();
let resultShownFor=null, rematchRequestedByMe=false, rematchOfferFromOpponent=false;
let disconnectedOpponent=false;
let currentFriendChallenge=null;
let pendingFriendChallenge=null, promptedFriendChallengeId=null;
let lastHandledChallengeId=null;
let friendChallengeTimer=null, friendRequestTimer=null;
let presenceTimer=null;
let lastPresence=null;
let ownQueueWaiting=false;
async function heartbeat(){
  if(credential)await api('/api/presence','POST');
}
function otherWaitingCount(total){
  return Math.max(0,total-(ownQueueWaiting?1:0));
}
function paintPresence(data){
  lastPresence=data;
  $('onlineCount').textContent=Number.isSafeInteger(data.limit)?data.online+' / '+data.limit:String(data.online);
  const others=otherWaitingCount(data.waiting);
  $('waitingCount').textContent=String(others);
  $('onlineWaitingCount').textContent=others===0
    ? 'Nikdo další právě nečeká.'
    : 'Další hráči čekající na soupeře: '+others+'.';
}
function setServerOffline(offline){
  const indicator=document.querySelector('.server-state');
  indicator.hidden=!offline;
  $('retryServerButton').hidden=!offline;
  for(const id of ['playRandom','playFriends']) $(id).disabled=offline;
  if(offline){
    // The API may fail before the first presence request: never leave a loading label stuck.
    lastPresence=null;
    $('onlineCount').textContent='—';
    $('waitingCount').textContent='—';
    $('onlineWaitingCount').textContent='Server je offline.';
  }else if(!lastPresence){
    $('onlineWaitingCount').textContent='Zjišťuji počet čekajících…';
  }
}
async function refreshPresence(){
  if(!apiBase)return;
  try{
    const response=await fetch(apiBase+'/api/presence',{cache:'no-store'});
    if(!response.ok)throw new Error('Nedostupné');
    const data=await response.json();
    if(!Number.isSafeInteger(data.online)||!Number.isSafeInteger(data.waiting)||
       data.online<0||data.waiting<0||data.waiting>data.online)throw new Error('Neplatná data');
    paintPresence(data);
    setServerOffline(false);
  }catch{
    // Clear stale counts and enable retry, including when /api/presence alone fails.
    setServerOffline(true);
  }
}
function startPresenceUpdates(){
  if(presenceTimer)return;
  const refresh=async()=>{
    if(document.visibilityState==='hidden')return;
    if(credential)await heartbeat().catch(()=>{});
    await refreshPresence();
    if(credential)await refreshResumeCard();
  };
  refresh();
  presenceTimer=setInterval(refresh,20_000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
}
let currentProfile=null;
export function getOnlineProfile(){return currentProfile ? {...currentProfile} : null;}
export async function updateOnlineProfile(nickname,avatar){
  const response=await api('/api/me','POST',{nickname,avatar});
  showProfile(response.profile);
  return response.profile;
}

function status(text,error=false){
  const target=$('onlineStatus');
  if(target){target.textContent=text;target.dataset.error=error?'true':'false';}
  // The local game displays move feedback directly below the board on tablets.
  // Keep the online waiting status above the board but mirror in-game feedback
  // into the same location as the shared local layout.
  const boardMessage=$('onlineBoardMessage');
  if(boardMessage){boardMessage.textContent=text;boardMessage.dataset.error=error?'true':'false';}
  const matchMessage=$('onlineGameMessage');
  if(matchMessage){matchMessage.textContent=text;matchMessage.dataset.error=error?'true':'false';}
}
async function api(path,method='GET',data){
  if(!credential)throw new Error('Nejdříve se přihlas přes Google.');
  const response=await fetch(apiBase+path,{
    method,headers:{Authorization:'Bearer '+credential,...(data?{'Content-Type':'application/json'}:{})},
    ...(data?{body:JSON.stringify(data)}:{})
  });
  const json=await response.json();
  if(!response.ok){
    const error=new Error(json.error||'Server neodpověděl.');
    error.httpStatus=response.status;
    throw error;
  }
  return json;
}
function googleSdk(){
  return new Promise((resolve,reject)=>{
    if(window.google?.accounts?.id)return resolve(window.google.accounts.id);
    const script=document.createElement('script');
    script.src='https://accounts.google.com/gsi/client';
    script.async=true;
    script.onload=()=>window.google?.accounts?.id?resolve(window.google.accounts.id):reject(new Error('Google přihlášení není dostupné.'));
    script.onerror=()=>reject(new Error('Nepodařilo se načíst přihlášení Google.'));
    document.head.append(script);
  });
}
function showProfile(profile){
  currentProfile=profile;
  onlineName=profile.nickname;
  // Also show this verified nickname as Player 1 in the local/AI game.
  cacheVerifiedOnlineProfile(profile);
  $('welcomeName').textContent=profile.nickname;
  $('profileName').textContent=profile.nickname;
  $('profileAvatar').textContent=displayAvatar(profile.avatar);
  $('onlineStats').hidden=false;
  $('onlineStats').textContent='Zápasy: '+profile.played+' · Výhry: '+profile.wins+' · Úspěšnost: '+profile.winRate+' %';
  $('onlineLogout').hidden=false;
  $('googleSignInWidget').hidden=true;
  $('onlineLoginNotice').hidden=true;
  $('profileSubtitle').textContent='Google účet · online';
  $('profileDescription').textContent='Tento profil a statistiky jsou uložené u tvého účtu. Úpravy přezdívky se synchronizují mezi zařízeními.';
  $('editProfile').textContent='Upravit online profil';
  $('manageFriends').hidden=false;
  $('onlineInfoText').textContent='Můžeš vyzvat přítele přímo ze seznamu nebo najít náhodného soupeře.';
  const onlineModes=[
    ['playRandom','HLEDAT SOUPEŘE'],
    ['playFriends','VYBRAT PŘÍTELE']
  ];
  for(const [id,action] of onlineModes){
    const card=$(id);
    card.classList.add('mode-connected');
    card.querySelector('.future-ribbon').textContent='ONLINE';
    const label=card.querySelector('.mode-action');
    label.textContent=action;
    label.classList.remove('muted');
  }
}
async function googleCredential(value){
  credential=value;
  try{
    // Oracle verifies the signed Google ID token, or a saved app session,
    // before the browser displays the authenticated profile.
    const {profile}=await api('/api/me');
    let lastingSession=isAppSession(value);
    if(!lastingSession){
      // Convert the short-lived Google ID token to a reusable, server-revocable
      // session. If exchange fails temporarily, retain the tab-scoped token
      // rather than interrupting the player's current login.
      try{
        const {sessionToken}=await api('/api/session','POST');
        if(!isAppSession(sessionToken))throw new Error('Server nevrátil platnou relaci.');
        credential=sessionToken;
        saveCredential(sessionToken);
        lastingSession=true;
      }catch{
        saveCredential(value);
      }
    }else saveCredential(value);
    showProfile(profile);
    if(!lastingSession){
      $('onlineInfoText').textContent='Jsi přihlášený. Po zavření prohlížeče může být potřeba přihlásit se znovu.';
    }
    await heartbeat().catch(()=>{});
    await refreshPresence();
    await refreshResumeCard();
    startFriendChallengeUpdates();
    return true;
  }catch(error){
    // Network outages and throttling do NOT invalidate a verified Google ID
    // token. Try the same saved session again after five seconds.
    if(error.httpStatus!==400&&error.httpStatus!==401){
      status('Server dočasně neodpovídá. Obnovuji přihlášení za 5 sekund…',true);
      $('onlineLoginNotice').hidden=false;
      $('onlineLoginNotice').textContent='Spojení se serverem není dostupné. Zkusím znovu za 5 sekund.';
      setTimeout(()=>{if(credential===value)googleCredential(value);},5000);
      return true;
    }
    credential=null;
    clearSavedCredential();
    status(error.message,true);
    $('onlineLoginNotice').hidden=false;
    $('onlineLoginNotice').textContent='Přihlášení je neplatné nebo vypršelo. Přihlas se přes Google.';
    $('googleSignInWidget').hidden=false;
    return false;
  }
}
// Chat can be collapsed or far below the visible game board on a phone.
// Keep a compact, tappable notification at the viewport edge until read.
function refreshUnreadChat(){
  const toast=$('onlineChatToast');
  const badge=$('onlineUnreadBadge');
  const hasUnread=unreadOnlineChat>0&&!!gameState&&!gameState.finished&&!$('onlineBoardWrapper').hidden;
  const messageCount=hasUnread?unreadOnlineChat:0;
  const notificationCount=messageCount+(pendingFriendChallenge?1:0)+pendingFriendRequestCount;
  for(const id of ['menuMessageBadge','friendsMessageBadge','onlineFriendsMessageBadge']){
    const counter=$(id);
    if(!counter)continue;
    counter.hidden=notificationCount===0;
    counter.textContent=notificationCount>99?'99+':String(notificationCount);
  }
  for(const [id,name] of [['menuToggle','Otevřít menu'],['friendsOpen','Přátelé'],['onlineFriendsOpen','Přátelé']]){
    const button=$(id);
    if(button)button.setAttribute('aria-label',name+(notificationCount?' · '+notificationCount+' upozornění':''));
  }
  toast.hidden=!hasUnread;
  badge.hidden=!hasUnread;
  if(hasUnread){
    badge.textContent=unreadOnlineChat>99?'99+':String(unreadOnlineChat);
    $('onlineChatToastCount').textContent=unreadOnlineChat===1?'Nová zpráva · Chat':'Nové zprávy ('+unreadOnlineChat+')';
    $('onlineChatToastPreview').textContent=latestUnreadChat;
    toast.setAttribute('aria-label','Otevřít chat: '+unreadOnlineChat+' nepřečtených zpráv');
  }
}
function setFriendRequestNotifications(requests,announce=false){
  const list=Array.isArray(requests)?requests:[];
  const ids=new Set(list.map(player=>player.id).filter(id=>typeof id==='string'));
  const newlyReceived=list.find(player=>typeof player.id==='string'&&!knownFriendRequestIds.has(player.id));
  pendingFriendRequestCount=ids.size;
  knownFriendRequestIds=ids;
  refreshUnreadChat();
  const toast=$('friendRequestToast');
  if(!toast)return;
  if(!ids.size||$('friendsDialog').open){toast.hidden=true;return;}
  if(announce&&newlyReceived){
    toast.textContent='Nová žádost o přátelství od '+newlyReceived.nickname+' · Zobrazit';
    toast.hidden=false;
  }
}
function markOnlineChatRead(){
  if(!unreadOnlineChat)return;
  unreadOnlineChat=0;
  latestUnreadChat='';
  refreshUnreadChat();
}
function revealOnlineChat(){
  revealArenaChat();
  $('onlineChat').scrollIntoView({behavior:'smooth',block:'center'});
  // The user explicitly opened the message notification.
  markOnlineChatRead();
}
function resetOnlineChat(){
  unreadOnlineChat=0;latestUnreadChat='';
  $('onlineChat').replaceChildren();
  refreshUnreadChat();
}
function resetOnlineResult(){
  if($('onlineResultDialog').open)$('onlineResultDialog').close();
  resultShownFor=null;rematchRequestedByMe=false;rematchOfferFromOpponent=false;
  $('onlineRematchStatus').textContent='';
  $('onlineRematch').disabled=false;
  $('onlineRematch').textContent='⚔ Odveta';
  $('onlineOpponentNotice').hidden=true;
  disconnectedOpponent=false;
}
function renderOnlineResult(state){
  if(!state?.finished||resultShownFor===state.matchId||onlineScoreRecap.playing()||recentOnlineMove)return;
  resultShownFor=state.matchId;
  const myName=onlinePlayerName(state.mySide);
  const opponentName=onlinePlayerName(1-state.mySide);
  const winner=state.winner;
  const title=state.reason==='abandoned'?'Partie přerušena'
    :winner===null?'Remíza':winner===state.mySide?'🏆 Vyhrál jsi!':'Soupeř vyhrál';
  $('onlineResultTitle').textContent=title;
  $('onlineResultDescription').textContent=winner===null
    ?'Partie nemá vítěze.'
    :'Vítěz: '+(winner===state.mySide?myName:opponentName);
  for(let side=0;side<2;side++){
    $('onlineResultPlayer'+side).textContent=onlinePlayerName(side);
    $('onlineResultScore'+side).textContent=String(state.players[side].score);
  }
  const reason={
    completed:'Hra skončila podle pravidel.',
    forfeit:'Jeden z hráčů se nevrátil do 60 sekund. Partie skončila kontumačně.',
    resigned:'Jeden z hráčů ukončil partii předčasně.',
    abandoned:'Oba hráči se odpojili. Zápas byl ukončen bez výsledku.'
  };
  $('onlineResultReason').textContent=reason[state.reason]||'Partie skončila.';
  $('onlineRematch').hidden=state.reason==='abandoned';
  $('onlineRematchStatus').textContent='Můžete se domluvit na odvetě.';
  if(!$('onlineResultDialog').open)$('onlineResultDialog').showModal();
}
// The server is authoritative: never infer a resumable match from localStorage.
async function refreshResumeCard(){
  const card=$('onlineResumeCard');
  if(!credential){card.hidden=true;syncResumeCard();return;}
  try{
    const data=await api('/api/match/current');
    if(!credential||!data.match||data.match.finished){
      card.hidden=true;
      syncResumeCard();
      return;
    }
    const match=data.match;
    const opponent=match.players?.[1-match.mySide]?.nickname||'soupeř';
    const points=(match.players||[]).map(player=>Number(player.score)||0);
    $('onlineResumeDescription').textContent='Soupeř: '+opponent+' · skóre '+points[0]+' : '+points[1]+
      ' · tah '+(Number(match.turns)+1)+'.';
    // Keep the button accessible when returning to the menu after a disconnect.
    card.hidden=$('onlineDialog').open;
    syncResumeCard();
  }catch{
    // If Oracle is unavailable, don't promise that an old match still exists.
    card.hidden=true;
    syncResumeCard();
  }
}
let randomMatchChecking=false;
function showRandomMatchNotice(title,message){
  $('plannedTitle').textContent=title;
  $('plannedText').textContent=message;
  if(!$('plannedDialog').open)$('plannedDialog').showModal();
}
async function startRandomMatch(){
  if(randomMatchChecking)return;
  randomMatchChecking=true;
  try{
    // Check Oracle before creating a second match request: the active game
    // may be on another tab or device, so local storage is not authoritative.
    const {match}=await api('/api/match/current');
    if(match&&!match.finished){
      await refreshResumeCard();
      showRandomMatchNotice('Máš rozehranou online partii',
        'Nejdřív se vrať do rozehrané hry tlačítkem „Pokračovat v online partii“. Nového soupeře můžeš hledat až po jejím skončení.');
      return;
    }
    connectOnline({type:'random',seconds:ONLINE_TURN_SECONDS});
  }catch{
    showRandomMatchNotice('Nepodařilo se ověřit rozehranou partii',
      'Zkus to znovu za chvíli. Hledání zatím nespouštím, aby se nepřerušila případná rozehraná hra.');
  }finally{
    randomMatchChecking=false;
  }
}
function clearReconnect(){
  if(reconnectTimer!==null)clearTimeout(reconnectTimer);
  reconnectTimer=null;
  $('onlineReconnectNotice').hidden=true;
}
function showReconnect(reason='Spojení se přerušilo.'){
  if(!$('onlineDialog').open||!credential)return;
  $('onlineReconnectNotice').hidden=false;
  $('onlineReconnectText').textContent=reason+' Znovu zkusím za 5 sekund.';
  status(reason+' Opakuji připojení za 5 sekund…',true);
}
function retryOnlineConnection(){
  if(!$('onlineDialog').open||!credential)return;
  clearReconnect();
  const next=gameState&&!gameState.finished?{type:'resume'}:
    (reconnectAction?.type==='random'?reconnectAction:{type:'resume'});
  reconnects++;
  $('onlineReconnectNotice').hidden=false;
  $('onlineReconnectText').textContent='Připojuji se znovu… (pokus '+reconnects+').';
  connectOnline(next,{reconnecting:true});
}
function scheduleReconnect(reason){
  if(!$('onlineDialog').open||!credential)return;
  if(reconnectTimer!==null)return;
  showReconnect(reason);
  reconnectTimer=setTimeout(()=>{
    reconnectTimer=null;
    retryOnlineConnection();
  },5000);
}
function send(type,fields={}){
  if(!connection||connection.readyState!==WebSocket.OPEN){
    scheduleReconnect('Spojení se serverem není aktivní.');
    return;
  }
  connection.send(JSON.stringify({type,...fields}));
}
// Three seconds of unobstructed board highlighting AFTER the scroll,
// for both online players (never while the scroll covers the board).
function clearOnlineReview(){
  if(recentOnlineMoveTimer!==null)clearTimeout(recentOnlineMoveTimer);
  recentOnlineMoveTimer=null;recentOnlineMove=null;recentOnlineMoveId=null;
}
function showOnlineHighlight(move){
  return new Promise(resolve=>{
    if(recentOnlineMoveTimer!==null)clearTimeout(recentOnlineMoveTimer);
    recentOnlineMove={
      placed:new Set(move.placed.map(p=>p.row+':'+p.col)),
      cells:new Set(move.cells.map(p=>p.row+':'+p.col)),
      text:'Hráč '+(move.player+1)+': '+formatEquations(move.equations)+' · +'+move.points+' bodů',
      until:Date.now()+3000
    };
    if(gameState)renderOnline();
    recentOnlineMoveTimer=setTimeout(()=>{
      recentOnlineMove=null;recentOnlineMoveTimer=null;
      if(gameState)renderOnline();
      resolve();
      // Wait for the scoring queue to release before showing match results.
      if(gameState?.finished)setTimeout(()=>renderOnlineResult(gameState),0);
    },3000);
  });
}
function showOnlineReview(state){
  const move=state.lastMove;
  if(!move||!Array.isArray(move.placed)||!Array.isArray(move.cells))return;
  // A pass or exchange advances turns but must not replay an older scorecard.
  const key=state.matchId+':'+(move.turnNumber??state.turns);
  if(key===recentOnlineMoveId)return;
  // A previous move may still be showing its board highlight. Do not
  // cancel that timer: the recap queue is waiting for it to resolve.
  if(recentOnlineMoveTimer===null)clearOnlineReview();
  recentOnlineMoveId=key;
  // The actual score was already awarded by the server. The next turn's
  // server deadline starts after both players have time to see this review.
  if(Number.isFinite(move.at)&&Date.now()-move.at<12_000&&Date.now()-move.at>=-5_000&&
     (!state.finished||state.reason==='completed')){
    onlineScoreRecap.play({
      player:state.players?.[move.player]?.nickname||'Hráč '+(move.player+1),
      breakdown:move.equationBreakdown,equations:move.equations,
      total:move.points,
      onDone:()=>showOnlineHighlight(move)
    });
  }
}
function connectOnline(action,{reconnecting=false}={}){
  if(!credential){status('Nejdříve se přihlas přes Google.',true);return;}
  clearReconnect();
  if(connection){
    const old=connection;
    connection=null;
    old.close();
  }
  socketAuthenticated=false;
  reconnectAction=action;
  if(!reconnecting){
    ownQueueWaiting=false;
    pending=[];selected=null;gameState=null;exchanging=false;selectedExchange.clear();
    clearOnlineReview();
    onlineScoreRecap.cancel();
    resetOnlineResult();
    if(!$('onlineDialog').open)$('onlineDialog').showModal();
    $('onlineMatchScoreboard').hidden=true;
    $('onlineBoardWrapper').hidden=true;
    $('onlineWaiting').hidden=false;
    $('onlineCancelSearch').hidden=action.type!=='random';
    $('onlineCode').textContent='';
    resetOnlineChat();
  }else if(gameState){
    pending=[];selected=null;exchanging=false;selectedExchange.clear();
    renderOnline();
  }
  if(reconnecting&&!gameState)$('onlineCancelSearch').hidden=action.type!=='random';
  $('onlineResumeCard').hidden=true;
  syncResumeCard();
  refreshPresence();
  status(reconnecting?'Znovu se připojuji k serveru…':'Připojuji se k serveru…');
  const wsUrl=apiBase.replace(/^http/,'ws')+'/ws';
  let socket;
  try{socket=new WebSocket(wsUrl);}
  catch{
    scheduleReconnect('Nepodařilo se otevřít spojení se serverem.');
    return;
  }
  connection=socket;
  lastSocketMessageAt=Date.now();
  let awaitingRecoveryState=reconnecting;
  const authWatchdog=setTimeout(()=>{
    if(connection!==socket||socketAuthenticated)return;
    socket.close();
    scheduleReconnect('Server neodpověděl na připojení.');
  },10_000);
  socket.addEventListener('open',()=>send('auth',{idToken:credential}));
  socket.addEventListener('message',event=>{
    if(connection!==socket)return;
    let msg;try{msg=JSON.parse(event.data)}catch{return;}
    lastSocketMessageAt=Date.now();
    if(msg.type==='error'){
      if(!socketAuthenticated&&/přihlášení|token|jwt|expired/i.test(msg.message||'')){
        status('Přihlášení vypršelo. Obnov stránku a přihlas se znovu.',true);
        clearSavedCredential();
        credential=null;
        clearReconnect();
        socket.close();
        return;
      }
      status(msg.message||'Chyba serveru.',true);
      if(gameState)sound('error');
      return;
    }
    if(msg.type==='authenticated'){
      clearTimeout(authWatchdog);
      socketAuthenticated=true;
      reconnects=0;
      clearReconnect();
      if(reconnecting)status('Spojení obnoveno. Načítám aktuální partii…');
      if(action.type==='resume')send('sync');
      else if(action.type==='random')send('matchmake',{seconds:action.seconds});
      else if(action.type==='invite')send('invite',{seconds:action.seconds});
      else if(action.type==='friend')send('challenge-friend',{targetId:action.targetId,seconds:action.seconds});
      else if(action.type==='join')send('join-invite',{code:action.code});
      else send('sync');
      return;
    }
    if(msg.type==='queue'){
      ownQueueWaiting=Boolean(msg.waiting);
      $('onlineCancelSearch').hidden=!ownQueueWaiting;
      status(msg.waiting?'Hledám online soupeře (60 sekund na tah)…':'Hledání zrušeno.');
      if(lastPresence)paintPresence(lastPresence);
      refreshPresence();return;
    }
    if(msg.type==='invite'){
      $('onlineCode').textContent=msg.code;
      status(action.type==='friend'?'Výzvu posílám hráči '+action.friendName+'…':'Pozvi přítele tímto kódem. Platí deset minut.');
      return;
    }
    if(msg.type==='friend-challenge-sent'){
      status('Výzva pro '+msg.to+' byla odeslána. Čekám na přijetí (max. 10 minut).');
      return;
    }
    if(msg.type==='friend-challenge-response'){
      status(msg.accepted
        ? msg.from+' přijal výzvu. Čekám na připojení…'
        : msg.from+' odmítl výzvu.');
      return;
    }
    if(msg.type==='friend-challenge-available'){
      refreshFriendChallenges();
      return;
    }
    if(msg.type==='match-start'){
      ownQueueWaiting=false;
      $('onlineCancelSearch').hidden=true;
      if(gameState?.matchId!==msg.matchId){
        onlineScoreRecap.cancel();
        clearOnlineReview();
        resetOnlineResult();
        resetOnlineChat();
        pending=[];selected=null;gameState=null;exchanging=false;selectedExchange.clear();
      }
      status('Soupeř připojen, partie začíná!');
      refreshPresence();
      return;
    }
    if(msg.type==='match-state'){
      ownQueueWaiting=false;
      $('onlineCancelSearch').hidden=true;
      const previous=gameState?.turn;
      const changedMatch=gameState?.matchId&&gameState.matchId!==msg.matchId;
      if(changedMatch){onlineScoreRecap.cancel();clearOnlineReview();resetOnlineResult();resetOnlineChat();}
      gameState=msg;
      scheduleOnlineTurnReady();
      if(!msg.finished) $('onlineOpponentNotice').hidden=!disconnectedOpponent;
      if(awaitingRecoveryState){
        awaitingRecoveryState=false;
        status(msg.finished?'Partie již skončila.':'Spojení obnoveno, pokračujeme v partii.');
      }
      showOnlineReview(msg);
      if(previous!==msg.turn||msg.finished){pending=[];selected=null;exchanging=false;selectedExchange.clear();}
      $('onlineWaiting').hidden=true;
      $('onlineBoardWrapper').hidden=false;
      renderOnline();
      renderOnlineResult(msg);
      refreshUnreadChat();
      return;
    }
    if(msg.type==='lobby'){
      ownQueueWaiting=Boolean(msg.queued);
      $('onlineCancelSearch').hidden=!ownQueueWaiting;
      if((gameState&&!gameState.finished)||action.type==='resume'){
        gameState=null;pending=[];selected=null;
        $('onlineBoardWrapper').hidden=true;
        $('onlineWaiting').hidden=false;
        $('onlineWaiting').querySelector('p').textContent='Partie již na serveru není aktivní. Vrať se do nabídky a začni novou.';
        status('Rozehranou partii už nelze obnovit.',true);
        refreshResumeCard();
      }
      return;
    }
    if(msg.type==='move-accepted'){pending=[];selected=null;sound('success');status('Platný tah: '+formatEquations(msg.equations)+' · +'+msg.points+' bodů.');return;}
    if(msg.type==='turn-passed'){status('Tah vynechán ('+msg.reason+').');return;}
    if(msg.type==='opponent'){
      disconnectedOpponent=msg.status==='disconnected';
      $('onlineOpponentNotice').hidden=!disconnectedOpponent;
      if(disconnectedOpponent){
        $('onlineOpponentNotice').textContent='⚠ Soupeř se odpojil. Má 60 sekund na návrat; pokud se nevrátí, partie skončí.';
        status('Soupeř se odpojil, čeká se až 60 sekund na jeho návrat.',true);
      }else status('Soupeř se znovu připojil. Partie pokračuje.');
      return;
    }
    if(msg.type==='match-end'){
      $('onlineOpponentNotice').hidden=true;
      status(msg.winner===null?'Partie skončila remízou.':(msg.winner===gameState?.mySide?'Vyhrál jsi!':'Soupeř vyhrál.'));
      // The subsequent match-state contains exact names/scores/reason for the result dialog.
      return;
    }
    if(msg.type==='rematch-status'){
      if(msg.status==='requested'){
        if(msg.by===gameState?.mySide){
          rematchRequestedByMe=true;
          $('onlineRematch').disabled=true;
          $('onlineRematchStatus').textContent='Odveta nabídnuta. Čekám, zda soupeř přijme…';
        }else{
          rematchOfferFromOpponent=true;
          $('onlineRematchStatus').textContent='Soupeř žádá odvetu. Chceš hrát znovu?';
        }
      }else if(msg.status==='declined'){
        rematchRequestedByMe=false;rematchOfferFromOpponent=false;
        $('onlineRematch').disabled=false;
        $('onlineRematchStatus').textContent='Odveta odmítnuta.';
      }
      return;
    }
    if(msg.type==='chat')addChat(msg.from,msg.text);
  });
  socket.addEventListener('close',event=>{
    clearTimeout(authWatchdog);
    if(connection!==socket)return;
    connection=null;
    socketAuthenticated=false;
    ownQueueWaiting=false;
    if(gameState)renderOnline();
    if(event.code===1000&&event.reason==='Nové připojení'){
      status('Partie byla otevřena v jiné kartě nebo zařízení.',true);
      return;
    }
    if(event.code===1013){
      clearReconnect();
      status('Server je plný (700/700 hráčů). Zkus to později.',true);
      return;
    }
    if(gameState?.finished)return;
    scheduleReconnect('Spojení přerušeno.');
  });
  socket.addEventListener('error',()=>{
    if(connection!==socket)return;
    status('Spojení se serverem se přerušilo.',true);
    // Browsers deliver the close event next; that is where retry is scheduled.
  });
}
function ownTurn(){return gameState&&!gameState.finished&&gameState.mySide===gameState.turn&&
  (!Number.isFinite(gameState.turnStartsAt)||Date.now()>=gameState.turnStartsAt)&&
  socketAuthenticated&&connection?.readyState===WebSocket.OPEN;}
function scheduleOnlineTurnReady(){
  if(onlineTurnReadyTimer!==null)clearTimeout(onlineTurnReadyTimer);
  onlineTurnReadyTimer=null;
  const until=Number(gameState?.turnStartsAt);
  if(!gameState||gameState.finished||!Number.isFinite(until)||until<=Date.now())return;
  onlineTurnReadyTimer=setTimeout(()=>{
    onlineTurnReadyTimer=null;
    if(gameState&&!gameState.finished)renderOnline();
  },until-Date.now()+50);
}
function addChat(uid,text){
  const line=document.createElement('div');
  line.className='online-chat-line';
  const own=gameState?.mySide===uid;
  line.textContent=(own?'Já: ':'Soupeř: ')+String(text||'');
  const chat=$('onlineChat');
  chat.append(line);
  chat.scrollTop=chat.scrollHeight;
  requestAnimationFrame(()=>{
    if(chat.isConnected)chat.scrollTop=chat.scrollHeight;
  });
  if(!own&&gameState&&!gameState.finished){
    unreadOnlineChat++;
    latestUnreadChat=String(text||'').slice(0,80);
  }
  refreshUnreadChat();
}
// Use the same status, progress and turn clock found in the offline game.
function onlinePlayerName(side){
  const fromServer=gameState?.players?.[side]?.nickname;
  if(typeof fromServer==='string'&&fromServer.trim())return fromServer.trim();
  return side===gameState?.mySide ? onlineName : 'Hráč '+(side+1);
}
function updateOnlineTimer(){
  if(!gameState||$('onlineBoardWrapper').hidden)return;
  const remaining=remainingOnlineTurnSeconds(gameState);
  $('onlineTimer').textContent=String(Math.floor(remaining/60)).padStart(2,'0')+':'+String(remaining%60).padStart(2,'0');
  $('onlineTimer').parentElement.classList.toggle('warning',!gameState.finished&&remaining<=15);
}
function renderOnlineProgress(s){
  const track=$('onlineProgress');
  const used=Math.max(0,Math.min(20,Math.round((TOTAL_TILES-s.bagCount)/TOTAL_TILES*20)));
  const fragment=document.createDocumentFragment();
  for(let i=0;i<20;i++){
    const bead=document.createElement('i');
    if(i<used)bead.className=i>15?'late':'used';
    fragment.append(bead);
  }
  track.replaceChildren(fragment);
}
function renderOnlineStatus(s){
  $('onlineMatchScoreboard').hidden=false;
  const label=side=>onlinePlayerName(side);
  $('onlineTurnName').textContent=s.finished?'Partie skončila':label(s.turn);
  for(let side=0;side<2;side++){
    $('onlinePlayer'+side+'Name').textContent=label(side);
    $('onlinePlayer'+side+'Score').textContent=s.players[side].score;
    $('onlinePlayer'+side+'Status').textContent=s.finished?'Konec':s.turn===side?'Na tahu':'Čeká';
    $('onlinePlayer'+side+'Card').classList.toggle('active',!s.finished&&s.turn===side);
  }
  $('onlineBagCount').textContent=String(s.bagCount);
  const last=s.lastMove;
  $('onlineLastPlayer').textContent=last?label(last.player):'—';
  $('onlineLastEquation').textContent=last?.equations?.length?formatEquations(last.equations,10):'—';
  $('onlineLastPoints').textContent=last?'+'+last.points:'—';
  const history=$('onlineMoveHistory');
  history.replaceChildren();
  const moves=(Array.isArray(s.history)&&s.history.length?s.history:last?[last]:[]).slice(-6).reverse();
  for(const entry of moves){
    const item=document.createElement('li');
    const points=document.createElement('strong');
    points.textContent='+'+entry.points+'b';
    const turnLabel=Number.isInteger(entry.turnNumber)&&entry.turnNumber>0
      ?entry.turnNumber+'. tah ':'';
    const added=Array.isArray(entry.addedNumbers)&&entry.addedNumbers.length
      ?' ('+entry.addedNumbers.join(',')+')':'';
    item.append(document.createTextNode(turnLabel+label(entry.player)+added+' '),points,
      document.createTextNode(' '+formatEquations(entry.equations,2)));
    history.append(item);
  }
}
const ONLINE_BONUS_LABELS={dd:'Číslo ×2',td:'Číslo ×3',de:'Příklad ×2',te:'Příklad ×3'};
function renderOnline(){
  if(!gameState)return;
  const s=gameState;
  const info=$('onlineScore');
  info.textContent='Hráč 1: '+s.players[0].score+' · Hráč 2: '+s.players[1].score+' · V sáčku: '+s.bagCount+' · Čas na tah: '+(s.seconds||60)+' s';
  renderOnlineProgress(s);
  renderOnlineStatus(s);
  updateOnlineTimer();
  $('onlineTurn').textContent=s.finished?'Partie skončila.':ownTurn()?'Jsi na tahu.':'Čekáš na soupeře.';
  const board=$('onlineBoard');
  const focused=board.contains(document.activeElement)
    ? {row:document.activeElement.dataset.row,col:document.activeElement.dataset.col} : null;
  board.replaceChildren();
  const staged=new Map(pending.map(p=>[p.row+':'+p.col,p]));
  const canPlay=ownTurn();
  const fragment=document.createDocumentFragment();
  for(let row=0;row<15;row++)for(let col=0;col<15;col++){
    const p=staged.get(row+':'+col);
    const digit=p?.digit??s.board[row][col];
    const bonus=bonusAt(row,col);
    const cell=document.createElement('button');
    cell.type='button';
    cell.dataset.row=row;cell.dataset.col=col;
    cell.className='cell '+bonus+(p?' pending':digit!==null?' occupied':' bonus-hint');
    const key=row+':'+col;
    if(recentOnlineMove&&Date.now()<recentOnlineMove.until){
      if(recentOnlineMove.cells.has(key))cell.classList.add('recent-equation');
      if(recentOnlineMove.placed.has(key))cell.classList.add('recent-tile');
    }
    cell.textContent=digit===null?(bonus?'×'+(bonus==='dd'||bonus==='de'?2:3):''):String(digit);
    cell.disabled=!canPlay||(!p&&digit!==null);
    const cellLabel=digit===null?'prázdné políčko':(p?'nově položená číslice ':'číslice ')+digit;
    cell.setAttribute('aria-label','Řádek '+(row+1)+', sloupec '+(col+1)+', '+cellLabel+(bonus?', '+ONLINE_BONUS_LABELS[bonus]:''));
    cell.title=cell.getAttribute('aria-label');
    cell.addEventListener('click',()=>{
      const old=pending.findIndex(p=>p.row===row&&p.col===col);
      if(old>=0){selected=pending[old].rackIndex;pending.splice(old,1);sound();renderOnline();return;}
      if(selected===null||pending.some(p=>p.rackIndex===selected))return;
      pending.push({row,col,digit:s.rack[selected],rackIndex:selected});
      selected=null;sound();renderOnline();
    });
    fragment.append(cell);
  }
  board.append(fragment);
  if(focused){
    const restored=board.querySelector(`.cell[data-row="${focused.row}"][data-col="${focused.col}"]`);
    if(restored&&!restored.disabled)restored.focus({preventScroll:true});
  }
  const review=$('onlineLastMoveReview');
  review.hidden=!recentOnlineMove||Date.now()>=recentOnlineMove.until;
  if(!review.hidden)review.textContent=recentOnlineMove.text;
  const rack=$('onlineRack');rack.replaceChildren();
  for(let i=0;i<s.rack.length;i++){
    const tile=document.createElement('button');
    tile.type='button';
    const used=pending.some(p=>p.rackIndex===i);
    tile.className='tile'+(used?' empty':'')+(selected===i?' selected':'')+(selectedExchange.has(i)?' exchange-selected':'');
    tile.textContent=used?'':String(s.rack[i]);
    tile.disabled=!canPlay||used;
    tile.setAttribute('aria-label','Číslo '+s.rack[i]);
    tile.addEventListener('click',()=>{
      if(exchanging){selectedExchange.has(i)?selectedExchange.delete(i):selectedExchange.add(i);}
      else selected=selected===i?null:i;
      sound();
      renderOnline();
    });
    rack.append(tile);
  }
  const preview=describeMovePreview(s.board,pending,s.finished);
  $('onlinePreview').dataset.state=preview.state;
  $('onlineBoard').dataset.moveState=preview.state;
  const confirm=$('onlineConfirm');
  confirm.dataset.state=preview.state;
  confirm.title=preview.state==='valid'?'Potvrdit tah za '+preview.points+' bodů':preview.state==='invalid'?preview.detail:'Nejprve polož čísla';
  confirm.setAttribute('aria-label',confirm.title);
  $('onlineUndo').dataset.hasPending=String(pending.length>0||exchanging||selectedExchange.size>0);
  $('onlinePreview').textContent=preview.state==='valid'?('+'+preview.points+' bodů · '+preview.detail):preview.detail;
  confirm.disabled=!canPlay||preview.state!=='valid';
  $('onlineUndo').disabled=!canPlay||(!pending.length&&!exchanging);
  $('onlinePass').disabled=!canPlay;
  $('onlineExchange').disabled=!canPlay;
  $('onlineExchange').textContent=exchanging?'Potvrdit výměnu ('+selectedExchange.size+')':'Vyměnit';
  $('onlineExchange').dataset.exchangeConfirm=String(exchanging);
}
function initializeActions(){
  $('onlineBoard').addEventListener('keydown',event=>{
    const delta={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}[event.key];
    const cell=event.target.closest?.('.cell');
    if(!delta||!cell||!$('onlineBoard').contains(cell))return;
    event.preventDefault();
    let row=Number(cell.dataset.row)+delta[0],col=Number(cell.dataset.col)+delta[1];
    while(row>=0&&row<15&&col>=0&&col<15){
      const next=$('onlineBoard').querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
      if(next&&!next.disabled){next.focus();break;}
      row+=delta[0];col+=delta[1];
    }
  });
  $('retryServerButton').addEventListener('click',async()=>{
    const button=$('retryServerButton');
    button.disabled=true;
    if(onlineInitRetryTimer){
      clearTimeout(onlineInitRetryTimer);
      onlineInitRetryTimer=null;
    }
    try {
      if(!onlineServerReady)await initOnline();
      else await refreshPresence();
    }finally{
      button.disabled=false;
    }
  });
  if(!onlineTimerTicker)onlineTimerTicker=setInterval(updateOnlineTimer,250);
  // Keep NGINX/Safari from idling out the WebSocket silently, and detect
  // dead connections if no state/sync reply has arrived for >75 seconds.
  if(!socketMonitorTimer)socketMonitorTimer=setInterval(()=>{
    if(!$('onlineDialog').open||!credential||!connection)return;
    if(connection.readyState===WebSocket.OPEN&&socketAuthenticated){
      if(Date.now()-lastSocketMessageAt>75_000){
        const stuck=connection;connection=null;
        socketAuthenticated=false;
        stuck.close();
        if(gameState)renderOnline();
        scheduleReconnect('Spojení přestalo odpovídat.');
      }else send('sync');
    }
  },25_000);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState!=='visible'||!$('onlineDialog').open||!credential)return;
    if(!connection||connection.readyState===WebSocket.CLOSED){
      retryOnlineConnection();
    }else if(connection.readyState===WebSocket.OPEN&&socketAuthenticated)send('sync');
  });
  $('playRandom').addEventListener('click',event=>{
    if(!configured||!credential)return;
    event.stopImmediatePropagation();
    startRandomMatch();
  },true);
  $('playFriends').addEventListener('click',event=>{
    if(!configured||!credential)return;
    event.stopImmediatePropagation();
    $('manageFriends').click();
  },true);
  function leaveOnlineGame(){
    clearReconnect();
    ownQueueWaiting=false;
    $('onlineCancelSearch').hidden=true;
    const old=connection;connection=null;socketAuthenticated=false;reconnectAction=null;
    old?.close();
    onlineScoreRecap.cancel();
    resetOnlineResult();
    resetOnlineChat();
    clearOnlineReview();
    if(inGameSettings.open)inGameSettings.close();
    if($('onlineDialog').open)$('onlineDialog').close();
    $('onlineMatchScoreboard').hidden=true;
    gameState=null;
    refreshResumeCard();
  }
  // Same compact Menu control used by game.html on phones/tablets.
  const onlineMenu=$('onlineGameNavigation');
  const onlineMenuToggle=$('onlineMenuToggle');
  const closeOnlineMenu=()=>{
    onlineMenu.classList.remove('is-open');
    onlineMenuToggle.setAttribute('aria-expanded','false');
  };
  onlineMenuToggle.addEventListener('click',()=>{
    const open=onlineMenu.classList.toggle('is-open');
    onlineMenuToggle.setAttribute('aria-expanded',String(open));
  });
  onlineMenu.addEventListener('click',event=>{
    if(event.target.closest('a,button'))closeOnlineMenu();
  });
  $('onlineCancel').addEventListener('click',()=>{
    if(gameState&&!gameState.finished){
      if(!window.confirm('Opravdu vzdát online partii? Soupeři se ihned zobrazí výhra.'))return;
      if(socketAuthenticated&&connection?.readyState===WebSocket.OPEN){
        send('resign');
        status('Vzdáváš partii. Odesílám výsledek oběma hráčům…');
        return;
      }
      if(!window.confirm('Server teď neodpovídá. Soupeř se o odpojení dozví až po uplynutí lhůty. Odejít?'))return;
    }else if(!gameState&&connection?.readyState===WebSocket.OPEN)send('cancel-matchmake');
    const wasWaiting=!gameState;
    leaveOnlineGame();
    if(wasWaiting)setTimeout(refreshPresence,750);
  });
  $('onlineCancelSearch').addEventListener('click',()=>{
    if(gameState||$('onlineCancelSearch').hidden)return;
    if(socketAuthenticated&&connection?.readyState===WebSocket.OPEN)send('cancel-matchmake');
    leaveOnlineGame();
    setTimeout(refreshPresence,750);
  });
  $('onlineResultExit').addEventListener('click',()=>{
    if(rematchRequestedByMe||rematchOfferFromOpponent){
      if(socketAuthenticated)send('rematch',{accept:false});
    }
    leaveOnlineGame();
  });
  $('onlineRematch').addEventListener('click',()=>{
    if(!gameState?.finished||!socketAuthenticated)return;
    send('rematch',{accept:true});
    $('onlineRematch').disabled=true;
    $('onlineRematchStatus').textContent='Odesílám návrh odvety…';
  });
  $('onlineChatToast').addEventListener('click',revealOnlineChat);
  $('onlineChat').addEventListener('click',markOnlineChatRead);
  $('onlineDialog').addEventListener('scroll',refreshUnreadChat,{passive:true});
  window.addEventListener('resize',refreshUnreadChat,{passive:true});
  $('onlineResultDialog').addEventListener('cancel',event=>event.preventDefault());
  $('onlineResumeButton').addEventListener('click',()=>{
    if(!credential)return;
    connectOnline({type:'resume'});
  });
  $('onlineRetryNow').addEventListener('click',retryOnlineConnection);
  // Available throughout an online match, not just in the lobby.
  const inGameSettings=$('onlineGameSettingsDialog');
  bindFeedback({buttonId:'onlineReportProblemButton',extraButtonIds:['onlineResultProblemButton'],send:({description,attach})=>{
    if(attach&&!gameState?.matchId)throw new Error('Pro přiložení historie nejdříve zahraj partii.');
    return api('/api/feedback','POST',{
      description,mode:'online',...(attach?{matchId:gameState.matchId,historyPublicConsent:true}:{})
    });
  }});
  const openSettings=(fromHome=false)=>{
    $('onlineSoundSetting').checked=onlineSoundEnabled;
    $('homeLocalTimeHelp').hidden=!fromHome;
    $('homeLocalSettingsExplanation').hidden=!fromHome;
    $('onlineSettingsPrivacy').hidden=fromHome;
    if(!inGameSettings.open)inGameSettings.showModal();
  };
  $('onlineSettingsButton').addEventListener('click',()=>openSettings(false));
  $('lobbySettingsButton').addEventListener('click',()=>openSettings(true));
  if(location.hash==='#settings')openSettings(!$('onlineDialog').open);
  window.addEventListener('hashchange',()=>{if(location.hash==='#settings')openSettings(!$('onlineDialog').open);});
  inGameSettings.addEventListener('close',()=>{
    $('onlineSoundSetting').checked=onlineSoundEnabled;
    if(location.hash==='#settings')history.replaceState(null,'',location.pathname+location.search);
  });
  $('onlineSettingsCancel').addEventListener('click',()=>{
    inGameSettings.close();
  });
  $('onlineSettingsSave').addEventListener('click',()=>{
    onlineSoundEnabled=$('onlineSoundSetting').checked;
    try{localStorage.setItem(ONLINE_SOUND_KEY,String(onlineSoundEnabled));}catch{}
    inGameSettings.close();
    status('Nastavení zobrazení a zvuků uloženo.');
  });
  $('onlineConfirm').addEventListener('click',()=>{
    if(ownTurn()&&pending.length)send('move',{placements:pending.map(p=>({row:p.row,col:p.col,rackIndex:p.rackIndex}))});
  });
  $('onlineUndo').addEventListener('click',()=>{pending=[];selected=null;exchanging=false;selectedExchange.clear();sound();renderOnline();});
  $('onlinePass').addEventListener('click',()=>{if(ownTurn()){send('pass');sound();}});
  $('onlineExchange').addEventListener('click',()=>{
    if(!ownTurn())return;
    if(!exchanging){pending=[];selected=null;exchanging=true;renderOnline();return;}
    if(selectedExchange.size){send('exchange',{indices:[...selectedExchange]});sound();}
    exchanging=false;selectedExchange.clear();renderOnline();
  });
  $('onlineChatForm').addEventListener('submit',event=>{
    event.preventDefault();
    if(!gameState||gameState.finished)return;
    const input=$('onlineChatInput'),text=input.value.trim();
    if(text){send('chat',{text:text.slice(0,160)});sound();input.value='';}
  });
  const openFriends=()=>{
    if(pendingFriendChallenge&&!(gameState&&!gameState.finished)){
      showFriendChallenge(pendingFriendChallenge,true);return;
    }
    if(credential){$('manageFriends').click();return;}
    $('friendsDialog').showModal();
    $('friendSearchForm').hidden=true;document.querySelector('.friend-invite-options').hidden=true;
    $('friendRequests').textContent='';$('friendSentRequests').textContent='';$('friendList').textContent='';
    $('friendSearchResults').replaceChildren();
    $('friendMessage').textContent='Pro seznam přátel se přihlas přes Google v kartě Můj profil.';
  };
  $('friendsOpen')?.addEventListener('click',openFriends);
  $('onlineFriendsOpen')?.addEventListener('click',openFriends);
  $('friendRequestToast')?.addEventListener('click',()=>{
    $('friendRequestToast').hidden=true;
    if(credential)$('manageFriends').click();
  });
  setInterval(()=>{
    if(credential&&$('friendsDialog').open&&document.visibilityState!=='hidden'&&!friendsBusy)refreshFriends();
  },20_000);
  $('manageFriends').addEventListener('click',async()=>{
    if(!credential)return;
    $('friendSearchForm').hidden=false;document.querySelector('.friend-invite-options').hidden=false;
    $('friendsDialog').showModal();
    $('friendRequestToast').hidden=true;
    $('friendSearchResults').replaceChildren();
    $('friendMessage').textContent='';
    await refreshFriends();
  });
  $('friendsClose').addEventListener('click',()=>{
    $('friendsDialog').close();
    refreshFriendChallenges();
  });
  $('friendCreateCode').addEventListener('click',()=>{
    $('friendsDialog').close();
    connectOnline({type:'invite',seconds:ONLINE_TURN_SECONDS});
  });
  $('friendJoinCode').addEventListener('click',()=>{
    const code=prompt('Zadej kód pozvánky od přítele:');
    if(!code?.trim())return;
    $('friendsDialog').close();
    connectOnline({type:'join',code:code.trim()});
  });
  $('friendChallengeAccept').addEventListener('click',()=>respondToFriendChallenge(true));
  $('friendChallengeDecline').addEventListener('click',()=>respondToFriendChallenge(false));
  $('friendChallengeLater').addEventListener('click',()=>$('friendChallengeDialog').close());
  $('friendChallengeDialog').addEventListener('close',()=>{
    currentFriendChallenge=null;
  });
  $('friendSearchForm').addEventListener('submit',async event=>{
    event.preventDefault();
    const query=$('friendSearchInput').value.trim();
    if(query.length<2)return;
    $('friendMessage').textContent='Vyhledávám hráče…';
    try{
      const data=await api('/api/players?name='+encodeURIComponent(query));
      const list=$('friendSearchResults');list.replaceChildren();
      for(const p of data.players||[])appendFriend(list,p,'Přidat přítele',async()=>{
        await api('/api/friends/request','POST',{id:p.id});
        $('friendMessage').textContent='Žádost o přátelství byla odeslána.';
      });
      if(!data.players?.length)$('friendMessage').textContent='Žádný odpovídající hráč.';
      else $('friendMessage').textContent='Nalezení hráči:';
    }catch(error){$('friendMessage').textContent=error.message;}
  });
  $('onlineLogout').addEventListener('click',()=>{
    if(credential){
      // Revoke this particular device session on Oracle, not just locally.
      const target=isAppSession(credential)?'/api/session':'/api/presence';
      fetch(apiBase+target,{
        method:'DELETE',headers:{Authorization:'Bearer '+credential},keepalive:true
      }).catch(()=>{});
    }
    clearReconnect();
    const old=connection;connection=null;
    old?.close();
    socketAuthenticated=false;
    credential=null;gameState=null;currentProfile=null;
    $('onlineResumeCard').hidden=true;
    syncResumeCard();
    clearSavedCredential();
    window.google?.accounts?.id?.disableAutoSelect?.();
    $('googleSignInWidget').hidden=false;
    $('onlineLogout').hidden=true;
    $('onlineStats').hidden=true;
    $('onlineLoginNotice').textContent='Přihlas se přes Google';
    location.reload();
  });
}
let friendsBusy=false;
function appendFriend(container,player,buttonText,handler){
  const row=document.createElement('div');row.className='friend-entry';
  const name=document.createElement('span');name.textContent=displayAvatar(player.avatar)+' '+player.nickname;
  row.append(name);
  if(handler){
    const button=document.createElement('button');button.type='button';button.className='gold-button';button.textContent=buttonText;
    button.addEventListener('click',async()=>{
      button.disabled=true;friendsBusy=true;
      try{await handler();await refreshFriends();}
      catch(error){$('friendMessage').textContent=error.message;}
      finally{button.disabled=false;friendsBusy=false;}
    });
    row.append(button);
  }
  container.append(row);
  return row;
}
async function refreshFriends(){
  try{
    const data=await api('/api/friends');
    setFriendRequestNotifications(data.requests);
    const incoming=$('friendRequests'),sent=$('friendSentRequests'),friends=$('friendList');
    incoming.replaceChildren();sent.replaceChildren();friends.replaceChildren();
    for(const player of data.requests||[]){
      const row=appendFriend(incoming,player,'Přijmout',async()=>{
        await api('/api/friends/respond','POST',{id:player.id,accept:true});
        $('friendMessage').textContent='Přátelství potvrzeno.';
      });
      const decline=document.createElement('button');
      decline.type='button';decline.className='gold-button';decline.textContent='Odmítnout';
      decline.setAttribute('aria-label','Odmítnout žádost od '+player.nickname);
      decline.addEventListener('click',async()=>{
        decline.disabled=true;friendsBusy=true;
        try{
          await api('/api/friends/respond','POST',{id:player.id,accept:false});
          $('friendMessage').textContent='Žádost byla odmítnuta.';
          await refreshFriends();
        }catch(error){$('friendMessage').textContent=error.message;}
        finally{decline.disabled=false;friendsBusy=false;}
      });
      row.append(decline);
    }
    for(const player of data.sentRequests||[]){
      const row=appendFriend(sent,player,'Zrušit žádost',async()=>{
        await api('/api/friends/cancel','POST',{id:player.id});
        $('friendMessage').textContent='Odeslaná žádost byla zrušena.';
      });
      const label=document.createElement('span');
      label.className='friend-request-pending';label.textContent='Čeká na přijetí';
      row.insertBefore(label,row.lastElementChild);
    }
    for(const player of data.friends||[]){
      appendFriend(friends,player,'⚔ Vyzvat',async()=>{
        $('friendsDialog').close();
        connectOnline({type:'friend',targetId:player.id,friendName:player.nickname,seconds:ONLINE_TURN_SECONDS});
      });
    }
    for(const [i,player] of (data.friends||[]).entries()){
      const row=friends.children[i],dot=document.createElement('span');
      const known=typeof player.online==='boolean';
      dot.className='friend-presence'+(known?(player.online?' is-online':' is-offline'):'');
      dot.title=known?(player.online?'Online':'Offline'):'Dostupnost zatím není známá';
      dot.setAttribute('role','img');dot.setAttribute('aria-label',dot.title);
      row.firstElementChild.prepend(dot);
      const remove=document.createElement('button');remove.type='button';
      remove.className='gold-button friend-remove';remove.textContent='×';
      remove.disabled=data.canRemoveFriends!==true;
      if(remove.disabled)remove.title='Odebírání přátel čeká na aktualizaci serveru.';
      remove.setAttribute('aria-label','Odebrat přítele '+player.nickname);
      if(!remove.disabled)remove.title='Odebrat přítele '+player.nickname;
      remove.addEventListener('click',async()=>{
        if(!confirm('Odebrat přítele '+player.nickname+'?'))return;
        friendsBusy=true;remove.disabled=true;
        try{
          await api('/api/friends/remove','POST',{id:player.id});
          $('friendMessage').textContent='Přítel byl odebrán.';
          await refreshFriends();
        }catch(error){$('friendMessage').textContent=error.message;}
        finally{friendsBusy=false;remove.disabled=false;}
      });
      row.append(remove);
    }
    if(!data.requests?.length)incoming.textContent='Žádné nové žádosti.';
    if(!data.sentRequests?.length)sent.textContent='Nemáš žádné odeslané žádosti.';
    if(!data.friends?.length)friends.textContent='Zatím nemáš přidané přátele.';
  }catch(error){$('friendMessage').textContent=error.message;}
}
// Invitations are delivered even if the invited friend's lobby has no open
// WebSocket: authenticated clients poll their own pending invitation only.
function showFriendChallenge(challenge,force=false){
  if(!challenge||!credential||$('friendChallengeDialog').open)return;
  if(!force&&promptedFriendChallengeId===challenge.id)return;
  // Keep an already-running match uninterrupted; the badge remains available.
  if(gameState&&!gameState.finished)return;
  promptedFriendChallengeId=challenge.id;
  currentFriendChallenge=challenge;
  $('friendChallengeFrom').textContent=displayAvatar(challenge.from.avatar)+' '+challenge.from.nickname;
  $('friendChallengeTime').textContent='Čas na tah: '+challenge.seconds+' sekund · pozvánka vyprší za '+Math.ceil(challenge.expiresInSeconds/60)+' min.';
  $('friendChallengeStatus').textContent='';
  $('friendChallengeDialog').showModal();
}
async function refreshFriendChallenges(){
  if(!credential||document.visibilityState==='hidden')return;
  const requestedWith=credential;
  try{
    const {challenge}=await api('/api/challenges');
    if(!credential||credential!==requestedWith)return;
    // An older in-flight poll must not resurrect an invite already answered.
    if(challenge?.id===lastHandledChallengeId)return;
    if(!challenge)lastHandledChallengeId=null;
    if(pendingFriendChallenge?.id!==challenge?.id)promptedFriendChallengeId=null;
    pendingFriendChallenge=challenge||null;
    refreshUnreadChat();
    if(challenge)showFriendChallenge(challenge);
  }catch{ /* The lobby stays playable even if invitation polling is unavailable. */ }
}
async function refreshFriendRequestNotifications(){
  if(!credential||document.visibilityState==='hidden'||$('friendsDialog').open||friendsBusy)return;
  const requestedWith=credential;
  try{
    const data=await api('/api/friends');
    if(credential!==requestedWith||$('friendsDialog').open)return;
    setFriendRequestNotifications(data.requests,true);
  }catch{/* Keep the last verified count if polling briefly fails. */}
}
function startFriendChallengeUpdates(){
  if(friendChallengeTimer)return;
  refreshFriendChallenges();
  refreshFriendRequestNotifications();
  friendChallengeTimer=setInterval(refreshFriendChallenges,10_000);
  friendRequestTimer=setInterval(refreshFriendRequestNotifications,20_000);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'){
      refreshFriendChallenges();
      refreshFriendRequestNotifications();
    }
  });
}
async function respondToFriendChallenge(accept){
  if(!currentFriendChallenge)return;
  const {id}=currentFriendChallenge;
  $('friendChallengeAccept').disabled=true;
  $('friendChallengeDecline').disabled=true;
  try{
    const data=await api('/api/challenges/respond','POST',{id,accept});
    lastHandledChallengeId=id;
    $('friendChallengeDialog').close();
    currentFriendChallenge=null;
    pendingFriendChallenge=null;
    refreshUnreadChat();
    if(accept&&data.code){
      for(const dialog of document.querySelectorAll('dialog[open]')){
        if(dialog!==$('onlineDialog'))dialog.close();
      }
      connectOnline({type:'join',code:data.code});
    }
  }catch(error){
    $('friendChallengeStatus').textContent=error.message;
  }finally{
    $('friendChallengeAccept').disabled=false;
    $('friendChallengeDecline').disabled=false;
  }
}
// Google Identity embeds a fixed-width iframe. Fit it to the live profile card,
// including Safari's narrower grid/sidebar layouts.
function renderResponsiveGoogleButton(g){
  const container=$('googleSignInWidget');
  let lastWidth=0;
  const render=()=>{
    if(container.hidden)return;
    const available=Math.floor(container.getBoundingClientRect().width)-2;
    if(available<80)return;
    const width=Math.min(400,available);
    if(width===lastWidth)return;
    lastWidth=width;
    container.replaceChildren();
    g.renderButton(container,{type:'standard',theme:'outline',size:'large',text:'signin_with',width,locale:'cs'});
  };
  render();
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(render).observe(container);
  else window.addEventListener('resize',render,{passive:true});
}
export async function initOnline(){
  if(!onlineInitStarted){
    onlineInitStarted=true;
    initializeActions();
  }
  if(!configured){
    setServerOffline(true);
    $('onlineInfoText').textContent='Online režim není nastaven. Hra proti počítači a hra ve dvou fungují dál.';
    return;
  }
  if(onlineServerReady)return;

  // A temporary 404/502/connection timeout during Safari refresh should not
  // permanently disable Google login or online resume for this page load.
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),4500);
  try{
    const response=await fetch(apiBase+'/health',{cache:'no-store',signal:controller.signal});
    if(!response.ok)throw new Error('Server dočasně neodpovídá.');
    const data=await response.json();
    if(data?.status!=='ok'||data?.service!=='arena-api')
      throw new Error('Server není připraven.');
  }catch{
    setServerOffline(true);
    $('onlineInfoText').textContent='Server nyní neodpovídá. Znovu se připojím za 5 sekund.';
    if(!onlineInitRetryTimer)onlineInitRetryTimer=setTimeout(()=>{
      onlineInitRetryTimer=null;
      initOnline();
    },5000);
    return;
  }finally{
    clearTimeout(timeout);
  }
  onlineServerReady=true;
  if(onlineInitRetryTimer){clearTimeout(onlineInitRetryTimer);onlineInitRetryTimer=null;}
  setServerOffline(false);
  startPresenceUpdates();
  $('googleSignIn').hidden=true;
  $('onlineLoginNotice').hidden=false;
  $('onlineLoginNotice').textContent='Obnovuji přihlášení…';
  $('onlineInfoText').textContent='Hraj s náhodným soupeřem nebo pozvi přítele.';

  // Restore a server-verified device session from any browser tab, or a
  // tab-scoped Google ID token when session exchange previously failed.
  // Expired or revoked device sessions cannot restore login.
  const saved=readSavedCredential();
  if(saved&&await googleCredential(saved))return;

  $('googleSignInWidget').hidden=false;
  $('onlineLoginNotice').hidden=false;
  $('onlineLoginNotice').textContent='Načítám Google přihlášení…';
  try{
    const g=await googleSdk();
    g.initialize({client_id:ONLINE_CONFIG.googleClientId,callback:response=>googleCredential(response.credential),auto_select:false});
    renderResponsiveGoogleButton(g);
    $('onlineLoginNotice').hidden=true;
  }catch(error){
    status(error.message,true);
    $('googleSignIn').hidden=false;
    $('googleSignInWidget').hidden=true;
    $('onlineLoginNotice').hidden=false;
    $('onlineLoginNotice').textContent='Google přihlášení se nepodařilo načíst.';
  }
}
