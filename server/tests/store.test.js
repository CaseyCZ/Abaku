import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../store.js';

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
    assert.throws(()=>s.request('playerA','playerA'),/sám/);
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
