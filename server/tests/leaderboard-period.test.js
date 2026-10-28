import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../store.js';

test('weekly/monthly results are stored separately without changing lifetime totals',()=>{
  const store=openStore(':memory:');
  try {
    const a='period-test:alpha',b='period-test:beta';
    store.ensure(a);
    store.ensure(b);
    store.rename(a,'PeriodAlpha');
    store.rename(b,'PeriodBeta');
    // Older lifetime records have no per-match timestamps.
    store.db.prepare('UPDATE players SET played=5,wins=3,losses=2 WHERE uid=?').run(a);
    assert.equal(store.leaderboard(30,'all').find(p=>p.nickname==='PeriodAlpha').played,5);
    assert.deepEqual(store.leaderboard(30,'week'),[]);
    assert.deepEqual(store.leaderboard(30,'month'),[]);
    store.record({ids:[a,b],winner:a,reason:'finished'});
    const weekly=store.leaderboard(30,'week');
    const monthly=store.leaderboard(30,'month');
    assert.equal(weekly.length,2);
    assert.equal(monthly.length,2);
    assert.deepEqual(weekly.map(p=>p.nickname),['PeriodAlpha','PeriodBeta']);
    assert.deepEqual(weekly.map(p=>p.played),[1,1]);
    assert.deepEqual(weekly.map(p=>p.wins),[1,0]);
    assert.equal(store.leaderboard(30,'all').find(p=>p.nickname==='PeriodAlpha').played,6);
    store.record({ids:[a,b],winner:null,reason:'draw'});
    assert.equal(store.leaderboard(30,'week').find(p=>p.nickname==='PeriodAlpha').draws,1);
    store.record({ids:[a,b],winner:a,reason:'abandoned'});
    assert.equal(store.leaderboard(30,'week').find(p=>p.nickname==='PeriodAlpha').played,2);
    assert.throws(()=>store.leaderboard(30,'invalid'),/Neplatné období/);
  } finally {
    store.close();
  }
});
