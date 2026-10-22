import { createServer } from 'node:http';
import { URL } from 'node:url';
import { OAuth2Client } from 'google-auth-library';
import { WebSocketServer } from 'ws';
import { openStore } from './store.js';
import { MatchEngine } from './match-engine.js';
import { PresenceTracker } from './presence.js';
import { FriendChallenges } from './friend-challenges.js';

const clientId=process.env.GOOGLE_CLIENT_ID||'';
const origins=(process.env.CORS_ORIGIN||'').split(',').map(x=>x.trim()).filter(Boolean);
if(!clientId||!origins.length){
  console.error('Chybí GOOGLE_CLIENT_ID nebo CORS_ORIGIN. Server se z bezpečnostních důvodů nespustí.');
  process.exit(1);
}
const port=Number(process.env.PORT||8790);
const host=process.env.HOST||'127.0.0.1';
const store=openStore(process.env.DB_PATH||'./data/abaku.sqlite');
const authClient=new OAuth2Client(clientId);
const tokenCache=new Map();
const sockets=new Map();
const rate=new Map();

function limited(ip,limit=180){
  const now=Date.now();
  const row=rate.get(ip);
  if(!row||now-row.start>=60_000) {rate.set(ip,{start:now,count:1});return false;}
  return ++row.count>limit;
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
async function verify(idToken){
  if(typeof idToken!=='string'||idToken.length<100||idToken.length>5000)throw new Error('Přihlášení je neplatné.');
  const cached=tokenCache.get(idToken),now=Date.now();
  if(cached&&cached.until>now)return cached.uid;
  const ticket=await authClient.verifyIdToken({idToken,audience:clientId});
  const payload=ticket.getPayload();
  if(!payload?.sub||!payload.exp||payload.exp*1000<=now)throw new Error('Přihlášení vypršelo.');
  if(tokenCache.size>400)tokenCache.clear();
  tokenCache.set(idToken,{uid:payload.sub,until:Math.min(payload.exp*1000,now+120_000)});
  return payload.sub;
}
async function identity(request){
  const header=request.headers.authorization||'';
  if(!header.startsWith('Bearer '))throw new Error('Pro tuto akci je nutné přihlášení.');
  return verify(header.slice(7));
}
async function body(request){
  let size=0,parts=[];
  for await(const part of request){
    size+=part.length;
    if(size>8192)throw new Error('Požadavek je příliš velký.');
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
  onResult:outcome=>store.record(outcome)
});
const friendChallenges=new FriendChallenges({
  engine,resolveFriend:(uid,id)=>store.resolveFriend(uid,id),
  getProfile:uid=>store.get(uid),push
});
// A tiny RAM-only presence table: unique Google UID, last heartbeat timestamp.
const presence=new PresenceTracker();
const clock=setInterval(()=>{engine.tick();friendChallenges.tick();
  const now=Date.now();
  for(const [key,item] of rate)if(now-item.start>120_000)rate.delete(key);
},1000);
clock.unref();

const http=createServer(async(request,response)=>{
  cors(request,response);
  if(!allowedOrigin(request)){respond(response,403,{error:'Nepovolený původ požadavku.'});return;}
  if(request.method==='OPTIONS'){response.writeHead(204);response.end();return;}
  if(limited(request.socket.remoteAddress||'unknown')){respond(response,429,{error:'Příliš mnoho požadavků.'});return;}
  const {pathname,searchParams}=new URL(request.url||'/', 'http://localhost');
  try {
    if(request.method==='GET'&&pathname==='/health')return respond(response,200,{status:'ok',service:'abaku-api'});
    if(request.method==='GET'&&pathname==='/api/leaderboard')return respond(response,200,{players:store.leaderboard()});
    // Counts are public and contain no profile data; expired heartbeats are excluded.
    if(request.method==='GET'&&pathname==='/api/presence')return respond(response,200,{
      online:presence.count(engine.connections),waiting:engine.waitingCount(),refreshSeconds:20
    });
    const uid=await identity(request);
    store.ensure(uid);
    if(request.method==='POST'&&pathname==='/api/presence'){
      presence.touch(uid);
      return respond(response,200,{ok:true});
    }
    if(request.method==='DELETE'&&pathname==='/api/presence'){
      presence.remove(uid);
      return respond(response,200,{ok:true});
    }
    if(request.method==='GET'&&pathname==='/api/me')return respond(response,200,{profile:store.get(uid)});
    if(request.method==='POST'&&pathname==='/api/me'){
      const {nickname,avatar}=await body(request);
      return respond(response,200,{profile:store.rename(uid,nickname,avatar)});
    }
    if(request.method==='GET'&&pathname==='/api/players'){
      const search=searchParams.get('name')||'';
      if(search.length<2)return respond(response,200,{players:[]});
      return respond(response,200,{players:store.findPlayers(search).filter(p=>p.id!==store.get(uid)?.id)});
    }
    if(request.method==='GET'&&pathname==='/api/friends')return respond(response,200,{friends:store.friends(uid),requests:store.incoming(uid)});
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
    respond(response,unauthorized?401:msg.includes('UNIQUE')?409:400,{error:unauthorized?'Je potřeba platné přihlášení.':msg.slice(0,200)});
  }
});
const wss=new WebSocketServer({noServer:true,maxPayload:4096,perMessageDeflate:false});
http.on('upgrade',(request,socket,head)=>{
  if(!allowedOrigin(request)||new URL(request.url||'/', 'http://localhost').pathname!=='/ws'){
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;
  }
  wss.handleUpgrade(request,socket,head,ws=>wss.emit('connection',ws,request));
});
wss.on('connection',(ws)=>{
  let uid=null,authed=false,messages=0,rateWindow=Date.now();
  const authTimeout=setTimeout(()=>{if(!authed)ws.close(1008,'Přihlášení vypršelo.');},10000);
  ws.on('message',async(data)=>{
    const now=Date.now();
    if(now-rateWindow>1000){messages=0;rateWindow=now;}
    if(++messages>15){ws.close(1008,'Příliš mnoho zpráv.');return;}
    try{
      const msg=JSON.parse(data.toString());
      if(!authed){
        if(msg?.type!=='auth')throw new Error('Nejdříve se přihlas.');
        uid=await verify(msg.idToken);
        // One live socket per authenticated player.
        const old=sockets.get(uid);
        if(old&&old!==ws)old.close(1000,'Nové připojení');
        sockets.set(uid,ws);
        authed=true;clearTimeout(authTimeout);
        store.ensure(uid);
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
        case 'sync':engine.sync(uid);break;
        default:throw new Error('Neznámá zpráva.');
      }
    }catch(error){
      if(ws.readyState===1)ws.send(JSON.stringify({type:'error',message:String(error?.message||'Chyba').slice(0,180)}));
    }
  });
  ws.on('close',()=>{
    clearTimeout(authTimeout);
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
