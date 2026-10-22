import test from 'node:test';
import assert from 'node:assert/strict';
import {
  offlinePlayerName,savedOnlineToken,hasSavedOnlineLogin,
  cacheVerifiedOnlineProfile,clearVerifiedOnlineProfile
} from '../src/player-identity.js';

function fakeStorage(){
  const data=new Map();
  return {
    getItem:key=>data.has(key)?data.get(key):null,
    setItem:(key,value)=>data.set(key,String(value)),
    removeItem:key=>data.delete(key),
    clear:()=>data.clear()
  };
}
function isolatedStorage(fn){
  const oldLocal=globalThis.localStorage;
  const oldSession=globalThis.sessionStorage;
  globalThis.localStorage=fakeStorage();
  globalThis.sessionStorage=fakeStorage();
  try{fn();}
  finally{
    if(oldLocal===undefined)delete globalThis.localStorage;
    else globalThis.localStorage=oldLocal;
    if(oldSession===undefined)delete globalThis.sessionStorage;
    else globalThis.sessionStorage=oldSession;
  }
}
const appToken='abaku_'+('X'.repeat(43));

test('the first player name falls back to a local nickname or Hráč 1',()=>{
  isolatedStorage(()=>{
    assert.equal(offlinePlayerName(),'Hráč 1');
    localStorage.setItem('abaku-local-profile-v1',JSON.stringify({nickname:'Moje jméno'}));
    assert.equal(offlinePlayerName(),'Moje jméno');
    localStorage.setItem('abaku-local-profile-v1',JSON.stringify({nickname:'<script>alert(1)</script>'}));
    assert.equal(offlinePlayerName(),'Hráč 1');
  });
});

test('a verified Google nickname appears for Player 1 on PC and iPhone',()=>{
  isolatedStorage(()=>{
    localStorage.setItem('abaku-local-profile-v1',JSON.stringify({nickname:'Místní jméno'}));
    localStorage.setItem('abaku-online-device-session-v1',appToken);
    assert.equal(savedOnlineToken(),appToken);
    assert.equal(hasSavedOnlineLogin(),true);
    assert.equal(cacheVerifiedOnlineProfile({nickname:'CaseyCZ',avatar:'✦'}),true);
    assert.equal(offlinePlayerName(),'CaseyCZ');
    // Renaming an online profile immediately updates the local game label.
    cacheVerifiedOnlineProfile({nickname:'Šárka',avatar:'★'});
    assert.equal(offlinePlayerName(),'Šárka');
    clearVerifiedOnlineProfile();
    assert.equal(offlinePlayerName(),'Místní jméno');
    cacheVerifiedOnlineProfile({nickname:'CaseyCZ'});
    localStorage.removeItem('abaku-online-device-session-v1');
    assert.equal(hasSavedOnlineLogin(),false);
    assert.equal(offlinePlayerName(),'Místní jméno');
  });
});

test('legacy Google sign-ins still provide the cached game name in the same tab',()=>{
  isolatedStorage(()=>{
    sessionStorage.setItem('abaku-online-google-session-v1','t'.repeat(120));
    cacheVerifiedOnlineProfile({nickname:'Dedkyns'});
    assert.equal(offlinePlayerName(),'Dedkyns');
    sessionStorage.removeItem('abaku-online-google-session-v1');
    assert.equal(offlinePlayerName(),'Hráč 1');
  });
});
