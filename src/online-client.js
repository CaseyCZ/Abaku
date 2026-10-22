import { ONLINE_CONFIG } from './online-config.js?v=0.2.5';
import { describeMovePreview } from './preview.js';

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
let credential=null,connection=null,gameState=null,selected=null,pending=[],exchanging=false,selectedExchange=new Set();
let onlineName='Hráč';
const validTurnSeconds=[30,60,90];
const timeStorageKey='abaku-online-turn-seconds';
const selectedTurnSeconds=()=>validTurnSeconds.includes(Number($('onlineTurnSeconds').value))
  ? Number($('onlineTurnSeconds').value) : 90;
function initOnlineTimeSetting(){
  const select=$('onlineTurnSeconds');
  try{
    const saved=Number(localStorage.getItem(timeStorageKey));
    if(validTurnSeconds.includes(saved))select.value=String(saved);
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
  if(!response.ok)throw new Error(json.error||'Server neodpověděl.');
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
  $('onlineLoginNotice').textContent='Přihlášený online profil';
  $('profileSubtitle').textContent='Google účet · online';
  $('profileDescription').textContent='Tento profil a statistiky jsou uložené na Oracle. Úpravy přezdívky se synchronizují mezi zařízeními.';
  $('editProfile').textContent='Upravit online profil';
  $('manageFriends').hidden=false;
  $('onlineInfoText').textContent='Oracle je připojený. Můžeš hledat náhodného soupeře nebo vytvořit pozvánku pomocí kódu.';
  const onlineModes=[
    ['playRandom','HLEDAT SOUPEŘE'],
    ['playFriends','VYTVOŘIT / ZADAT KÓD']
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
    const {profile}=await api('/api/me');
    showProfile(profile);
    await heartbeat().catch(()=>{});
    await refreshPresence();
    await showLeaderboard();
  }catch(error){
    credential=null;
    status(error.message,true);
    $('onlineLoginNotice').textContent='Přihlášení se nepodařilo ověřit na Oracle serveru.';
    $('googleSignInWidget').hidden=false;
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
function send(type,fields={}){
  if(!connection||connection.readyState!==WebSocket.OPEN){status('Spojení se serverem není aktivní.',true);return;}
  connection.send(JSON.stringify({type,...fields}));
}
function connectOnline(action){
  if(!credential){status('Nejdříve se přihlas přes Google.',true);return;}
  if(connection){connection.close();connection=null;}
  pending=[];selected=null;gameState=null;
  $('onlineDialog').showModal();
  $('onlineBoardWrapper').hidden=true;
  $('onlineWaiting').hidden=false;
  $('onlineCode').textContent='';
  $('onlineChat').replaceChildren();
  refreshPresence();
  status('Připojuji se k Oracle serveru…');
  const wsUrl=apiBase.replace(/^http/,'ws')+'/ws';
  const socket=new WebSocket(wsUrl);
  connection=socket;
  socket.addEventListener('open',()=>send('auth',{idToken:credential}));
  socket.addEventListener('message',event=>{
    if(connection!==socket)return;
    let msg;try{msg=JSON.parse(event.data)}catch{return;}
    if(msg.type==='error'){status(msg.message||'Chyba serveru.',true);return;}
    if(msg.type==='authenticated'){
      if(action.type==='random')send('matchmake',{seconds:action.seconds});
      else if(action.type==='invite')send('invite',{seconds:action.seconds});
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
      status('Pozvi přítele tímto kódem. Platí deset minut.');
      return;
    }
    if(msg.type==='match-start'){status('Soupeř připojen, partie začíná!');refreshPresence();return;}
    if(msg.type==='match-state'){
      const previous=gameState?.turn;
      gameState=msg;
      if(previous!==msg.turn||msg.finished){pending=[];selected=null;exchanging=false;selectedExchange.clear();}
      $('onlineWaiting').hidden=true;
      $('onlineBoardWrapper').hidden=false;
      renderOnline();
      return;
    }
    if(msg.type==='move-accepted'){pending=[];selected=null;status('Platný tah: +'+msg.points+' bodů.');return;}
    if(msg.type==='turn-passed'){status('Tah vynechán ('+msg.reason+').');return;}
    if(msg.type==='opponent'){status(msg.status==='disconnected'?'Soupeř se odpojil, má 60 sekund na návrat.':'Soupeř se znovu připojil.');return;}
    if(msg.type==='match-end'){status(msg.winner===null?'Remíza.':(msg.winner===gameState?.mySide?'Vyhrál jsi!':'Soupeř vyhrál.'));return;}
    if(msg.type==='chat')addChat(msg.from,msg.text);
  });
  socket.addEventListener('close',()=>{if(connection===socket)status('Spojení skončilo.');});
  socket.addEventListener('error',()=>status('Nelze se spojit s Oracle API. Zkontroluj jeho HTTPS adresu.',true));
}
function ownTurn(){return gameState&&!gameState.finished&&gameState.mySide===gameState.turn;}
function addChat(uid,text){
  const line=document.createElement('div');
  line.className='online-chat-line';
  const own=gameState?.mySide===uid;
  line.textContent=(own?'Já: ':'Soupeř: ')+String(text||'');
  const chat=$('onlineChat');chat.append(line);chat.scrollTop=chat.scrollHeight;
}
function renderOnline(){
  if(!gameState)return;
  const s=gameState;
  const info=$('onlineScore');
  info.textContent='Hráč 1: '+s.players[0].score+' · Hráč 2: '+s.players[1].score+' · V sáčku: '+s.bagCount+' · Čas na tah: '+(s.seconds||90)+' s';
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
    cell.className='online-cell'+(p?' staged':digit!==null?' fixed':'');
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
  const rack=$('onlineRack');rack.replaceChildren();
  for(let i=0;i<s.rack.length;i++){
    const tile=document.createElement('button');
    tile.type='button';
    tile.className='online-tile'+(selected===i?' chosen':'')+(selectedExchange.has(i)?' chosen':'');
    tile.textContent=String(s.rack[i]);
    tile.disabled=!canPlay||pending.some(p=>p.rackIndex===i);
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
  $('onlinePass').disabled=!canPlay;
  $('onlineExchange').disabled=!canPlay;
  $('onlineExchange').textContent=exchanging?'Potvrdit výměnu ('+selectedExchange.size+')':'Vyměnit';
}
function initializeActions(){
  $('playRandom').addEventListener('click',event=>{
    if(!configured||!credential)return;
    event.stopImmediatePropagation();
    connectOnline({type:'random',seconds:selectedTurnSeconds()});
  },true);
  $('playFriends').addEventListener('click',event=>{
    if(!configured||!credential)return;
    event.stopImmediatePropagation();
    const code=prompt('Zadej kód pozvánky. Pro vytvoření nové pozvánky nech pole prázdné:');
    if(code===null)return;
    connectOnline(code.trim()?{type:'join',code:code.trim()}:{type:'invite',seconds:selectedTurnSeconds()});
  },true);
  $('onlineCancel').addEventListener('click',()=>{
    if(!gameState)send('cancel-matchmake');
    connection?.close();connection=null;
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
  $('friendsClose').addEventListener('click',()=>$('friendsDialog').close());
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
    for(const player of data.friends||[])appendFriend(friends,player,null,null);
    if(!data.requests?.length)incoming.textContent='Žádné nové žádosti.';
    if(!data.friends?.length)friends.textContent='Zatím nemáš přidané přátele.';
  }catch(error){$('friendMessage').textContent=error.message;}
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
  $('googleSignInWidget').hidden=false;
  $('onlineLoginNotice').textContent='Načítání přihlášení Google…';
  $('onlineInfoText').textContent='Oracle API je připojené. Přihlas se přes Google a můžeš hledat soupeře.';
  try{
    const g=await googleSdk();
    g.initialize({client_id:ONLINE_CONFIG.googleClientId,callback:response=>googleCredential(response.credential),auto_select:false});
    g.renderButton($('googleSignInWidget'),{type:'standard',theme:'outline',size:'large',text:'signin_with',width:230,locale:'cs'});
    $('onlineLoginNotice').textContent='Přihlas se přes Google';
  }catch(error){status(error.message,true);$('googleSignIn').hidden=false;$('googleSignInWidget').hidden=true;}
}
