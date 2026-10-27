import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {syncResumeCard} from '../src/resume-card.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const html=read('../index.html');
const localJs=read('../src/lobby.js');
const onlineJs=read('../src/online-client.js');

test('both continue choices are inside one hero card, not in the player sidebar',()=>{
  const at=html.indexOf('id="resumeCard"');
  const sectionEnd=html.indexOf('</section>',at);
  assert.ok(at>0&&sectionEnd>at);
  const hero=html.slice(at,sectionEnd);
  for(const id of ['savedCard','savedDescription','onlineResumeCard','onlineResumeDescription','onlineResumeButton'])
    assert.match(hero,new RegExp('id="'+id+'"'));
  assert.equal(html.match(/id="onlineResumeCard"/g)?.length,1);
  assert.equal(html.match(/id="savedCard"/g)?.length,1);
  assert.match(localJs,/syncResumeCard\(\)/);
  assert.match(onlineJs,/syncResumeCard\(\)/);
  assert.match(onlineJs,/api\('\/api\/match\/current'\)/);
  assert.match(onlineJs,/connectOnline\(\{type:'resume'\}\)/);
});

test('shared card stays hidden for neither and visible for either or both matches',()=>{
  const previous=globalThis.document;
  const nodes={resumeCard:{hidden:true},savedCard:{hidden:true},onlineResumeCard:{hidden:true}};
  globalThis.document={getElementById:id=>nodes[id]};
  try{
    for(const [local,online,expectedHidden] of [[false,false,true],[true,false,false],[false,true,false],[true,true,false]]){
      nodes.savedCard.hidden=!local;
      nodes.onlineResumeCard.hidden=!online;
      syncResumeCard();
      assert.equal(nodes.resumeCard.hidden,expectedHidden,'local='+local+', online='+online);
    }
    nodes.onlineResumeCard.hidden=true;
    syncResumeCard();
    assert.equal(nodes.resumeCard.hidden,false,'offline/error must not hide the local match');
  }finally{globalThis.document=previous;}
});
