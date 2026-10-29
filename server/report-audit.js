// The arithmetic replay remains independent from the game validator. Bonus
// coordinates are shared with the game so points cannot differ by mode.
import {bonusAt} from '../src/rules.js';
const SIZE=15;
const MAX_EVENTS=600;

function binaryOperation(digits,ruleset){
  if(!/^\d{3,9}$/.test(digits))return null;
  if(digits.length>=3){
    for(let i=1;i<=Math.min(3,digits.length-2);i++){
      for(let j=i+1;j<=Math.min(i+3,digits.length-1);j++){
        const parts=[digits.slice(0,i),digits.slice(i,j),digits.slice(j)];
        if(parts.some(s=>s.length>1&&s[0]==='0'))continue;
        const [a,b,c]=parts.map(Number);
        if(!a||!b||!c)continue;
        if(a+b===c)return `${a} + ${b} = ${c}`;
        if(a-b===c)return `${a} − ${b} = ${c}`;
        if(a*b===c)return `${a} × ${b} = ${c}`;
        if(a/b===c)return `${a} ÷ ${b} = ${c}`;
        if(ruleset==='legacy-0.2'&&(b===2||b===3)&&a**b===c)return `${a}^${b} = ${c}`;
      }
    }
  }
  return null;
}

function operation(digits,ruleset){
  if(!/^\d{2,9}$/.test(digits))return null;
  const binary=binaryOperation(digits,ruleset);
  if(binary)return binary;
  if(!['classic-powers-roots','classic-powers-roots-strict','classic-powers-roots-linked','classic-powers-roots-linked-powers'].includes(ruleset))return null;
  for(let i=1;i<digits.length;i++){
    const left=digits.slice(0,i),right=digits.slice(i);
    if((left.length>1&&left[0]==='0')||(right.length>1&&right[0]==='0'))continue;
    const a=Number(left),b=Number(right);
    if(!a||!b)continue;
    if(a*a===b)return `${a}² = ${b}`;
    if(a*a*a===b)return `${a}³ = ${b}`;
    if(b*b===a)return `√${a} = ${b}`;
    if(b*b*b===a)return `∛${a} = ${b}`;
  }
  return null;
}

const cellId=(r,c)=>`${r}:${c}`;
const isBoard=board=>Array.isArray(board)&&board.length===SIZE&&board.every(row=>
  Array.isArray(row)&&row.length===SIZE&&row.every(n=>n===null||(Number.isInteger(n)&&n>=0&&n<=9)));
const isScores=scores=>Array.isArray(scores)&&scores.length===2&&scores.every(n=>Number.isSafeInteger(n)&&n>=0);

function validLinkedContinuation(run,keys,ruleset){
  const firstNew=run.findIndex(p=>keys.has(cellId(p.row,p.col)));
  if(firstNew<2||!run.slice(firstNew).every(p=>keys.has(cellId(p.row,p.col))))return false;
  const prefix=run.slice(0,firstNew).map(p=>p.digit).join('');
  const added=run.slice(firstNew).map(p=>p.digit).join('');
  for(let start=0;start<prefix.length-1;start++){
    const end=prefix.slice(start);
    const old=operation(end,ruleset);
    if(!old)continue;
    const result=old.match(/= (\d+)$/)?.[1];
    if(result&&end.endsWith(result)&&
      (ruleset==='classic-powers-roots-linked-powers'?
        operation(result+added,ruleset):binaryOperation(result+added,ruleset)))return true;
  }
  return false;
}

function inspect(board,placed,ruleset){
  if(!Array.isArray(placed)||placed.length<1||placed.length>5)return {valid:false};
  const keys=new Set();
  for(const p of placed){
    if(!p||!Number.isInteger(p.row)||!Number.isInteger(p.col)||!Number.isInteger(p.digit)||
      p.row<0||p.row>=SIZE||p.col<0||p.col>=SIZE||p.digit<0||p.digit>9||
      board[p.row][p.col]!==null||keys.has(cellId(p.row,p.col)))return {valid:false};
    keys.add(cellId(p.row,p.col));
  }
  const horizontal=placed.every(p=>p.row===placed[0].row);
  const vertical=placed.every(p=>p.col===placed[0].col);
  if(!horizontal&&!vertical)return {valid:false};
  const after=board.map(row=>row.slice());
  for(const p of placed)after[p.row][p.col]=p.digit;
  const positions=placed.map(p=>horizontal?p.col:p.row);
  for(let x=Math.min(...positions);x<=Math.max(...positions);x++){
    if((horizontal?after[placed[0].row][x]:after[x][placed[0].col])===null)return {valid:false};
  }
  const hadOld=board.some(row=>row.some(n=>n!==null));
  if(!hadOld&&!keys.has('7:7'))return {valid:false};
  if(hadOld&&!placed.some(p=>[[1,0],[-1,0],[0,1],[0,-1]].some(([dr,dc])=>
    board[p.row+dr]?.[p.col+dc]!==undefined&&board[p.row+dr][p.col+dc]!==null)))return {valid:false};
  const expressions=[];
  const allRows=new Set(placed.map(p=>p.row)),allCols=new Set(placed.map(p=>p.col));
  const strict=['classic-powers-roots-strict','classic-powers-roots-linked','classic-powers-roots-linked-powers'].includes(ruleset);
  for(const [axis,indices] of [['row',allRows],['col',allCols]]){
    for(const index of indices){
      let run=[];
      const collect=()=>{
        if(strict){
          if(run.length<2||!run.some(p=>keys.has(cellId(p.row,p.col))))return true;
          const sequence=run.map(p=>p.digit).join('');
          if(!operation(sequence,ruleset)&&
            !(['classic-powers-roots-linked','classic-powers-roots-linked-powers'].includes(ruleset)&&
              validLinkedContinuation(run,keys,ruleset)))return false;
        }
        for(let start=0;start<run.length;start++)for(let end=start+2;end<=Math.min(run.length,start+9);end++){
          const cells=run.slice(start,end);
          if(!cells.some(p=>keys.has(cellId(p.row,p.col))))continue;
          const sequence=cells.map(p=>p.digit).join('');
          const equation=operation(sequence,ruleset);
          if(equation)expressions.push({cells,sequence,equation});
        }
        return true;
      };
      for(let i=0;i<=SIZE;i++){
        const row=axis==='row'?index:i,col=axis==='row'?i:index;
        const value=i<SIZE?after[row][col]:null;
        if(value!==null)run.push({row,col,digit:value});
        else if(run.length){if(!collect())return {valid:false};run=[];}
      }
    }
  }
  if(!expressions.length)return {valid:false};
  const covered=new Set(expressions.flatMap(e=>e.cells.map(p=>cellId(p.row,p.col))));
  if(placed.some(p=>!covered.has(cellId(p.row,p.col))))return {valid:false};
  for(const p of placed){
    for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nr=p.row+dr,nc=p.col+dc;
      if(after[nr]?.[nc]===undefined||after[nr][nc]===null)continue;
      if(!expressions.some(e=>e.cells.some(x=>x.row===p.row&&x.col===p.col)&&
        e.cells.some(x=>x.row===nr&&x.col===nc)))return {valid:false};
    }
  }
  const breakdown=expressions.map(e=>{
    let base=0,multiplier=1;
    for(const c of e.cells){
      const kind=keys.has(cellId(c.row,c.col))?bonusAt(c.row,c.col):null;
      base+=c.digit*(kind==='dd'?2:kind==='td'?3:1);
      if(kind==='de')multiplier*=2;
      if(kind==='te')multiplier*=3;
    }
    return {sequence:e.sequence,equation:e.equation,base,multiplier,points:base*multiplier};
  });
  return {valid:true,board:after,points:breakdown.reduce((n,b)=>n+b.points,0),
    equations:expressions.map(e=>e.sequence),breakdown};
}

const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function auditReport(input){
  if(!input||!['bot','local','online'].includes(input.mode)||
    !['legacy-0.2','classic-powers-roots','classic-powers-roots-strict','classic-powers-roots-linked','classic-powers-roots-linked-powers'].includes(input.ruleset)||
    !isBoard(input.initialBoard)||!isBoard(input.finalBoard)||
    !isScores(input.initialScores)||!isScores(input.finalScores)||
    !Array.isArray(input.events)||input.events.length<1||input.events.length>MAX_EVENTS||
    typeof input.partial!=='boolean')throw new Error('Neplatný nebo příliš dlouhý záznam partie.');
  let board=input.initialBoard.map(row=>row.slice());
  const scores=input.initialScores.slice(),issues=[];
  let checked=0;
  for(const [index,event] of input.events.entries()){
    if(!event||!['move','pass','exchange'].includes(event.type)||![0,1].includes(event.player))
      throw new Error('Neplatná událost v historii partie.');
    if(event.type!=='move')continue;
    if(typeof event.accepted!=='boolean'||!Array.isArray(event.placements)||event.placements.length>5||
      !event.placements.every(p=>p&&Number.isInteger(p.row)&&Number.isInteger(p.col)&&Number.isInteger(p.digit)&&
        p.row>=0&&p.row<SIZE&&p.col>=0&&p.col<SIZE&&p.digit>=0&&p.digit<=9))
      throw new Error('Neplatný záznam položených kamenů.');
    checked++;
    const independent=inspect(board,event.placements,input.ruleset);
    const moveNumber=index+1;
    if(independent.valid!==event.accepted){
      issues.push({event:moveNumber,type:event.accepted?'accepted-invalid':'rejected-valid',
        description:event.accepted?'Hra uznala neplatný tah.':'Hra zamítla platný tah.'});
    }
    if(!event.accepted)continue;
    if(!Number.isSafeInteger(event.points)||event.points<0||!Array.isArray(event.equations)||
      event.equations.length>120||!event.equations.every(s=>typeof s==='string'&&/^\d{2,9}$/.test(s))||
      (event.breakdown!==undefined&&(!Array.isArray(event.breakdown)||
        event.breakdown.length>120||!event.breakdown.every(b=>b&&
          typeof b.sequence==='string'&&/^\d{2,9}$/.test(b.sequence)&&
          typeof b.equation==='string'&&b.equation.length<=50&&
          /^[\d +−×÷=^²³√∛.]+$/.test(b.equation)&&
          [b.base,b.multiplier,b.points].every(n=>Number.isSafeInteger(n)&&n>=0)))))
      throw new Error('Neplatné bodování v záznamu.');
    scores[event.player]+=event.points;
    // Replay what the game actually accepted, even when the checker disagrees.
    for(const p of event.placements)board[p.row][p.col]=p.digit;
    if(!independent.valid)continue;
    if(independent.points!==event.points)
      issues.push({event:moveNumber,type:'points',description:`Hra: ${event.points}, kontrola: ${independent.points} bodů.`});
    if(!same([...independent.equations].sort(),[...event.equations].sort()))
      issues.push({event:moveNumber,type:'equations',description:'Hra a kontrola rozpoznaly různé příklady.'});
    if(Array.isArray(event.breakdown)&&!same(independent.breakdown,event.breakdown))
      issues.push({event:moveNumber,type:'bonuses',description:'Nesouhlasí rozpis bodů nebo bonusů.'});
  }
  if(!same(board,input.finalBoard))issues.push({event:null,type:'board',description:'Konečný stav desky neodpovídá historii.'});
  if(!same(scores,input.finalScores))issues.push({event:null,type:'totals',description:'Celkové skóre neodpovídá zapsaným tahům.'});
  if(input.partial)issues.push({event:null,type:'partial',description:'Partie začala před zapnutím záznamu; kontrola je pouze částečná.'});
  return {checkedMoves:checked,events:input.events.length,issues,ok:issues.length===0};
}
