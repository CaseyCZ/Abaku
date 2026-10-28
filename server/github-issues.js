import {auditReport} from './report-audit.js';

const DEFAULT_REPOSITORY='CaseyCZ/Ciselna-Arena';
const ALLOWED_REPOSITORIES=new Set([DEFAULT_REPOSITORY]);
const MODES={bot:'Hra proti počítači',local:'Dva hráči na jednom zařízení',online:'Online hra'};
const MAX_ISSUE_BODY_BYTES=50_000;
const MAX_HISTORY_ARTIFACT_BYTES=512_000;

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

// The caller may provide arbitrary extra keys. Only reviewed game data goes to a public issue.
export function publicGameHistory(report,mode){
  if(report?.mode!==mode)throw new Error('Historie neodpovídá hernímu režimu.');
  auditReport(report);
  return {mode:report.mode,ruleset:report.ruleset,partial:report.partial,
    finished:report.finished===true,
    initialBoard:report.initialBoard,initialScores:report.initialScores,
    events:report.events.map(event=>event.type==='move'?{
      type:'move',player:event.player,accepted:event.accepted,
      placements:event.placements.map(p=>({row:p.row,col:p.col,digit:p.digit})),
      ...(event.accepted?{points:event.points,equations:event.equations,
        breakdown:Array.isArray(event.breakdown)?event.breakdown.map(b=>({
          sequence:b.sequence,equation:b.equation,base:b.base,multiplier:b.multiplier,points:b.points
        })):[]}:{}),
    }:{type:event.type,player:event.player}),
    finalBoard:report.finalBoard,finalScores:report.finalScores};
}

export class GitHubIssueReporter{
  constructor({token,fetchImpl=fetch,repository=DEFAULT_REPOSITORY}={}){
    // Never interpolate an arbitrary environment-provided URL into a request.
    if(!ALLOWED_REPOSITORIES.has(repository))throw new Error('Neplatný GitHub repozitář pro hlášení.');
    this.token=token||'';
    this.fetchImpl=fetchImpl;
    this.repository=repository;
  }
  get configured(){return this.token.length>=20;}
  async post(path,payload,apiVersion='2022-11-28'){
    let response;
    try{
      response=await this.fetchImpl(`https://api.github.com/repos/${this.repository}/${path}`,{
        method:'POST',
        headers:{
          Accept:'application/vnd.github+json',
          Authorization:`Bearer ${this.token}`,
          'Content-Type':'application/json',
          'X-GitHub-Api-Version':apiVersion,
          'User-Agent':'Arena-Feedback'
        },
        body:JSON.stringify(payload),
        signal:AbortSignal.timeout(apiVersion==='2026-03-10'?20000:8000)
      });
    }catch{throw new Error('GitHub teď neodpovídá. Zkus hlášení odeslat později.');}
    if(!response.ok){
      console.error('Arena GitHub feedback: HTTP',response.status);
      throw new Error('GitHub hlášení nepřijal. Zkus to prosím později.');
    }
    try{return await response.json();}
    catch{throw new Error('GitHub nepotvrdil uložení hlášení.');}
  }
  async create({description,mode,report=null}){
    if(!this.configured)throw new Error('Hlášení problémů ještě není na serveru zapnuté.');
    const title=`[Hlášení hráče] ${description.replace(/\s+/g,' ').slice(0,75)}`;
    // Keep the public document readable on GitHub, including on small screens.
    const history=report?JSON.stringify(publicGameHistory(report,mode),null,2):null;
    if(history&&Buffer.byteLength(history,'utf8')>MAX_HISTORY_ARTIFACT_BYTES)
      throw new Error('Historie partie je příliš dlouhá pro jednu přílohu. Odešli problém bez historie a popiš konkrétní tah.');
    const body=[
      '### Popis problému',
      `<pre>${escapeForHtmlPre(description)}</pre>`,
      `**Režim:** ${MODES[mode]}`,
      history?'**Historie partie:** požádáno o přiložení veřejného anonymizovaného dokumentu GitHubu. Obsahuje jen herní čísla, tahy a body, nikoli jména, chat či přihlašovací údaje. Příloha je v části Artifacts, pokud se její nahrání podařilo.':
        '**Historie partie:** nepřiložena',
      '',
      '_Hlášení bylo odesláno dobrovolně přímo ze hry Číselná aréna. Popis a případná anonymizovaná historie jsou veřejné._'
    ].join('\n\n');
    if(Buffer.byteLength(body,'utf8')>MAX_ISSUE_BODY_BYTES)
      throw new Error('Popis problému je pro GitHub příliš dlouhý.');
    const issue=await this.post('issues',{title,body});
    if(!Number.isInteger(issue.number)||
       issue.html_url!==`https://github.com/${this.repository}/issues/${issue.number}`)
      throw new Error('GitHub nepotvrdil vytvoření hlášení.');
    if(history){
      // The history is stored as exactly one GitHub Issue Artifact. Never
      // scatter it across comments or silently call an incomplete upload done.
      try{
        const artifact=await this.post(`issues/${issue.number}/artifacts`,{
          type:'generic',name:'Anonymizovaná historie partie',
          body:['### Veřejná anonymizovaná historie partie','```json',history,'```'].join('\n\n')
        },'2026-03-10');
        if(Number.isInteger(artifact.number)&&
           artifact.html_url===`${issue.html_url}/artifacts/${artifact.number}`)
          return {issueNumber:issue.number,issueUrl:issue.html_url,
            historyComplete:true,historyAttachment:'artifact'};
      }catch(error){
        console.error('Arena GitHub feedback: document attachment unavailable:',error.message);
      }
      return {issueNumber:issue.number,issueUrl:issue.html_url,
        historyComplete:false,historyAttachment:'missing'};
    }
    return {issueNumber:issue.number,issueUrl:issue.html_url,historyComplete:true};
  }
}
