import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {APP_VERSION, RELEASE_HISTORY} from '../src/version-data.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const packageInfo=JSON.parse(read('../package.json'));
const pages=['../index.html','../game.html'].map(read);

test('lobby and offline game expose one shared current version and changelog',()=>{
  assert.equal(APP_VERSION,packageInfo.version);
  assert.equal(RELEASE_HISTORY[0].version,APP_VERSION);
  assert.ok(RELEASE_HISTORY.length>=3);
  assert.equal(new Set(RELEASE_HISTORY.map(item=>item.version)).size,RELEASE_HISTORY.length);
  for(const page of pages){
    assert.match(page,/<details class="version-history" data-version-history><summary>Historie změn<\/summary><\/details>/);
    assert.match(page,/version-history\.css\?v=0\.2\.3/);
    assert.match(page,/src\/version-ui\.js\?v=0\.2\.6/);
    assert.doesNotMatch(page,/<summary>Verze 0\.2\.[0-9]+/);
  }
});

test('shared renderer shows release dates and notes on both settings screens',()=>{
  const source=read('../src/version-ui.js');
  assert.match(source,/from '\.\/version-data\.js\?v=0\.2\.6'/);
  assert.doesNotMatch(source,/innerHTML|document\.write|localStorage/);
  function element(tag){
    return {tag,children:[],textContent:'',className:'',
      querySelector(name){return this.children.find(node=>node.tag===name)||null;},
      append(...nodes){this.children.push(...nodes);},
      appendChild(node){this.children.push(node);},
      replaceChildren(...nodes){this.children=nodes;}
    };
  }
  const details=[element('details'),element('details')];
  details.forEach(node=>node.children.push(element('summary')));
  const document={querySelectorAll:()=>details,createElement:element};
  const withoutImport=source.replace(/^import[^\n]+\n/,'');
  new Script(withoutImport).runInNewContext({document,APP_VERSION,RELEASE_HISTORY});
  for(const node of details){
    assert.equal(node.children[0].textContent,'Verze '+APP_VERSION+' · Historie změn');
    const notes=node.children[1];
    assert.equal(notes.tag,'ol');
    assert.equal(notes.children.length,RELEASE_HISTORY.length);
    assert.equal(notes.children[0].children[0].textContent,'0.2.6 · 27. 10. 2026');
    assert.equal(notes.children[0].children[1].textContent,RELEASE_HISTORY[0].description);
  }
});
