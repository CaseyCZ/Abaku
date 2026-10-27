import {SIZE, BONUS, bonusAt, emptyBoard, makeBag, drawTiles, replenishPlayerRack, validateMove, formatEquations} from './rules.js?v=0.2.24';
import {chooseMove} from './ai.js?v=0.2.24';
import {describeMovePreview} from './preview.js?v=0.2.24';
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
const VERSION = '0.1.19';
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
  const used = new Set(pend…4043 tokens truncated…ng').value=settings.mode;byId('difficultySetting').value=settings.difficulty;
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
