import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const js=read('../src/analytics.js');
const pages=['../index.html','../game.html','../privacy.html'];
const createEnv=(choice=null)=>{
  const storage=new Map(choice===null?[]:[['abaku-analytics-consent-v1',choice]]);
  const scripts=[],tags=[],page=[];
  function element(name){
    return {name,children:[],dataset:{},listeners:{},textContent:'',style:{},
      append(...parts){this.children.push(...parts);},
      addEventListener(event,fn){this.listeners[event]=fn;},
      setAttribute(){},
      remove(){this.removed=true}
    };
  }
  const doc={
    title:'Abaku | Test',
    readyState:'complete',
    querySelector(selector){
      if(selector==='meta[name="analytics-page-title"]')return {content:'Abaku — Herní deska'};
      if(selector==='script[data-abaku-analytics]')return tags.find(tag=>tag.dataset.abakuAnalytics);
      return null;
    },
    querySelectorAll(){return [];},
    createElement:element,
    head:{append(tag){tags.push(tag);if(tag.src)scripts.push(tag.src);}},
    body:{append(node){page.push(node);}}
  };
  const window={location:{origin:'https://caseycz.github.io',pathname:'/Abaku/game.html'}};
  const localStorage={
    getItem:key=>storage.get(key)??null,
    setItem:(key,value)=>storage.set(key,String(value))
  };
  runInNewContext(js,{document:doc,window,localStorage,Date,encodeURIComponent});
  return {window,storage,scripts,page};
};

test('all Abaku pages load the same consent-managed analytics, with distinct GA4 titles',()=>{
  const titles=[];
  for(const path of pages){
    const html=read(path);
    // Pages may use independent cache versions for the consent script.
    assert.match(html,/src="\.(?:\/)src\/analytics\.js\?v=\d+" defer/);
    assert.match(html,/href="\.(?:\/)analytics\.css\?v=1"/);
    assert.match(html,/data-cookie-settings/);
    assert.match(html,/href="\.\/privacy\.html"|id="privacyConsentTitle"|Soukromí a cookies/);
    const title=html.match(/<meta name="analytics-page-title" content="([^"]+)"/)?.[1];
    assert.ok(title);
    titles.push(title);
  }
  assert.equal(new Set(titles).size,3,'Each page should have its own distinct page title');
});

test('no analytics request happens before opt-in; acceptance loads GA4 exactly once',()=>{
  const env=createEnv();
  assert.equal(env.scripts.length,0);
  assert.equal(env.page.length,1,'Visitor can choose analytics consent');
  const banner=env.page[0];
  const actions=banner.children[1];
  const accept=actions.children.find(x=>x.textContent==='Přijmout analytiku');
  assert.ok(accept);
  accept.listeners.click();
  assert.equal(env.scripts.length,1);
  assert.equal(env.scripts[0],'https://www.googletagmanager.com/gtag/js?id=G-SZTERTRTCE');
  assert.equal(env.storage.get('abaku-analytics-consent-v1'),'granted');
  const config=[...env.window.dataLayer].find(args=>args[0]==='config');
  assert.equal(config[1],'G-SZTERTRTCE');
  assert.equal(config[2].page_title,'Abaku — Herní deska');
  assert.equal(config[2].page_location,'https://caseycz.github.io/Abaku/game.html');
  assert.equal(config[2].allow_google_signals,false);
  env.window.abakuAnalytics.showSettings();
  assert.equal(env.scripts.length,1,'Settings dialog must not send duplicate page views');
});

test('rejecting analytics never loads Google tags, and visitor can change choice later',()=>{
  const env=createEnv();
  const reject=env.page[0].children[1].children.find(x=>x.textContent==='Odmítnout');
  reject.listeners.click();
  assert.equal(env.scripts.length,0);
  assert.equal(env.storage.get('abaku-analytics-consent-v1'),'denied');
  assert.equal(createEnv('denied').scripts.length,0);
  const approved=createEnv('granted');
  assert.equal(approved.scripts.length,1);
});

test('cookie choice is specific to Abaku, never uses auth tokens or iOS Hub consent',()=>{
  assert.match(js,/const CONSENT_KEY = 'abaku-analytics-consent-v1'/);
  assert.doesNotMatch(js,/ioshub-analytics-consent-v1/);
  assert.doesNotMatch(js,/sessionStorage|googleCredential|idToken|\/api\/me/);
  assert.match(js,/ad_storage: 'denied'/);
  assert.match(js,/page_location: LOCATION/);
});
