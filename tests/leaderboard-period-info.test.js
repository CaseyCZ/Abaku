import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('overall leaderboard hides the period explanation until week or month is selected',()=>{
  const page=read('../leaderboard.html');
  const logic=read('../src/leaderboard.js');
  assert.match(page,/data-leaderboard-period="all" aria-pressed="true"/);
  assert.match(page,/<p id="leaderboardPeriodInfo" class="leaderboard-period-info" hidden>/);
  assert.match(logic,/periodInfo\.hidden=period==='all'/);
});
