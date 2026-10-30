import {APP_VERSION} from './version-data.js?v=0.2.62';

const CHECK_INTERVAL_MS=5*60*1000;
const MIN_CHECK_GAP_MS=60*1000;
const initializedAt=Date.now()+8000;
let lastCheck=0;
let checking=false;
let pendingVersion='';

// Only released numeric versions are eligible. Never reload for a downgrade.
export function isNewerVersion(candidate,current=APP_VERSION){
  const parse=value=>{
    if(typeof value!=='string'||!/^\d+\.\d+\.\d+$/.test(value))return null;
    const parts=value.split('.').map(Number);
    return parts.every(Number.isSafeInteger)?parts:null;
  };
  const next=parse(candidate),installed=parse(current);
  if(!next||!installed)return false;
  for(let i=0;i<next.length;i++){
    if(next[i]>installed[i])return true;
    if(next[i]<installed[i])return false;
  }
  return false;
}

export function canApplyUpdate({visible,dialogOpen,onlineMatch,editing}){
  return Boolean(visible&&!dialogOpen&&!onlineMatch&&!editing);
}

function mayReload(){
  const resume=document.getElementById('onlineResumeCard');
  const active=document.activeElement;
  return canApplyUpdate({
    visible:document.visibilityState==='visible',
    dialogOpen:Boolean(document.querySelector('dialog[open]')),
    onlineMatch:Boolean(resume&&!resume.hidden),
    editing:Boolean(active?.matches('input,textarea,select,[contenteditable="true"]'))
  });
}

function applyPendingUpdate(){
  if(!pendingVersion||!mayReload())return;
  const next=new URL(window.location.href);
  // A versioned URL bypasses stale iOS home-screen / GitHub Pages HTML caches.
  // Do not loop if that exact URL still happens to contain the old page.
  if(next.searchParams.get('arena-update')===pendingVersion)return;
  next.searchParams.set('arena-update',pendingVersion);
  window.location.replace(next.href);
}

async function checkForUpdate(){
  if(Date.now()<initializedAt||document.visibilityState!=='visible'||checking||Date.now()-lastCheck<MIN_CHECK_GAP_MS)return;
  checking=true;
  lastCheck=Date.now();
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),5000);
  try{
    const url=new URL('../package.json',import.meta.url);
    url.searchParams.set('checked',String(Date.now()));
    const response=await fetch(url,{cache:'no-store',signal:controller.signal});
    if(!response.ok)return;
    const data=await response.json();
    if(isNewerVersion(data?.version)){
      pendingVersion=data.version;
      applyPendingUpdate();
    }
  }catch{
    // Offline or temporarily unavailable: keep the current working version.
  }finally{
    clearTimeout(timeout);
    checking=false;
  }
}

if(typeof document!=='undefined'&&typeof window!=='undefined'){
  // Online session restoration may need a few seconds before the resume card appears.
  setTimeout(()=>void checkForUpdate(),8000);
  window.addEventListener('pageshow',()=>void checkForUpdate());
  window.addEventListener('focus',()=>{
    applyPendingUpdate();
    void checkForUpdate();
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'){
      applyPendingUpdate();
      void checkForUpdate();
    }
  });
  document.addEventListener('close',applyPendingUpdate,true);
  document.addEventListener('focusout',applyPendingUpdate);
  setInterval(()=>void checkForUpdate(),CHECK_INTERVAL_MS);
  setInterval(applyPendingUpdate,15000);
}
