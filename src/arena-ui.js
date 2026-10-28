// Presentation preferences only; never change a saved game or network state.
const LEGACY_PANEL_KEY='ciselna-arena-panels-v1';
const LEGACY_LAYOUT_KEY='ciselna-arena-layout-v1';
const byId=id=>document.getElementById(id);
const PANEL_KEY=byId('settingsDialog')?'arena-local-panels-v1':'arena-online-panels-v1';
// Both dialogs use the same copy. Their mode-specific explanations remain local.
const SETTINGS_COPY=Object.freeze({
  explanation:'Vysvětlení nastavení',
  panels:'Průběh a chat jsou vedle desky, na telefonu pod ní.',
  privacyTitle:'Soukromí a cookies',
  privacyLink:'Zásady soukromí',
  cookies:'Nastavení cookies'
});

function storedPanels(){
  try{
    const saved=JSON.parse(localStorage.getItem(PANEL_KEY)||localStorage.getItem(LEGACY_PANEL_KEY)||'null');
    if(typeof saved?.history==='boolean'&&typeof saved?.chat==='boolean')return saved;
    // Preserve old visibility without deleting or rewriting the legacy key.
    if(localStorage.getItem(LEGACY_LAYOUT_KEY)==='focus')return {history:false,chat:false};
  }catch{/* Preferences also work with blocked storage. */}
  return {history:true,chat:true};
}
let savedPanels=storedPanels();
function applyPanels(value){
  document.documentElement.dataset.arenaHistory=String(value.history);
  document.documentElement.dataset.arenaChat=String(value.chat);
  for(const input of document.querySelectorAll('[data-arena-panel]')){
    input.checked=value[input.dataset.arenaPanel];
  }
}
function selectedPanels(){
  return Object.fromEntries([...document.querySelectorAll('[data-arena-panel]')]
    .map(input=>[input.dataset.arenaPanel,input.checked]));
}
function savePanels(){
  savedPanels=selectedPanels();
  try{localStorage.setItem(PANEL_KEY,JSON.stringify(savedPanels));}catch{/* Keep current-page preferences. */}
  applyPanels(savedPanels);
}
// A new-message notification may reveal chat without changing saved preferences.
export function revealArenaChat(){
  applyPanels({history:document.documentElement.dataset.arenaHistory==='true',chat:true});
}
function init(){
  for(const node of document.querySelectorAll('[data-arena-settings-copy]')){
    const value=SETTINGS_COPY[node.dataset.arenaSettingsCopy];
    if(value)node.textContent=value;
  }
  applyPanels(savedPanels);
  for(const input of document.querySelectorAll('[data-arena-panel]')){
    input.addEventListener('change',()=>applyPanels(selectedPanels()));
  }
  for(const id of ['settingsButton','lobbySettingsButton','onlineSettingsButton']){
    byId(id)?.addEventListener('click',()=>applyPanels(savedPanels));
  }
  byId('settingsForm')?.addEventListener('submit',event=>{
    // The game may reject a mode change; rejected submission must not save preferences.
    queueMicrotask(()=>{
      if(event.submitter?.value==='save'&&!event.defaultPrevented)savePanels();
      else applyPanels(savedPanels);
    });
  });
  byId('onlineSettingsSave')?.addEventListener('click',savePanels);
  for(const id of ['settingsDialog','onlineGameSettingsDialog']){
    byId(id)?.addEventListener('close',()=>applyPanels(savedPanels));
  }
  window.addEventListener('storage',event=>{
    if(event.key===PANEL_KEY||event.key===null){savedPanels=storedPanels();applyPanels(savedPanels);}
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
