import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';

export function openStore(filename = './data/abaku.sqlite') {
  if(filename !== ':memory:') mkdirSync(dirname(resolve(filename)),{recursive:true,mode:0o700});
  const db=new DatabaseSync(filename,{timeout:5000});
  db.exec(`PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS players (
  uid TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL COLLATE NOCASE UNIQUE,
  avatar TEXT NOT NULL DEFAULT '✦',
  played INTEGER NOT NULL DEFAULT 0 CHECK(played >= 0),
  wins INTEGER NOT NULL DEFAULT 0 CHECK(wins >= 0),
  losses INTEGER NOT NULL DEFAULT 0 CHECK(losses >= 0),
  draws INTEGER NOT NULL DEFAULT 0 CHECK(draws >= 0)
);
CREATE TABLE IF NOT EXISTS friend_requests (
  sender TEXT NOT NULL REFERENCES players(uid) ON DELETE CASCADE,
  recipient TEXT NOT NULL REFERENCES players(uid) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('pending','accepted','declined')),
  PRIMARY KEY(sender,recipient),
  CHECK(sender <> recipient)
);
`);
  const statements={
    lookup:db.prepare('SELECT public_id AS id,nickname,avatar,played,wins,losses,draws FROM players WHERE uid=?'),
    lookupId:db.prepare('SELECT uid FROM players WHERE public_id=?'),
    insert:db.prepare('INSERT OR IGNORE INTO players(uid,public_id,nickname) VALUES(?,?,?)'),
    rename:db.prepare('UPDATE players SET nickname=?,avatar=? WHERE uid=?'),
    leaderboard:db.prepare(`SELECT nickname,avatar,played,wins,losses,draws
      FROM players WHERE played>0 ORDER BY (wins*1.0/played) DESC, wins DESC, played DESC LIMIT ?`),
    search:db.prepare("SELECT public_id AS id,nickname,avatar FROM players WHERE nickname LIKE ? LIMIT 15"),
    friendList:db.prepare(`SELECT p.public_id AS id,p.nickname,p.avatar FROM players p
      WHERE p.uid IN (
        SELECT recipient FROM friend_requests WHERE sender=? AND status='accepted'
        UNION
        SELECT sender FROM friend_requests WHERE recipient=? AND status='accepted'
      ) ORDER BY p.nickname`),
    pending:db.prepare(`SELECT p.public_id AS id,p.nickname,p.avatar FROM players p
      JOIN friend_requests f ON f.sender=p.uid WHERE f.recipient=? AND f.status='pending'`),
    exists:db.prepare('SELECT status FROM friend_requests WHERE sender=? AND recipient=?'),
    incoming:db.prepare('SELECT status FROM friend_requests WHERE sender=? AND recipient=?'),
    acceptedFriend:db.prepare("SELECT 1 AS is_friend FROM friend_requests WHERE status='accepted' AND ((sender=? AND recipient=?) OR (sender=? AND recipient=?)) LIMIT 1"),
    insertRequest:db.prepare("INSERT INTO friend_requests(sender,recipient,status) VALUES(?,?,'pending') ON CONFLICT(sender,recipient) DO UPDATE SET status='pending'"),
    reply:db.prepare("UPDATE friend_requests SET status=? WHERE sender=? AND recipient=? AND status='pending'"),
    win:db.prepare('UPDATE players SET played=played+1,wins=wins+1 WHERE uid=?'),
    lose:db.prepare('UPDATE players SET played=played+1,losses=losses+1 WHERE uid=?'),
    draw:db.prepare('UPDATE players SET played=played+1,draws=draws+1 WHERE uid=?')
  };
  const expose=p=>p && {...p,winRate:p.played ? Math.round(p.wins/p.played*10000)/100 : 0};
  const ensure=uid=>{
    if(typeof uid!=='string'||!uid||uid.length>150)throw new Error('Neplatný identifikátor.');
    if (!statements.lookup.get(uid)) {
      const publicId=randomBytes(8).toString('hex');
      statements.insert.run(uid,publicId,'Hráč-'+publicId.slice(0,6));
    }
    return expose(statements.lookup.get(uid));
  };
  const rename=(uid,nickname,avatar='✦')=>{
    if(typeof nickname!=='string'||nickname.trim().length<2||nickname.trim().length>20||!/^[\p{L}\p{N} ._\-]+$/u.test(nickname.trim()))
      throw new Error('Přezdívka musí mít 2–20 znaků a obsahovat pouze písmena, čísla, mezeru, tečku, pomlčku nebo podtržítko.');
    if(!['✦','★','❖','♟'].includes(avatar))throw new Error('Neplatný avatar.');
    try{statements.rename.run(nickname.trim(),avatar,uid);}
    catch(error){if(/UNIQUE constraint/i.test(error.message))throw new Error('Přezdívka už je obsazená.');throw error;}
    return expose(statements.lookup.get(uid));
  };
  const request=(sender,recipientId)=>{
    const recipient=statements.lookupId.get(recipientId)?.uid;
    if(!recipient)throw new Error('Hráč neexistuje.');
    if(sender===recipient)throw new Error('Nemůžeš přidat sám sebe.');
    if(!statements.lookup.get(recipient))throw new Error('Hráč neexistuje.');
    const outgoing=statements.exists.get(sender,recipient);
    const incoming=statements.incoming.get(recipient,sender);
    if(outgoing?.status==='accepted'||incoming?.status==='accepted')throw new Error('Už jste přátelé.');
    if(incoming?.status==='pending')throw new Error('Tento hráč už tě požádal. Přijmi jeho žádost.');
    statements.insertRequest.run(sender,recipient);
  };
  const respond=(recipient,senderId,accept)=>{
    const sender=statements.lookupId.get(senderId)?.uid;
    if(!sender)throw new Error('Žádost nebyla nalezena.');
    const result=statements.reply.run(accept?'accepted':'declined',sender,recipient);
    if(result.changes===0)throw new Error('Žádost nebyla nalezena.');
  };
  const record=({ids,winner,reason})=>{
    if(reason==='abandoned')return;
    if(!Array.isArray(ids)||ids.length!==2||ids[0]===ids[1])throw new Error('Neplatný výsledek.');
    db.exec('BEGIN IMMEDIATE');
    try {
      for(const uid of ids){
        ensure(uid);
        if(winner===null)statements.draw.run(uid);
        else if(winner===uid)statements.win.run(uid);
        else statements.lose.run(uid);
      }
      db.exec('COMMIT');
    } catch(error){db.exec('ROLLBACK');throw error;}
  };
  return {
    db,ensure,rename,request,respond,record,
    get:uid=>expose(statements.lookup.get(uid)),
    leaderboard:(limit=30)=>statements.leaderboard.all(Math.min(50,Math.max(1,Number(limit)||30))).map(expose),
    findPlayers:query=>statements.search.all('%'+String(query||'').slice(0,20).replace(/[%_]/g,'')+'%'),
    friends:uid=>statements.friendList.all(uid,uid),
    incoming:uid=>statements.pending.all(uid),
    // Resolve a public friend ID to a private Google UID only after server-side
    // mutual relationship validation. Never send the UID to the browser.
    resolveFriend:(uid,publicId)=>{
      if(typeof publicId!=='string'||!/^[a-f0-9]{16}$/.test(publicId))
        throw new Error('Neplatný hráč.');
      const target=statements.lookupId.get(publicId)?.uid;
      if(!target||uid===target||!statements.acceptedFriend.get(uid,target,target,uid))
        throw new Error('Hráč není mezi tvými přáteli.');
      return {uid:target,profile:expose(statements.lookup.get(target))};
    },
    close:()=>db.close()
  };
}
