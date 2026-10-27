import {SIZE, BONUS, bonusAt, emptyBoard, makeBag, drawTiles, replenishPlayerRack, validateMove, formatEquations} from './rules.js?v=0.2.10';
import {chooseMove} from './ai.js?v=0.2.24';
import {describeMovePreview} from './preview.js?v=0.2.10';
import {ScoreRecap,getRecapSeconds,setRecapSeconds} from './score-recap.js?v=0.2.24';
import {ONLINE_CONFIG} from './online-config.js?v=0.2.8';
import {offlinePlayerName,savedOnlineToken,cacheVerifiedOnlineProfile,clearVerifiedOnlineProfile}
  from './player-identity.js?v=1';
import {ensureAudit,recordAudit,sendLocalReport,localReport} from './report-client.js?v=3';
import {bindFeedback,sendAnonymousFeedback} from './feedback-client.js?v=1';
import {reportEligibility,addReportReceipt} from './report-policy.js?v=1';

const byId = id => document.getElementById(id);
const settingsKey = 'retro-abaku-settings-v1';
const saveKey = 'retro-abaku-game-v1';
const defaults = {mode:'bot', difficulty:'medium', time:60, sound:true};
function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
let settings = {...defaults, ...load(settingsKey, {})};
// One-time migration from the old 90-second default for existing local games.
// The user can still choose and keep 90 seconds after the migration.
try {
  const key='retro-abaku-default-60-migrated-v1';
  if(localStorage.getItem(key)!=='yes'){
    if(Number(settings.time)===90)settings.time=60;
    localStorage.setItem(settingsKey,JSON.stringify(settings));
    localStorage.setItem(key,'yes');
  }
} catch { /* Preferences can work without storage. */ }
// Previously saved 180s/unlimited settings are no longer offered.
if (![30, 60, 90].includes(Number(settings.time))) settings.time = 60;
let game = null;
let selectedIndex = null;
let pending = [];
let exchangeMode = false;
let exchangeIndices = new Set();
let deadline = null;
let botBusy = false;
let reportSubmitting = false;
let reportRefreshTimer = null;
let messageType = '';
let recentMove = null;
let recentMoveTimer = null;
let audioContext;
const scoreRecap = new ScoreRecap(document.body);

function sound(kind = 'tap') {
  if (!settings.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator(), volume = audioContext.createGain();
    oscillator.type = kind === 'error' ? 'sawtooth' : 'sine';
    oscillator.frequency.value = kind === 'success' ? 690 : kind === 'error' ? 140 : 480;
    volume.gain.setValueAtTime(.05,audioContext.currentTime);
    volume.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime + .14);
    oscillator.connect(volume).connect(audioContext.destination);
    oscillator.start();oscillator.stop(audioContext.currentTime + .15);
  } catch { /* audio is optional */ }
}

function currentPlayer() { return game.players[game.turn]; }
function playerLabel(index) { return index === 0 ? offlinePlayerName() : settings.mode === 'bot' ? 'Počítač' : 'Hráč 2'; }

// The local game works even without Oracle, but refreshes the visible player
// name from the server when an authenticated device session is available.
// Neither token nor cached nickname is used to authorize game actions.
async function refreshLocalPlayerName(){
  const token=savedOnlineToken();
  if(!token)return;
  try{
    const response=await fetch(ONLINE_CONFIG.apiBase+'/api/me',{
      headers:{Authorization:'Bearer '+token},cache:'no-store'
    });
    if(token!==savedOnlineToken())return; // account was switched or signed out
    if(response.ok){
      const {profile}=await response.json();
      if(cacheVerifiedOnlineProfile(profile)&&game)render();
    }else if(response.status===401){
      // Invalid or revoked credentials must not keep a stale online nickname.
      clearVerifiedOnlineProfile();
      if(game)render();
    }
  }catch{ /* Offline game never depends on network connectivity. */ }
}
function isBotTurn() { return settings.mode === 'bot' && game.turn === 1; }
function notify(message, type = '') {
  messageType = type;
  byId('gameMessage').textContent = message;
  byId('gameMessage').className = `game-message ${messageType}`;
  // On phones the sidebar is collapsible, so always show hint/errors beneath the rack.
  const mobileMessage = byId('mobileGameMessage');
  if (mobileMessage) {
    mobileMessage.textContent = message;
    mobileMessage.className = `mobile-game-message ${messageType}`;
  }
}
// The completed turn is highlighted for three seconds AFTER the scoring
// scroll closes. Never waste this visibility while the parchment is on top.
function clearRecentMove(){
  if(recentMoveTimer!==null)clearTimeout(recentMoveTimer);
  recentMoveTimer=null;recentMove=null;
  const banner=byId('lastMoveReview');
  if(banner)banner.hidden=true;
}
function showRecentMove(checked,placements,who,onDone=()=>{}){
  clearRecentMove();
  recentMove={
    placed:new Set(placements.map(p=>p.row+':'+p.col)),
    cells:new Set((checked.equationCells||[]).map(p=>p.row+':'+p.col)),
    label:who+': '+formatEquations(checked.equations)+' · +'+checked.points+' bodů',
    until:Date.now()+3000
  };
  renderBoard();
  renderRecentMove();
  recentMoveTimer=setTimeout(()=>{
    recentMove=null;recentMoveTimer=null;
    render();
    onDone();
    // Wait for the scorer's promise microtask to release the final animation
    // before opening the modal above the board.
    if(game?.finished)setTimeout(showOfflineResult,0);
  },3000);
}
function renderRecentMove(){
  const banner=byId('lastMoveReview');
  if(!banner)return;
  banner.hidden=!recentMove||Date.now()>=recentMove.until;
  if(!banner.hidden)banner.textContent=recentMove.label;
}
function save() { try { localStorage.setItem(saveKey, JSON.stringify(game)); } catch {} }
function freshGame() {
  const bag = makeBag();
  const players = [{rack:[],score:0},{rack:[],score:0}];
  players[0].rack = drawTiles(bag, []);
  players[1].rack = drawTiles(bag, []);
  const next={board:emptyBoard(),bag,players,turn:0,turns:0,passStreak:0,finished:false,history:[],chat:[]};
  ensureAudit(next);
  return next;
}
function clearPending() { pending = []; selectedIndex = null; exchangeMode = false; exchangeIndices.clear(); }
function newGame() {
  const resultDialog=byId('onlineResultDialog');
  if(resultDialog.open)resultDialog.close();
  scoreRecap.cancel();
  clearRecentMove();
  game = freshGame(); clearPending();botBusy = false;
  resetDeadline();save();render();notify('První tah: sestav příklad přes prostřední pole.');
}
function resetDeadline() {deadline = settings.time ? Date.now() + settings.time*1000 : null;}
function restore() {
  scoreRecap.cancel();
  clearRecentMove();
  const saved = load(saveKey, null);
  if (saved && Array.isArray(saved.board) && saved.board.length === SIZE && saved.players?.length === 2 && Array.isArray(saved.bag)) {
    game = saved;
    ensureAudit(game);
    if (!Array.isArray(game.history)) game.history = [];
    // Older versions recorded automatic game events in chat: keep player messages only.
    const oldChat = Array.isArray(game.chat) ? game.chat : [];
    game.chat = oldChat.filter(m => m?.kind === 'player' && typeof m.text === 'string');
    const chatMigrated = game.chat.length !== oldChat.length || !Array.isArray(saved.chat);
    // Earlier versions lost replenished tiles. Repair saved games without resetting scores.
    if (!game.finished) {
      let repaired = false;
      for (const player of game.players) {
        const before = Array.isArray(player.rack) ? player.rack.length : 0;
        replenishPlayerRack(game.bag, player);
        if (player.rack.length !== before) repaired = true;
      }
      if (repaired || chatMigrated) save();
    } else if (chatMigrated) save();
  } else game = freshGame();
  resetDeadline();render();
  notify(game.finished ? 'Partie skončila.' : game.turns ? 'Vítej zpět! Partie byla automaticky obnovena.' : 'První tah: sestav příklad přes prostřední pole.');
  if(game.finished)showOfflineResult();
  if (isBotTurn() && !game.finished) runBot();
}

const boardElement = byId('board');
const BONUS_LABELS={dd:'Číslo ×2',td:'Číslo ×3',de:'Příklad ×2',te:'Příklad ×3'};
function renderBoard() {
  const placed = new Map(pending.map(p => [`${p.row}:${p.col}`,p]));
  const fragment = document.createDocumentFragment();
  for (let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) {
    const key = `${r}:${c}`;
    const staged = placed.get(key);
    const digit = staged ? staged.digit : game.board[r][c];
    const bonus=bonusAt(r,c);
    const cell = document.createElement('button');
    cell.type = 'button';cell.className = `cell ${bonus} ${digit !== null ? 'occupied' : 'bonus-hint'} ${staged ? 'pending' : digit !== null ? 'old' : ''}`;
    if(recentMove&&Date.now()<recentMove.until){
      if(recentMove.cells.has(key))cell.classList.add('recent-equation');
      if(recentMove.placed.has(key))cell.classList.add('recent-tile');
    }
    cell.dataset.row = r;cell.dataset.col = c;
    cell.textContent = digit === null ? (bonus ? ('×'+(bonus==='dd'||bonus==='de'?2:3)) : '') : String(digit);
    cell.title = `${r+1}. řádek, ${c+1}. sloupec${digit === null ? '' : `, ${digit}`}${bonus ? ', '+BONUS_LABELS[bonus] : ''}`;
    cell.setAttribute('aria-label',cell.title);
    fragment.append(cell);
  }
  boardElement.replaceChildren(fragment);
}
function renderRack() {
  const rack = byId('rack');rack.replaceChildren();
  const busy = isBotTurn() || game.finished || botBusy || scoreRecap.playing() || Boolean(recentMove);
  const used = new Set(pending.map(p => p.rackIndex));
  const numbers = currentPlayer().rack;
  for (let index=0;index<5;index++) {
    const digit = numbers[index];
    const tile = document.createElement('button');tile.type='button';
    tile.className=`tile ${digit === undefined || used.has(index) ? 'empty' : ''} ${selectedIndex === index ? 'selected' : ''} ${exchangeIndices.has(index) ? 'exchange-selected' : ''}`;
    tile.textContent=digit === undefined || used.has(index) ? '' : digit;
    tile.disabled=busy || digit === undefined || used.has(index);tile.dataset.index=index;
    tile.setAttribute('aria-label', digit === undefined ? 'Prázdné místo' : `Číslo ${digit}`);
    rack.append(tile);
  }
}
function renderProgress() {
  const track = byId('progressTrack');track.replaceChildren();
  const completed = Math.round((110-game.bag.length)/110*20);
  for(let i=0;i<20;i++) {const bead=document.createElement('i'); if(i<completed) bead.className=i>15?'late':'used';track.append(bead);}
}
function renderSidebar() {
  byId('turnName').textContent = game.finished ? 'Partie skončila' : playerLabel(game.turn);
  const last = game.history?.length ? game.history[game.history.length - 1] : null;
  byId('lastMovePlayer').textContent = last ? playerLabel(last.player) : '—';
  byId('lastExample').textContent = last?.examples?.length ? formatEquations(last.examples,10) : '—';
  byId('lastPoints').textContent = last ? '+' + last.points : '—';
  const history = byId('moveHistory');
  history.replaceChildren();
  for (const entry of (game.history || []).slice(-6).reverse()) {
    const li = document.createElement('li');
    const who = document.createElement('span');
    who.textContent = playerLabel(entry.player) + ' · ';
    const points = document.createElement('strong');
    points.className = 'move-points';
    points.textContent = '+' + entry.points;
    const details = document.createElement('span');
    details.textContent = ' · ' + (formatEquations(entry.examples,2) || 'tah');
    li.append(who,points,details);
    history.append(li);
  }
}
function renderMovePreview() {
  const preview = describeMovePreview(game.board, pending, game.finished);
  const box = byId('movePreview');
  box.dataset.state = preview.state;
  byId('board').dataset.moveState = preview.state;
  const confirm=byId('confirmButton');
  confirm.dataset.state=preview.state;
  confirm.title=preview.state==='valid'?'Potvrdit tah za '+preview.points+' bodů':preview.state==='invalid'?preview.detail:'Nejprve polož čísla';
  confirm.setAttribute('aria-label',confirm.title);
  byId('undoButton').dataset.hasPending=String(pending.length>0||exchangeMode||exchangeIndices.size>0);
  const points = byId('previewPoints');
  points.textContent = preview.state === 'valid' ? '+' + preview.points : '—';
  const details = byId('previewDetails');
  details.textContent = preview.detail;
  details.title = preview.detail;
}
function renderChat() {
  const container = byId('chatMessages');
  const wasNearBottom = container.scrollHeight - container.clientHeight - container.scrollTop < 44;
  container.replaceChildren();
  const messages = Array.isArray(game.chat) ? game.chat.filter(m => m?.kind === 'player').slice(-80) : [];
  if (!messages.length) {
    const note = document.createElement('div');
    note.className = 'chat-message system';
    note.textContent = 'Zatím žádné zprávy.';
    container.append(note);
  }
  for (const m of messages) {
    const box = document.createElement('div');
    box.className = 'chat-message player';
    const who = document.createElement('strong');
    who.textContent = Number.isInteger(m.player) ? playerLabel(m.player) : 'Hráč';
    box.append(who);
    const body = document.createElement('span');
    body.textContent = String(m.text || '');
    box.append(body);
    container.append(box);
  }
  if (wasNearBottom) container.scrollTop = container.scrollHeight;
  const enabled = settings.mode === 'local' && !game.finished;
  byId('chatInput').disabled = !enabled;
  byId('chatSendButton').disabled = !enabled;
  byId('chatInput').placeholder = enabled ? 'Napiš zprávu…' : 'Chat pouze pro dva hráče';
}
function render() {
  // The AI has no chat partner; use that space for the board.
  document.querySelector('.game-app').dataset.arenaMode=settings.mode;
  renderBoard();renderRack();renderProgress();
  byId('player0Name').textContent=playerLabel(0);byId('player1Name').textContent=playerLabel(1);
  for(let i=0;i<2;i++) {
    byId(`player${i}Score`).textContent=game.players[i].score;
    byId(`player${i}Card`).classList.toggle('active',game.turn===i && !game.finished);
    byId(`player${i}Status`).textContent=game.finished ? 'Konec' : game.turn===i ? 'Na tahu' : 'Čeká';
  }
  renderSidebar();renderChat();renderMovePreview();renderRecentMove();
  byId('hintButton').hidden = settings.mode !== 'bot';
  byId('bagCount').textContent=game.bag.length;
  byId('modeLabel').textContent=settings.mode==='bot' ? `Počítač: ${ {easy:'začátečník',medium:'pokročilý',hard:'expert'}[settings.difficulty] }`:'Dva hráči';
  const busy=isBotTurn()||game.finished||botBusy||scoreRecap.playing()||Boolean(recentMove);
  for(const id of ['hintButton','exchangeButton','passButton','confirmButton','undoButton']) byId(id).disabled=busy;
  byId('confirmButton').disabled=busy||!pending.length;
  byId('exchangeButton').textContent=exchangeMode ? `Potvrdit výměnu (${exchangeIndices.size})`:'Vyměnit';
  updateReportButtons();
}

boardElement.addEventListener('click',event=>{
  const cell=event.target.closest('.cell');if(!cell||game.finished||isBotTurn()||botBusy||scoreRecap.playing()||recentMove||exchangeMode)return;
  const row=Number(cell.dataset.row),col=Number(cell.dataset.col);
  const prior=pending.findIndex(p=>p.row===row&&p.col===col);
  if(prior!==-1) {selectedIndex=pending[prior].rackIndex;pending.splice(prior,1);render();return;}
  if(game.board[row][col]!==null)return;
  if(selectedIndex===null) {notify('Nejdříve vyber číslo dole.','error');return;}
  const digit=currentPlayer().rack[selectedIndex];
  pending.push({row,col,digit,rackIndex:selectedIndex});
  selectedIndex=null;sound();render();
  if(pending.length===5) notify('Všech pět čísel je položeno. Potvrď tah.');
});
byId('rack').addEventListener('click',event=>{
  const tile=event.target.closest('.tile');if(!tile||tile.disabled)return;
  const index=Number(tile.dataset.index);
  if(exchangeMode) {if(exchangeIndices.has(index))exchangeIndices.delete(index);else exchangeIndices.add(index);}
  else selectedIndex=selectedIndex===index?null:index;
  sound();renderRack();byId('exchangeButton').textContent=exchangeMode?`Potvrdit výměnu (${exchangeIndices.size})`:'Vyměnit';
});

function advanceTurn(pass=false,waitForRecap=false) {
  if(pass)game.passStreak++;else game.passStreak=0;
  game.turns++;
  if(game.passStreak>=6 || (game.bag.length===0 && game.players.some(p=>p.rack.length===0))) {
    finish(game.passStreak>=6?'Šest tahů po sobě bylo vynecháno.':'Sáček je prázdný a některému hráči došla čísla.');return;
  }
  game.turn=1-game.turn;clearPending();resetDeadline();save();render();
  if(isBotTurn()&&!waitForRecap)runBot();
}
function showOfflineResult(){
  if(!game?.finished||scoreRecap.playing()||recentMove)return;
  const dialog=byId('onlineResultDialog');
  if(dialog.open)return;
  const [first,second]=game.players.map(p=>Number(p.score)||0);
  const winner=first===second?null:first>second?0:1;
  const title=winner===null?'Remíza!':settings.mode==='bot'
    ?winner===0?'🏆 Vyhrál jsi!':'Počítač vyhrál'
    :'🏆 Vyhrál '+playerLabel(winner)+'!';
  byId('onlineResultTitle').textContent=title;
  byId('onlineResultDescription').textContent=winner===null?'Partie skončila nerozhodně.'
    :'Vítěz: '+playerLabel(winner);
  byId('onlineResultPlayer0').textContent=playerLabel(0);
  byId('onlineResultPlayer1').textContent=playerLabel(1);
  byId('onlineResultScore0').textContent=String(first);
  byId('onlineResultScore1').textContent=String(second);
  byId('onlineResultReason').textContent=game.finishReason||'Partie skončila podle pravidel.';
  byId('onlineRematchStatus').textContent=reportEligibility(
    game.reportReceipts,game.audit.revision,game.finished).kind==='sent'
    ?'Partie již byla odeslána ke kontrole.':'Můžeš rovnou začít další partii.';
  byId('onlineRematch').hidden=false;
  byId('onlineRematch').disabled=false;
  dialog.showModal();
}
function finish(reason='Partie skončila podle pravidel.') {
  if(game.finished)return;
  game.finished=true;game.finishReason=reason;clearPending();save();render();
  const [a,b]=game.players.map(p=>p.score);
  notify(a===b?'Remíza!':`Partie skončila. Vyhrává ${playerLabel(a>b?0:1)} (${Math.max(a,b)} bodů)!`,'success');
  sound('success');
  showOfflineResult();
}
function commitMove(placements, fromBot=false) {
  const checked=validateMove(game.board,placements);
  recordAudit(game,{type:'move',player:game.turn,accepted:checked.valid,placements,
    points:checked.points,equations:checked.equations,breakdown:checked.equationBreakdown});
  if(!checked.valid) {save();notify(checked.reason,'error');sound('error');return false;}
  game.board=checked.board;
  const player=currentPlayer();
  const usedIndexes=placements.map(p=>p.rackIndex).sort((a,b)=>b-a);
  for(const index of usedIndexes)player.rack.splice(index,1);
  replenishPlayerRack(game.bag,player);
  player.score+=checked.points;
  game.history.push({player:game.turn,points:checked.points,examples:checked.equations,tiles:placements.length});
  const who=fromBot?'Počítač':playerLabel(game.turn);
  notify(`${who}: +${checked.points} bodů · ${formatEquations(checked.equations)}${checked.equations.length>3?'…':''}`,'success');
  const nextTurn=1-game.turn;
  scoreRecap.play({player:who,breakdown:checked.equationBreakdown,
    equations:checked.equations,total:checked.points,
    onDone:()=>new Promise(resolve=>{
      // The scorer waits for 3 seconds of unobstructed board highlighting
      // before displaying any queued future scoring animation.
      showRecentMove(checked,placements,who,()=>{
        if(!game?.finished&&game.turn===nextTurn){
          resetDeadline();render();
          if(isBotTurn()&&!botBusy)runBot();
        }
        resolve();
        // ScoreRecap releases its busy state in a microtask after resolve().
        // Paint once more on the next frame so a human's rack and buttons
        // become enabled even when there is no AI turn or other render.
        requestAnimationFrame(()=>{if(game)render();});
      });
    })
  });
  sound('success');advanceTurn(false,true);return true;
}
byId('confirmButton').addEventListener('click',()=>{if(pending.length)commitMove(pending);});
byId('undoButton').addEventListener('click',()=>{clearPending();render();notify('Rozložená čísla vrácena do zásobníku.');});
byId('passButton').addEventListener('click',()=>{
  const who=playerLabel(game.turn);recordAudit(game,{type:'pass',player:game.turn});
  notify(`${who} vynechal tah.`);advanceTurn(true);
});
byId('exchangeButton').addEventListener('click',()=>{
  if(pending.length){notify('Před výměnou vrať položená čísla.','error');return;}
  if(game.bag.length===0){notify('V sáčku už nejsou čísla.','error');return;}
  if(!exchangeMode){exchangeMode=true;selectedIndex=null;exchangeIndices.clear();notify('Vyber čísla pro výměnu a znovu stiskni Vyměnit.');render();return;}
  if(!exchangeIndices.size){exchangeMode=false;render();return;}
  const player=currentPlayer();
  const indexes=[...exchangeIndices].sort((a,b)=>b-a);
  const removed=indexes.map(index=>player.rack.splice(index,1)[0]);
  recordAudit(game,{type:'exchange',player:game.turn});
  replenishPlayerRack(game.bag,player);
  game.bag.unshift(...removed);
  clearPending();sound();notify(`${playerLabel(game.turn)} vyměnil čísla (${indexes.length}).`);advanceTurn(true);
});
byId('hintButton').addEventListener('click',()=>{
  if(settings.mode !== 'bot' || game.finished || isBotTurn()) return;
  if(pending.length){notify('Pro nápovědu nejprve vrať rozložená čísla.','error');return;}
  notify('Hledám vhodný příklad…');
  setTimeout(()=>{
    const move=chooseMove(game.board,currentPlayer().rack,'hard');
    if(!move){notify('Nenašel jsem jednoduchý tah. Zkus vyměnit čísla.');return;}
    const available=currentPlayer().rack.map((digit,index)=>({digit,index}));
    pending=move.placements.map(p=>{
      const i=available.findIndex(v=>v.digit===p.digit);
      const {index}=available.splice(i,1)[0];
      return {...p,rackIndex:index};
    });
    sound();render();notify(`Nápověda: ${formatEquations(move.equations)} · +${move.points} bodů. Potvrď nebo uprav.`,'success');
  },30);
});

function runBot() {
  botBusy=true;render();notify('Počítač přemýšlí…');
  setTimeout(()=>{
    if(!isBotTurn()||game.finished){botBusy=false;return;}
    const move=chooseMove(game.board,currentPlayer().rack,settings.difficulty);
    botBusy=false;
    if(!move){
      recordAudit(game,{type:game.bag.length?'exchange':'pass',player:game.turn});
      if(game.bag.length){
        const bot=currentPlayer();game.bag.unshift(...bot.rack.splice(0,bot.rack.length));replenishPlayerRack(game.bag,bot);
        notify('Počítač vyměnil čísla.');
      } else {notify('Počítač vynechal tah.');}
      advanceTurn(true);return;
    }
    const available=currentPlayer().rack.map((digit,index)=>({digit,index}));
    const placements=move.placements.map(p=>{
      const found=available.findIndex(v=>v.digit===p.digit);
      const {index}=available.splice(found,1)[0];return {...p,rackIndex:index};
    });
    commitMove(placements,true);
  },3000);
}

function tick(){
  if(!game||game.finished)return;
  // The offline countdown pauses while players watch the score animation.
  if(scoreRecap.playing()||recentMove)return;
  const display=byId('timer');
  if(deadline===null){display.textContent='∞';byId('timer').parentElement.classList.remove('warning');return;}
  const remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));
  display.textContent=`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;
  display.parentElement.classList.toggle('warning',remaining<=15);
  if(remaining===0&&!botBusy) {const name=playerLabel(game.turn);
    recordAudit(game,{type:'pass',player:game.turn});
    clearPending();notify(`${name}: vypršel časový limit.`,'error');advanceTurn(true);}
}
setInterval(tick,250);

// Reuse exactly the online results modal and its existing two actions.
byId('onlineRematch').addEventListener('click',()=>newGame());
byId('onlineResultExit').addEventListener('click',()=>{
  save();
  window.location.assign('./index.html');
});
byId('onlineResultDialog').addEventListener('cancel',event=>event.preventDefault());
byId('newButton').addEventListener('click',()=>byId('newGameDialog').showModal());
byId('cancelNewGame').addEventListener('click',()=>byId('newGameDialog').close());
byId('confirmNewGame').addEventListener('click',()=>{byId('newGameDialog').close();newGame();});
byId('chatForm').addEventListener('submit',event=>{
  event.preventDefault();
  if(settings.mode !== 'local' || game.finished) return;
  const input=byId('chatInput');
  const content=input.value.trim().slice(0,160);
  if(!content) return;
  if(!Array.isArray(game.chat)) game.chat = [];
  game.chat.push({kind:'player',player:game.turn,text:content,at:Date.now()});
  if(game.chat.length > 80) game.chat.splice(0,game.chat.length - 80);
  input.value='';
  save();
  renderChat();
  sound();
});
byId('rulesButton').addEventListener('click',()=>byId('rulesDialog').showModal());
byId('closeRules').addEventListener('click',()=>byId('rulesDialog').close());
byId('settingsButton').addEventListener('click',()=>{
  byId('modeSetting').value=settings.mode;byId('difficultySetting').value=settings.difficulty;
  byId('timeSetting').value=String(settings.time);byId('soundSetting').checked=settings.sound;
  byId('scoreRecapSecondsSetting').value=String(getRecapSeconds());
  updateReportButtons();
  byId('settingsDialog').showModal();
});
function updateReportButtons(){
  if(!game)return;
  const state=reportEligibility(game.reportReceipts,game.audit?.revision||0,game.finished);
  const label=state.kind==='sent'?'Již bylo odesláno'
    :state.kind==='limit'?'Limit kontrol dosažen'
    :state.kind==='cooldown'?`Znovu za ${Math.max(1,Math.ceil((state.retryAt-Date.now())/1000))} s`
    :'Odeslat partii ke kontrole';
  for(const id of ['reportGameButton','offlineReportResultButton']){
    const button=byId(id);
    button.disabled=reportSubmitting||state.kind!=='ready';
    button.textContent=label;
  }
  if(state.kind==='cooldown'&&!reportRefreshTimer){
    reportRefreshTimer=setTimeout(()=>{
      reportRefreshTimer=null;
      updateReportButtons();
    },Math.max(0,state.retryAt-Date.now())+100);
  }
}
async function reportCurrentGame(button,statusElement){
  if(reportSubmitting)return;
  const state=reportEligibility(game.reportReceipts,game.audit?.revision||0,game.finished);
  if(state.kind!=='ready'){
    statusElement.textContent=state.kind==='sent'?'Partie v tomto stavu již byla odeslána.'
      :'Další kontrola bude dostupná později.';
    updateReportButtons();
    return;
  }
  const reportedGame=game;
  const reportedMode=settings.mode;
  const revision=game.audit?.revision||0;
  const finished=game.finished;
  reportSubmitting=true;
  updateReportButtons();
  statusElement.textContent='Odesílám partii…';
  try{
    const result=await sendLocalReport(reportedGame,reportedMode);
    reportedGame.reportReceipts=addReportReceipt(
      reportedGame.reportReceipts,result.id,revision,finished);
    if(game===reportedGame)save();
    statusElement.textContent=`Partie odeslána ke kontrole (č. ${result.id.slice(0,8)}).`;
  }catch(error){statusElement.textContent=error.message||'Odeslání se nezdařilo.';}
  finally{reportSubmitting=false;updateReportButtons();}
}
byId('reportGameButton').addEventListener('click',()=>reportCurrentGame(
  byId('reportGameButton'),byId('reportGameStatus')));
bindFeedback({buttonId:'reportProblemButton',send:({description,attach})=>{
  if(attach&&!game.audit?.events?.length)
    throw new Error('Pro přiložení historie nejdříve odehraj tah, nebo přílohu vypni.');
  return sendAnonymousFeedback({description,mode:settings.mode,
    ...(attach?{report:localReport(game,settings.mode)}:{})});
}});
byId('offlineReportResultButton').addEventListener('click',()=>reportCurrentGame(
  byId('offlineReportResultButton'),byId('onlineRematchStatus')));
byId('settingsForm').addEventListener('submit',event=>{
  if(event.submitter?.value!=='save')return;
  const mode=byId('modeSetting').value;
  const modeChanged=mode!==settings.mode;
  if (modeChanged && !confirm('Změna herního režimu zahájí novou partii a nahradí současnou hru. Pokračovat?')) { event.preventDefault(); return; }
  settings={mode,difficulty:byId('difficultySetting').value,time:Number(byId('timeSetting').value),sound:byId('soundSetting').checked};
  setRecapSeconds(byId('scoreRecapSecondsSetting').value);
  try{localStorage.setItem(settingsKey,JSON.stringify(settings));}catch{}
  if(modeChanged)newGame();else{resetDeadline();render();}
});
window.addEventListener('keydown',event=>{
  if(document.querySelector('dialog[open]')||game.finished||isBotTurn())return;
  if(event.key>='1'&&event.key<='5'){
    const index=Number(event.key)-1;
    if(currentPlayer().rack[index]!==undefined&&!pending.some(p=>p.rackIndex===index)) {selectedIndex=index;renderRack();}
  }
  if(event.key==='Escape'&&pending.length){clearPending();render();}
  if(event.key==='Enter'&&pending.length)commitMove(pending);
});


// The lobby may request a new local match; otherwise restore the existing session.
const startRequest = new URLSearchParams(window.location.search);
const startMode = startRequest.get('mode');
if (startRequest.get('start') === 'new' && (startMode === 'bot' || startMode === 'local')) {
  settings.mode = startMode;
  try { localStorage.setItem(settingsKey, JSON.stringify(settings)); } catch {}
  window.history.replaceState(null, '', window.location.pathname);
  newGame();
  tick();
} else {
  restore();
  tick();
}
// A profile edit or logout in a different browser tab updates Player 1.
window.addEventListener('storage',event=>{
  if(['abaku-online-display-profile-v1','abaku-online-device-session-v1',
    'abaku-local-profile-v1'].includes(event.key)&&game){
    render();
    if(event.key==='abaku-online-device-session-v1')refreshLocalPlayerName();
  }
});
window.addEventListener('pageshow',()=>{if(game){render();refreshLocalPlayerName();}});
refreshLocalPlayerName();
byId('lobbyButton').addEventListener('click', () => {
  const confirmed = window.confirm('Vrátit se do hlavní nabídky? Rozehraná partie zůstane uložená.');
  if (!confirmed) return;
  save();
  window.location.assign('./index.html');
});
