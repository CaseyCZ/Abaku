import {ONLINE_CONFIG} from './online-config.js?v=0.2.40';

export const REPORT_RULESET='classic-powers-roots-linked-powers';
export function ensureAudit(game){
  if(game.audit?.ruleset===REPORT_RULESET&&Array.isArray(game.audit.events)){
    if(!Number.isSafeInteger(game.audit.revision))game.audit.revision=game.audit.events.length;
    return;
  }
  // Old saved games can continue; never replay their previous turns under new rules.
  game.audit={ruleset:REPORT_RULESET,partial:Boolean(game.turns),
    initialBoard:game.board.map(row=>row.slice()),
    initialScores:game.players.map(p=>p.score),events:[],revision:0};
}

export function recordAudit(game,event){
  ensureAudit(game);
  if(game.audit.events.length>=600){
    game.audit.partial=true;
    const oldestNonMove=game.audit.events.findIndex(e=>e.type!=='move'||!e.accepted);
    if(oldestNonMove<0)return;
    game.audit.events.splice(oldestNonMove,1);
  }
  if(event.type==='move'){
    const safe={type:'move',player:event.player,accepted:event.accepted,
      placements:event.placements.map(p=>({row:p.row,col:p.col,digit:p.digit}))};
    if(event.accepted){
      safe.points=event.points;
      safe.equations=[...event.equations];
      safe.breakdown=event.breakdown.map(e=>({...e}));
    }
    game.audit.events.push(safe);
  }else game.audit.events.push({type:event.type,player:event.player});
  game.audit.revision++;
}

export function localReport(game,mode){
  ensureAudit(game);
  const log=game.audit;
  return {mode,ruleset:log.ruleset,partial:log.partial,finished:Boolean(game.finished),
    initialBoard:log.initialBoard,initialScores:log.initialScores,
    events:log.events,finalBoard:game.board,finalScores:game.players.map(p=>p.score)};
}

export async function sendLocalReport(game,mode){
  const payload=localReport(game,mode);
  if(!payload.events.length)throw new Error('Nejdříve odehraj alespoň jeden tah.');
  const response=await fetch(ONLINE_CONFIG.apiBase+'/api/reports',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
  });
  let result;
  try{result=await response.json();}catch{throw new Error('Server kontroly momentálně neodpovídá.');}
  if(!response.ok)throw new Error(result.error||'Partii se nepodařilo odeslat.');
  return result;
}
