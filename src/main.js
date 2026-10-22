import {SIZE, BONUS, bonusAt, emptyBoard, makeBag, drawTiles, validateMove} from './rules.js';
import {chooseMove} from './ai.js';

const byId = id => document.getElementById(id);
const settingsKey = 'retro-abaku-settings-v1';
const saveKey = 'retro-abaku-game-v1';
const defaults = {mode:'bot', difficulty:'medium', time:90, sound:true};
function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
let settings = {...defaults, ...load(settingsKey, {})};
// Previously saved 180s/unlimited settings are no longer offered.
if (![30, 60, 90].includes(Number(settings.time))) settings.time = 90;
let game = null;
let selectedIndex = null;
let pending = [];
let exchangeMode = false;
let exchangeIndices = new Set();
let deadline = null;
let botBusy = false;
let messageType = '';
let audioContext;

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
function playerLabel(index) { return index === 0 ? 'Hráč 1' : settings.mode === 'bot' ? 'Počítač' : 'Hráč 2'; }
function isBotTurn() { return settings.mode === 'bot' && game.turn === 1; }
function notify(message, type = '') { byId('gameMessage').textContent = message; messageType = type; byId('gameMessage').className = `game-message ${messageType}`; }
function save() { try { localStorage.setItem(saveKey, JSON.stringify(game)); } catch {} }
function freshGame() {
  const bag = makeBag();
  const players = [{rack:[],score:0},{rack:[],score:0}];
  players[0].rack = drawTiles(bag, []);
  players[1].rack = drawTiles(bag, []);
  return {board:emptyBoard(),bag,players,turn:0,turns:0,passStreak:0,finished:false,history:[]};
}
function clearPending() { pending = []; selectedIndex = null; exchangeMode = false; exchangeIndices.clear(); }
function newGame() {
  game = freshGame(); clearPending();botBusy = false;
  resetDeadline();save();render();notify('První tah: sestav příklad přes prostřední pole.');
}
function resetDeadline() {deadline = settings.time ? Date.now() + settings.time*1000 : null;}
function restore() {
  const saved = load(saveKey, null);
  if (saved && Array.isArray(saved.board) && saved.board.length === SIZE && saved.players?.length === 2 && Array.isArray(saved.bag)) {
    game = saved;
  } else game = freshGame();
  resetDeadline();render();
  notify(game.finished ? 'Partie skončila.' : game.turns ? 'Vítej zpět! Partie byla automaticky obnovena.' : 'První tah: sestav příklad přes prostřední pole.');
  if (isBotTurn() && !game.finished) runBot();
}

const boardElement = byId('board');
function renderBoard() {
  const placed = new Map(pending.map(p => [`${p.row}:${p.col}`,p]));
  const fragment = document.createDocumentFragment();
  for (let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) {
    const key = `${r}:${c}`;
    const staged = placed.get(key);
    const digit = staged ? staged.digit : game.board[r][c];
    const cell = document.createElement('button');
    cell.type = 'button';cell.className = `cell ${bonusAt(r,c)} ${digit !== null ? 'occupied' : ''} ${staged ? 'pending' : digit !== null ? 'old' : ''}`;
    cell.dataset.row = r;cell.dataset.col = c;
    cell.textContent = digit === null ? '' : String(digit);
    cell.title = `${r+1}. řádek, ${c+1}. sloupec${digit === null ? '' : `, ${digit}`}`;
    cell.setAttribute('aria-label',cell.title);
    fragment.append(cell);
  }
  boardElement.replaceChildren(fragment);
}
function renderRack() {
  const rack = byId('rack');rack.replaceChildren();
  const busy = isBotTurn() || game.finished || botBusy;
  const used = new Set(pending.map(p => p.rackIndex));
  const numbers = currentPlayer().rack;
  for (let index=0;index<5;index++) {
    const digit = numbers[index];
    const tile = document.createElement('button');tile.type='button';
    tile.className=`tile ${digit === undefined || used.has(index) ? 'empty' : ''} ${selectedIndex === index ? 'selected' : ''} ${exchangeIndices.has(index) ? 'exchange-selected' : ''}`;
    tile.textContent=digit === undefined || used.has(index) ? '' : digit;
    tile.disabled=busy || digit === undefined || used.has(index);tile.dataset.index=index;
    tile.setAttribute('aria-label', digit === undefined ? 'Prázdné místo' : `Kámen ${digit}`);
    rack.append(tile);
  }
}
function renderProgress() {
  const track = byId('progressTrack');track.replaceChildren();
  const completed = Math.round((110-game.bag.length)/110*20);
  for(let i=0;i<20;i++) {const bead=document.createElement('i'); if(i<completed) bead.className=i>15?'late':'used';track.append(bead);}
}
function render() {
  renderBoard();renderRack();renderProgress();
  byId('player0Name').textContent=playerLabel(0);byId('player1Name').textContent=playerLabel(1);
  for(let i=0;i<2;i++) {
    byId(`player${i}Score`).textContent=game.players[i].score;
    byId(`player${i}Card`).classList.toggle('active',game.turn===i && !game.finished);
    byId(`player${i}Status`).textContent=game.finished ? 'Konec' : game.turn===i ? 'Na tahu' : 'Čeká';
  }
  byId('bagCount').textContent=game.bag.length;
  byId('modeLabel').textContent=settings.mode==='bot' ? `Počítač: ${ {easy:'začátečník',medium:'pokročilý',hard:'expert'}[settings.difficulty] }`:'Dva hráči';
  const busy=isBotTurn()||game.finished||botBusy;
  for(const id of ['hintButton','exchangeButton','passButton','confirmButton','undoButton']) byId(id).disabled=busy;
  byId('confirmButton').disabled=busy||!pending.length;
  byId('exchangeButton').textContent=exchangeMode ? `Potvrdit výměnu (${exchangeIndices.size})`:'Vyměnit';
}

boardElement.addEventListener('click',event=>{
  const cell=event.target.closest('.cell');if(!cell||game.finished||isBotTurn()||botBusy||exchangeMode)return;
  const row=Number(cell.dataset.row),col=Number(cell.dataset.col);
  const prior=pending.findIndex(p=>p.row===row&&p.col===col);
  if(prior!==-1) {selectedIndex=pending[prior].rackIndex;pending.splice(prior,1);render();return;}
  if(game.board[row][col]!==null)return;
  if(selectedIndex===null) {notify('Nejdříve vyber číselný kámen dole.','error');return;}
  const digit=currentPlayer().rack[selectedIndex];
  pending.push({row,col,digit,rackIndex:selectedIndex});
  selectedIndex=null;sound();render();
  if(pending.length===5) notify('Všech pět kamenů je položeno. Potvrď tah.');
});
byId('rack').addEventListener('click',event=>{
  const tile=event.target.closest('.tile');if(!tile||tile.disabled)return;
  const index=Number(tile.dataset.index);
  if(exchangeMode) {if(exchangeIndices.has(index))exchangeIndices.delete(index);else exchangeIndices.add(index);}
  else selectedIndex=selectedIndex===index?null:index;
  sound();renderRack();byId('exchangeButton').textContent=exchangeMode?`Potvrdit výměnu (${exchangeIndices.size})`:'Vyměnit';
});

function advanceTurn(pass=false) {
  if(pass)game.passStreak++;else game.passStreak=0;
  game.turns++;
  if(game.passStreak>=6 || (game.bag.length===0 && game.players.some(p=>p.rack.length===0))) {
    finish();return;
  }
  game.turn=1-game.turn;clearPending();resetDeadline();save();render();
  if(isBotTurn())runBot();
}
function finish() {
  game.finished=true;clearPending();save();render();
  const [a,b]=game.players.map(p=>p.score);
  notify(a===b?'Remíza!':`Partie skončila. Vyhrává ${playerLabel(a>b?0:1)} (${Math.max(a,b)} bodů)!`,'success');
  sound('success');
}
function commitMove(placements, fromBot=false) {
  const checked=validateMove(game.board,placements);
  if(!checked.valid) {notify(checked.reason,'error');sound('error');return false;}
  game.board=checked.board;
  const player=currentPlayer();
  const usedIndexes=placements.map(p=>p.rackIndex).sort((a,b)=>b-a);
  for(const index of usedIndexes)player.rack.splice(index,1);
  drawTiles(game.bag,player.rack);
  player.score+=checked.points;
  game.history.push({player:game.turn,points:checked.points,examples:checked.equations,tiles:placements.length});
  const who=fromBot?'Počítač':playerLabel(game.turn);
  notify(`${who}: +${checked.points} bodů · ${checked.equations.slice(0,3).join(', ')}${checked.equations.length>3?'…':''}`,'success');
  sound('success');advanceTurn();return true;
}
byId('confirmButton').addEventListener('click',()=>{if(pending.length)commitMove(pending);});
byId('undoButton').addEventListener('click',()=>{clearPending();render();notify('Rozložené kameny vráceny do zásobníku.');});
byId('passButton').addEventListener('click',()=>{const who=playerLabel(game.turn);notify(`${who} vynechal tah.`);advanceTurn(true);});
byId('exchangeButton').addEventListener('click',()=>{
  if(pending.length){notify('Před výměnou vrať položené kameny.','error');return;}
  if(game.bag.length===0){notify('V sáčku už nejsou kameny.','error');return;}
  if(!exchangeMode){exchangeMode=true;selectedIndex=null;exchangeIndices.clear();notify('Vyber kameny pro výměnu a znovu stiskni Vyměnit.');render();return;}
  if(!exchangeIndices.size){exchangeMode=false;render();return;}
  const player=currentPlayer();
  const indexes=[...exchangeIndices].sort((a,b)=>b-a);
  const removed=indexes.map(index=>player.rack.splice(index,1)[0]);
  drawTiles(game.bag,player.rack);
  game.bag.unshift(...removed);
  clearPending();sound();notify(`${playerLabel(game.turn)} vyměnil ${indexes.length} kamenů.`);advanceTurn(true);
});
byId('hintButton').addEventListener('click',()=>{
  if(pending.length){notify('Pro nápovědu nejprve vrať rozložené kameny.','error');return;}
  notify('Hledám vhodný příklad…');
  setTimeout(()=>{
    const move=chooseMove(game.board,currentPlayer().rack,'hard');
    if(!move){notify('Nenašel jsem jednoduchý tah. Zkus vyměnit kameny.');return;}
    const available=currentPlayer().rack.map((digit,index)=>({digit,index}));
    pending=move.placements.map(p=>{
      const i=available.findIndex(v=>v.digit===p.digit);
      const {index}=available.splice(i,1)[0];
      return {...p,rackIndex:index};
    });
    sound();render();notify(`Návrh tahu za ${move.points} bodů. Můžeš ho upravit nebo potvrdit.`,'success');
  },30);
});

function runBot() {
  botBusy=true;render();notify('Počítač přemýšlí…');
  setTimeout(()=>{
    if(!isBotTurn()||game.finished){botBusy=false;return;}
    const move=chooseMove(game.board,currentPlayer().rack,settings.difficulty);
    botBusy=false;
    if(!move){
      if(game.bag.length){
        const bot=currentPlayer();game.bag.unshift(...bot.rack.splice(0,bot.rack.length));drawTiles(game.bag,bot.rack);
        notify('Počítač vyměnil kameny.');
      } else notify('Počítač vynechal tah.');
      advanceTurn(true);return;
    }
    const available=currentPlayer().rack.map((digit,index)=>({digit,index}));
    const placements=move.placements.map(p=>{
      const found=available.findIndex(v=>v.digit===p.digit);
      const {index}=available.splice(found,1)[0];return {...p,rackIndex:index};
    });
    commitMove(placements,true);
  },500);
}

function tick(){
  if(!game||game.finished)return;
  const display=byId('timer');
  if(deadline===null){display.textContent='∞';byId('timer').parentElement.classList.remove('warning');return;}
  const remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));
  display.textContent=`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;
  display.parentElement.classList.toggle('warning',remaining<=15);
  if(remaining===0&&!botBusy) {const name=playerLabel(game.turn);clearPending();notify(`${name}: vypršel časový limit.`,'error');advanceTurn(true);}
}
setInterval(tick,250);

byId('newButton').addEventListener('click',()=>{if(game.turns||pending.length){if(!confirm('Opravdu začít novou partii? Dosavadní výsledek se nahradí.'))return;}newGame();});
byId('rulesButton').addEventListener('click',()=>byId('rulesDialog').showModal());
byId('closeRules').addEventListener('click',()=>byId('rulesDialog').close());
byId('settingsButton').addEventListener('click',()=>{
  byId('modeSetting').value=settings.mode;byId('difficultySetting').value=settings.difficulty;
  byId('timeSetting').value=String(settings.time);byId('soundSetting').checked=settings.sound;
  byId('settingsDialog').showModal();
});
byId('settingsForm').addEventListener('submit',event=>{
  if(event.submitter?.value!=='save')return;
  const mode=byId('modeSetting').value;
  const modeChanged=mode!==settings.mode;
  settings={mode,difficulty:byId('difficultySetting').value,time:Number(byId('timeSetting').value),sound:byId('soundSetting').checked};
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

restore();tick();
