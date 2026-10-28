import {ONLINE_CONFIG} from './online-config.js?v=0.2.9';

export async function sendAnonymousFeedback(payload){
  const response=await fetch(ONLINE_CONFIG.apiBase+'/api/feedback',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
  });
  let result;
  try{result=await response.json();}
  catch{throw new Error('Odeslání hlášení se nezdařilo.');}
  if(!response.ok)throw new Error(result.error||'Odeslání hlášení se nezdařilo.');
  return result;
}

export function bindFeedback({buttonId,send}){
  const button=document.getElementById(buttonId);
  const dialog=document.getElementById('feedbackDialog');
  const form=document.getElementById('feedbackForm');
  const description=document.getElementById('feedbackDescription');
  const attach=document.getElementById('feedbackAttach');
  const status=document.getElementById('feedbackStatus');
  const submit=document.getElementById('feedbackSubmit');
  const cancel=document.getElementById('feedbackCancel');
  if(!button||!dialog||!form)return;

  button.addEventListener('click',()=>{
    status.textContent='';
    dialog.showModal();
  });
  cancel.addEventListener('click',()=>dialog.close());
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(submit.disabled||!form.reportValidity())return;
    submit.disabled=true;
    status.textContent='Odesílám hlášení…';
    try{
      const result=await send({description:description.value.trim(),attach:attach.checked});
      status.textContent=`Problém nahlášen (č. ${result.issueNumber}). Děkujeme! `;
      if(/^https:\/\/github\.com\/CaseyCZ\/Abaku\/issues\/\d+$/.test(result.issueUrl||'')){
        const link=document.createElement('a');
        link.href=result.issueUrl;link.target='_blank';link.rel='noopener noreferrer';
        link.textContent='Zobrazit hlášení';
        status.append(link);
      }
      form.reset();
    }catch(error){status.textContent=error.message||'Hlášení se nepodařilo odeslat.';}
    finally{submit.disabled=false;}
  });
}
