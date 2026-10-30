import {ONLINE_CONFIG} from './online-config.js?v=0.2.67';

const MEDALS=['🥇','🥈','🥉'];
let leaderboardRetryTimer=null;
let latestLoad=0;

function retryLeaderboardLater(){
  if(leaderboardRetryTimer!==null)return;
  leaderboardRetryTimer=setTimeout(()=>{
    leaderboardRetryTimer=null;
    if(document.visibilityState==='hidden')retryLeaderboardLater();
    else void loadHomeTopThree();
  },60_000);
}

// Keep exactly the same ordering and all-time period as the full leaderboard.
export function topThreePlayers(data){
  if(!Array.isArray(data?.players)||(data.period&&data.period!=='all'))return null;
  return data.players.slice(0,3).map((player,index)=>({
    place:index+1,
    nickname:typeof player?.nickname==='string'?player.nickname.trim():'',
    played:Number(player?.played),
    wins:Number(player?.wins),
    winRate:Number(player?.winRate)
  })).filter(player=>player.nickname&&Number.isSafeInteger(player.played)&&player.played>0&&
    Number.isSafeInteger(player.wins)&&player.wins>=0&&player.wins<=player.played&&
    Number.isFinite(player.winRate)&&player.winRate>=0&&player.winRate<=100);
}

async function loadHomeTopThree(){
  const list=document.getElementById('homeTopPlayers');
  const status=document.getElementById('homeTopStatus');
  if(!list||!status)return;
  const load=++latestLoad;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),8000);
  try{
    const base=new URL(ONLINE_CONFIG.apiBase);
    if(base.protocol!=='https:'&&!(base.protocol==='http:'&&base.hostname==='localhost'))throw Error('Invalid API URL');
    const url=base.toString().replace(/\/$/,'')+'/api/leaderboard?period=all';
    const response=await fetch(url,{cache:'no-store',signal:controller.signal});
    if(!response.ok)throw Error('Leaderboard unavailable');
    const players=topThreePlayers(await response.json());
    if(!players)throw Error('Invalid leaderboard');
    if(load!==latestLoad)return;
    if(leaderboardRetryTimer!==null){
      clearTimeout(leaderboardRetryTimer);
      leaderboardRetryTimer=null;
    }
    list.replaceChildren();
    for(const player of players){
      const item=document.createElement('li');
      item.className='home-top-player';
      const medal=document.createElement('span');
      medal.className='home-top-medal';
      medal.textContent=MEDALS[player.place-1];
      medal.setAttribute('aria-label',player.place+'. místo');
      const name=document.createElement('strong');
      name.className='home-top-name';
      name.textContent=player.nickname;
      const success=document.createElement('span');
      success.className='home-top-success';
      success.textContent=player.winRate.toLocaleString('cs-CZ',{maximumFractionDigits:2})+' %';
      const matches=document.createElement('small');
      matches.textContent=player.wins+' výher / '+player.played+' partií';
      item.append(medal,name,success,matches);
      list.append(item);
    }
    list.hidden=players.length===0;
    status.textContent=players.length?'':'Zatím nejsou odehrané žádné online partie.';
    status.hidden=players.length>0;
  }catch{
    if(load!==latestLoad)return;
    list.hidden=true;
    status.hidden=false;
    status.textContent='Celkové pořadí teď není dostupné.';
    retryLeaderboardLater();
  }finally{
    clearTimeout(timeout);
  }
}

if(typeof document!=='undefined'){
  void loadHomeTopThree();
  // The homepage should recover after a temporary API outage without a reload.
  window.addEventListener('arena:online-restored',()=>void loadHomeTopThree());
}
