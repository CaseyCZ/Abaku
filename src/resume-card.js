// The parent card is visible whenever either independently verified match is available.
// Local state comes from the browser; online state only from the authenticated API.
export function syncResumeCard(){
  const root=document.getElementById('resumeCard');
  const local=document.getElementById('savedCard');
  const online=document.getElementById('onlineResumeCard');
  if(root&&local&&online)root.hidden=local.hidden&&online.hidden;
}
