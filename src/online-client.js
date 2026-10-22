import { ONLINE_CONFIG } from './online-config.js?v=0.2.8';
import { describeMovePreview } from './preview.js?v=0.2.9';
import { formatEquations, bonusAt, TOTAL_TILES } from './rules.js?v=0.2.9';

const $=id=>document.getElementById(id);
const safeApiBase=()=>{
  try{
    const url=new URL(ONLINE_CONFIG.apiBase);
    if(url.protocol!=='https:'&&!(url.protocol==='http:'&&url.hostname==='localhost'))return '';
    return url.toString().replace(/\/$/,'');
  }catch{return '';}
};
const apiBase=safeApiBase();
const configured=Boolean(apiBase&&ONLINE_CONFIG.googleClientId);

// Keep a successful Google sign-in only for the current browser tab.
// sessionStorage survives Safari refresh, but does not persist across new
// tabs or long-term browser storage. Every reload still verifies the ID
// token with our Oracle API before enabling any authenticated controls.
const authSessionKey='abaku-online-google-session-v1';
function readSavedCredential(){
  try{
    const token=sessionStorage.getItem(authSessionKey);
    return typeof token==='string'&&token.length>=100&&token.length<=5000 ? token : null;
  }catch{return null;}
}
function saveCredential(token){
  try{sessionStorage.setItem(authSessionKey,token);}catch{}
}
function clearSavedCredential(){
  try{sessionStorage.removeItem(authSessionKey);}catch{}
}
let credential=null,connection=null,gameState=null,selected=null,pending=[],exchanging=false,selectedExchange=new Set();
let onlineName='Hráč';
let recentOnlineMove=null;
let recentOnlineMoveId=null;
let recentOnlineMoveTimer=null;
let onlineTimerTicker=null;
let reconnectTimer=null, reconnectAction=null, socketAuthenticated=false;
let reconnects=0, lastSocketMessageAt=0;
let socketMonitorTimer=null, onlineInitRetryTimer=null;
let onlineInitStarted=false, onlineServerReady=false;
let currentFriendChallenge=null;
let friendChallengeTimer=null;
const validTurnSeconds=[30,60,90];
const timeStorageKey='abaku-online-turn-seconds';
const selectedTurnSeconds=()=>validTurnSeconds.includes(Number($('onlineTurnSeconds').value))
  ? Number($('onlineTurnSeconds').value) : 60;
function initOnlineTimeSetting(){
  const select=$('onlineTurnSeconds');
  try{
    const migrationKey='abaku-online-default-60-migrated-v1';
    const alreadyMigrated=localStorage.getItem(migrationKey)==='yes';
    const saved=Number(localStorage.getItem(timeStorageKey));
    // Replace only the old 90-second default once. Later user-selected 90s remains saved.
    const preferred=!alreadyMigrated&&saved===90 ? 60 : saved;
    if(validTurnSeconds.includes(preferred))select.value=String(preferred);
    if(!alreadyMigrated){
      if(saved===90)localStorage.setItem(timeStorageKey,'60');
      localStorage.setItem(migrationKey,'yes');
    }
  }catch{ /* browser storage may be disabled */ }
  select.addEventListener('change',()=>{
    try{localStorage.setItem(timeStorageKey,String(selectedTurnSeconds()));}
    catch{ /* selecting a time must always remain possible */ }
  });
}
let presenceTimer=null;
let lastPresence=null;
async function heartbeat(){
  if(credential)await api('/api/presence','POST');
}
function paintPresence(data){
  lastPresence=data;
  $('onlineCount').textContent=String(data.online);
  $('waitingCount').textContent=String(data.waiting);
  const msg=data.waiting===0
    ? 'Nikdo právě nečeká. Můžeš zahájit hledání.'
    : data.waiting===1 ? '1 hráč právě hledá soupeře.'
    : data.waiting+' hráči právě hledají soupeře.';
  $('queueActivity').textContent=msg;
  $('onlineWaitingCount').textContent='Nyní čeká na náhodného soupeře: '+data.waiting+'.';
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
  }catch{
    // Never display an old cached count as if it were current.
    lastPresence=null;
    $('onlineCount').textContent='—';
    $('waitingCount').textContent='—';
    $('queueActivity').textContent='Aktuální počet čekajících není dostupný.';
    $('onlineWaitingCount').textContent='Počet čekajících není dostupný.';
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
  $('welcomeName').textContent=profile.nickname;
  $('profileName').textContent=profile.nickname;
  $('profileAvatar').textContent=profile.avatar||'✦';
  $('onlineStats').hidden=false;
  $('onlineStats').textContent='Zápasy: '+profile.played+' · Výhry: '+profile.wins+' · Úspěšnost: '+profile.winRate+' %';
  $('onlineLogout').hidden=false;
  $('googleSignInWidget').hidden=true;
  $('onlineLoginNotice').hidden=true;
  $('profileSubtitle').textContent='Google účet · online';
  $('profileDescription').textContent='Tento profil a statistiky jsou uložené na Oracle. Úpravy přezdívky se synchronizují mezi zařízeními.';
  $('editProfile').textContent='Upravit online profil';
  $('manageFriends').hidden=false;
  $('onlineInfoText').textContent='Oracle je připojený. Můžeš vyzvat přítele přímo ze seznamu nebo najít náhodného soupeře.';
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
    // The server, not the browser, verifies Google's signed token and audience.
    const {profile}=await api('/api/me');
    saveCredential(value);
    showProfile(profile);
    await heartbeat().catch(()=>{});
    await refreshPresence();
    await showLeaderboard();
    await refreshResumeCard();
    startFriendChallengeUpdates();
    return true;
  }catch(error){
    credential=null;
    clearSavedCredential();
    status(error.message,true);
    $('onlineLoginNotice').hidden=false;
    $('onlineLoginNotice').textContent='Přihlášení je neplatné nebo vypršelo. Přihlas se přes Google.';
    $('googleSignInWidget').hidden=false;
    return false;
  }
}
async function showLeaderboard(){
  if(!credential)return;
  try{
    const r=await fetch(apiBase+'/api/leaderboard');
    if(!r.ok)return;
    const data=await r.json();
    const board=$('leaderboard');
    board.replaceChildren();
    for(const p of (data.players||[]).slice(0,5)){
      const li=document.createElement('li');
      li.textContent=p.nickname+' · '+p.wins+' výher · '+p.winRate+' %';
      board.append(li);
    }
    $('leaderboardPanel').hidden=!(data.players||[]).length;
  }catch{ /* leaderboard is optional */ }
}
// The server is authoritative: never infer a resumable match from localStorage.
async function refreshResumeCard(){
  const card=$('onlineResumeCard');
  if(!credential){card.hidden=true;return;}
  try{
    const data=await api('/api/match/current');
    if(!credential||!data.match||data.match.finished){
      card.hidden=true;
      return;
    }
    const match=data.match;
    const opponent=match.players?.[1-match.mySide]?.nickname||'soupeř';
    const points=(match.players||[]).map(player=>Number(player.score)||0);
    $('onlineResumeDescription').textContent='Soupeř: '+opponent+' · skóre '+points[0]+' : '+points[1]+
      ' · tah '+(Number(match.turns)+1)+'.';
    // Keep the button accessible when returning to the menu after a disconnect.
    card.hidden=$('onlineDialog').open;
  }catch{
    // If Oracle is unavailable, don't promise that an old match still exists.
    card.hidden=true;
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
// Keep the previous turn visible for three seconds for BOTH online players.
function clearOnlineReview(){
  if(recentOnlineMoveTimer!==null)clearTimeout(recentOnlineMoveTimer);
  recentOnlineMoveTimer=null;recentOnlineMove=null;recentOnlineMoveId=null;
}
function showOnlineReview(state){
  const move=state.lastMove;
  if(!move||!Array.isArray(move.placed)||!Array.isArray(move.cells))return;
  const key=state.matchId+':'+state.turns;
  if(key===recentOnlineMoveId)return;
  clearOnlineReview();
  recentOnlineMoveId=key;
  recentOnlineMove={
    placed:new Set(move.placed.map(p=>p.row+':'+p.col)),
    cells:new Set(move.cells.map(p=>p.row+':'+p.col)),
    text:'Hráč '+(move.player+1)+': '+formatEquations(move.equations)+' · +'+move.points+' bodů',
    until:Date.now()+3000
  };
  recentOnlineMoveTimer=setTimeout(()=>{
    recentOnlineMove=null;recentOnlineMoveTimer=null;
    if(gameState)renderOnline();
  },3000);
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
    pending=[];selected=null;gameState=null;exchanging=false;selectedExchange.clear();
    clearOnlineReview();
    if(!$('onlineDialog').open)$('onlineDialog').showModal();
    $('onlineBoardWrapper').hidden=true;
    $('onlineWaiting').hidden=false;
    $('onlineCode').textContent='';
    $('onlineChat').replaceChildren();
  }else if(gameState){
    pending=[];selected=null;exchanging=false;selectedExchange.clear();
    renderOnline();
  }
  $('onlineResumeCard').hidden=true;
  refreshPresence();
  status(reconnecting?'Znovu se připojuji k Oracle serveru…':'Připojuji se k Oracle serveru…');
  const wsUrl=apiBase.replace(/^http/,'ws')+'/ws';
  let socket;
  try{socket=new WebSocket(wsUrl);}
  catch{
    scheduleReconnect('Nepodařilo se otevřít spojení se serverem.');
    return;
  }
  connection=socket;
  lastSocketMessageAt=Date.now();
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
      return;
    }
    if(msg.type==='authenticated'){
      socketAuthenticated=true;
      reconnects=0;
      clearReconnect();
      if(reconnecting)status('Spojení obnoveno. Načítám aktuální partii…');
      if(action.type==='resume')send('sync');
      else 
if(action.type==='random')send('matchmake',{seconds:action.seconds});
      else if(action.type==='invite')send('invite',{seconds:action.seconds});
      else if(action.type==='friend')send('challenge-friend',{targetId:action.targetId,seconds:action.seconds});
      else if(action.type==='join')send('join-invite',{code:action.code});
      else send('sync');
      return;
    }
    if(msg.type==='queue'){
      status(msg.waiting?'Hledám soupeře se stejným časem na tah ('+action.seconds+' s)…':'Hledání zrušeno.');
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
    if(msg.type==='match-start'){status('Soupeř připojen, partie začíná!');refreshPresence();return;}
    if(msg.type==='match-state'){
      const previous=gameState?.turn;
      gameState=msg;
      if(reconnecting)status(msg.finished?'Partie již skončila.':'Spojení obnoveno, pokračujeme v partii.');
      showOnlineReview(msg);
      if(previous!==msg.turn||msg.finished){pending=[];selected=null;exchanging=false;selectedExchange.clear();}
      $('onlineWaiting').hidden=true;
      $('onlineBoardWrapper').hidden=false;
      renderOnline();
      return;
    }
    if(msg.type==='lobby'){
      if(gameState&&!gameState.finished){
        gameState=null;pending=[];selected=null;
        $('onlineBoardWrapper').hidden=true;
        $('onlineWaiting').hidden=false;
        $('onlineWaiting').querySelector('p').textContent='Partie již na serveru není aktivní. Vrať se do nabídky a začni novou.';
        status('Rozehranou partii už nelze obnovit.',true);
        refreshResumeCard();
      }
      return;
    }
    if(msg.type==='move-accepted'){pending=[];selected=null;status('Platný tah: '+formatEquations(msg.equations)+' · +'+msg.points+' bodů.');return;}
    if(msg.type==='turn-passed'){status('Tah vynechán ('+msg.reason+').');return;}
    if(msg.type==='opponent'){status(msg.status==='disconnected'?'Soupeř se odpojil, má 60 sekund na návrat.':'Soupeř se znovu připojil.');return;}
    if(msg.type==='match-end'){status(msg.winner===null?'Remíza.':(msg.winner===gameState?.mySide?'Vyhrál jsi!':'Soupeř vyhrál.'));return;}
    if(msg.type==='chat')addChat(msg.from,msg.text);
  });
  socket.addEventListener('close',event=>{
    if(connection!==socket)return;
    connection=null;
    socketAuthenticated=false;
    if(gameState)renderOnline();
    if(event.code===1000&&event.reason==='Nové připojení'){
      status('Partie byla otevřena v jiné kartě nebo zařízení.',true);
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
  socketAuthenticated&&connection?.readyState===WebSocket.OPEN;}
function addChat(uid,text){
  const line=document.createElement('div');
  line.className='online-chat-line';
  const own=gameState?.mySide===uid;
  line.textContent=(own?'Já: ':'Soupeř: ')+String(text||'');
  const chat=$('onlineChat');chat.append(line);chat.scrollTop=chat.scrollHeight;
}
// Use the same status, progress and turn clock found in the offline game.
function onlinePlayerName(side){
  const fromServer=gameState?.players?.[side]?.nickname;
  if(typeof fromServer==='string'&&fromServer.trim())return fromServer.trim();
  return side===gameState?.mySide ? onlineName : 'Hráč '+(side+1);
}
function updateOnlineTimer(){
  if(!gameState||$('onlineBoardWrapper').hidden)return;
  const until=Number(gameState.deadline);
  const remaining=gameState.finished ? 0
    : Number.isFinite(until) ? Math.max(0,Math.ceil((until-Date.now())/1000))
    : gameState.seconds||60;
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
    points.textContent='+'+entry.points;
    item.append(document.createTextNode(label(entry.player)+' · '),points,
      document.createTextNode(' · '+formatEquations(entry.equations,2)));
    history.append(item);
  }
}
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
  board.replaceChildren();
  const staged=new Map(pending.map(p=>[p.row+':'+p.col,p]));
  const canPlay=ownTurn();
  const fragment=document.createDocumentFragment();
  for(let row=0;row<15;row++)for(let col=0;col<15;col++){
    const p=staged.get(row+':'+col);
    const digit=p?.digit??s.board[row][col];
    const cell=document.createElement('button');
    cell.type='button';
    cell.className='online-cell '+bonusAt(row,col)+(p?' staged':digit!==null?' fixed':'');
    const key=row+':'+col;
    if(recentOnlineMove&&Date.now()<recentOnlineMove.until){
      if(recentOnlineMove.cells.has(key))cell.classList.add('recent-equation');
      if(recentOnlineMove.placed.has(key))cell.classList.add('recent-tile');
    }
    cell.textContent=digit===null?'':String(digit);
    cell.disabled=!canPlay||(!p&&digit!==null);
    cell.setAttribute('aria-label','Řádek '+(row+1)+', sloupec '+(col+1));
    cell.addEventListener('click',()=>{
      const old=pending.findIndex(p=>p.row===row&&p.col===col);
      if(old>=0){selected=pending[old].rackIndex;pending.splice(old,1);renderOnline();return;}
      if(selected===null||pending.some(p=>p.rackIndex===selected))return;
      pending.push({row,col,digit:s.rack[selected],rackIndex:selected});
      selected=null;renderOnline();
    });
    fragment.append(cell);
  }
  board.append(fragment);
  const review=$('onlineLastMoveReview');
  review.hidden=!recentOnlineMove||Date.now()>=recentOnlineMove.until;
  if(!review.hidden)review.textContent=recentOnlineMove.text;
  const rack=$('onlineRack');rack.replaceChildren();
  for(let i=0;i<s.rack.length;i++){
    const tile=document.createElement('button');
    tile.type='button';
    tile.className='online-tile'+(selected===i?' chosen':'')+(selectedExchange.has(i)?' chosen':'');
    tile.textContent=String(s.rack[i]);
    tile.disabled=!canPlay||pending.some(p=>p.rackIndex===i);
    tile.setAttribute('aria-label','Kámen '+s.rack[i]);
    tile.addEventListener('click',()=>{
      if(exchanging){selectedExchange.has(i)?selectedExchange.delete(i):selectedExchange.add(i);}
      else selected=selected===i?null:i;
      renderOnline();
    });
    rack.append(tile);
  }
  const preview=describeMovePreview(s.board,pending,s.finished);
  $('onlinePreview').textContent=preview.state==='valid'?('+'+preview.points+' bodů · '+preview.detail):preview.detail;
  $('onlineConfirm').disabled=!canPlay||preview.state!=='valid';
  $('onlineUndo').disabled=!canPlay||(!pending.length&&!exchanging);
  $('onlinePass').disabled=!canPlay;
  $('onlineExchange').disabled=!canPlay;
  $('onlineExchange').textContent=exchanging?'Potvrdit výměnu ('+selectedExchange.size+')':'Vyměnit';
}
function initializeActions(){
  // Mobile only: match the collapsible Progress / Chat panels in the offline UI.
  for(const panel of document.querySelectorAll('#onlineDialog .online-panel')){
    const toggle=panel.querySelector('.online-panel-toggle');
    if(!toggle)continue;
    toggle.addEventListener('click',()=>{
      const expanded=panel.classList.toggle('mobile-expanded');
      toggle.setAttribute('aria-expanded',String(expanded));
      toggle.textContent=(expanded?'▾ ':'▸ ')+(panel.classList.contains('online-status-panel')?'Průběh partie':'Chat');
    });
  }
  if(!onlineTimerTicker)onlineTimerTicker=setInterval(updateOnlineTimer,250);
  $('playRandom').addEventListener('click',event=>{
    if(!configured||!credential)return;
    event.stopImmediatePropagation();
    connectOnline({type:'random',seconds:selectedTurnSeconds()});
  },true);
  $('playFriends').addEventListener('click',event=>{
    if(!configured||!credential)return;
    event.stopImmediatePropagation();
    $('manageFriends').click();
  },true);
  $('onlineCancel').addEventListener('click',()=>{
    if(gameState&&!gameState.finished&&!window.confirm('Vrátit se do nabídky? Online partie se odpojí.'))return;
    if(!gameState)send('cancel-matchmake');
    connection?.close();connection=null;
    clearOnlineReview();
    $('onlineDialog').close();
  });
  $('onlineConfirm').addEventListener('click',()=>{
    if(ownTurn()&&pending.length)send('move',{placements:pending.map(p=>({row:p.row,col:p.col,rackIndex:p.rackIndex}))});
  });
  $('onlineUndo').addEventListener('click',()=>{pending=[];selected=null;exchanging=false;selectedExchange.clear();renderOnline();});
  $('onlinePass').addEventListener('click',()=>{if(ownTurn())send('pass');});
  $('onlineExchange').addEventListener('click',()=>{
    if(!ownTurn())return;
    if(!exchanging){pending=[];selected=null;exchanging=true;renderOnline();return;}
    if(selectedExchange.size)send('exchange',{indices:[...selectedExchange]});
    exchanging=false;selectedExchange.clear();renderOnline();
  });
  $('onlineChatForm').addEventListener('submit',event=>{
    event.preventDefault();
    if(!gameState||gameState.finished)return;
    const input=$('onlineChatInput'),text=input.value.trim();
    if(text){send('chat',{text:text.slice(0,160)});input.value='';}
  });
  $('manageFriends').addEventListener('click',async()=>{
    if(!credential)return;
    $('friendsDialog').showModal();
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
    connectOnline({type:'invite',seconds:selectedTurnSeconds()});
  });
  $('friendJoinCode').addEventListener('click',()=>{
    const code=prompt('Zadej kód pozvánky od přítele:');
    if(!code?.trim())return;
    $('friendsDialog').close();
    connectOnline({type:'join',code:code.trim()});
  });
  $('friendChallengeAccept').addEventListener('click',()=>respondToFriendChallenge(true));
  $('friendChallengeDecline').addEventListener('click',()=>respondToFriendChallenge(false));
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
      fetch(apiBase+'/api/presence',{
        method:'DELETE',headers:{Authorization:'Bearer '+credential},keepalive:true
      }).catch(()=>{});
    }
    connection?.close();connection=null;credential=null;gameState=null;currentProfile=null;
    clearSavedCredential();
    window.google?.accounts?.id?.disableAutoSelect?.();
    $('googleSignInWidget').hidden=false;
    $('onlineLogout').hidden=true;
    $('onlineStats').hidden=true;
    $('onlineLoginNotice').textContent='Přihlas se přes Google';
    location.reload();
  });
}
function appendFriend(container,player,buttonText,handler){
  const row=document.createElement('div');row.className='friend-entry';
  const name=document.createElement('span');name.textContent=(player.avatar||'✦')+' '+player.nickname;
  row.append(name);
  if(handler){
    const button=document.createElement('button');button.type='button';button.className='gold-button';button.textContent=buttonText;
    button.addEventListener('click',async()=>{
      button.disabled=true;
      try{await handler();await refreshFriends();}
      catch(error){$('friendMessage').textContent=error.message;}
      finally{button.disabled=false;}
    });
    row.append(button);
  }
  container.append(row);
}
async function refreshFriends(){
  try{
    const data=await api('/api/friends');
    const incoming=$('friendRequests'),friends=$('friendList');
    incoming.replaceChildren();friends.replaceChildren();
    for(const player of data.requests||[]){
      appendFriend(incoming,player,'Přijmout',async()=>{
        await api('/api/friends/respond','POST',{id:player.id,accept:true});
        $('friendMessage').textContent='Přátelství potvrzeno.';
      });
    }
    for(const player of data.friends||[]){
      appendFriend(friends,player,'⚔ Vyzvat',async()=>{
        $('friendsDialog').close();
        connectOnline({type:'friend',targetId:player.id,friendName:player.nickname,seconds:selectedTurnSeconds()});
      });
    }
    if(!data.requests?.length)incoming.textContent='Žádné nové žádosti.';
    if(!data.friends?.length)friends.textContent='Zatím nemáš přidané přátele.';
  }catch(error){$('friendMessage').textContent=error.message;}
}
// Invitations are delivered even if the invited friend's lobby has no open
// WebSocket: authenticated clients poll their own pending invitation only.
async function refreshFriendChallenges(){
  if(!credential||document.visibilityState==='hidden')return;
  if(document.querySelector('dialog[open]'))return;
  try{
    const {challenge}=await api('/api/challenges');
    if(!challenge||!credential||document.querySelector('dialog[open]'))return;
    currentFriendChallenge=challenge;
    $('friendChallengeFrom').textContent=(challenge.from.avatar||'✦')+' '+challenge.from.nickname;
    $('friendChallengeTime').textContent='Čas na tah: '+challenge.seconds+' sekund · pozvánka vyprší za '+Math.ceil(challenge.expiresInSeconds/60)+' min.';
    $('friendChallengeStatus').textContent='';
    $('friendChallengeDialog').showModal();
  }catch{ /* The lobby stays playable even if invitation polling is unavailable. */ }
}
function startFriendChallengeUpdates(){
  if(friendChallengeTimer)return;
  refreshFriendChallenges();
  friendChallengeTimer=setInterval(refreshFriendChallenges,10_000);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')refreshFriendChallenges();
  });
}
async function respondToFriendChallenge(accept){
  if(!currentFriendChallenge)return;
  const {id}=currentFriendChallenge;
  $('friendChallengeAccept').disabled=true;
  $('friendChallengeDecline').disabled=true;
  try{
    const data=await api('/api/challenges/respond','POST',{id,accept});
    $('friendChallengeDialog').close();
    currentFriendChallenge=null;
    if(accept&&data.code)connectOnline({type:'join',code:data.code});
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
  initOnlineTimeSetting();
  initializeActions();
  if(!configured)return;

  // Never expose an apparently ready sign-in flow before Oracle API is reachable.
  // The offline AI and two-player modes remain fully available without a backend.
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),4500);
  try{
    const response=await fetch(apiBase+'/health',{cache:'no-store',signal:controller.signal});
    if(!response.ok)return;
    const data=await response.json();
    if(data?.status!=='ok'||data?.service!=='abaku-api')return;
  }catch{
    return;
  }finally{
    clearTimeout(timeout);
  }

  document.querySelector('.server-state').textContent='● Oracle Online připojeno';
  startPresenceUpdates();
  $('googleSignIn').hidden=true;
  $('onlineLoginNotice').hidden=false;
  $('onlineLoginNotice').textContent='Obnovuji přihlášení…';
  $('onlineInfoText').textContent='Oracle API běží. Hraj s náhodným soupeřem nebo pozvi přítele.';

  // Do not show the Google account picker on every refresh. First try the
  // session-scoped token and verify it again on Oracle. Expired/revoked
  // tokens are discarded, after which the normal Google button appears.
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
