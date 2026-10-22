// Original-Abaku-inspired sequential scoring display.
// It only visualises points already calculated by validateMove on the client
// or the authoritative server. It never changes the saved/player score.
import {formatEquations} from './rules.js?v=0.2.15';

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

export class ScoreRecap {
  constructor(container=document.body){
    this.root=document.createElement('div');
    this.root.className='abaku-score-recap';
    this.root.hidden=true;
    this.root.setAttribute('aria-label','Automatické vyhodnocení tahu');
    this.root.innerHTML=
      '<div class="abaku-score-scroll" aria-hidden="true">'+
        '<div class="abaku-score-cap"></div>'+
        '<div class="abaku-score-face">'+
          '<div class="abaku-score-player"></div>'+
          '<div class="abaku-score-equation"></div>'+
          '<div class="abaku-score-addition"></div>'+
          '<div class="abaku-score-bonus"></div>'+
          '<div class="abaku-score-separator"></div>'+
          '<div class="abaku-score-total-label">Průběžný součet</div>'+
          '<div class="abaku-score-counter">0</div>'+
          '<div class="abaku-score-progress"></div>'+
        '</div>'+
        '<div class="abaku-score-cap"></div>'+
      '</div>';
    container.append(this.root);
    this.player=this.root.querySelector('.abaku-score-player');
    this.equation=this.root.querySelector('.abaku-score-equation');
    this.addition=this.root.querySelector('.abaku-score-addition');
    this.bonus=this.root.querySelector('.abaku-score-bonus');
    this.totalLabel=this.root.querySelector('.abaku-score-total-label');
    this.counter=this.root.querySelector('.abaku-score-counter');
    this.progress=this.root.querySelector('.abaku-score-progress');
    this.timeouts=[];
    this.counterInterval=null;
    this.onDone=null;
    this.active=false;
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
    this.root.hidden=true;
  }
  playing(){return this.active;}
  play({player='Hráč',breakdown=[],equations=[],total=0,onDone=null}={}){
    this.cancel();
    const steps=scoringSteps(breakdown,total,equations);
    if(!steps.length){onDone?.();return;}
    this.active=true;
    this.onDone=onDone;
    this.root.hidden=false;
    this.player.textContent=String(player).slice(0,45);
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const stepDuration=reduced?750:1250;
    const completedDuration=reduced?650:1050;
    const animateCount=(from,to)=>{
      if(this.counterInterval!==null)clearInterval(this.counterInterval);
      const started=Date.now();
      const duration=reduced?100:660;
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
        this.root.classList.remove('abaku-score-change');
        void this.root.offsetWidth;
        this.root.classList.add('abaku-score-change');
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
      this.root.classList.remove('abaku-score-change');
      this.equation.textContent='Celkem za tah';
      this.addition.textContent='';
      this.bonus.textContent='';
      this.totalLabel.textContent='Získané body';
      this.counter.textContent=String(total);
      this.progress.textContent='✓ Tah vyhodnocen';
    },steps.length*stepDuration);
    this.later(()=>{
      const done=this.onDone;
      this.cancel();
      done?.();
    },steps.length*stepDuration+completedDuration);
  }
}
