const toggle=document.getElementById('menuToggle');
const navigation=document.getElementById('siteNavigation');
if(toggle&&navigation){
  const close=(restoreFocus=false)=>{
    navigation.classList.remove('is-open');
    toggle.setAttribute('aria-expanded','false');
    toggle.setAttribute('aria-label','Otevřít menu');
    if(restoreFocus)toggle.focus();
  };
  toggle.addEventListener('click',()=>{
    const opened=navigation.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded',String(opened));
    toggle.setAttribute('aria-label',opened?'Zavřít menu':'Otevřít menu');
  });
  navigation.addEventListener('click',event=>{
    if(event.target.closest('a,button'))close();
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&navigation.classList.contains('is-open'))close(true);
  });
  document.addEventListener('click',event=>{
    if(!navigation.contains(event.target)&&!toggle.contains(event.target))close();
  });
  matchMedia('(max-width:760px)').addEventListener('change',()=>close());
  // Dialogs opened from the mobile menu must return focus to a visible control.
  document.addEventListener('close',()=>{
    if(getComputedStyle(toggle).display!=='none'&&navigation.contains(document.activeElement))toggle.focus();
  },true);
}
