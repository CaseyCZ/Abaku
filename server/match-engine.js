import { randomInt, randomUUID } from 'node:crypto';
import { SIZE, emptyBoard, makeBag, drawTiles, validateMove } from '../src/rules.js';
import {reportEligibility,addReportReceipt} from '../src/report-policy.js';

const RACK_SIZE = 5;
const MAX_CHAT = 160;
const INVITE_TTL = 10 * 60_000;
const RECONNECT_GRACE = 60_000;
const RESTART_RECOVERY_WINDOW = 24 * 60 * 60_000;
const INVALID_MOVE_WINDOW = 5_000;
const MAX_INVALID_MOVES = 6;
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// All newly created online matches use one fixed turn duration.
// Restored historical matches retain their original deadline and duration.
const legalTime = () => 60;

export class MatchEngine {
  constructor({send = () => {}, onResult = () => {}, onChange = () => {}, onFinish = null, onDelete = () => {}, clock = () => Date.now(), rng = Math.random, getName = () => null} = {}) {
    this.send = send;
    this.onResult = onResult;
    this.onChange = onChange;
    this.onFinish = onFinish;
    this.onDelete = onDelete;
    this.clock = clock;
    this.rng = rng;
    this.getName = getName;
    this.connections = new Set();
    this.queue = [];
    this.invites = new Map();
    this.matches = new Map();
    this.byPlayer = new Map();
    this.disconnected = new Map();
    this.chatAt = new Map();
    this.restoredAwaiting = new Map();
    this.savedSnapshots = new Map();
    this.invalidMoves = new Map();
  }
  // Only private server state is serialized. Never send this snapshot to clients:
  // it contains both players' racks, bag order and internal account IDs.
  snapshot(match) {
    return {version:1,id:match.id,players:match.players,board:match.board,
      bag:match.bag,turn:match.turn,turns:match.turns,passStreak:match.passStreak,
      seconds:match.seconds,deadline:match.deadline,finished:match.finished,
      winner:match.winner,reason:match.reason,endedAt:match.endedAt,
      lastMove:match.lastMove||null,history:match.history||[],
      auditEvents:match.auditEvents,auditRevision:match.auditRevision,
      auditPartial:Boolean(match.auditPartial),
      reportReceipts:[...match.reportReceipts],savedAt:this.clock()};
  }
  rememberSnapshot(snapshot) {
    // Keep the last committed state so a failed SQLite write cannot leave a
    // different, unacknowledged board in server memory.
    this.savedSnapshots.set(snapshot.id,structuredClone(snapshot));
  }
  rollback(match) {
    const previous=this.savedSnapshots.get(match.id);
    if(!previous)return;
    const copy=structuredClone(previous);
    for(const field of ['players','board','bag','turn','turns','passStreak','seconds',
      'deadline','finished','winner','reason','endedAt','lastMove','history',
      'auditEvents','auditRevision','auditPartial'])match[field]=copy[field];
    match.reportReceipts=new Map(copy.reportReceipts);
  }
  persist(match) {
    const snapshot=this.snapshot(match);
    try{
      this.onChange(snapshot);
      this.rememberSnapshot(snapshot);
    }catch(error){this.rollback(match);throw error;}
  }
  restore(snapshots) {
    const now=this.clock();
    for(const state of snapshots){
      try {
        if(state?.version!==1||typeof state.id!=='string'||!state.id||state.id.length>80||
          !Array.isArray(state.players)||state.players.length!==2||
          state.players.some(p=>typeof p?.uid!=='string'||!p.uid||p.uid.length>150||
            !Number.isSafeInteger(p.score)||p.score<0||!Array.isArray(p.rack)||p.rack.length>RACK_SIZE||
            p.rack.some(n=>!Number.isInteger(n)||n<0||n>9))||
          state.players[0].uid===state.players[1].uid||
          !Array.isArray(state.board)||state.board.length!==SIZE||
          state.board.some(row=>!Array.isArray(row)||row.length!==SIZE||
            row.some(n=>n!==null&&(!Number.isInteger(n)||n<0||n>9)))||
          !Array.isArray(state.bag)||state.bag.length>110||
          state.bag.some(n=>!Number.isInteger(n)||n<0||n>9)||
          ![0,1].includes(state.turn)||!Number.isSafeInteger(state.turns)||state.turns<0||
          !Number.isSafeInteger(state.passStreak)||state.passStreak<0||
          ![30,60,90].includes(state.seconds)||!Number.isFinite(state.deadline)||
          typeof state.finished!=='boolean'||!Number.isFinite(state.savedAt)||
          (state.finished&&!Number.isFinite(state.endedAt))||
          (state.winner!==null&&typeof state.winner!=='string')||
          !Array.isArray(state.auditEvents)||state.auditEvents.length>600||
          !Number.isSafeInteger(state.auditRevision)||state.auditRevision<0||
          !Array.isArray(state.history)||state.history.length>30||
          !Array.isArray(state.reportReceipts)||
          state.reportReceipts.some(row=>!Array.isArray(row)||row.length!==2||typeof row[0]!=='string'))
          throw new Error('Neplatný uložený stav.');
        if(state.finished ? (now-state.endedAt>5*60_000) : (now-state.savedAt>RESTART_RECOVERY_WINDOW)){
          this.onDelete(state.id);
          continue;
        }
        if(this.matches.has(state.id)||state.players.some(p=>{
          const previous=this.byPlayer.get(p.uid);
          return previous&&!previous.finished;
        }))throw new Error('Kolize uložených partií.');
        const match={...state,reportReceipts:new Map(state.reportReceipts),
          reportPending:new Map(),rematchVotes:new Set()};
        this.matches.set(match.id,match);
        this.rememberSnapshot(state);
        for(const p of match.players){
          const previous=this.byPlayer.get(p.uid);
          if(!previous||previous.finished)this.byPlayer.set(p.uid,match);
        }
        if(!match.finished){
          // Nobody has a socket immediately after an API restart. Pause the
          // old deadline and give both players a chance to reconnect.
          match.deadline=now+match.seconds*1000;
          for(const p of match.players)this.disconnected.set(p.uid,now);
          this.restoredAwaiting.set(match.id,now);
        }
      }catch(error){
        console.error('Arena recovery skipped match',String(state?.id||'?').slice(0,80),error.message);
      }
    }
  }
  connect(uid) {
    const match = this.matchOf(uid);
    if(match&&!match.finished&&this.restoredAwaiting.has(match.id)){
      const now=this.clock();
      match.deadline=now+match.seconds*1000;
      this.persist(match);
      this.restoredAwaiting.delete(match.id);
      for(const p of match.players)if(p.uid!==uid)this.disconnected.set(p.uid,now);
    }
    this.connections.add(uid);
    this.disconnected.delete(uid);
    this.sync(uid);
    if (match && !match.finished) this.toOthers(match, uid, {type:'opponent',status:'connected'});
  }
  disconnect(uid) {
    this.connections.delete(uid);
    this.queue = this.queue.filter(item => item.uid !== uid);
    for (const [code,inv] of this.invites) if (inv.owner === uid) this.invites.delete(code);
    const match = this.matchOf(uid);
    if (match && !match.finished) {
      this.disconnected.set(uid, this.clock());
      this.toOthers(match, uid, {type:'opponent',status:'disconnected',graceSeconds:60});
    } else if(match?.finished && match.rematchVotes?.size){
      // An absent player cannot silently remain opted into a new game.
      match.rematchVotes.clear();
      this.toAll(match,{type:'rematch-status',status:'declined',by:match.players.findIndex(p=>p.uid===uid)});
    }
  }
  matchOf(uid) {
    return this.byPlayer.get(uid) || null;
  }
  // A safe resume summary for the signed-in player only.
  // This never exposes the other player's account ID or rack.
  activeMatchSummary(uid) {
    const match=this.matchOf(uid);
    if(!match || match.finished)return null;
    return {
      matchId:match.id,
      players:match.players.map((p,i)=>({
        nickname:this.getName(p.uid)||'Hráč '+(i+1),
        score:p.score,side:i
      })),
      mySide:match.players.findIndex(p=>p.uid===uid),
      turn:match.turn,turns:match.turns,
      deadline:match.deadline,seconds:match.seconds
    };
  }
  waitingCount() {
    // Only players who are still connected and eligible for random matchmaking.
    return this.queue.filter(item => this.connections.has(item.uid) && (!this.matchOf(item.uid) || this.matchOf(item.uid).finished)).length;
  }
  assertFree(uid) {
    const match = this.matchOf(uid);
    if (match && !match.finished) throw new Error('Už jsi v rozehrané partii.');
    if (!this.connections.has(uid)) throw new Error('Připojení není aktivní.');
  }
  sendTo(uid, payload) { this.send(uid,payload); }
  toOthers(match, uid, payload) { for (const player of match.players) if (player.uid !== uid) this.sendTo(player.uid,payload); }
  sync(uid) {
    const match = this.matchOf(uid);
    if (match) {
      const me = match.players.findIndex(p => p.uid === uid);
      this.sendTo(uid,{type:'match-state',matchId:match.id,board:match.board,
        players:match.players.map((p,i)=>({score:p.score,rackCount:p.rack.length,side:i,
          nickname:this.getName(p.uid)||'Hráč '+(i+1)})),
        mySide:me,rack:match.players[me].rack,turn:match.turn,turns:match.turns,
        bagCount:match.bag.length,seconds:match.seconds,deadline:match.deadline,
        lastMove:match.lastMove||null,history:(match.history||[]).slice(-6),finished:match.finished,
        winner:match.winner===null?null:match.players.findIndex(p=>p.uid===match.winner),reason:match.reason,
        auditRevision:match.auditRevision||0,reportStatus:this.reportStatus(uid,match)});
    } else this.sendTo(uid,{type:'lobby',queued:this.queue.some(q=>q.uid===uid)});
  }
  joinRandom(uid, seconds=60) {
    this.assertFree(uid);
    const selectedSeconds=legalTime(seconds);
    if (this.queue.some(q=>q.uid===uid)) return this.sendTo(uid,{type:'queue',waiting:true});
    const found = this.queue.findIndex(q=>q.uid!==uid && q.seconds===selectedSeconds && this.connections.has(q.uid) && (!this.matchOf(q.uid) || this.matchOf(q.uid).finished));
    if (found >= 0) {
      const opponent=this.queue.splice(found,1)[0];
      this.createMatch(opponent.uid,uid,opponent.seconds);
    } else {
      this.queue.push({uid,seconds:selectedSeconds});
      this.sendTo(uid,{type:'queue',waiting:true});
    }
  }
  leaveQueue(uid) {
    this.queue=this.queue.filter(item=>item.uid!==uid);
    this.sendTo(uid,{type:'queue',waiting:false});
  }
  makeInvite(uid,seconds=60) {
    this.assertFree(uid);
    for (const [code,value] of this.invites) if (value.owner===uid) this.invites.delete(code);
    let code;
    do { code=Array.from({length:7},()=>INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)]).join(''); }
    while(this.invites.has(code));
    this.invites.set(code,{owner:uid,seconds:legalTime(seconds),expires:this.clock()+INVITE_TTL});
    this.sendTo(uid,{type:'invite',code,expiresInSeconds:600});
    return code;
  }
  joinInvite(uid,code) {
    this.assertFree(uid);
    const key=String(code||'').trim().toUpperCase();
    const invite=this.invites.get(key);
    if (!invite || invite.expires < this.clock() || !this.connections.has(invite.owner))
      throw new Error('Pozvánka již neplatí.');
    if(invite.owner === uid) throw new Error('Nelze hrát sám se sebou.');
    if (this.matchOf(invite.owner) && !this.matchOf(invite.owner).finished) throw new Error('Hráč už hraje.');
    this.invites.delete(key);
    this.createMatch(invite.owner,uid,invite.seconds);
  }
  createMatch(uidA,uidB,seconds=60) {
    if(uidA===uidB)throw new Error('Nelze hrát sám se sebou.');
    for(const uid of [uidA,uidB]) {
      const prior=this.matchOf(uid);
      if(prior && prior.finished) this.byPlayer.delete(uid);
    }
    this.queue=this.queue.filter(q=>q.uid!==uidA&&q.uid!==uidB);
    const bag=makeBag(this.rng);
    const players=[{uid:uidA,score:0,rack:drawTiles(bag,[])},{uid:uidB,score:0,rack:drawTiles(bag,[])}];
    const match={id:'m_'+randomUUID(),players,board:emptyBoard(),bag,
      turn:0,turns:0,passStreak:0,seconds:legalTime(seconds),
      deadline:this.clock()+legalTime(seconds)*1000,finished:false,winner:null,reason:null,endedAt:null,
      auditEvents:[],auditRevision:0,reportReceipts:new Map(),reportPending:new Map()};
    this.persist(match);
    this.matches.set(match.id,match);
    this.byPlayer.set(uidA,match);this.byPlayer.set(uidB,match);
    this.invalidMoves.delete(uidA);this.invalidMoves.delete(uidB);
    for(const uid of [uidA,uidB]) {this.sendTo(uid,{type:'match-start',matchId:match.id});this.sync(uid);}
    return match;
  }
  requireTurn(uid) {
    const match=this.matchOf(uid);
    if(!match || match.finished)throw new Error('Není rozehraná partie.');
    if(match.players[match.turn].uid!==uid)throw new Error('Nyní nejsi na tahu.');
    if(match.deadline<=this.clock()) {this.passTurn(match,'timeout');throw new Error('Čas na tah vypršel.');}
    return match;
  }
  place(uid,placements) {
    const match=this.requireTurn(uid);
    const invalidWindow=this.invalidMoves.get(uid);
    const now=this.clock();
    if(invalidWindow&&now-invalidWindow.start<INVALID_MOVE_WINDOW&&invalidWindow.count>=MAX_INVALID_MOVES)
      throw new Error('Příliš mnoho neplatných pokusů. Počkej několik sekund.');
    if(!Array.isArray(placements)||placements.length<1||placements.length>RACK_SIZE)throw new Error('Neplatný počet čísel.');
    const rack=match.players[match.turn].rack;
    const used=new Set();
    const safe=placements.map(p=>{
      const idx=p?.rackIndex;
      if(!Number.isInteger(idx)||idx<0||idx>=rack.length||used.has(idx))throw new Error('Neplatný výběr čísla.');
      used.add(idx);
      return {row:p.row,col:p.col,digit:rack[idx],rackIndex:idx};
    });
    const validated=validateMove(match.board,safe);
    const auditPlacements=safe.map(p=>({row:p.row,col:p.col,digit:p.digit}));
    if(!validated.valid){
      this.recordAudit(match,{type:'move',player:match.turn,accepted:false,placements:auditPlacements});
      this.persist(match);
      if(!invalidWindow||now-invalidWindow.start>=INVALID_MOVE_WINDOW)
        this.invalidMoves.set(uid,{start:now,count:1});
      else invalidWindow.count++;
      throw new Error(validated.reason);
    }
    this.recordAudit(match,{type:'move',player:match.turn,accepted:true,placements:auditPlacements,
      points:validated.points,equations:validated.equations,breakdown:validated.equationBreakdown});
    match.board=validated.board;
    const player=match.players[match.turn];
    for(const index of [...used].sort((a,b)=>b-a))player.rack.splice(index,1);
    player.rack=drawTiles(match.bag,player.rack);
    player.score+=validated.points;
    const addedNumbers=auditPlacements.slice().sort((a,b)=>a.row-b.row||a.col-b.col).map(p=>p.digit);
    // Both players receive the same last accepted move and full equation cells.
    // Data contains only public board coordinates, never another player's rack.
    match.lastMove={player:match.turn,points:validated.points,equations:validated.equations,
      turnNumber:match.turns+1,addedNumbers,
      equationBreakdown:validated.equationBreakdown,
      placed:safe.map(p=>({row:p.row,col:p.col})),cells:validated.equationCells,at:this.clock()};
    match.history ||= [];
    match.history.push({player:match.turn,turnNumber:match.turns+1,addedNumbers,
      points:validated.points,equations:validated.equations});
    if(match.history.length>30)match.history.shift();
    match.passStreak=0;
    this.nextTurn(match,()=>this.sendTo(uid,{
      type:'move-accepted',points:validated.points,equations:validated.equations
    }));
    this.invalidMoves.delete(uid);
  }
  exchange(uid,indices) {
    const match=this.requireTurn(uid);
    if(!Array.isArray(indices)||!indices.length||indices.length>RACK_SIZE||match.bag.length<indices.length)
      throw new Error('Nelze vyměnit tato čísla.');
    const player=match.players[match.turn];
    const indexes=new Set(indices);
    if(indexes.size!==indices.length||[...indexes].some(i=>!Number.isInteger(i)||i<0||i>=player.rack.length))throw new Error('Neplatná čísla.');
    const removed=[...indexes].sort((a,b)=>b-a).map(i=>player.rack.splice(i,1)[0]);
    player.rack=drawTiles(match.bag,player.rack);
    match.bag.unshift(...removed);
    this.recordAudit(match,{type:'exchange',player:match.turn});
    match.passStreak++;
    this.nextTurn(match);
  }
  pass(uid) {
    const match=this.requireTurn(uid);
    this.passTurn(match,'pass');
  }
  passTurn(match,reason) {
    this.recordAudit(match,{type:'pass',player:match.turn});
    match.passStreak++;
    const by=match.turn;
    this.nextTurn(match,()=>this.toAll(match,{type:'turn-passed',by,reason}));
  }
  nextTurn(match,afterSave=()=>{}) {
    match.turns++;
    if(match.passStreak>=6||(!match.bag.length&&match.players.some(p=>!p.rack.length))) {
      this.finish(match,'completed',null,afterSave);
      return;
    }
    match.turn=1-match.turn;
    match.deadline=this.clock()+match.seconds*1000;
    this.persist(match);
    afterSave();
    for(const p of match.players)this.sync(p.uid);
  }
  toAll(match,payload){for(const p of match.players)this.sendTo(p.uid,payload);}
  // Leaving deliberately concedes the match immediately; a network interruption
  // still has its 60-second recovery period.
  resign(uid){
    const match=this.matchOf(uid);
    if(!match||match.finished)throw new Error('Není rozehraná partie.');
    const opponent=match.players.find(player=>player.uid!==uid);
    this.finish(match,'resigned',opponent.uid);
  }
  // A rematch can start only after both former players explicitly opt in.
  rematch(uid,accept=true){
    const match=this.matchOf(uid);
    if(!match||!match.finished||match.reason==='abandoned')
      throw new Error('Odveta už není dostupná.');
    if(typeof accept!=='boolean')throw new Error('Neplatná volba odvety.');
    match.rematchVotes ||= new Set();
    if(!accept){
      match.rematchVotes.clear();
      this.toAll(match,{type:'rematch-status',status:'declined',by:match.players.findIndex(p=>p.uid===uid)});
      return;
    }
    if(!this.connections.has(uid))throw new Error('Nejsi připojen.');
    const other=match.players.find(player=>player.uid!==uid);
    if(!this.connections.has(other.uid)){
      throw new Error('Soupeř není připojen. Odvetu lze spustit, až se vrátí.');
    }
    match.rematchVotes.add(uid);
    if(match.rematchVotes.size===2){
      // Swap first-player order so the second match can begin with the other player.
      const [first,second]=match.players;
      this.createMatch(second.uid,first.uid,match.seconds);
      return;
    }
    this.toAll(match,{type:'rematch-status',status:'requested',by:match.players.findIndex(p=>p.uid===uid)});
  }
  finish(match,reason,winnerOverride=null,afterSave=()=>{}) {
    if(match.finished)return;
    match.finished=true;
    match.reason=reason;
    match.endedAt=this.clock();
    const [a,b]=match.players;
    match.winner=winnerOverride ?? (a.score===b.score ? null : (a.score>b.score?a.uid:b.uid));
    const outcome={matchId:match.id,ids:[a.uid,b.uid],winner:match.winner,reason};
    try{
      if(this.onFinish){
        const snapshot=this.snapshot(match);
        this.onFinish(outcome,snapshot);
        this.rememberSnapshot(snapshot);
      }else{
        this.onResult(outcome);
        this.persist(match);
      }
    }catch(error){this.rollback(match);throw error;}
    afterSave();
    this.toAll(match,{type:'match-end',winner:match.winner===null?null:match.players.findIndex(p=>p.uid===match.winner),reason});
    for(const p of match.players)this.sync(p.uid);
  }
  chat(uid,text) {
    const match=this.matchOf(uid);
    if(!match||match.finished)throw new Error('Chat je dostupný jen během partie.');
    if(typeof text!=='string'||!text.trim()||text.trim().length>MAX_CHAT)throw new Error('Neplatná zpráva.');
    if(this.clock()-(this.chatAt.get(uid)||0)<1000)throw new Error('Zprávy posíláš příliš rychle.');
    this.chatAt.set(uid,this.clock());
    this.toAll(match,{type:'chat',from:match.players.findIndex(p=>p.uid===uid),text:text.trim()});
  }
  recordAudit(match,event){
    if(match.auditEvents.length>=600){
      match.auditPartial=true;
      const index=match.auditEvents.findIndex(e=>e.type!=='move'||!e.accepted);
      if(index<0)return;
      match.auditEvents.splice(index,1);
    }
    match.auditEvents.push(event);
    match.auditRevision++;
  }
  reportStatus(uid,match=this.matchOf(uid)){
    if(!match)return {kind:'ready'};
    return reportEligibility(match.reportReceipts?.get(uid),match.auditRevision||0,
      match.finished,this.clock());
  }
  async submitReport(uid,matchId,save){
    const match=this.matchOf(uid);
    if(!match||match.id!==matchId||!match.players.some(p=>p.uid===uid))
      throw new Error('Partie není dostupná.');
    if(match.reportPending.has(uid))return match.reportPending.get(uid);
    const state=this.reportStatus(uid,match);
    if(state.kind==='sent')return {id:state.id,alreadySent:true};
    if(state.kind==='limit')throw new Error('Byl dosažen limit průběžných kontrol této partie. Závěrečnou kontrolu lze stále odeslat.');
    if(state.kind==='cooldown')throw new Error('Další průběžnou kontrolu můžeš odeslat za dvě minuty.');
    const snapshot=structuredClone(this.reportFor(uid,matchId));
    const revision=match.auditRevision||0,finished=match.finished;
    const pending=Promise.resolve().then(()=>save(snapshot)).then(result=>{
      match.reportReceipts.set(uid,addReportReceipt(
        match.reportReceipts.get(uid),result.id,revision,finished,this.clock()));
      this.persist(match);
      this.sync(uid);
      return {...result,reportRevision:revision,reportFinished:finished};
    }).finally(()=>match.reportPending.delete(uid));
    match.reportPending.set(uid,pending);
    return pending;
  }
  reportFor(uid,matchId){
    const match=this.matchOf(uid);
    if(!match||match.id!==matchId||!match.players.some(p=>p.uid===uid))
      throw new Error('Partie není dostupná.');
    return {mode:'online',ruleset:'classic-powers-roots-linked-powers',partial:Boolean(match.auditPartial),
      finished:Boolean(match.finished),
      initialBoard:emptyBoard(),initialScores:[0,0],events:match.auditEvents,
      finalBoard:match.board,finalScores:match.players.map(p=>p.score)};
  }
  tick() {
    const now=this.clock();
    for(const [code,inv] of this.invites) if(inv.expires<now)this.invites.delete(code);
    for(const match of this.matches.values()) {
      if(match.finished) {
        if(now-match.endedAt>5*60_000) {
          this.onDelete(match.id);
          this.restoredAwaiting.delete(match.id);
          this.matches.delete(match.id);
          this.savedSnapshots.delete(match.id);
          for(const p of match.players)if(this.byPlayer.get(p.uid)===match){
            this.byPlayer.delete(p.uid);
            this.disconnected.delete(p.uid);
            this.chatAt.delete(p.uid);
            this.invalidMoves.delete(p.uid);
          }
        }
        continue;
      }
      const disconnected=match.players.filter(p=>this.disconnected.has(p.uid));
      if(disconnected.length===2){
        if(this.restoredAwaiting.has(match.id)){
          if(now-this.restoredAwaiting.get(match.id)<=RESTART_RECOVERY_WINDOW)continue;
          this.restoredAwaiting.delete(match.id);
        }
        const oldest=Math.min(...disconnected.map(p=>this.disconnected.get(p.uid)));
        if(now-oldest>RECONNECT_GRACE) {
          // No winning player: ignore abandoned game to avoid artificial draws in statistics.
          match.finished=true;match.endedAt=now;match.reason='abandoned';match.winner=null;
          this.persist(match);
        }
        continue;
      }
      if(disconnected.length===1 && now-this.disconnected.get(disconnected[0].uid)>RECONNECT_GRACE){
        const opponent=match.players.find(p=>p.uid!==disconnected[0].uid);
        this.finish(match,'forfeit',opponent.uid);
        continue;
      }
      if(match.deadline<=now)this.passTurn(match,'timeout');
    }
    for(const [uid,row] of this.invalidMoves)
      if(now-row.start>=INVALID_MOVE_WINDOW)this.invalidMoves.delete(uid);
  }
}
