import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../store.js';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('profiles and statistics remain minimal',()=>{
  const store=openStore(':memory:');
  try {
    assert.equal(store.ensure('12345678901').played,0);
    store.ensure('12345678902');
    store.record({ids:['12345678901','12345678902'],winner:'12345678901',reason:'completed'});
    store.record({ids:['12345678901','12345678902'],winner:null,reason:'completed'});
    const profile=store.get('12345678901');
    assert.equal(profile.wins,1);
    assert.equal(profile.draws,1);
    assert.equal(profile.played,2);
    assert.equal(profile.winRate,50);
    assert.equal('uid' in profile,false,'Google sub must never appear in public profile');
    assert.equal(store.get('12345678902').losses,1);
    assert.equal(store.leaderboard()[0].nickname,profile.nickname);
  }finally{store.close();}
});
test('friend requests require recipient approval',()=>{
  const s=openStore(':memory:');
  try {
    s.ensure('playerA');s.ensure('playerB');
    assert.throws(()=>s.request('playerA',s.get('playerA').id),/sám/);
    s.request('playerA',s.get('playerB').id);
    assert.equal(s.incoming('playerB').length,1);
    assert.equal(s.friends('playerB').length,0);
    s.respond('playerB',s.get('playerA').id,true);
    assert.equal(s.friends('playerB').length,1);
    assert.equal(s.friends('playerA').length,1);
  }finally{s.close();}
});
test('nickname validation and uniqueness',()=>{
  const s=openStore(':memory:');
  try {
    s.ensure('first');s.ensure('second');
    s.rename('first','Lukas','★');
    assert.throws(()=>s.rename('second','Lukas','♟'),/obsazená/);
    assert.throws(()=>s.rename('first','<img src=x>','★'),/Přezdívka/);
  }finally{s.close();}
});


test('new Google sign-in gets a random revocable session; only hashes live in SQLite',()=>{
  const s=openStore(':memory:');
  try{
    s.ensure('google-user-A');
    const first=s.createSession('google-user-A');
    const second=s.createSession('google-user-A');
    assert.match(first.sessionToken,/^abaku_[A-Za-z0-9_-]{43}$/);
    assert.notEqual(first.sessionToken,second.sessionToken);
    assert.ok(first.expiresAt>Date.now()+29*86400_000);
    assert.equal(s.sessionUid(first.sessionToken),'google-user-A');
    assert.equal(s.sessionUid(second.sessionToken),'google-user-A');
    const dbRow=s.db.prepare('SELECT token_hash,uid FROM login_sessions LIMIT 1').get();
    assert.equal(dbRow.token_hash.length,64);
    assert.ok(!dbRow.token_hash.includes(first.sessionToken));
    assert.equal(dbRow.uid,'google-user-A');
    assert.equal(s.revokeSession(first.sessionToken),true);
    assert.equal(s.sessionUid(first.sessionToken),null);
    assert.equal(s.sessionUid(second.sessionToken),'google-user-A');
    assert.equal(s.revokeSession(first.sessionToken),false);
    assert.equal(s.sessionUid('abaku_'+('a'.repeat(43))),null);
  }finally{s.close();}
});

test('device session survives SQLite reopen and cannot be used after expiry',()=>{
  const dir=mkdtempSync(join(tmpdir(),'abaku-device-session-'));
  const filename=join(dir,'profiles.sqlite');
  try{
    let s=openStore(filename);
    const token=s.createSession('google-user-B').sessionToken;
    s.close();
    s=openStore(filename);
    try{
      assert.equal(s.sessionUid(token),'google-user-B');
      // Expired sessions cannot authenticate, even if browser kept a token.
      s.db.prepare('UPDATE login_sessions SET expires_at=?').run(Date.now()-1);
      assert.equal(s.sessionUid(token),null);
      const fresh=s.createSession('google-user-B');
      assert.equal(s.sessionUid(fresh.sessionToken),'google-user-B');
    }finally{s.close();}
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('active device session extends automatically and limits sessions per account',()=>{
  const s=openStore(':memory:');
  try{
    const first=s.createSession('google-user-C');
    const oldExpiry=first.expiresAt;
    s.db.prepare('UPDATE login_sessions SET expires_at=?').run(Date.now()+5*86400_000);
    assert.equal(s.sessionUid(first.sessionToken),'google-user-C');
    const renewed=s.db.prepare('SELECT expires_at FROM login_sessions').get().expires_at;
    assert.ok(renewed>=oldExpiry-2000);
    for(let i=0;i<13;i++)s.createSession('google-user-C');
    assert.ok(s.db.prepare('SELECT COUNT(*) AS count FROM login_sessions WHERE uid=?')
      .get('google-user-C').count<=10);
  }finally{s.close();}
});
