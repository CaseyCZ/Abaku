import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { URL } from 'node:url';
import { OAuth2Client } from 'google-auth-library';
import { WebSocketServer } from 'ws';
import { openStore } from './store.js';
import { MatchEngine } from './match-engine.js';
import { PresenceTracker } from './presence.js';
import { FriendChallenges } from './friend-challenges.js';
import {ReportStore} from './report-store.js';
import {GitHubIssueReporter,validateFeedback} from './github-issues.js';

const clientId=process.env.GOOGLE_CLIENT_ID||'';
const origins=(process.env.CORS_ORIGIN||'').split(',').map(x=>x.trim()).filter(Boolean);
if(!clientId||!origins.length){
  console.error('Chybí GOOGLE_CLIENT_ID nebo CORS_ORIGIN. Server se z bezpečnostních důvodů nespustí.');
  process.exit(1);
}
const port=Number(process.env.PORT||8790);
const host=process.env.HOST||'127.0.0.1';
// Enable only after NGINX overwrites X-Real-IP with $remote_addr.
// Never trust a client-supplied forwarding header on a public connection.
const trustProxyRealIp=process.env.TRUST_PROXY_REAL_IP==='1';
const store=openStore(process.env.DB_PATH||'./data/abaku.sqlite');
const authClient=new OAuth2Client(clientId);
const tokenCache=new Map();
const sockets=new Map();
const socketSessionTokens=new WeakMap();
const MAX_ONLINE_PLAYERS=700;
const MAX_PENDING_WS_AUTH=300;
const fullServerMessage='Server je plný (700/700 hráčů). Zkus to později.';
const rate=new Map();
const pendingWsAuth=new Set();
const reportRate=new Map();
const feedbackRate=new Map();
let feedbackDay='',feedbackDayCount=0;
const reportStore=new ReportStore({directory:process.env.ABAKU_REPORT_DIR||'/home/ubuntu/abaku-reports'});
const issueReporter=new GitHubIssueReporter({
  token:process.env.ABAKU_GITHUB_ISSUES_TOKEN,
  repository:process.env.ABAKU_GITHUB_REPO||'CaseyCZ/Ciselna-Arena'
});
const adminToken=process.env.ABAKU_REPORT_ADMIN_TOKEN||'';

function reportLimited(ip){
  const now=Date.now(),current=reportRate.get(ip);
  if(!current||now-current.start>=10*60_000){reportRate.set(ip,{start:now,count:1});return false;}
  return ++current.count>20;
}
function feedbackLimited(ip){
  const now=Date.now(),day=new Date(now).toISOString().slice(0,10);
  if(day!==feedbackDay){feedbackDay=day;feedbackDayCount=0;}
  const current=feedbackRate.get(ip);
  if(feedbackDayCount>=30||current&&now-current.start<60*60_000&&current.count>=10)return true;
  if(!current||now-current.start>=60*60_000)feedbackRate.set(ip,{start:now,count:1});
  else current.count++;
  feedbackDayCount++;
  return false;
}
function adminAllowed(request){
  if(adminToken.length<32)return false;
  const token=(request.headers.authorization||'').replace(/^Bearer /,'');
  if(token.length!==adminToken.length)return false;
  return timingSafeEqual(Buffer.from(token),Buffer.from(adminToken));
}

function limited(ip,limit=180){
  const now=Date.now();
  const row=rate.get(ip);
  if(!row||now-row.start>=60_000) {rate.set(ip,{start:now,count:1});return false;}
  return ++row.count>limit;
}
function clientIp(request){
  const peer=request.socket.remoteAddress||'unknown';
  if(!trustProxyRealIp||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer))return peer;
  const forwarded=request.headers['x-real-ip'];
  return typeof forwarded==='string'&&isIP(forwarded)?forwarded:peer;
}
function allowedOrigin(request){
  const origin=request.headers.origin;
  return !origin||origins.includes(origin);
}
function cors(request,response){
  const origin=request.headers.origin;
  if(origin&&origins.includes(origin)){
    response.setHeader('Access-Control-Allow-Origin',origin);
    response.setHeader('Vary','Origin');
    response.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
    response.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');
  }
}
function respond(response,status,body){
  if(response.writableEnded)return;
  response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  response.end(JSON.stringify(body));
}
function storageFailure(error){
  const code=String(error?.code||'');
  const message=String(error?.message||'');
  return /^(ERR_SQLITE|SQLITE_)/.test(code)||
    /^(EIO|ENOSPC|EROFS|EACCES|EMFILE|ENFILE)$/.test(code)||
    /database is locked|database or disk is full|disk I\/O error|database disk image is malformed|no such table/i.test(message);
}
function publicError(error){
  if(storageFailure(error)){
    console.error('Abaku API storage error:',error);
    return 'Server má dočasný problém s uložením dat. Zkus to prosím znovu.';
  }
  return String(error?.message||'Chyba').slice(0,180);
}
async function verifyGoogle(idToken){
  if(typeof idToken!=='string'||idToken.length<100||idToken.length>5000)
    throw new Error('Přihlášení je neplatné.');
  const cached=tokenCache.get(idToken),now=Date.now();
  if(cached&&cached.until>now)return cached.uid;
  let ticket;
  try{ticket=await authClient.verifyIdToken({idToken,audience:clientId});}
  catch{throw new Error('Přihlášení přes Google je neplatné nebo vypršelo.');}
  const payload=ticket.getPayload();
  if(!payload?.sub||!payload.exp||payload.exp*1000<=now)throw new Error('Přihlášení vypršelo.');
  if(tokenCache.size>400)tokenCache.clear();
  tokenCache.set(idToken,{uid:payload.sub,until:Math.min(payload.exp*1000,now+120_000)});
  return payload.sub;
}
async function verify(token){
  if(typeof token==='string'&&token.startsWith('abaku_')){
    const uid=store.sessionUid(token);
    if(!uid)throw new Error('Přihlášení vypršelo nebo bylo odhlášeno.');
    return uid;
  }
  return verifyGoogle(token);
}
async function identity(request){
  const header=request.headers.authorization||'';
  if(!header.startsWith('Bearer '))throw new Error('Pro tuto akci je nutné přihlášení.');
  return verify(header.slice(7));
}
async function body(request,maxBytes=8192){
  let size=0,parts=[];
  for await(const part of request){
    size+=part.length;
    if(size>maxBytes)throw new Error('Požadavek je příliš velký.');
    parts.push(part);
  }
  try {return JSON.parse(Buffer.concat(parts).toString('utf8'));}
  catch {throw new Error('Neplatná JSON zpráva.');}
}
const push=(uid,event)=>{
  const ws=sockets.get(uid);
  if(ws?.readyState===1) ws.send(JSON.stringify(event));
};
const engine=new MatchEngine({
  send:push,
  onResult:outcome=>store.record(outcome),
  onChange:snapshot=>store.saveMatch(snapshot),
  onFinish:(outcome,snapshot)=>store.record({...outcome,snapshot}),
  onDelete:matchId=>store.deleteMatch(matchId),
  getName:uid=>store.get(uid)?.nickname||null
});
// Restore private boards, racks, scores and audit history before accepting
// HTTP or WebSocket connections. Queue, invites and chat remain ephemeral.
engine.restore(store.loadMatches());
const friendChallenges=new FriendChallenges({
  engine,resolveFriend:(uid,id)=>store.resolveFriend(uid,id),
  getProfile:uid=>store.get(uid),push
});
// A tiny RAM-only presence table: unique Google UID, last heartbeat timestamp.
const presence=new PresenceTracker();
let lastSessionSweep=0;
const clock=setInterval(()=>{engine.tick();friendChallenges.tick();
  const now=Date.now();
  if(now-lastSessionSweep>=60_000){
    lastSessionSweep=now;
    try{
      for(const ws of sockets.values()){
        const token=socketSessionTokens.get(ws);
        if(token&&!store.sessionActive(token))ws.close(1008,'Relace vypršela nebo byla odhlášena.');
      }
    }catch(error){console.error('Abaku session cleanup:',error.message);}
  }
  for(const [key,item] of rate)if(now-item.start>120_000)rate.delete(key);
  for(const [key,item] of reportRate)if(now-item.start>10*60_000)reportRate.delete(key);
  for(const [key,item] of feedbackRate)if(now-item.start>60*60_000)feedbackRate.delete(key);
},1000);
clock.unref();
const cleanupClock=setInterval(()=>reportStore.cleanup().catch(error=>
  console.error('Abaku report cleanup:',error.message)),60*60_000);
cleanupClock.unref();
reportStore.cleanup().catch(error=>console.error('Abaku report directory:',error.message));

const http=createServer(async(request,response)=>{
  cors(request,response);
  if(!allowedOrigin(request)){respond(response,403,{error:'Nepovolený původ požadavku.'});return;}
  if(request.method==='OPTIONS'){response.writeHead(204);response.end();return;}
  const requester=clientIp(request);
  const {pathname,searchParams}=new URL(request.url||'/', 'http://localhost');
  // Authenticated operations are rate-limited by verified account, not by
  // shared school/home NAT IP. Public reads and sign-in still need IP limits.
  const publicRead=request.method==='GET'&&['/health','/api/presence','/api/leaderboard'].includes(pathname);
  const guestRoute=(pathname==='/api/session'&&request.method==='POST')||
    (pathname==='/api/reports'&&['GET','POST'].includes(request.method))||
    (pathname==='/api/reports/detail'&&request.method==='GET')||
    (pathname==='/api/feedback'&&request.method==='POST');
  const authHeader=request.headers.authorization||'';
  const limitKey=publicRead?'public:'+requester:guestRoute?'guest:'+requester:
    !authHeader.startsWith('Bearer ')?'missing:'+requester:
    !authHeader.startsWith('Bearer abaku_')?'google:'+requester:null;
  const ipCap=publicRead?5000:guestRoute?1200:!authHeader.startsWith('Bearer ')?60:5000;
  if(limitKey&&limited(limitKey,ipCap)){
    respond(response,429,{error:'Příliš mnoho požadavků.'});return;
  }
  try {
    if(request.method==='GET'&&pathname==='/health')return respond(response,200,{status:'ok',service:'arena-api'});
    if(request.method==='GET'&&pathname==='/api/leaderboard'){
      const period=searchParams.get('period')||'all';
      if(!['all','week','month'].includes(period))return respond(response,400,{error:'Neplatné období žebříčku.'});
      return respond(response,200,{period,players:store.leaderboard(30,period)});
    }
    // Counts are public and contain no profile data; expired heartbeats are excluded.
    if(request.method==='GET'&&pathname==='/api/presence')return respond(response,200,{
      online:presence.count(engine.connections),waiting:engine.waitingCount(),refreshSeconds:20,limit:MAX_ONLINE_PLAYERS
    });
    if(pathname==='/api/reports'&&request.method==='POST'){
      if(reportLimited(requester))
        return respond(response,429,{error:'Příliš mnoho odeslaných partií. Zkus to později.'});
      const data=await body(request,256*1024);
      if(data?.mode==='online')throw new Error('Online partie se odesílá přímo ze serveru.');
      return respond(response,201,await reportStore.submit(data));
    }
    if(pathname==='/api/reports'&&request.method==='GET'){
      if(!adminAllowed(request))return respond(response,403,{error:'Kontroly jsou soukromé.'});
      return respond(response,200,{reports:await reportStore.list()});
    }
    if(pathname==='/api/reports/detail'&&request.method==='GET'){
      if(!adminAllowed(request))return respond(response,403,{error:'Kontroly jsou soukromé.'});
      const item=await reportStore.get(searchParams.get('id'));
      return respond(response,item?200:404,item||{error:'Záznam už neexistuje.'});
    }
    if(pathname==='/api/feedback'&&request.method==='POST'){
      if(!issueReporter.configured)
        return respond(response,503,{error:'Hlášení problémů ještě není na serveru zapnuté.'});
      if(feedbackLimited(requester))
        return respond(response,429,{error:'Příliš mnoho hlášení. Zkus to později.'});
      const data=await body(request,260*1024);
      const {description,mode}=validateFeedback(data);
      if(data.report&&data.matchId)throw new Error('Nelze přiložit dvě různé partie.');
      let reportId=null;
      if(data.report){
        if(!['bot','local'].includes(mode)||data.report.mode!==mode)
          throw new Error('Historie neodpovídá hernímu režimu.');
        reportId=(await reportStore.submit(data.report)).id;
      }else if(data.matchId){
        if(mode!=='online')throw new Error('Historie neodpovídá hernímu režimu.');
        const uid=await identity(request);
        reportId=(await reportStore.submit(engine.reportFor(uid,data.matchId))).id;
      }
      const issue=await issueReporter.create({description,mode,reportId});
      return respond(response,201,{...issue,reportId});
    }
    // Exchange an already verified Google ID token for a revocable session.
    // Google is required for initial sign-in, not for each later page load.
    if(request.method==='POST'&&pathname==='/api/session'){
      const bearer=request.headers.authorization||'';
      if(!bearer.startsWith('Bearer '))throw new Error('Přihlášení je vyžadováno.');
      const uid=await verifyGoogle(bearer.slice(7));
      if(limited('player:'+uid))return respond(response,429,{error:'Příliš mnoho požadavků.'});
      return respond(response,200,store.createSession(uid));
    }
    const uid=await identity(request);
    if(limited('player:'+uid))return respond(response,429,{error:'Příliš mnoho požadavků.'});
    store.ensure(uid);
    if(request.method==='POST'&&pathname==='/api/reports/online'){
      if(reportLimited(requester))
        return respond(response,429,{error:'Příliš mnoho odeslaných partií. Zkus to později.'});
      const data=await body(request);
      return respond(response,201,await engine.submitReport(uid,data?.matchId,
        report=>reportStore.submit(report)));
    }
    if(request.method==='DELETE'&&pathname==='/api/session'){
      const bearer=request.headers.authorization||'';
      const sessionToken=bearer.slice(7);
      const revoked=store.revokeSession(sessionToken);
      const ws=sockets.get(uid);
      if(revoked&&ws&&socketSessionTokens.get(ws)===sessionToken)
        ws.close(1008,'Relace byla odhlášena.');
      presence.remove(uid);
      return respond(response,200,{ok:true});
    }
    if(request.method==='POST'&&pathname==='/api/presence'){
      if(!presence.canAdmit(uid,engine.connections,MAX_ONLINE_PLAYERS))
        return respond(response,503,{error:fullServerMessage,limit:MAX_ONLINE_PLAYERS});
      presence.touch(uid);
      return respond(response,200,{ok:true});
    }
    if(request.method==='DELETE'&&pathname==='/api/presence'){
      presence.remove(uid);
      return respond(response,200,{ok:true});
    }
    if(request.method==='GET'&&pathname==='/api/me')return respond(response,200,{profile:store.get(uid)});
    if(request.method==='GET'&&pathname==='/api/match/current')return respond(response,200,{match:engine.activeMatchSummary(uid)});
    if(request.method==='POST'&&pathname==='/api/me'){
      const {nickname,avatar}=await body(request);
      return respond(response,200,{profile:store.rename(uid,nickname,avatar)});
    }
    if(request.method==='GET'&&pathname==='/api/players'){
      const search=searchParams.get('name')||'';
      if(search.length<2)return respond(response,200,{players:[]});
      return respond(response,200,{players:store.findPlayers(search).filter(p=>p.id!==store.get(uid)?.id)});
    }
    if(request.method==='GET'&&pathname==='/api/friends'){
      const active=presence.active();
      for(const connected of engine.connections)active.add(connected);
      const friends=store.friends(uid).map(friend=>({...friend,online:active.has(store.resolveFriend(uid,friend.id).uid)}));
      return respond(response,200,{friends,requests:store.incoming(uid),sentRequests:store.outgoing(uid),canRemoveFriends:true});
    }
    if(request.method==='POST'&&pathname==='/api/friends/remove'){
      const data=await body(request);
      store.removeFriend(uid,data.id);
      return respond(response,200,{ok:true});
    }
    if(request.method==='GET'&&pathname==='/api/challenges')return respond(response,200,{challenge:friendChallenges.pending(uid)});
    if(request.method==='POST'&&pathname==='/api/challenges/respond'){
      const data=await body(request);
      if(typeof data.id!=='string'||data.id.length>80||typeof data.accept!=='boolean')throw new Error('Neplatná odpověď na výzvu.');
      const result=friendChallenges.respond(uid,data.id,data.accept);
      return respond(response,200,{ok:true,...result});
    }
    if(request.method==='POST'&&pathname==='/api/friends/request'){
      const data=await body(request);
      if(typeof data.id!=='string')throw new Error('Vyber hráče.');
      store.request(uid,data.id);return respond(response,200,{ok:true});
    }
    if(request.method==='POST'&&pathname==='/api/friends/respond'){
      const data=await body(request);
      if(typeof data.id!=='string'||typeof data.accept!=='boolean')throw new Error('Neplatná odpověď.');
      store.respond(uid,data.id,data.accept);return respond(response,200,{ok:true});
    }
    respond(response,404,{error:'Neznámá cesta.'});
  }catch(error){
    const msg=String(error?.message||'Chyba');
    const unauthorized=/Přihlášení|Token|token|jwt|expired|audience|signature/.test(msg);
    const serverError=storageFailure(error);
    respond(response,serverError?500:unauthorized?401:msg.includes('UNIQUE')?409:400,
      {error:serverError?publicError(error):unauthorized?'Je potřeba platné přihlášení.':msg.slice(0,200)});
  }
});
const wss=new WebSocketServer({noServer:true,maxPayload:4096,perMessageDeflate:false});
http.on('upgrade',(request,socket,head)=>{
  if(!allowedOrigin(request)||new URL(request.url||'/', 'http://localhost').pathname!=='/ws'){
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;
  }
  // WebSocket upgrades previously bypassed all HTTP limits. Bound handshakes
  // before authentication without blocking a legitimate 700-player school NAT.
  if(limited('ws-upgrade:'+clientIp(request),3000)||pendingWsAuth.size>=MAX_PENDING_WS_AUTH){
    socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');return;
  }
  wss.handleUpgrade(request,socket,head,ws=>wss.emit('connection',ws,request));
});
wss.on('connection',(ws)=>{
  let uid=null,authed=false,authInProgress=false,messages=0,rateWindow=Date.now();
  pendingWsAuth.add(ws);
  const authTimeout=setTimeout(()=>{if(!authed)ws.close(1008,'Přihlášení vypršelo.');},10000);
  ws.on('message',async(data)=>{
    const now=Date.now();
    if(now-rateWindow>1000){messages=0;rateWindow=now;}
    if(++messages>15){ws.close(1008,'Příliš mnoho zpráv.');return;}
    try{
      const msg=JSON.parse(data.toString());
      if(!authed){
        if(msg?.type!=='auth')throw new Error('Nejdříve se přihlas.');
        if(authInProgress){ws.close(1008,'Přihlášení již probíhá.');return;}
        authInProgress=true;
        let verifiedUid;
        try{verifiedUid=await verify(msg.idToken);}
        finally{authInProgress=false;}
        // An async Google verification can finish after the socket has closed.
        // Never register a dead socket as a connected player.
        if(ws.readyState!==1)return;
        uid=verifiedUid;
        if(!presence.canAdmit(uid,engine.connections,MAX_ONLINE_PLAYERS)){
          ws.close(1013,fullServerMessage);
          return;
        }
        store.ensure(uid);
        // One live socket per authenticated player.
        const old=sockets.get(uid);
        if(old&&old!==ws)old.close(1000,'Nové připojení');
        sockets.set(uid,ws);
        if(typeof msg.idToken==='string'&&msg.idToken.startsWith('abaku_'))
          socketSessionTokens.set(ws,msg.idToken);
        authed=true;clearTimeout(authTimeout);
        pendingWsAuth.delete(ws);
        presence.touch(uid);
        push(uid,{type:'authenticated',profile:store.get(uid)});
        engine.connect(uid);
        return;
      }
      if(sockets.get(uid)!==ws)throw new Error('Staré spojení.');
      switch(msg?.type){
        case 'matchmake':engine.joinRandom(uid,msg.seconds);break;
        case 'cancel-matchmake':engine.leaveQueue(uid);break;
        case 'invite':engine.makeInvite(uid,msg.seconds);break;
        case 'challenge-friend':friendChallenges.issue(uid,msg.targetId,msg.seconds);break;
        case 'join-invite':engine.joinInvite(uid,msg.code);break;
        case 'move':engine.place(uid,msg.placements);break;
        case 'pass':engine.pass(uid);break;
        case 'exchange':engine.exchange(uid,msg.indices);break;
        case 'chat':engine.chat(uid,msg.text);break;
        case 'resign':engine.resign(uid);break;
        case 'rematch':engine.rematch(uid,msg.accept);break;
        case 'sync':engine.sync(uid);break;
        default:throw new Error('Neznámá zpráva.');
      }
    }catch(error){
      if(ws.readyState===1)ws.send(JSON.stringify({type:'error',message:publicError(error)}));
      // Never let a single unauthenticated socket retry expensive Google
      // verification indefinitely within its ten-second handshake window.
      if(!authed)ws.close(1008,'Přihlášení se nezdařilo.');
    }
  });
  ws.on('error',()=>{ /* The close handler releases all per-socket state. */ });
  ws.on('close',()=>{
    clearTimeout(authTimeout);
    pendingWsAuth.delete(ws);
    if(uid&&sockets.get(uid)===ws){sockets.delete(uid);engine.disconnect(uid);}
  });
});
http.listen(port,host,()=>console.log('Abaku API listening on '+host+':'+port));
function stop(){
  clearInterval(clock);
  wss.clients.forEach(ws=>ws.close(1001,'Restart serveru'));
  http.close(()=>{store.close();process.exit(0);});
  setTimeout(()=>process.exit(1),5000).unref();
}
process.once('SIGTERM',stop);
process.once('SIGINT',stop);
