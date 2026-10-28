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
  let sent;
  const reporter=new GitHubIssueReporter({token:'x'.repeat(30),fetchImpl:async(_url,opts)=>{
    sent=JSON.parse(opts.body);
    return {ok:true,json:async()=>({number:43,html_url:'https://github.com/CaseyCZ/Ciselna-Arena/issues/43'})};
  }});
  await reporter.create({description:'Nesprávně spočítaný tah.',mode:'bot',report});
  assert.match(sent.body,/Veřejně přiložená anonymizovaná historie/);
  assert.match(sent.body,/"finalScores":/);
  for(const secret of ['NEVEREJNA_PREZDIVKA','SOUKROMY_UCET','SOUKROMY_CHAT','SOUKROMY_TOKEN'])
    assert.doesNotMatch(sent.body,new RegExp(secret));
  assert.deepEqual(publicGameHistory(report,'bot').finalScores,[move.points,0]);
  assert.throws(()=>publicGameHistory(report,'online'),/režimu/);
  const oversized={...report,events:Array.from({length:550},()=>({type:'move',player:0,
    accepted:true,placements,points:move.points,equations:move.equations,
    breakdown:move.equationBreakdown}))};
  await assert.rejects(reporter.create({description:'Nesprávně spočítaný tah.',mode:'bot',report:oversized}),/příliš dlouhá/);
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
    assert.match(html,/anonymizovanou historii partie na GitHub \(veřejně\)/);
    assert.doesNotMatch(html,/Prověřit partii|24 hodinách/);
  }
  const server=page('../index.js');
  assert.match(server,/pathname==='\/api\/feedback'/);
  assert.match(server,/historyPublicConsent!==true/);
  assert.doesNotMatch(server,/reportStore\.submit|pathname==='\/api\/reports'/);
});
