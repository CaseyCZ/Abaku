import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formatEquations} from '../src/rules.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('history shows compact parenthesized equations separated by commas',()=>{
  assert.equal(formatEquations(['426','339']), '(4+2=6), (3×3=9)');
  assert.equal(formatEquations(['426']), '(4+2=6)');
});

test('offline history stores original turn number and the actual added digits',()=>{
  const source=read('../src/main.js');
  const sidebar=source.slice(source.indexOf('function renderSidebar()'),source.indexOf('function renderMovePreview()'));
  assert.match(source,/game\.history\.push\(\{player:game\.turn,turnNumber:game\.turns\+1/);
  assert.match(source,/addedNumbers:placements\.slice\(\)\.sort\(\(a,b\)=>a\.row-b\.row\|\|a\.col-b\.col\)\.map\(p=>p\.digit\)/);
  assert.match(sidebar,/entry\.addedNumbers\.join\(','\)/);
  assert.match(sidebar,/entry\.turnNumber/);
  assert.match(sidebar,/entry\.points \+ 'b'/);
  assert.doesNotMatch(sidebar,/·/,'history must not contain bullet separators');
  assert.match(read('../style.css'),/\.move-history\{[^}]*list-style:none/);
});

test('online history uses public added digits and no bullet separators',()=>{
  const source=read('../src/online-client.js');
  const history=source.slice(source.indexOf("const history=$('onlineMoveHistory')"),source.indexOf('const ONLINE_BONUS_LABELS'));
  assert.match(history,/entry\.addedNumbers\.join\(','\)/);
  assert.match(history,/entry\.turnNumber/);
  assert.match(history,/entry\.points\+'b'/);
  assert.doesNotMatch(history,/·/);
  assert.match(read('../style.css'),/\.move-history\{[^}]*list-style:none/);
});
