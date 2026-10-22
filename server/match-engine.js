import { randomInt } from 'node:crypto';
import { emptyBoard, makeBag, drawTiles, validateMove } from '../src/rules.js';

const RACK_SIZE = 5;
const MAX_CHAT = 160;
const INVITE_TTL = 10 * 60_000;
const RECONNECT_GRACE = 60_000;
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const legalTime = value => [30, 60, 90].includes(Number(value)) ? Number(value) : 60;

export class MatchEngine {
  constructor({send = () => {}, onResult = () => {}, clock = () => Date.now(), rng = Math.random, getName = () => null} = {}) {
    this.send = send;
    this.onResult = onResult;
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
    this.nextId = 0;
  }
  connect(uid) {
    this.connections.add(uid);
    this.disconnected.delete(uid);
    this.sync(uid);
    const match = this.matchOf(uid);
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
    }
  }
  matchOf(uid) {
    return this.byPlayer.get(uid) || null;
  }
  // A safe resume summary for the signed-in player only. Matches live in RAM.
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
        winner:match.winner===null?null:match.players.findIndex(p=>p.uid===match.winner),reason:match.reason});
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
    const match={id:'m'+(++this.nextId),players,board:emptyBoard(),bag,
      turn:0,turns:0,passStreak:0,seconds:legalTime(seconds),
      deadline:this.clock()+legalTime(seconds)*1000,finished:false,winner:null,reason:null,endedAt:null};
    this.matches.set(match.id,match);
    this.byPlayer.set(uidA,match);this.byPlayer.set(uidB,match);
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
    if(!Array.isArray(placements)||placements.length<1||placements.length>RACK_SIZE)throw new Error('Neplatný počet kamenů.');
    const rack=match.players[match.turn].rack;
    const used=new Set();
    const safe=placements.map(p=>{
      const idx=p?.rackIndex;
      if(!Number.isInteger(idx)||idx<0||idx>=rack.length||used.has(idx))throw new Error('Neplatný výběr kamene.');
      used.add(idx);
      return {row:p.row,col:p.col,digit:rack[idx],rackIndex:idx};
    });
    const validated=validateMove(match.board,safe);
    if(!validated.valid)throw new Error(validated.reason);
    match.board=validated.board;
    const player=match.players[match.turn];
    for(const index of [...used].sort((a,b)=>b-a))player.rack.splice(index,1);
    player.rack=drawTiles(match.bag,player.rack);
    player.score+=validated.points;
    // Both players receive the same last accepted move and full equation cells.
    // Data contains only public board coordinates, never another player's rack.
    match.lastMove={player:match.turn,points:validated.points,equations:validated.equations,
      placed:safe.map(p=>({row:p.row,col:p.col})),cells:validated.equationCells,at:this.clock()};
    match.history ||= [];
    match.history.push({player:match.turn,points:validated.points,equations:validated.equations});
    if(match.history.length>30)match.history.shift();
    match.passStreak=0;
    this.sendTo(uid,{type:'move-accepted',points:validated.points,equations:validated.equations});
    this.nextTurn(match);
  }
  exchange(uid,indices) {
    const match=this.requireTurn(uid);
    if(!Array.isArray(indices)||!indices.length||indices.length>RACK_SIZE||match.bag.length<indices.length)
      throw new Error('Nelze vyměnit tyto kameny.');
    const player=match.players[match.turn];
    const indexes=new Set(indices);
    if(indexes.size!==indices.length||[...indexes].some(i=>!Number.isInteger(i)||i<0||i>=player.rack.length))throw new Error('Neplatné kameny.');
    const removed=[...indexes].sort((a,b)=>b-a).map(i=>player.rack.splice(i,1)[0]);
    player.rack=drawTiles(match.bag,player.rack);
    match.bag.unshift(...removed);
    match.passStreak++;
    this.nextTurn(match);
  }
  pass(uid) {
    const match=this.requireTurn(uid);
    this.passTurn(match,'pass');
  }
  passTurn(match,reason) {
    match.passStreak++;
    this.toAll(match,{type:'turn-passed',by:match.turn,reason});
    this.nextTurn(match);
  }
  nextTurn(match) {
    match.turns++;
    if(match.passStreak>=6||(!match.bag.length&&match.players.some(p=>!p.rack.length))) {
      this.finish(match,'completed');
      return;
    }
    match.turn=1-match.turn;
    match.deadline=this.clock()+match.seconds*1000;
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
  finish(match,reason,winnerOverride=null) {
    if(match.finished)return;
    match.finished=true;
    match.reason=reason;
    match.endedAt=this.clock();
    const [a,b]=match.players;
    match.winner=winnerOverride ?? (a.score===b.score ? null : (a.score>b.score?a.uid:b.uid));
    this.onResult({ids:[a.uid,b.uid],winner:match.winner,reason});
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
  tick() {
    const now=this.clock();
    for(const [code,inv] of this.invites) if(inv.expires<now)this.invites.delete(code);
    for(const match of this.matches.values()) {
      if(match.finished) {
        if(now-match.endedAt>5*60_000) {
          this.matches.delete(match.id);
          for(const p of match.players)if(this.byPlayer.get(p.uid)===match)this.byPlayer.delete(p.uid);
        }
        continue;
      }
      const disconnected=match.players.filter(p=>this.disconnected.has(p.uid));
      if(disconnected.length===2){
        const oldest=Math.min(...disconnected.map(p=>this.disconnected.get(p.uid)));
        if(now-oldest>RECONNECT_GRACE) {
          // No winning player: ignore abandoned game to avoid artificial draws in statistics.
          match.finished=true;match.endedAt=now;match.reason='abandoned';match.winner=null;
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
  }
}
