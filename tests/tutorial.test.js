import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

function node(){
  return {
    children:[],listeners:{},dataset:{},classList:{add(){}},
    replaceChildren(){this.children=[];},
    append(child){this.children.push(child);},
    setAttribute(){},
    addEventListener(event,handler){this.listeners[event]=handler;},
    click(){this.listeners.click?.();}
  };
}

test('guided opening scores 32 points consistently and can be restarted',()=>{
  const nodes=Object.fromEntries([
    'tutorialBoard','tutorialRack','tutorialCounter','tutorialPrompt',
    'tutorialInstruction','tutorialScore','tutorialMessage','tutorialReset'
  ].map(id=>[id,node()]));
  const document={getElementById:id=>nodes[id],createElement:node};
  new Script(read('../src/tutorial.js')).runInNewContext({document});

  for(const [i,position] of [11,12,13].entries()){
    nodes.tutorialRack.children[i].click();
    nodes.tutorialBoard.children[position].click();
  }
  assert.equal(nodes.tutorialCounter.textContent,'Tah dokončen');
  assert.match(nodes.tutorialInstruction.textContent,/Získal jsi 32 bodů/);
  assert.match(nodes.tutorialMessage.textContent,/na 32 bodů/);
  assert.equal(nodes.tutorialScore.hidden,false);

  nodes.tutorialReset.click();
  assert.equal(nodes.tutorialCounter.textContent,'Krok 1 ze 3');
  assert.equal(nodes.tutorialScore.hidden,true);
});

test('how-to-play honors the existing game text-size setting without duplicate privacy links',()=>{
  const page=read('../how-to-play.html');
  const css=read('../tutorial.css');
  assert.match(page,/game-text-size\.css\?v=/);
  assert.match(page,/src\/text-size\.js\?v=/);
  assert.match(css,/var\(--arena-game-text-scale\)/);
  assert.match(css,/text-align:center/);
  assert.equal((page.match(/href="\.\/privacy\.html"/g)||[]).length,1);
});
