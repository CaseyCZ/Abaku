import {ONLINE_CONFIG} from './online-config.js?v=0.2.8';

const board=document.getElementById('leaderboard');
const panel=document.getElementById('leaderboardPanel');
const status=document.getElementById('leaderboardStatus');
const refresh=document.getElementById('leaderboardRefresh');

async function loadLeaderboard(){
  refresh.disabled=true;
  panel.hidden=true;
  status.textContent='Načítám žebříček…';
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),8000);
  try{
    const base=new URL(ONLINE_CONFIG.apiBase);
    if(base.protocol!=='https:'&&!(base.protocol==='http:'&&base.hostname==='localhost'))throw new Error('Invalid API URL');
    // Public read-only endpoint; no login, session migration or presence heartbeat.
    const response=await fetch(base.toString().replace(/\/$/,'')+'/api/leaderboard',{
      signal:controller.signal,cache:'no-store'
    });
    if(!response.ok)throw new Error('Leaderboard unavailable');
    const data=await response.json();
    if(!Array.isArray(data.players))throw new Error('Invalid leaderboard');
    board.replaceChildren();
    for(const [index,player] of data.players.slice(0,30).entries()){
      const row=document.createElement('tr');
      for(const value of [index+1,player.nickname,player.played,player.wins,player.winRate+' %']){
        const cell=document.createElement('td');
        cell.textContent=String(value??'—');
        row.append(cell);
      }
      board.append(row);
    }
    panel.hidden=!board.children.length;
    status.textContent=panel.hidden?'Zatím tu nejsou žádné výsledky. Zahraj první online partii.':'Aktuální výsledky online partií.';
  }catch{
    status.textContent='Žebříček se nepodařilo načíst. Zkus obnovit výsledky za chvíli.';
  }finally{
    clearTimeout(timeout);
    refresh.disabled=false;
  }
}
refresh.addEventListener('click',loadLeaderboard);
loadLeaderboard();
