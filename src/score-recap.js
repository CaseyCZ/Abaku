// Sequential scoring display shared by local and online matches.
// It only visualises points already calculated by validateMove on the client
// or the authoritative server. It never changes the saved/player score.
import {formatEquations} from './rules.js?v=0.2.61';

// Local players choose their duration; online matches always use three seconds.
export const RECAP_SECONDS_OPTIONS=Object.freeze([0,2,3,5]);
export const RECAP_STORAGE_KEY='arena-local-score-recap-seconds-v1';
const LEGACY_RECAP_STORAGE_KEY='arena-score-recap-seconds-v1';
export function getRecapSeconds(){
  try{
    // Read the old shared preference only until a local-specific one is saved.
    const current=localStorage.getItem(RECAP_STORAGE_KEY);
    const legacy=current===null?localStorage.getItem(LEGACY_RECAP_STORAGE_KEY):null;
    const stored=current??legacy;
    // Number(null) is zero: missing preferences must remain 3 seconds.
    const preferred=stored!==null&&stored!==''&&RECAP_SECONDS_OPTIONS.includes(Number(stored))
      ?Number(stored):3;
    // Invalid former 8/10-second choices become a saved local 3-second value.
    if(current===null&&legacy!==null||current!==null&&String(preferred)!==current)
      localStorage.setItem(RECAP_STORAGE_KEY,String(preferred));
    return preferred;
  }catch{ /* localStorage may be blocked */ }
  return 3;
}
export function setRecapSeconds(seconds){
  const value=Number(seconds);
  if(!RECAP_SECONDS_OPTIONS.includes(value))return false;
  try{localStorage.setItem(RECAP_STORAGE_KEY,String(value));}
  catch{ /* current page can still use the selection */ }
  return true;
}

export function scoringSteps(breakdown,total,equations=[]){
  const target=Number(total);
  if(!Number.isSafeInteger(target)||target<0)return [];
  const entries=Array.isArray(breakdown)?breakdown:[];
  const correct=entries.length>0&&entries.every(item=>
    item&&typeof item.equation==='string'&&item.equation.length>0&&
    Number.isSafeInteger(item.base)&&item.base>=0&&
    Number.isSafeInteger(item.multiplier)&&item.multiplier>0&&
    Number.isSafeInteger(item.points)&&item.points===item.base*item.multiplier
  )&&entries.reduce((sum,item)=>sum+item.points,0)===target;
  // Older server versions lacked per-equation points. Show the accurate
  // total once instead of fabricating individual scores.
  if(!correct)return target===0?[]:[{
    equation:formatEquations(equations,100)||'Vyhodnocení tahu',
    base:target,multiplier:1,points:target
  }];
  return entries.map(item=>({
    equation:item.equation,base:item.base,multiplier:item.multiplier,
    points:item.points
  }));
}

// Online turns begin only after the shared 3-second-per-example recap,
// its final summary, and the unobstructed 3-second board highlight.
// Allow a little time for both devices to receive the WebSocket event.
export function onlineReviewDelayMs(breakdown,total,equations=[]){
  const steps=scoringSteps(breakdown,total,equations).length;
  return (steps?steps*(700+3000)+3000:0)+3000+1500;
}

export class ScoreRecap {
  constructor(container=document.body,{seconds=getRecapSeconds}={}){
    this.seconds=seconds;
    this.root=document.createElement('div');
    this.root.className='arena-score-recap';
    this.root.hidden=true;
    this.root.setAttribute('aria-label','Automatické vyhodnocení tahu');
    this.root.innerHTML=
      '<div class="arena-score-scroll" aria-hidden="true">'+
        '<div class="arena-score-cap"></div>'+
        '<div class="arena-score-face">'+
          '<div class="arena-score-player"></div>'+
          '<div class="arena-score-equation"></div>'+
          '<div class="arena-score-addition"></div>'+
          '<div class="arena-score-bonus"></div>'+
          '<div class="arena-score-separator"></div>'+
          '<div class="arena-score-total-label">Průběžný součet</div>'+
          '<div class="arena-score-counter">0</div>'+
          '<div class="arena-score-progress"></div>'+
        '</div>'+
        '<div class="arena-score-cap"></div>'+
      '</div>';
    container.append(this.root);
    this.player=this.root.querySelector('.arena-score-player');
    this.equation=this.root.querySelector('.arena-score-equation');
    this.addition=this.root.querySelector('.arena-score-addition');
    this.bonus=this.root.querySelector('.arena-score-bonus');
    this.totalLabel=this.root.querySelector('.arena-score-total-label');
    this.counter=this.root.querySelector('.arena-score-counter');
    this.progress=this.root.querySelector('.arena-score-progress');
    this.timeouts=[];
    this.counterInterval=null;
    this.onDone=null;
    this.active=false;
    this.queue=[];
    this.generation=0;
  }
  later(callback,ms){
    this.timeouts.push(setTimeout(callback,ms));
  }
  cancel(){
    for(const timer of this.timeouts)clearTimeout(timer);
    this.timeouts=[];
    if(this.counterInterval!==null)clearInterval(this.counterInterval);
    this.counterInterval=null;
    this.active=false;
    this.onDone=null;
    this.queue=[];
    this.root.hidden=true;
    this.generation++;
  }
  playing(){return this.active;}
  play({player='Hráč',breakdown=[],equations=[],total=0,onDone=null}={}){
    // A quick AI or online reply must not cut short the current recap.
    if(this.active){
      this.queue.push({player,breakdown,equations,total,onDone});
      return;
    }
    this.cancel();
    // Disabled: skip the parchment/point counter entirely. The same onDone
    // callback still highlights newly played tiles for 3 seconds.
    if(this.seconds()===0){
      onDone?.();
      return;
    }
    const runId=this.generation;
    const steps=scoringSteps(breakdown,total,equations);
    if(!steps.length){onDone?.();return;}
    this.active=true;
    this.onDone=onDone;
    this.root.hidden=false;
    this.player.textContent=String(player).slice(0,45);
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const counterDuration=reduced?100:700;
    // Hold each COMPLETE example on screen for the selected number
    // of seconds AFTER the counter finishes animating.
    const visibleSeconds=this.seconds();
    const stepDuration=counterDuration+visibleSeconds*1000;
    const completedDuration=visibleSeconds*1000;
    const animateCount=(from,to)=>{
      if(this.counterInterval!==null)clearInterval(this.counterInterval);
      const started=Date.now();
      const duration=counterDuration;
      this.counter.textContent=String(from);
      this.counterInterval=setInterval(()=>{
        const fraction=Math.min(1,(Date.now()-started)/duration);
        this.counter.textContent=String(Math.round(from+(to-from)*(1-(1-fraction)**3)));
        if(fraction>=1){clearInterval(this.counterInterval);this.counterInterval=null;}
      },35);
    };
    let cumulative=0;
    steps.forEach((item,index)=>{
      this.later(()=>{
        const before=cumulative;
        cumulative+=item.points;
        this.root.classList.remove('arena-score-change');
        void this.root.offsetWidth;
        this.root.classList.add('arena-score-change');
        this.equation.textContent=item.equation;
        this.addition.textContent='+'+item.points+' bodů';
        this.bonus.textContent=item.multiplier>1
          ?'Základ '+item.base+' × '+item.multiplier+' bonus'
          :'Základ '+item.base+' bodů';
        this.totalLabel.textContent='Průběžný součet';
        this.progress.textContent='Příklad '+(index+1)+' z '+steps.length;
        animateCount(before,cumulative);
      },index*stepDuration);
    });
    this.later(()=>{
      if(this.counterInterval!==null)clearInterval(this.counterInterval);
      this.counterInterval=null;
      this.root.classList.remove('arena-score-change');
      this.equation.textContent='Celkem za tah';
      this.addition.textContent='';
      this.bonus.textContent='';
      this.totalLabel.textContent='Získané body';
      this.counter.textContent=String(total);
      this.progress.textContent='✓ Tah vyhodnocen';
    },steps.length*stepDuration);
    this.later(()=>{
      const done=this.onDone;
      this.root.hidden=true;
      // The onDone callback may wait for a 3-second board highlight.
      // Keep the scorer busy and queued moves waiting until it completes.
      let completion;
      try{completion=done?.();}
      catch{completion=null;}
      Promise.resolve(completion).then(()=>{
        if(this.generation!==runId)return; // game reset or match changed
        const next=this.queue[0]||null;
        const remainder=this.queue.slice(1);
        this.cancel();
        if(next){
          this.play(next);
          this.queue.push(...remainder);
        }
      });
    },steps.length*stepDuration+completedDuration);
  }
}
