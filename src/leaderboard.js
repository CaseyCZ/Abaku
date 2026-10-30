import {ONLINE_CONFIG} from './online-config.js?v=0.2.61';

const board=document.getElementById('leaderboard');
const panel=document.getElementById('leaderboardPanel');
const status=document.getElementById('leaderboardStatus');
const refresh=document.getElementById('leaderboardRefresh');
const periodButtons=[...document.querySelectorAll('[data-leaderboard-period]')];
const periodInfo=document.getElementById('leaderboardPeriodInfo');
const labels={week:'Tento týden',month:'Tento měsíc',all:'Celkově'};
let selectedPeriod='all';
let activeRequest=null;

function choosePeriod(period){
  if(!Object.hasOwn(labels,period))return;
  selectedPeriod=period;
  for(const button of periodButtons){
    button.setAttribute('aria-pressed',String(button.dataset.leaderboardPeriod===period));
  }
  periodInfo.hidden=period==='all';
  void loadLeaderboard();
}

async function loadLeaderboard(){
  activeRequest?.abort();
  const controller=new AbortController();
  activeRequest=controller;
  refresh.disabled=true;
  panel.hidden=true;
  status.textContent='Načítám žebříček…';
  const timeout=setTimeout(()=>controller.abort(),8000);
  const currentPeriod=selectedPeriod;
  try{
    const base=new URL(ONLINE_CONFIG.apiBase);
    if(base.protocol!=='https:'&&!(base.protocol==='http:'&&base.hostname==='localhost'))throw new Error('Invalid API URL');
    const endpoint=base.toString().replace(/\/$/,'')+'/api/leaderboard';
    const response=await fetch(endpoint+'?period='+encodeURIComponent(currentPeriod),{
      signal:controller.signal,cache:'no-store'
    });
    if(!response.ok)throw new Error('Leaderboard unavailable');
    const data=await response.json();
    if(!Array.isArray(data.players)|| (data.period && data.period!==currentPeriod))throw new Error('Invalid leaderboard');
    // Keep the overall table usable until the production API is upgraded.
    if(currentPeriod!=='all' && data.period!==currentPeriod){
      if(activeRequest===controller){
        board.replaceChildren();
        panel.hidden=true;
        status.textContent='Týdenní a měsíční žebříček bude dostupný po aktualizaci serveru.';
      }
      return;
    }
    if(activeRequest!==controller)return;
    board.replaceChildren();
    for(const [index,player] of data.players.slice(0,30).entries()){
      const row=document.createElement('tr');
      const place=['🥇','🥈','🥉'][index] ?? String(index+1);
      for(const [column,value] of [place,player.nickname,player.played,player.wins,player.winRate+' %'].entries()){
        const cell=document.createElement('td');
        cell.textContent=String(value??'—');
        if(column===0)cell.setAttribute('aria-label',(index+1)+'. místo');
        row.append(cell);
      }
      board.append(row);
    }
    panel.hidden=!board.children.length;
    status.textContent=panel.hidden
      ? 'Za období „'+labels[currentPeriod]+'“ zatím nejsou žádné výsledky.'
      : 'Aktuální výsledky: '+labels[currentPeriod]+'.';
  }catch{
    if(activeRequest!==controller)return;
    status.textContent='Žebříček se nepodařilo načíst. Zkus obnovit výsledky za chvíli.';
  }finally{
    clearTimeout(timeout);
    if(activeRequest===controller){
      activeRequest=null;
      refresh.disabled=false;
    }
  }
}
for(const button of periodButtons){
  button.addEventListener('click',()=>choosePeriod(button.dataset.leaderboardPeriod));
}
refresh.addEventListener('click',loadLeaderboard);
loadLeaderboard();
