import test from 'node:test';
import assert from 'node:assert/strict';
import {isNewerVersion,canApplyUpdate} from '../src/app-update.js';

test('only a newer valid release triggers an update',()=>{
  assert.equal(isNewerVersion('0.2.49','0.2.48'),true);
  assert.equal(isNewerVersion('0.3.0','0.2.99'),true);
  assert.equal(isNewerVersion('0.2.48','0.2.48'),false);
  assert.equal(isNewerVersion('0.2.47','0.2.48'),false);
  assert.equal(isNewerVersion('invalid','0.2.48'),false);
  assert.equal(isNewerVersion('0.2.49-beta','0.2.48'),false);
  assert.equal(isNewerVersion(null,'0.2.48'),false);
});

test('updates wait for the lobby to be idle and visible',()=>{
  const ready={visible:true,dialogOpen:false,onlineMatch:false,editing:false};
  assert.equal(canApplyUpdate(ready),true);
  for(const key of ['dialogOpen','onlineMatch','editing']){
    assert.equal(canApplyUpdate({...ready,[key]:true}),false,key);
  }
  assert.equal(canApplyUpdate({...ready,visible:false}),false);
});
