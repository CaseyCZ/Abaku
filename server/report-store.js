import {randomUUID} from 'node:crypto';
import {chmod,mkdir,readdir,readFile,stat,unlink,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {auditReport} from './report-audit.js';

export const REPORT_TTL_MS=24*60*60*1000;
const ID_PATTERN=/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i;

export class ReportStore{
  constructor({directory,clock=()=>Date.now()}={}){
    if(!directory)throw new Error('Chybí soukromá složka pro kontrolu partií.');
    this.directory=directory;
    this.clock=clock;
  }
  async prepare(){await mkdir(this.directory,{recursive:true,mode:0o700});await chmod(this.directory,0o700);}
  async submit(report){
    const result=auditReport(report);
    await this.prepare();
    await this.cleanup();
    if((await readdir(this.directory)).filter(name=>name.endsWith('.json')).length>=500)
      throw new Error('Úložiště kontrol je dočasně plné. Zkus to později.');
    const id=randomUUID(),createdAt=this.clock();
    // Do not persist arbitrary client keys, account data or chat.
    const safe={mode:report.mode,ruleset:report.ruleset,partial:report.partial,
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
    const record={id,createdAt,expiresAt:createdAt+REPORT_TTL_MS,
      summary:{mode:safe.mode,checkedMoves:result.checkedMoves,events:result.events,
        issues:result.issues.length,ok:result.ok},result,report:safe};
    await writeFile(join(this.directory,id+'.json'),JSON.stringify(record),{encoding:'utf8',flag:'wx',mode:0o600});
    return {id,expiresAt:record.expiresAt,...record.summary};
  }
  async cleanup(){
    await this.prepare();
    let removed=0;
    for(const filename of await readdir(this.directory)){
      if(!ID_PATTERN.test(filename.replace(/\.json$/,''))||!filename.endsWith('.json'))continue;
      const path=join(this.directory,filename);
      try{if((await stat(path)).mtimeMs<=this.clock()-REPORT_TTL_MS){await unlink(path);removed++;}}
      catch(error){if(error.code!=='ENOENT')throw error;}
    }
    return removed;
  }
  async list(){
    await this.cleanup();
    const summaries=[];
    for(const filename of await readdir(this.directory)){
      if(!filename.endsWith('.json')||!ID_PATTERN.test(filename.slice(0,-5)))continue;
      const item=JSON.parse(await readFile(join(this.directory,filename),'utf8'));
      summaries.push({id:item.id,createdAt:item.createdAt,expiresAt:item.expiresAt,...item.summary});
    }
    return summaries.sort((a,b)=>b.createdAt-a.createdAt);
  }
  async get(id){
    if(typeof id!=='string'||!ID_PATTERN.test(id))throw new Error('Neplatné číslo kontroly.');
    await this.cleanup();
    try{return JSON.parse(await readFile(join(this.directory,id+'.json'),'utf8'));}
    catch(error){if(error.code==='ENOENT')return null;throw error;}
  }
}
