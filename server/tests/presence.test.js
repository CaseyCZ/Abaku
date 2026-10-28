import test from 'node:test';
import assert from 'node:assert/strict';
import {PresenceTracker} from '../presence.js';

test('online presence includes only authenticated players with fresh heartbeats',()=>{
  let now=1000;const presence=new PresenceTracker({clock:()=>now,ttlMs:70_000});
  presence.touch('google-a');presence.touch('google-a');presence.touch('google-b');
  assert.equal(presence.count(),2);
  now+=60_000;presence.touch('google-a');
  now+=11_000;
  assert.equal(presence.count(),1);
  assert.deepEqual([...presence.active()],['google-a']);
});

test('online presence merges live WebSocket sessions without double-counting',()=>{
  const presence=new PresenceTracker();
  presence.touch('a');presence.touch('b');
  assert.equal(presence.count(['b','c']),3);
  presence.remove('a');
  assert.equal(presence.count(['b']),1);
});

test('inactive users automatically expire without a database or background process',()=>{
  let now=0;const presence=new PresenceTracker({clock:()=>now,ttlMs:70_000});
  presence.touch('a');
  now=69_999;assert.equal(presence.count(),1);
  now=70_000;assert.equal(presence.count(),0);
});

test('capacity of 700 counts unique players, permits reconnects and releases expired slots',()=>{
  let now=1000;
  const presence=new PresenceTracker({clock:()=>now,ttlMs:70_000});
  for(let i=0;i<700;i++)presence.touch('player-'+i);
  assert.equal(presence.count(),700);
  assert.equal(presence.canAdmit('new-player'),false);
  assert.equal(presence.canAdmit('player-0'),true);
  assert.equal(presence.canAdmit('player-0',['player-0']),true);
  presence.remove('player-0');
  assert.equal(presence.canAdmit('new-player'),true);
  presence.touch('new-player');
  assert.equal(presence.count(),700);
  now+=70_000;
  assert.equal(presence.canAdmit('another-player'),true);
});

test('live WebSocket users occupy capacity even without a recent presence heartbeat',()=>{
  const presence=new PresenceTracker();
  const connected=new Set(Array.from({length:700},(_,i)=>'ws-'+i));
  assert.equal(presence.canAdmit('new-player',connected),false);
  assert.equal(presence.canAdmit('ws-42',connected),true);
  connected.delete('ws-42');
  assert.equal(presence.canAdmit('new-player',connected),true);
});
