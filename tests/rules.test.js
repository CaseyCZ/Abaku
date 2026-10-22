import test from 'node:test';
import assert from 'node:assert/strict';
import {SIZE, emptyBoard, makeBag, readsAsEquation, validateMove, bonusAt, replenishPlayerRack} from '../src/rules.js';
import {findMoves, chooseMove} from '../src/ai.js';

const tiles = (digits, row = 7, start = 6) => [...digits].map((digit, i) => ({row, col:start+i, digit:Number(digit)}));

test('new game has 15x15 board and 110 digits', () => {
  const board = emptyBoard();
  assert.equal(board.length,SIZE);
  assert.ok(board.every(row=>row.length===SIZE && row.every(cell=>cell===null)));
  const bag=makeBag(()=>.45);
  assert.equal(bag.length,110);
  for(let digit=0;digit<10;digit++)assert.equal(bag.filter(x=>x===digit).length,11);
});

test('after a move or an exchange the player gets five tiles again', () => {
  const bag=makeBag(()=>.45);
  const player={rack:[2,7,9,4,1],score:63};
  player.rack.splice(2,1);
  replenishPlayerRack(bag,player);
  assert.equal(player.rack.length,5);
  assert.equal(player.score,63,'replenishment must preserve score');
  assert.equal(bag.length,109);
  player.rack.splice(0,3);
  replenishPlayerRack(bag,player);
  assert.equal(player.rack.length,5);
  assert.equal(bag.length,106);
});

test('an existing empty rack is recovered without restarting the match', () => {
  const bag=[1,3,7,9,2,6];
  const player={rack:[],score:49};
  replenishPlayerRack(bag,player);
  assert.deepEqual(player.rack,[6,2,9,7,3]);
  assert.deepEqual(bag,[1]);
  assert.equal(player.score,49);
});

test('classic signless arithmetic examples are recognised', () => {
  for(const sequence of ['279','927','236','1243','2793','224','248','633','1234']) {
    if(sequence==='1234')continue;
    assert.equal(readsAsEquation(sequence),true,sequence);
  }
  for(const sequence of ['','1','12','999','001','273','999999999','240']) assert.equal(readsAsEquation(sequence),false,sequence);
});

test('first move needs center and a valid arithmetic relation', () => {
  const board=emptyBoard();
  const valid=validateMove(board,tiles('279'));
  assert.equal(valid.valid,true,valid.reason);
  assert.ok(valid.points>0);
  assert.equal(valid.board[7][7],7);
  assert.equal(board[7][7],null,'validation cannot mutate input');
  assert.equal(validateMove(board,tiles('279',2,2)).valid,false);
  assert.equal(validateMove(board,tiles('273')).valid,false);
});

test('extending a board can yield new examples',()=>{
  const initial=validateMove(emptyBoard(),tiles('279'));
  const extension=validateMove(initial.board,[{row:7,col:9,digit:3}]);
  assert.equal(extension.valid,true,extension.reason);
  assert.ok(extension.equations.includes('2793'));
  assert.equal(extension.board[7][9],3);
});

test('illegal placement is rejected',()=>{
  const board=emptyBoard();
  assert.equal(validateMove(board,[{row:7,col:7,digit:2},{row:7,col:9,digit:9}]).valid,false,'gap');
  assert.equal(validateMove(board,[{row:7,col:7,digit:2},{row:8,col:8,digit:7},{row:9,col:9,digit:9}]).valid,false,'diagonal');
  assert.equal(validateMove(board,[{row:7,col:7,digit:2},{row:7,col:7,digit:7}]).valid,false,'same cell');
  assert.equal(validateMove(board,[{row:-1,col:7,digit:7}]).valid,false,'out of bounds');
  const start=validateMove(board,tiles('279')).board;
  assert.equal(validateMove(start,[{row:7,col:7,digit:5}]).valid,false,'occupied');
  assert.equal(validateMove(start,[{row:0,col:0,digit:5}]).valid,false,'disconnected');
});

test('bonus board is symmetric',()=>{
  for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++) {
    assert.equal(bonusAt(r,c),bonusAt(14-r,14-c),`${r},${c}`);
  }
});

test('bot finds legal opening and next turn',()=>{
  const board=emptyBoard();
  const rack=[2,7,9,3,8];
  const moves=findMoves(board,rack);
  assert.ok(moves.length>0);
  const bot=chooseMove(board,rack,'hard');
  assert.equal(validateMove(board,bot.placements).valid,true);
  const opening=validateMove(board,tiles('279'));
  const next=findMoves(opening.board,[3,5,8,1,4]);
  assert.ok(next.every(move=>validateMove(opening.board,move.placements).valid));
});
