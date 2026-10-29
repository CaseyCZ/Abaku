import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash } from 'node:crypto';

const SESSION_TTL=30*24*60*60*1000;
const SESSION_RENEW_BELOW=20*24*60*60*1000;
const sessionDigest=token=>createHash('sha256').update(token).digest('hex');
const validSessionToken=token=>typeof token==='string'&&/^arena_[A-Za-z0-9_-]{43}$/.test(token);

export function openStore(filename = './data/arena.sqlite') {
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
CREATE TABLE IF NOT EXISTS login_sessions (
  token_hash TEXT PRIMARY KEY,
  uid TEXT NOT NULL REFERENCES players(uid) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_sessions_uid ON login_sessions(uid);
CREATE TABLE IF NOT EXISTS match_results (
  id INTEGER PRIMARY KEY,
  uid TEXT NOT NULL REFERENCES players(uid) ON DELETE CASCADE,
  played_at INTEGER NOT NULL,
  result TEXT NOT NULL CHECK(result IN ('win','loss','draw'))
);
CREATE INDEX IF NOT EXISTS idx_match_results_period ON match_results(played_at,uid);
CREATE TABLE IF NOT EXISTS live_matches (
  match_id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settled_matches (
  match_id TEXT PRIMARY KEY,
  settled_at INTEGER NOT NULL
);
`);
  const statements={
    lookup:db.prepare('SELECT public_id AS id,nickname,avatar,played,wins,losses,draws FROM players WHERE uid=?'),
    lookupId:db.prepare('SELECT uid FROM players WHERE public_id=?'),
    insert:db.prepare('INSERT OR IGNORE INTO players(uid,public_id,nickname) VALUES(?,?,?)'),
    rename:db.prepare('UPDATE players SET nickname=?,avatar=? WHERE uid=?'),
    leaderboard:db.prepare(`SELECT nickname,avatar,played,wins,losses,draws
      FROM players WHERE played>0 ORDER BY (wins*1.0/played) DESC, wins DESC, played DESC LIMIT ?`),
    leaderboardPeriod:db.prepare(`SELECT p.nickname,p.avatar,
      COUNT(*) AS played,
      SUM(CASE WHEN r.result='win' THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN r.result='loss' THEN 1 ELSE 0 END) AS losses,
      SUM(CASE WHEN r.result='draw' THEN 1 ELSE 0 END) AS draws
      FROM match_results r JOIN players p ON p.uid=r.uid
      WHERE r.played_at>=?
      GROUP BY r.uid
      ORDER BY (SUM(CASE WHEN r.result='win' THEN 1 ELSE 0 END)*1.0/COUNT(*)) DESC,
        wins DESC, played DESC, p.nickname COLLATE NOCASE
      LIMIT ?`),
    resultInsert:db.prepare('INSERT INTO match_results(uid,played_at,result) VALUES(?,?,?)'),
    matchSave:db.prepare(`INSERT INTO live_matches(match_id,state_json,updated_at) VALUES(?,?,?)
      ON CONFLICT(match_id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at`),
    matchLoad:db.prepare('SELECT match_id,state_json FROM live_matches ORDER BY updated_at,match_id'),
    matchDelete:db.prepare('DELETE FROM live_matches WHERE match_id=?'),
    settledInsert:db.prepare('INSERT OR IGNORE INTO settled_matches(match_id,settled_at) VALUES(?,?)'),
    search:db.prepare("SELECT public_id AS id,nickname,avatar FROM players WHERE nickname LIKE ? LIMIT 15"),
    friendList:db.prepare(`SELECT p.public_id AS id,p.nickname,p.avatar FROM players p
      WHERE p.uid IN (
        SELECT recipient FROM friend_requests WHERE sender=? AND status='accepted'
        UNION
        SELECT sender FROM friend_requests WHERE recipient=? AND status='accepted'
      ) ORDER BY p.nickname`),
    pending:db.prepare(`SELECT p.public_id AS id,p.nickname,p.avatar FROM players p
      JOIN friend_requests f ON f.sender=p.uid WHERE f.recipient=? AND f.status='pending'`),
    outgoing:db.prepare(`SELECT p.public_id AS id,p.nickname,p.avatar FROM players p
      JOIN friend_requests f ON f.recipient=p.uid WHERE f.sender=? AND f.status='pending' ORDER BY p.nickname COLLATE NOCASE`),
    exists:db.prepare('SELECT status FROM friend_requests WHERE sender=? AND recipient=?'),
    incoming:db.prepare('SELECT status FROM friend_requests WHERE sender=? AND recipient=?'),
    acceptedFriend:db.prepare("SELECT 1 AS is_friend FROM friend_requests WHERE status='accepted' AND ((sender=? AND recipient=?) OR (sender=? AND recipient=?)) LIMIT 1"),
    insertRequest:db.prepare("INSERT INTO friend_requests(sender,recipient,status) VALUES(?,?,'pending') ON CONFLICT(sender,recipient) DO UPDATE SET status='pending'"),
    removeFriend:db.prepare("DELETE FROM friend_requests WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)"),
    cancelRequest:db.prepare("DELETE FROM friend_requests WHERE sender=? AND recipient=? AND status='pending'"),
    reply:db.prepare("UPDATE friend_requests SET status=? WHERE sender=? AND recipient=? AND status='pending'"),
    win:db.prepare('UPDATE players SET played=played+1,wins=wins+1 WHERE uid=?'),
    lose:db.prepare('UPDATE players SET played=played+1,losses=losses+1 WHERE uid=?'),
    draw:db.prepare('UPDATE players SET played=played+1,draws=draws+1 WHERE uid=?'),
    sessionInsert:db.prepare('INSERT INTO login_sessions(token_hash,uid,expires_at,created_at) VALUES(?,?,?,?)'),
    sessionGet:db.prepare('SELECT uid,expires_at FROM login_sessions WHERE token_hash=? AND expires_at>?'),
    sessionDelete:db.prepare('DELETE FROM login_sessions WHERE token_hash=?'),
    sessionDeleteOld:db.prepare('DELETE FROM login_sessions WHERE expires_at<=?'),
    sessionDeleteOverflow:db.prepare(`DELETE FROM login_sessions WHERE uid=? AND token_hash NOT IN (
      SELECT token_hash FROM login_sessions WHERE uid=? ORDER BY created_at DESC LIMIT 10)`),
    sessionExtend:db.prepare('UPDATE login_sessions SET expires_at=? WHERE token_hash=? AND expires_at>?')
  };
  const expose=p=>p && {...p,winRate:p.played ? Math.round(p.wins/p.played*10000)/100 : 0};
  const pragueDateParts=timestamp=>{
    const parts=new Intl.DateTimeFormat('en-GB',{
      timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(new Date(timestamp));
    return Object.fromEntries(parts.filter(p=>['year','month','day'].includes(p.type)).map(p=>[p.type,Number(p.value)]));
  };
  const pragueMidnightUtc=(year,month,day)=>{
    const approximate=Date.UTC(year,month-1,day);
    const zone=new Intl.DateTimeFormat('en-GB',{
      timeZone:'Europe/Prague',timeZoneName:'shortOffset'
    }).formatToParts(new Date(approximate)).find(p=>p.type==='timeZoneName')?.value||'GMT+1';
    const match=/GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(zone);
    if(!match)throw new Error('Nelze určit pražské časové pásmo.');
    const offset=(Number(match[2])*60+Number(match[3]||0))*60000*(match[1]==='+'?1:-1);
    return approximate-offset;
  };
  const periodStart=period=>{
    const now=Date.now(),{year,month,day}=pragueDateParts(now);
    if(period==='month')return pragueMidnightUtc(year,month,1);
    if(period==='week'){
      const weekday=new Date(Date.UTC(year,month-1,day)).getUTCDay();
      const monday=new Date(Date.UTC(year,month-1,day-(weekday+6)%7));
      return pragueMidnightUtc(monday.getUTCFullYear(),monday.getUTCMonth()+1,monday.getUTCDate());
    }
    throw new Error('Neplatné období žebříčku.');
  };
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
  const cancelRequest=(sender,recipientId)=>{
    const recipient=statements.lookupId.get(recipientId)?.uid;
    if(!recipient||sender===recipient||statements.cancelRequest.run(sender,recipient).changes===0)
      throw new Error('Čekající žádost nebyla nalezena.');
  };
  const respond=(recipient,senderId,accept)=>{
    const sender=statements.lookupId.get(senderId)?.uid;
    if(!sender)throw new Error('Žádost nebyla nalezena.');
    const result=statements.reply.run(accept?'accepted':'declined',sender,recipient);
    if(result.changes===0)throw new Error('Žádost nebyla nalezena.');
  };
  const saveMatch=snapshot=>{
    if(typeof snapshot?.id!=='string'||!snapshot.id||snapshot.id.length>80)
      throw new Error('Neplatný identifikátor partie.');
    statements.matchSave.run(snapshot.id,JSON.stringify(snapshot),Date.now());
  };
  const record=({ids,winner,reason,matchId,snapshot=null})=>{
    if(reason==='abandoned'){
      if(snapshot)saveMatch(snapshot);
      return;
    }
    if(!Array.isArray(ids)||ids.length!==2||ids[0]===ids[1])throw new Error('Neplatný výsledek.');
    if(snapshot&&snapshot.id!==matchId)throw new Error('Výsledek neodpovídá partii.');
    db.exec('BEGIN IMMEDIATE');
    try {
      const playedAt=Date.now();
      // The same match can be completed again after a crash between recording
      // its result and saving the final snapshot. Never count it twice.
      let newResult=true;
      if(matchId!=null){
        if(typeof matchId!=='string'||!matchId||matchId.length>80)throw new Error('Neplatná partie.');
        newResult=Boolean(statements.settledInsert.run(matchId,playedAt).changes);
      }
      if(newResult){
        for(const uid of ids){
          ensure(uid);
          if(winner===null)statements.draw.run(uid);
          else if(winner===uid)statements.win.run(uid);
          else statements.lose.run(uid);
          statements.resultInsert.run(uid,playedAt,winner===null?'draw':winner===uid?'win':'loss');
        }
      }
      // Save the final private game snapshot in this same SQLite transaction.
      // The scoreboard and persisted finished state must commit together.
      if(snapshot)saveMatch(snapshot);
      db.exec('COMMIT');
    } catch(error){db.exec('ROLLBACK');throw error;}
  };
  const createSession=uid=>{
    ensure(uid);
    const now=Date.now(),expiresAt=now+SESSION_TTL;
    statements.sessionDeleteOld.run(now);
    // Only a SHA-256 hash is held on Oracle's disk.
    const token='arena_'+randomBytes(32).toString('base64url');
    statements.sessionInsert.run(sessionDigest(token),uid,expiresAt,now);
    statements.sessionDeleteOverflow.run(uid,uid);
    return {sessionToken:token,expiresAt};
  };
  const sessionUid=token=>{
    if(!validSessionToken(token))return null;
    const now=Date.now(),hash=sessionDigest(token);
    const row=statements.sessionGet.get(hash,now);
    if(!row)return null;
    // Sliding expiration: active PC/iPhone sessions remain valid.
    if(row.expires_at-now<SESSION_RENEW_BELOW)statements.sessionExtend.run(now+SESSION_TTL,hash,now);
    return row.uid;
  };
  const sessionActive=token=>validSessionToken(token)&&
    Boolean(statements.sessionGet.get(sessionDigest(token),Date.now()));
  const revokeSession=token=>{
    if(!validSessionToken(token))return false;
    return statements.sessionDelete.run(sessionDigest(token)).changes>0;
  };
  return {
    db,ensure,rename,request,cancelRequest,respond,record,createSession,sessionUid,sessionActive,revokeSession,
    saveMatch,
    loadMatches:()=>{
      const snapshots=[];
      for(const row of statements.matchLoad.all()){
        try{snapshots.push(JSON.parse(row.state_json));}
        catch{console.error('Arena recovery unreadable match',row.match_id);}
      }
      return snapshots;
    },
    deleteMatch:matchId=>statements.matchDelete.run(matchId),
    get:uid=>expose(statements.lookup.get(uid)),
    leaderboard:(limit=30,period='all')=>{
      const capped=Math.min(50,Math.max(1,Number(limit)||30));
      if(period==='all')return statements.leaderboard.all(capped).map(expose);
      if(!['week','month'].includes(period))throw new Error('Neplatné období žebříčku.');
      return statements.leaderboardPeriod.all(periodStart(period),capped).map(expose);
    },
    findPlayers:query=>statements.search.all('%'+String(query||'').slice(0,20).replace(/[%_]/g,'')+'%'),
    friends:uid=>statements.friendList.all(uid,uid),
    incoming:uid=>statements.pending.all(uid),
    outgoing:uid=>statements.outgoing.all(uid),
    removeFriend:(uid,publicId)=>{
      if(typeof publicId!=='string'||!/^[a-f0-9]{16}$/.test(publicId))throw new Error('Neplatný hráč.');
      const target=statements.lookupId.get(publicId)?.uid;
      if(!target||uid===target||!statements.acceptedFriend.get(uid,target,target,uid))throw new Error('Hráč není mezi tvými přáteli.');
      statements.removeFriend.run(uid,target,target,uid);
    },
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
