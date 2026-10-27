import {createHash} from 'node:crypto';
import {chmod,mkdir,readdir,readFile,stat,unlink,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {auditReport} from './report-audit.js';

export const REPORT_TTL_MS=24*60*60*1000;
const ID_PATTERN=/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i;
function idFor(report){
  // Same anonymized board, events and scores => same private file for 24 hours.
  const hash=createHash('sha256').update(JSON.stringify(report)).digest('hex');
  const variant=((parseInt(hash[16],16)&3)|8).toString(16);
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-${variant}${hash.slice(17,20)}-${hash.slice(20,32)}`;
}
function confirmation(item){
  return {id:item.id,expiresAt:item.expiresAt,...item.summary};
}

export class ReportStore{
  constructor({directory,clock=()=>Date.now()}={}){
    if(!directory)throw new Error('Chybí soukromá složka pro kontrolu partií.');
    this.directory=directory;
    this.clock=clock;
    this.pending=new Map();
  }
  async prepare(){await mkdir(this.directory,{recursive:true,mode:0o700});await chmod(this.directory,0o700);}
  async submit(report){
    const result=auditReport(report);
    // Do not persist arbitrary client keys, account data or chat.
    const safe={mode:report.mode,ruleset:report.ruleset,partial:report.partial,
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
    const id=idFor(safe);
    if(this.pending.has(id))return this.pending.get(id);
    const pending=this.persist(id,safe,result);
    this.pending.set(id,pending);
    try{return await pending;}
    finally{this.pending.delete(id);}
  }
  async persist(id,safe,result){
    await this.prepare();
    await this.cleanup();
    const path=join(this.directory,id+'.json');
    try{return confirmation(JSON.parse(await readFile(path,'utf8')));}
    catch(error){if(error.code!=='ENOENT')throw error;}
    if((await readdir(this.directory)).filter(name=>name.endsWith('.json')).length>=500)
      throw new Error('Úložiště kontrol je dočasně plné. Zkus to později.');
    const createdAt=this.clock();
    const record={id,createdAt,expiresAt:createdAt+REPORT_TTL_MS,
      summary:{mode:safe.mode,checkedMoves:result.checkedMoves,events:result.events,
        issues:result.issues.length,ok:result.ok},result,report:safe};
    try{await writeFile(path,JSON.stringify(record),{encoding:'utf8',flag:'wx',mode:0o600});}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      // A simultaneous submission may still be finishing its first write.
      for(let attempt=0;attempt<5;attempt++){
        try{return confirmation(JSON.parse(await readFile(path,'utf8')));}
        catch(readError){if(attempt===4)throw readError;await new Promise(resolve=>setTimeout(resolve,25));}
      }
    }
    return confirmation(record);
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
