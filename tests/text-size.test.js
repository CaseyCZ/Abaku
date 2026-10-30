import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('both local and online games offer the same three text sizes',()=>{
  for(const page of ['../game.html','../index.html']){
    const html=read(page);
    assert.match(html,/game-text-size\.css\?v=/);
    for(const size of ['normal','large','largest'])
      assert.match(html,new RegExp(`<option value="${size}">`));
  }
  const local=read('../src/main.js');
  const online=read('../src/online-client.js');
  assert.match(local,/byId\('localTextSizeSetting'\)\.value=getTextSize\(\)/);
  assert.match(local,/setTextSize\(byId\('localTextSizeSetting'\)\.value\)/);
  assert.match(online,/\$\('onlineTextSizeSetting'\)\.value=getTextSize\(\)/);
  assert.match(online,/setTextSize\(\$\('onlineTextSizeSetting'\)\.value\)/);
});

test('changing text size persists locally, ignores unknown values and only scales UI text',async()=>{
  const oldDoc=globalThis.document;
  const oldStorage=globalThis.localStorage;
  const values=new Map();
  globalThis.document={documentElement:{dataset:{}}};
  globalThis.localStorage={
    getItem:key=>values.get(key)??null,
    setItem:(key,value)=>values.set(key,value)
  };
  try{
    const textSize=await import('../src/text-size.js?test=text-size');
    assert.equal(textSize.getTextSize(),'normal');
    assert.equal(document.documentElement.dataset.arenaTextSize,'normal');
    textSize.setTextSize('largest');
    assert.equal(textSize.getTextSize(),'largest');
    assert.equal(document.documentElement.dataset.arenaTextSize,'largest');
    textSize.setTextSize('invalid');
    assert.equal(textSize.getTextSize(),'normal');
    assert.equal(document.documentElement.dataset.arenaTextSize,'normal');
  } finally {
    if(oldDoc===undefined)delete globalThis.document;
    else globalThis.document=oldDoc;
    if(oldStorage===undefined)delete globalThis.localStorage;
    else globalThis.localStorage=oldStorage;
  }
  const css=read('../game-text-size.css');
  assert.match(css,/--arena-game-text-scale:1\.16/);
  assert.match(css,/--arena-game-text-scale:1\.32/);
  assert.match(css,/\.game-app \.move-history/);
  assert.match(css,/\.game-app \.game-controls \.gold-button/);
  assert.doesNotMatch(css,/\.board \.cell\s*\{/);
  assert.match(css,/font-size:max\(16px,/);
});
