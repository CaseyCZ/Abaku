const GITHUB_ISSUES_URL='https://api.github.com/repos/CaseyCZ/Abaku/issues';
const MODES={bot:'Hra proti počítači',local:'Dva hráči na jednom zařízení',online:'Online hra'};

export function validateFeedback(input){
  if(!input||typeof input.description!=='string')throw new Error('Napiš, co se stalo.');
  const description=input.description.trim();
  if(description.length<10||description.length>1500)throw new Error('Popiš problém (10 až 1500 znaků).');
  if(!Object.hasOwn(MODES,input.mode))throw new Error('Neznámý herní režim.');
  return {description,mode:input.mode};
}

function escapeForHtmlPre(text){
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export class GitHubIssueReporter{
  constructor({token,fetchImpl=fetch}={}){
    this.token=token||'';
    this.fetchImpl=fetchImpl;
  }
  get configured(){return this.token.length>=20;}
  async create({description,mode,reportId=null}){
    if(!this.configured)throw new Error('Hlášení problémů ještě není na serveru zapnuté.');
    const title=`[Hlášení hráče] ${description.replace(/\s+/g,' ').slice(0,75)}`;
    const body=[
      '### Popis problému',
      `<pre>${escapeForHtmlPre(description)}</pre>`,
      `**Režim:** ${MODES[mode]}`,
      reportId?`**Soukromá kontrola partie:** ${reportId} (na serveru, smaže se do 24 hodin)`:
        '**Historie partie:** nepřiložena',
      '',
      '_Hlášení bylo odesláno dobrovolně přímo ze hry Abaku. Soukromá data partie nejsou zveřejněna._'
    ].join('\n\n');
    let response;
    try{
      response=await this.fetchImpl(GITHUB_ISSUES_URL,{
        method:'POST',
        headers:{
          Accept:'application/vnd.github+json',
          Authorization:`Bearer ${this.token}`,
          'Content-Type':'application/json',
          'X-GitHub-Api-Version':'2022-11-28',
          'User-Agent':'Abaku-Feedback'
        },
        body:JSON.stringify({title,body}),
        signal:AbortSignal.timeout(8000)
      });
    }catch{throw new Error('GitHub teď neodpovídá. Zkus hlášení odeslat později.');}
    if(!response.ok){
      console.error('Abaku GitHub Issue: HTTP',response.status);
      throw new Error('GitHub hlášení nepřijal. Zkus to prosím později.');
    }
    const issue=await response.json();
    if(!Number.isInteger(issue.number)||
       !/^https:\/\/github\.com\/CaseyCZ\/Abaku\/issues\/\d+$/.test(issue.html_url||''))
      throw new Error('GitHub nepotvrdil vytvoření hlášení.');
    return {issueNumber:issue.number,issueUrl:issue.html_url};
  }
}
