const HIDE_KEY='arena-welcome-guide-hidden-v1';
const SESSION_KEY='arena-welcome-guide-seen-session-v1';
const RETURNING_KEYS=[
  'arena-local-profile-v1',
  'retro-arena-game-v1',
  'arena-online-device-session-v1'
];

export function shouldShowWelcome({hidden=false,shownThisSession=false,returningPlayer=false}={}){
  return !hidden&&!shownThisSession&&!returningPlayer;
}

if(typeof document!=='undefined'){
  const dialog=document.getElementById('welcomeGuide');
  const checkbox=document.getElementById('welcomeGuideNeverShow');
  const byId=id=>document.getElementById(id);
  const get=(storage,key)=>{
    try{return storage?.getItem(key);}catch{return null;}
  };
  const set=(storage,key,value)=>{
    try{storage?.setItem(key,value);}catch{/* Private browsing can block storage. */}
  };
  const remember=()=>{
    try{
      if(checkbox.checked)localStorage.setItem(HIDE_KEY,'1');
      else localStorage.removeItem(HIDE_KEY);
    }catch{/* Closing the guide must always work. */}
  };
  const close=()=>{
    remember();
    if(dialog.open)dialog.close();
  };
  const open=()=>{
    if(dialog.open)return;
    checkbox.checked=get(localStorage,HIDE_KEY)==='1';
    dialog.showModal();
    set(sessionStorage,SESSION_KEY,'1');
  };
  const focusProfile=()=>{
    const card=byId('homeProfileCard');
    const loginWidget=byId('googleSignInWidget');
    const loginFallback=byId('googleSignIn');
    const target=!loginWidget.hidden?loginWidget:!loginFallback.hidden?loginFallback:card;
    target.scrollIntoView({behavior:'smooth',block:'center'});
    if(target===loginFallback)loginFallback.focus({preventScroll:true});
    else card.focus({preventScroll:true});
  };

  byId('welcomeGuideOpen').addEventListener('click',open);
  byId('welcomeGuideClose').addEventListener('click',close);
  byId('welcomeGuideDone').addEventListener('click',close);
  dialog.addEventListener('close',remember);
  dialog.querySelectorAll('[data-welcome-action]').forEach(element=>{
    element.addEventListener('click',()=>{
      close();
      switch(element.dataset.welcomeAction){
        case 'login':focusProfile();break;
        case 'profile':byId('editProfile').click();break;
        case 'friends':byId('friendsOpen').click();break;
        case 'computer':byId('playAi').click();break;
        case 'settings':byId('lobbySettingsButton').click();break;
        // The real link to how-to-play.html handles navigation itself.
      }
    });
  });

  const returningPlayer=RETURNING_KEYS.some(key=>Boolean(get(localStorage,key)));
  if(shouldShowWelcome({
    hidden:get(localStorage,HIDE_KEY)==='1',
    shownThisSession:get(sessionStorage,SESSION_KEY)==='1',
    returningPlayer
  })){
    // The server can restore an online match asynchronously; never cover one.
    window.setTimeout(()=>{
      if(document.querySelector('dialog[open]')||!byId('onlineResumeCard').hidden)return;
      open();
    },1100);
  }
}
