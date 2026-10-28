import {APP_VERSION, RELEASE_HISTORY} from './version-data.js?v=0.2.41';

// Both pages render the same notes without touching gameplay preferences.
for(const details of document.querySelectorAll('[data-version-history]')){
  const summary=details.querySelector('summary')||document.createElement('summary');
  summary.textContent='Verze '+APP_VERSION+' · Historie změn';
  const list=document.createElement('ol');
  list.className='version-history-list';
  for(const item of RELEASE_HISTORY){
    const li=document.createElement('li');
    const label=document.createElement('strong');
    label.textContent=item.version+(item.date?' · '+item.date:'');
    const description=document.createElement('p');
    description.textContent=item.description;
    li.append(label,description);
    list.appendChild(li);
  }
  details.replaceChildren(summary,list);
}
