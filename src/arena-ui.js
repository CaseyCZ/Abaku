// Číselná aréna: presentation preferences only.
// Affects CSS layout and panel visibility, never game rules or network state.
const LAYOUT_KEY='ciselna-arena-layout-v1';
const layouts=new Set(['focus','side','stack']);
const byId=id=>document.getElementById(id);

function storedLayout(){
  try{const saved=localStorage.getItem(LAYOUT_KEY);return layouts.has(saved)?saved:'focus';}
  catch{return 'focus';}
}
function applyLayout(value,persist=false){
  const chosen=layouts.has(value)?value:'focus';
  document.documentElement.dataset.arenaLayout=chosen;
  if(persist){try{localStorage.setItem(LAYOUT_KEY,chosen);}catch{/* Private mode */}}
  for(const id of ['layoutSetting','onlineLayoutSetting']){
    const field=byId(id);
    if(field&&field.value!==chosen)field.value=chosen;
  }
  // Changing modes closes overlays so a panel cannot get stuck across layouts.
  for(const element of document.querySelectorAll('.game-app.panel-open,#onlineDialog.panel-open')){
    element.classList.remove('panel-open');
  }
  for(const id of ['gameInfoToggle','onlineInfoToggle']){
    const button=byId(id);
    if(button)button.setAttribute('aria-expanded','false');
  }
}
function togglePanel(buttonId,container){
  const button=byId(buttonId);
  if(!button||!container)return;
  button.addEventListener('click',()=>{
    const opened=container.classList.toggle('panel-open');
    button.setAttribute('aria-expanded',String(opened));
  });
}
function init(){
  applyLayout(storedLayout());
  for(const id of ['layoutSetting','onlineLayoutSetting']){
    const field=byId(id);
    if(field){
      field.value=storedLayout();
      field.addEventListener('change',()=>applyLayout(field.value,true));
    }
  }
  togglePanel('gameInfoToggle',document.querySelector('.game-app'));
  togglePanel('onlineInfoToggle',byId('onlineDialog'));
  window.addEventListener('storage',event=>{
    if(event.key===LAYOUT_KEY)applyLayout(storedLayout());
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
