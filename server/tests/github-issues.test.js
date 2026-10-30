import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyBoard,validateMove} from '../../src/rules.js';
import {GitHubIssueReporter,publicGameHistory,validateFeedback} from '../github-issues.js';

test('manual feedback accepts gameplay, menu, and layout messages',()=>{
  for(const mode of ['bot','local','online']){
    assert.equal(validateFeedback({description:'  Nejde otevřít nastavení. ',mode}).description,'Nejde otevřít nastavení.');
  }
  assert.throws(()=>validateFeedback({description:'abc',mode:'bot'}),/10 až 1500/);
  assert.throws(()=>validateFeedback({description:'Nejde kliknout',mode:'unknown'}),/režim/);
});

test('GitHub issue contains public description without separate report storage',async()=>{
  let sent;
  const reporter=new GitHubIssueReporter({token:'x'.repeat(30),fetchImpl:async(url,opts)=>{
    sent={url,opts};
    return {ok:true,json:async()=>({number:42,html_url:'https://github.com/CaseyCZ/Ciselna-Arena/issues/42'})};
  }});
  const result=await reporter.create({
    description:'Rozbilo se <menu> & zobrazení skóre.',mode:'local'
  });
  assert.equal(result.issueNumber,42);
  assert.equal(sent.url,'https://api.github.com/repos/CaseyCZ/Ciselna-Arena/issues');
  const payload=JSON.parse(sent.opts.body);
  assert.match(payload.body,/&lt;menu&gt; &amp;/);
  assert.match(payload.body,/Historie partie:\*\* nepřiložena/);
  assert.doesNotMatch(payload.body,/finalBoard|initialBoard|events|Authorization/);
  assert.equal(sent.opts.headers.Authorization,'Bearer '+'x'.repeat(30));
});

test('optional public game history contains only audited numeric game data',async()=>{
  const board=emptyBoard();
  const placements=[2,6,8].map((digit,i)=>({row:7,col:7+i,digit}));
  const move=validateMove(board,placements);
  assert.equal(move.valid,true);
  const report={mode:'bot',ruleset:'classic-powers-roots-linked-powers',partial:false,
    finished:true,initialBoard:board,initialScores:[0,0],
    events:[{type:'move',player:0,accepted:true,placements,points:move.points,
      equations:move.equations,breakdown:move.equationBreakdown,
      nickname:'NEVEREJNA_PREZDIVKA'}],finalBoard:move.board,finalScores:[move.points,0],
    uid:'SOUKROMY_UCET',chat:'SOUKROMY_CHAT',token:'SOUKROMY_TOKEN'};
  const sent=[];
  const issueUrl='https://github.com/CaseyCZ/Ciselna-Arena/issues/43';
  const reporter=new GitHubIssueReporter({token:'x'.repeat(30),fetchImpl:async(url,opts)=>{
    sent.push({url,payload:JSON.parse(opts.body),auth:opts.headers.Authorization});
    if(url.endsWith('/issues'))
      return {ok:true,json:async()=>({number:43,html_url:issueUrl})};
    if(url.endsWith('/artifacts'))return {ok:true,json:async()=>({
      number:1,html_url:`${issueUrl}/artifacts/1`
    })};
    throw new Error('Neočekávaný požadavek.');
  }});
  await reporter.create({description:'Nesprávně spočítaný tah.',mode:'bot',report});
  assert.equal(sent.length,2);
  assert.match(sent[0].payload.body,/části Artifacts/);
  assert.doesNotMatch(sent[0].payload.body,/"finalScores":/);
  assert.match(sent[1].payload.body,/"finalScores":/);
  for(const secret of ['NEVEREJNA_PREZDIVKA','SOUKROMY_UCET','SOUKROMY_CHAT','SOUKROMY_TOKEN'])
    assert.doesNotMatch(sent[1].payload.body,new RegExp(secret));
  assert.deepEqual(publicGameHistory(report,'bot').finalScores,[move.points,0]);
  assert.throws(()=>publicGameHistory(report,'online'),/režimu/);
  sent.length=0;
  const oversized={...report,events:Array.from({length:550},()=>({type:'move',player:0,
    accepted:true,placements,points:move.points,equations:move.equations,
    breakdown:move.equationBreakdown}))};
  const longResult=await reporter.create({description:'Nesprávně spočítaný tah.',mode:'bot',report:oversized});
  assert.equal(longResult.issueNumber,43);
  assert.equal(longResult.historyComplete,true);
  assert.equal(longResult.historyAttachment,'artifact');
  assert.equal(sent.length,2);
  assert.match(sent[0].payload.body,/části Artifacts/);
  assert.doesNotMatch(sent[0].payload.body,/"finalScores":/);
  assert.equal(sent[1].url,`https://api.github.com/repos/CaseyCZ/Ciselna-Arena/issues/43/artifacts`);
  assert.equal(sent[1].payload.type,'generic');
  assert.equal(sent[1].auth,'Bearer '+'x'.repeat(30));
  const rebuilt=JSON.parse(sent[1].payload.body.match(/```json\n\n([\s\S]*?)\n\n```/)[1]);
  assert.deepEqual(rebuilt,publicGameHistory(oversized,'bot'));
  for(const secret of ['NEVEREJNA_PREZDIVKA','SOUKROMY_UCET','SOUKROMY_CHAT','SOUKROMY_TOKEN'])
    assert.doesNotMatch(JSON.stringify(rebuilt),new RegExp(secret));
});

test('long history uses one GitHub document attachment when available',async()=>{
  const board=emptyBoard();
  const placements=[2,6,8].map((digit,i)=>({row:7,col:7+i,digit}));
  const move=validateMove(board,placements);
  const report={mode:'bot',ruleset:'classic-powers-roots-linked-powers',partial:false,
    finished:true,initialBoard:board,initialScores:[0,0],
    events:Array.from({length:550},()=>({type:'move',player:0,accepted:true,
      placements,points:move.points,equations:move.equations,breakdown:move.equationBreakdown})),
    finalBoard:move.board,finalScores:[move.points,0]};
  const issueUrl='https://github.com/CaseyCZ/Ciselna-Arena/issues/45';
  const calls=[];
  const reporter=new GitHubIssueReporter({token:'x'.repeat(30),fetchImpl:async(url,opts)=>{
    calls.push({url,body:JSON.parse(opts.body),version:opts.headers['X-GitHub-Api-Version']});
    if(url.endsWith('/issues'))return {ok:true,json:async()=>({number:45,html_url:issueUrl})};
    if(url.endsWith('/artifacts'))return {ok:true,json:async()=>({
      number:1,html_url:`${issueUrl}/artifacts/1`
    })};
    throw new Error('Nepotřebný komentář.');
  }});
  const result=await reporter.create({description:'Chybně spočítaný tah.',mode:'bot',report});
  assert.equal(result.historyAttachment,'artifact');
  assert.equal(result.historyComplete,true);
  assert.equal(calls.length,2);
  assert.equal(calls[1].version,'2026-03-10');
  assert.equal(calls[1].body.type,'generic');
  assert.equal(calls[1].body.name,'Anonymizovaná historie partie');
  assert.match(calls[1].body.body,/\n  "mode": "bot",\n/);
  assert.match(calls[1].body.body,/\n    \{\n      "type": "move",/);
  const attached=JSON.parse(calls[1].body.body.match(/```json\n\n([\s\S]*?)\n\n```/)[1]);
  assert.deepEqual(attached,publicGameHistory(report,'bot'));
});

test('rejected document attachment creates no comments and warns about the existing issue',async()=>{
  const board=emptyBoard();
  const placements=[2,6,8].map((digit,i)=>({row:7,col:7+i,digit}));
  const move=validateMove(board,placements);
  const report={mode:'bot',ruleset:'classic-powers-roots-linked-powers',partial:false,
    finished:true,initialBoard:board,initialScores:[0,0],
    events:Array.from({length:550},()=>({type:'move',player:0,accepted:true,
      placements,points:move.points,equations:move.equations,breakdown:move.equationBreakdown})),
    finalBoard:move.board,finalScores:[move.points,0]};
  const issueUrl='https://github.com/CaseyCZ/Ciselna-Arena/issues/44';
  let issuePosts=0,attachmentPosts=0,commentPosts=0;
  const reporter=new GitHubIssueReporter({token:'x'.repeat(30),fetchImpl:async(url)=>{
    if(url.endsWith('/issues')){
      issuePosts++;
      return {ok:true,json:async()=>({number:44,html_url:issueUrl})};
    }
    if(url.endsWith('/artifacts')){
      attachmentPosts++;
      return {ok:false,status:404};
    }
    commentPosts++;
    throw new Error('Komentář se nikdy nemá vytvářet.');
  }});
  const result=await reporter.create({description:'Chybně spočítaný tah.',mode:'bot',report});
  assert.equal(issuePosts,1);
  assert.equal(attachmentPosts,1);
  assert.equal(commentPosts,0);
  assert.equal(result.historyComplete,false);
  assert.equal(result.historyAttachment,'missing');
  assert.equal(result.issueUrl,issueUrl);
});

test('GitHub failures are reported, never described to the player as successful',async()=>{
  const disabled=new GitHubIssueReporter();
  await assert.rejects(disabled.create({description:'Nejde menu',mode:'bot'}),/není.*zapnuté/);
  const denied=new GitHubIssueReporter({token:'x'.repeat(30),fetchImpl:async()=>({ok:false,status:403})});
  await assert.rejects(denied.create({description:'Nejde menu',mode:'bot'}),/nepřijal/);
});

test('player problem button is in both settings and requires public-description consent',()=>{
  const page=path=>readFileSync(new URL(path,import.meta.url),'utf8');
  for(const html of [page('../../game.html'),page('../../index.html')]){
    assert.match(html,/Nahlásit problém/);
    assert.match(html,/id="feedbackDescription"[^>]+required/);
    assert.match(html,/id="feedbackAttach"/);
    assert.match(html,/id="feedbackConsent" required/);
    assert.match(html,/id="feedbackSubmit"/);
    assert.match(html,/Přiložit historii partie/);
    assert.doesNotMatch(html,/Prověřit partii|24 hodinách/);
  }
  const server=page('../index.js');
  assert.match(server,/pathname==='\/api\/feedback'/);
  assert.match(server,/historyPublicConsent!==true/);
  assert.doesNotMatch(server,/reportStore\.submit|pathname==='\/api\/reports'/);
});
