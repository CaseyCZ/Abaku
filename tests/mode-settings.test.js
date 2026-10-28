import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MatchEngine} from '../server/match-engine.js';
import {createGameAudio} from '../src/game-audio.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const local=read('../game.html'),online=read('../index.html');
const main=read('../src/main.js'),client=read('../src/online-client.js');
const ui=read('../src/arena-ui.js');

test('mode is chosen only on the home page; local game retains its own controls',()=>{
  assert.match(online,/data-mode="bot"/);
  assert.match(online,/data-mode="local"/);
  assert.doesNotMatch(local,/id="modeSetting"/);
  for(const id of ['difficultySetting','timeSetting','scoreRecapSecondsSetting','soundSetting'])
    assert.match(local,new RegExp('id="'+id+'"'));
  const localRecap=local.slice(local.indexOf('id="scoreRecapSecondsSetting"'));
  const options=[...localRecap.slice(0,localRecap.indexOf('</select>')).matchAll(/option value="(\d+)"/g)]
    .map(x=>Number(x[1]));
  assert.deepEqual(options,[0,2,3,5]);
  assert.match(main,/settings=\{\.\.\.settings,difficulty:/);
});

test('online hides duration selectors and enforces 60/3 independently of local settings',()=>{
  assert.doesNotMatch(online,/id="onlineTurnSeconds"|id="onlineRecapSeconds"/);
  assert.match(online,/Online partie mají pevně 60 sekund na tah a 3 sekundy/);
  assert.match(client,/const ONLINE_TURN_SECONDS=60/);
  assert.match(client,/const ONLINE_RECAP_SECONDS=3/);
  assert.match(client,/new ScoreRecap\(\$\('onlineDialog'\),\{seconds:\(\)=>ONLINE_RECAP_SECONDS\}\)/);
  const messages=[];
  const engine=new MatchEngine({send:(player,message)=>messages.push({player,...message})});
  engine.connect('a');engine.connect('b');
  engine.joinRandom('a',30);engine.joinRandom('b',90);
  assert.equal(engine.matchOf('a').seconds,60);
  assert.equal(engine.matchOf('a'),engine.matchOf('b'));
});

test('home settings explain both game modes, while in-match settings remain online-only',()=>{
  assert.match(online,/id="homeLocalTimeHelp" hidden/);
  assert.match(online,/Místní hra:<\/strong> Proti počítači nebo ve dvou/);
  assert.match(online,/id="homeLocalSettingsExplanation" hidden/);
  assert.match(online,/Herní obrazovka – online/);
  assert.match(online,/Přepínače v tomto okně platí jen pro tvoji online obrazovku/);
  assert.match(client,/\$\('homeLocalTimeHelp'\)\.hidden=!fromHome/);
  assert.match(client,/\$\('homeLocalSettingsExplanation'\)\.hidden=!fromHome/);
  assert.match(client,/lobbySettingsButton'\)\.addEventListener\('click',\(\)=>openSettings\(true\)\)/);
  assert.match(client,/onlineSettingsButton'\)\.addEventListener\('click',\(\)=>openSettings\(false\)\)/);
});

test('privacy links stay on the home page and in live game settings without duplicating home dialog links',()=>{
  assert.match(online,/<footer class="lobby-footer">[\s\S]*?href="\.\/privacy\.html"[\s\S]*?data-cookie-settings[\s\S]*?<\/footer>/);
  assert.match(online,/id="onlineSettingsPrivacy"/);
  assert.match(local,/class="game-settings-details game-settings-privacy"/);
  assert.match(client,/\$\('onlineSettingsPrivacy'\)\.hidden=fromHome/);
});

test('display preferences are independent, with legacy preference as fallback',()=>{
  assert.match(ui,/arena-local-panels-v1/);
  assert.match(ui,/arena-online-panels-v1/);
  assert.match(ui,/LEGACY_PANEL_KEY/);
  assert.match(ui,/localStorage\.setItem\(PANEL_KEY,JSON\.stringify\(savedPanels\)\)/);
  for(const page of [local,online]){
    for(const name of ['history','chat'])
      assert.match(page,new RegExp('data-arena-panel="'+name+'"'));
  }
  assert.match(online,/id="onlineSoundSetting"/);
  assert.match(client,/const ONLINE_SOUND_KEY='arena-online-sound-v1'/);
  assert.match(main,/const sound=createGameAudio\(\(\)=>settings\.sound\)/);
  assert.match(client,/const sound=createGameAudio\(\(\)=>onlineSoundEnabled\)/);
});

test('identical shared settings paragraphs and labels come from one copy table',()=>{
  const attr=/data-arena-settings-copy="([a-zA-Z]+)"/g;
  const localKeys=[...local.matchAll(attr)].map(x=>x[1]);
  const onlineKeys=[...online.matchAll(attr)].map(x=>x[1]);
  assert.deepEqual(localKeys,onlineKeys);
  for(const key of localKeys)assert.match(ui,new RegExp(key+':'));
  assert.match(ui,/node\.textContent=value/);
});

test('sound synthesis is shared but obeys each mode enablement',()=>{
  const oldWindow=globalThis.window;
  const frequencies=[];
  class FakeContext{
    currentTime=0;
    destination={};
    createOscillator(){return {frequency:{value:0},connect:()=>({connect:()=>{}}),start:()=>frequencies.push(1),stop:()=>{}};}
    createGain(){return {gain:{setValueAtTime:()=>{},exponentialRampToValueAtTime:()=>{}},connect:()=>({})};}
  }
  globalThis.window={AudioContext:FakeContext};
  try{
    let enabled=false;
    const play=createGameAudio(()=>enabled);
    play();assert.equal(frequencies.length,0);
    enabled=true;play('tap');play('success');play('error');
    assert.equal(frequencies.length,3);
  }finally{
    if(oldWindow===undefined)delete globalThis.window;
    else globalThis.window=oldWindow;
  }
});
