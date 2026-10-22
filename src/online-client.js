import { ONLINE_CONFIG } from './online-config.js';
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
  onlineName=profile.nickname;
  $('welcomeName').textContent=profile.nickname;
  $('profileName').textContent=profile.nickname;
  $('profileAvatar').textContent=profile.avatar||'✦';
  $('onlineStats').hidden=false;
  $('onlineStats').textContent='Zápasy: '+profile.played+' · Výhry: '+profile.wins+' · Úspěšnost: '+profile.winRate+' %';
  $('onlineLogout').hidden=false;
  $('googleSignInWidget').hidden=true;
  $('onlineLoginNotice').textContent='Přihlášený online profil';
  document.querySelectorAll('.mode-future').forEach(card=>card.classList.add('mode-connected'));
}
async function googleCredential(value){
  credential=value;
  try{
    const {profile}=await api('/api/me');
    showProfile(profile);
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
      if(action.type==='random')send('matchmake',{seconds:90});
      else if(action.type==='invite')send('invite',{seconds:90});
      else if(action.type==='join')send('join-invite',{code:action.code});
      else send('sync');
      return;
    }
    if(msg.type==='queue'){status(msg.waiting?'Hledám soupeře…':'Hledání zrušeno.');return;}
    if(msg.type==='invite'){
      $('onlineCode').textContent=msg.code;
      status('Pozvi přítele tímto kódem. Platí deset minut.');
      return;
    }
    if(msg.type==='match-start'){status('Soupeř připojen, partie začíná!');return;}
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
  info.textContent='Hráč 1: '+s.players[0].score+' · Hráč 2: '+s.players[1].score+' · V sáčku: '+s.bagCount;
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
    connectOnline({type:'random'});
  },true);
  $('playFriends').addEventListener('click',event=>{
    if(!configured||!credential)return;
    event.stopImmediatePropagation();
    const code=prompt('Zadej kód pozvánky. Pro vytvoření nové pozvánky nech pole prázdné:');
    if(code===null)return;
    connectOnline(code.trim()?{type:'join',code:code.trim()}:{type:'invite'});
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
  $('onlineLogout').addEventListener('click',()=>{
    connection?.close();connection=null;credential=null;gameState=null;
    window.google?.accounts?.id?.disableAutoSelect?.();
    $('googleSignInWidget').hidden=false;
    $('onlineLogout').hidden=true;
    $('onlineStats').hidden=true;
    $('onlineLoginNotice').textContent='Přihlas se přes Google';
    location.reload();
  });
}
export async function initOnline(){
  initializeActions();
  if(!configured)return;
  $('googleSignIn').hidden=true;
  $('googleSignInWidget').hidden=false;
  $('onlineLoginNotice').textContent='Načítání přihlášení Google…';
  try{
    const g=await googleSdk();
    g.initialize({client_id:ONLINE_CONFIG.googleClientId,callback:response=>googleCredential(response.credential),auto_select:false});
    g.renderButton($('googleSignInWidget'),{type:'standard',theme:'outline',size:'large',text:'signin_with',width:230,locale:'cs'});
    $('onlineLoginNotice').textContent='Přihlas se přes Google';
  }catch(error){status(error.message,true);$('googleSignIn').hidden=false;$('googleSignInWidget').hidden=true;}
}
