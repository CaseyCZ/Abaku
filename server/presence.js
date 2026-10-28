// Lightweight in-memory online presence. Never writes Google IDs or activity to SQLite.
// Each authenticated player counts once, including when signed in on several tabs.
export class PresenceTracker {
  constructor({clock=()=>Date.now(),ttlMs=70_000}={}){
    this.clock=clock;
    this.ttlMs=ttlMs;
    this.lastSeen=new Map();
  }
  touch(uid){
    if(typeof uid!=='string'||!uid)throw new Error('Neplatný hráč.');
    this.lastSeen.set(uid,this.clock());
  }
  remove(uid){this.lastSeen.delete(uid);}
  active(){
    const now=this.clock();
    for(const [uid,at] of this.lastSeen)if(now-at>=this.ttlMs)this.lastSeen.delete(uid);
    return new Set(this.lastSeen.keys());
  }
  canAdmit(uid,extraConnected=[],limit=700){
    if(typeof uid!=='string'||!uid)throw new Error('Neplatný hráč.');
    const unique=this.active();
    for(const connected of extraConnected)unique.add(connected);
    return unique.has(uid)||unique.size<limit;
  }
  count(extraConnected=[]){
    const unique=this.active();
    for(const uid of extraConnected)unique.add(uid);
    return unique.size;
  }
}
