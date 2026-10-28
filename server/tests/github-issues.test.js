import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GitHubIssueReporter,validateFeedback} from '../github-issues.js';

test('manual feedback accepts gameplay, menu, and layout messages',()=>{
  for(const mode of ['bot','local','online']){
    assert.equal(validateFeedback({description:'  Nejde otevřít nastavení. ',mode}).description,'Nejde otevřít nastavení.');
  }
  assert.throws(()=>validateFeedback({description:'abc',mode:'bot'}),/10 až 1500/);
  assert.throws(()=>validateFeedback({description:'Nejde kliknout',mode:'unknown'}),/režim/);
});

test('GitHub issue contains public description and only private game reference',async()=>{
  let sent;
  const reporter=new GitHubIssueReporter({token:'x'.repeat(30),fetchImpl:async(url,opts)=>{
    sent={url,opts};
    return {ok:true,json:async()=>({number:42,html_url:'https://github.com/CaseyCZ/Ciselna-Arena/issues/42'})};
  }});
  const result=await reporter.create({
    description:'Rozbilo se <menu> & zobrazení skóre.',mode:'local',
    reportId:'01234567-1111-4111-8111-111111111111'
  });
  assert.equal(result.issueNumber,42);
  assert.equal(sent.url,'https://api.github.com/repos/CaseyCZ/Ciselna-Arena/issues');
  const payload=JSON.parse(sent.opts.body);
  assert.match(payload.body,/&lt;menu&gt; &amp;/);
  assert.match(payload.body,/01234567-1111-4111-8111-111111111111/);
  assert.doesNotMatch(payload.body,/finalBoard|initialBoard|events|Authorization/);
  assert.equal(sent.opts.headers.Authorization,'Bearer '+'x'.repeat(30));
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
  }
  assert.match(page('../index.js'),/pathname==='\/api\/feedback'/);
});
