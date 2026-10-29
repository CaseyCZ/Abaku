// Guided first move: a small, isolated demo; never writes to game saves.
const $=id=>document.getElementById(id);
const numbers=[2,6,8];
const targets=[[2,1],[2,2],[2,3]];
let step=0,chosen=null;
function render(){
  const board=$('tutorialBoard');
  board.replaceChildren();
  for(let row=0;row<5;row++)for(let col=0;col<5;col++){
    const index=targets.findIndex(([r,c])=>r===row&&c===col);
    const cell=document.createElement('button');
    cell.type='button';cell.className='tutorial-demo-cell';
    if(row===2&&col===2)cell.classList.add('tutorial-demo-center');
    if(index>=0&&index<step){
      cell.classList.add('placed');
      cell.textContent=numbers[index];
    }else if(index===step&&step<numbers.length){
      cell.classList.add('target');
      cell.textContent=row===2&&col===2?'×2':'';
    }else if(row===2&&col===2){cell.textContent='×2';}
    cell.setAttribute('aria-label',index>=0&&index<step
      ?'Položená číslice '+numbers[index]
      :'Řádek '+(row+1)+', sloupec '+(col+1)+(row===2&&col===2?', střední bonus ×2 příklad':''));
    if(step===numbers.length||index<0||index<step)cell.disabled=true;
    else cell.addEventListener('click',()=>{
      if(index!==step){
        feedback('Čísla musí pokračovat v jedné souvislé řadě. Použij zeleně vyznačené pole.',true);return;
      }
      if(chosen!==numbers[step]){
        feedback('Nejprve vyber číslo '+numbers[step]+' dole.',true);return;
      }
      step++;chosen=null;render();
      if(step===3)feedback('Výborně! 2 + 6 = 8. Střed ×2 zvyšuje 16 na 32 bodů.',false);
      else feedback('Správně, pokračuj dalším číslem.',false);
    });
    board.append(cell);
  }
  const rack=$('tutorialRack');
  rack.replaceChildren();
  for(let i=0;i<numbers.length;i++){
    const tile=document.createElement('button');
    tile.type='button';tile.className='tutorial-demo-tile';
    if(numbers[i]===chosen)tile.classList.add('selected');
    tile.textContent=numbers[i];
    tile.disabled=i<step||step===3;
    tile.setAttribute('aria-label','Vybrat číslo '+numbers[i]);
    tile.setAttribute('aria-pressed',String(numbers[i]===chosen));
    tile.addEventListener('click',()=>{chosen=chosen===numbers[i]?null:numbers[i];render();});
    rack.append(tile);
  }
  const completed=step===3;
  $('tutorialCounter').textContent=completed?'Tah dokončen':'Krok '+(step+1)+' ze 3';
  $('tutorialPrompt').textContent=completed?'První tah je správný!':'Vyber číslo '+numbers[step];
  const instruction=[
    'Klepni na zlaté číslo 2 a potom ho polož na zeleně označené pole nalevo od středu.',
    'Vyber číslo 6 a polož ho na středové pole ×2 příklad.',
    'Nakonec polož číslo 8 napravo od středu.'
  ];
  $('tutorialInstruction').textContent=completed
    ?'Získal jsi 48 bodů. Takto může vypadat první tah skutečné partie.'
    :instruction[step];
  $('tutorialScore').hidden=!completed;
}
function feedback(message,error){
  const el=$('tutorialMessage');
  el.textContent=message;el.dataset.error=String(error);
}
$('tutorialReset').addEventListener('click',()=>{
  step=0;chosen=null;render();
  feedback('První tah bude tvořit příklad 2 + 6 = 8.',false);
});
render();
