import { randomUUID } from 'node:crypto';

const CHALLENGE_TTL_MS = 10 * 60_000;
const CHALLENGE_COOLDOWN_MS = 15_000;

// Temporary challenges live in RAM, like match boards and invitation codes.
// Only accepted friends can be challenged, and only the intended recipient
// can accept or decline the corresponding private invitation.
export class FriendChallenges {
  constructor({engine,resolveFriend,getProfile,push=()=>{},clock=()=>Date.now()}){
    this.engine=engine;
    this.resolveFriend=resolveFriend;
    this.getProfile=getProfile;
    this.push=push;
    this.clock=clock;
    this.byRecipient=new Map();
    this.lastSent=new Map();
  }
  valid(item){
    const invite=item&&this.engine.invites.get(item.code);
    return Boolean(item&&item.expires>this.clock()&&invite&&
      invite.owner===item.sender&&this.engine.connections.has(item.sender)&&
      (!this.engine.matchOf(item.sender)||this.engine.matchOf(item.sender).finished));
  }
  issue(sender,recipientPublicId,seconds=60){
    // resolveFriend validates the *accepted* friendship in SQLite.
    const {uid:recipient,profile}=this.resolveFriend(sender,recipientPublicId);
    this.engine.assertFree(sender);
    const opponentMatch=this.engine.matchOf(recipient);
    if(opponentMatch&&!opponentMatch.finished)throw new Error('Přítel právě hraje jinou partii.');
    if(this.clock()-(this.lastSent.get(sender)||0)<CHALLENGE_COOLDOWN_MS)
      throw new Error('Další výzvu můžeš poslat za několik sekund.');
    const code=this.engine.makeInvite(sender,seconds);
    const savedInvite=this.engine.invites.get(code);
    const item={
      id:randomUUID(),sender,recipient,code,seconds:savedInvite.seconds,
      expires:savedInvite.expires,fromPublicId:this.getProfile(sender).id
    };
    this.byRecipient.set(recipient,item);
    this.lastSent.set(sender,this.clock());
    this.push(sender,{type:'friend-challenge-sent',to:profile.nickname,seconds:item.seconds});
    this.push(recipient,{type:'friend-challenge-available'});
    return item.id;
  }
  pending(uid){
    const item=this.byRecipient.get(uid);
    if(!item)return null;
    if(!this.valid(item)){
      this.byRecipient.delete(uid);
      return null;
    }
    // Read the current nickname, not an untrusted nickname supplied by sender.
    const from=this.getProfile(item.sender);
    if(!from)return null;
    return {id:item.id,from:{id:from.id,nickname:from.nickname,avatar:from.avatar},
      seconds:item.seconds,expiresInSeconds:Math.max(0,Math.ceil((item.expires-this.clock())/1000))};
  }
  respond(uid,id,accept){
    const item=this.byRecipient.get(uid);
    if(!item||item.id!==id||!this.valid(item)){
      this.byRecipient.delete(uid);
      throw new Error('Tato výzva již neplatí.');
    }
    if(typeof accept!=='boolean')throw new Error('Neplatná odpověď.');
    if(accept){
      // Recheck relationship and match availability at the moment of acceptance.
      this.resolveFriend(item.sender,this.getProfile(uid).id);
      this.engine.assertFree(item.sender);
      // The target has not yet opened a WS, so a match must not be active already.
      if(this.engine.matchOf(uid)&&!this.engine.matchOf(uid).finished)
        throw new Error('Nejdříve dokonči rozehranou partii.');
    }
    this.byRecipient.delete(uid);
    this.push(item.sender,{type:'friend-challenge-response',
      accepted:accept,from:this.getProfile(uid)?.nickname||'Přítel'});
    return accept?{code:item.code}:{code:null};
  }
  tick(){
    for(const [uid,item] of this.byRecipient)if(!this.valid(item))this.byRecipient.delete(uid);
    for(const [uid,at] of this.lastSent)if(this.clock()-at>60_000)this.lastSent.delete(uid);
  }
  forget(uid){
    this.byRecipient.delete(uid);
    for(const [recipient,item] of this.byRecipient){
      if(item.sender===uid)this.byRecipient.delete(recipient);
    }
    this.lastSent.delete(uid);
  }
}
