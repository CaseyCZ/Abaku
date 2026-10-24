import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyBoard, validateMove} from '../src/rules.js';
import {describeMovePreview} from '../src/preview.js';

const move = (digits, row = 7, col = 6) =>
  [...digits].map((digit, i) => ({row, col:col+i, digit:Number(digit), rackIndex:i}));

test('score preview has no points for empty, partial and finished moves', () => {
  const board=emptyBoard();
  assert.deepEqual(describeMovePreview(board,[]).state, 'empty');
  const incomplete=describeMovePreview(board,move('27'));
  assert.equal(incomplete.state,'invalid');
  assert.equal(incomplete.points,null);
  assert.equal(describeMovePreview(board,move('279'),true).points,null);
});

test('score preview matches the actual committed score with board bonuses', () => {
  const board=emptyBoard(), placements=move('279');
  const preview=describeMovePreview(board,placements);
  const commit=validateMove(board,placements);
  assert.equal(preview.state,'valid');
  assert.equal(preview.points,commit.points);
  assert.equal(preview.detail,'2 + 7 = 9');
  assert.equal(board[7][7],null,'preview must not change the board');
});

test('live score changes and clears as tiles are placed and returned', () => {
  const board=emptyBoard();
  const full=move('279');
  assert.equal(describeMovePreview(board,full).state,'valid');
  assert.equal(describeMovePreview(board,full.slice(0,2)).state,'invalid');
  assert.equal(describeMovePreview(board,[]).points,null);
  const committed=validateMove(board,full);
  const extension=[{row:7,col:9,digit:3,rackIndex:0}];
  const next=describeMovePreview(committed.board,extension);
  assert.equal(next.state,'valid');
  assert.equal(next.points,validateMove(committed.board,extension).points);
});

test('tentative equations show readable operation, not concatenated digits',()=>{
  const board=emptyBoard();
  assert.equal(describeMovePreview(board,move('268')).detail,'2 + 6 = 8');
  assert.equal(describeMovePreview(board,move('236')).detail,'2 × 3 = 6');
  assert.equal(describeMovePreview(board,move('1243',7,5)).detail,'12 ÷ 4 = 3 · 2² = 4');
});

test('powers and roots appear correctly in the live score preview',()=>{
  const board=emptyBoard();
  const square=move('24',7,7);
  const root=move('42',7,7);
  const cubeRoot=move('273');
  for(const [placement,expected] of [[square,'2² = 4'],[root,'√4 = 2'],[cubeRoot,'∛27 = 3']]) {
    const preview=describeMovePreview(board,placement);
    const actual=validateMove(board,placement);
    assert.equal(preview.state,'valid',expected);
    assert.equal(preview.detail,expected);
    assert.equal(preview.points,actual.points);
  }
});
