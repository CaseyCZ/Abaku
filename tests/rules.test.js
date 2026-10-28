import test from 'node:test';
import assert from 'node:assert/strict';
import {SIZE, emptyBoard, makeBag, readsAsEquation, validateMove, bonusAt, replenishPlayerRack, formatEquation, formatEquations} from '../src/rules.js';
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
  for(const sequence of ['279','927','236','1243','2793','224','248','633','24','42','273','749','8512','1255']) {
    assert.equal(readsAsEquation(sequence),true,sequence);
  }
  for(const sequence of ['','1','12','999','001','238','999999999','240']) assert.equal(readsAsEquation(sequence),false,sequence);
});

test('first move needs center and a valid arithmetic relation', () => {
  const board=emptyBoard();
  const valid=validateMove(board,tiles('279'));
  assert.equal(valid.valid,true,valid.reason);
  assert.ok(valid.points>0);
  assert.equal(valid.board[7][7],7);
  assert.equal(board[7][7],null,'validation cannot mutate input');
  assert.equal(validateMove(board,tiles('279',2,2)).valid,false);
  assert.equal(validateMove(board,tiles('238')).valid,false);
});

test('two-tile powers and roots can start a match and produce highlighted cells',()=>{
  for(const sequence of ['24','42']) {
    const placement=tiles(sequence,7,7);
    const result=validateMove(emptyBoard(),placement);
    assert.equal(result.valid,true,`${sequence}: ${result.reason}`);
    assert.deepEqual(result.equations,[sequence]);
    assert.deepEqual(result.equationCells,[{row:7,col:7},{row:7,col:8}]);
    assert.equal(result.equationBreakdown[0].equation,formatEquation(sequence));
    assert.ok(result.points>0);
  }
});

test('one placement can yield overlapping power, multiplication, and subtraction',()=>{
  const result=validateMove(emptyBoard(),tiles('1248',7,6));
  assert.equal(result.valid,true,result.reason);
  assert.ok(result.equations.includes('1248'),'12 − 4 = 8');
  assert.ok(result.equations.includes('248'),'2 × 4 = 8');
  assert.ok(result.equations.includes('24'),'2² = 4');
  assert.equal(result.equationBreakdown.reduce((sum,x)=>sum+x.points,0),result.points);
});

test('the entire unbroken line must be valid before overlapping examples count',()=>{
  for(const digits of ['9724','5327']){
    const result=validateMove(emptyBoard(),tiles(digits,7,6));
    assert.equal(result.valid,false,`${digits} must not pass using shorter equations`);
    assert.match(result.reason,/Celá souvislá řada/);
  }
  const valid=validateMove(emptyBoard(),tiles('1248',7,6));
  assert.equal(valid.valid,true);
  assert.deepEqual(valid.equations,['1248','24','248']);
});

test('extending a formerly valid line must leave the whole new line valid',()=>{
  const first=validateMove(emptyBoard(),tiles('532',7,6));
  assert.equal(first.valid,true);
  const wrong=validateMove(first.board,[{row:7,col:9,digit:7}]);
  assert.equal(wrong.valid,false,'5327 is invalid even though 532 and 327 work');
  const correct=validateMove(first.board,[{row:7,col:9,digit:1}]);
  assert.equal(correct.valid,false,'5321 has no full arithmetic meaning either');
});

test('a new calculation may start from the result at the end of an older calculation',()=>{
  const old=validateMove(emptyBoard(),tiles('5611',7,5));
  assert.equal(old.valid,true,old.reason);
  const linked=validateMove(old.board,[{row:7,col:9,digit:2},{row:7,col:10,digit:9}]);
  assert.equal(linked.valid,true,linked.reason);
  assert.ok(linked.equations.includes('1129'),'11 - 2 = 9 must score');
  assert.ok(linked.equations.includes('112'),'other new valid examples also score');
  assert.ok(!linked.equations.includes('5611'),'old example must not score again');
  assert.ok(!linked.equations.includes('561129'),'invalid concatenation is not scored');
  const another=validateMove(linked.board,[{row:7,col:11,digit:2},{row:7,col:12,digit:7}]);
  assert.equal(another.valid,true,another.reason);
  assert.ok(another.equations.includes('927'),'9 - 2 = 7 starts from the next result');
});

test('a power can link to an older result, but not rescue an invalid single-turn row',()=>{
  for(const digits of ['112','972']){
    const opening=validateMove(emptyBoard(),tiles(digits));
    assert.equal(opening.valid,true,opening.reason);
    const linked=validateMove(opening.board,[{row:7,col:9,digit:4}]);
    assert.equal(linked.valid,true,`${digits} + 4 in a later turn: ${linked.reason}`);
    assert.ok(linked.equations.includes('24'),'2² = 4 must count as the new example');
    assert.ok(!linked.equations.includes(digits),'the old example must not score again');
  }
  const rootOpening=validateMove(emptyBoard(),tiles('224'));
  const root=validateMove(rootOpening.board,[{row:7,col:9,digit:2}]);
  assert.equal(root.valid,true,root.reason);
  assert.ok(root.equations.includes('42'),'√4 = 2 may also link in a later turn');
  for(const digits of ['1124','9724']){
    const oneTurn=validateMove(emptyBoard(),tiles(digits));
    assert.equal(oneTurn.valid,false,`${digits} cannot be laid all at once`);
  }
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

test('bot can find a valid two-tile power opening',()=>{
  const board=emptyBoard();
  const moves=findMoves(board,[2,4]);
  assert.ok(moves.length>0);
  assert.ok(moves.some(move=>move.placements.length===2 && move.equations.includes('24')));
  assert.ok(moves.every(move=>validateMove(board,move.placements).valid));
});

test('recognized arithmetic examples are shown as readable complete equations',()=>{
  assert.equal(formatEquation('268'),'2 + 6 = 8');
  assert.equal(formatEquation('936'),'9 − 3 = 6');
  assert.equal(formatEquation('236'),'2 × 3 = 6');
  assert.equal(formatEquation('1243'),'12 ÷ 4 = 3');
  assert.equal(formatEquation('24'),'2² = 4');
  assert.equal(formatEquation('42'),'√4 = 2');
  assert.equal(formatEquation('749'),'7² = 49');
  assert.equal(formatEquation('8512'),'8³ = 512');
  assert.equal(formatEquation('273'),'∛27 = 3');
  assert.equal(formatEquation('1255'),'∛125 = 5');
  assert.equal(formatEquation('238'),null);
  assert.equal(formatEquation('09'),null);
  assert.equal(formatEquations(['268','936','1243']), '(2+6=8),(9−3=6),(12÷4=3)');
  assert.equal(formatEquations(['268']), '(2+6=8)');
});

test('a valid move returns all accepted equation squares without changing score',()=>{
  const board=emptyBoard();
  const placed=tiles('268');
  const result=validateMove(board,placed);
  assert.equal(result.valid,true,result.reason);
  assert.ok(result.equations.includes('268'));
  assert.deepEqual(result.equationCells,[{row:7,col:6},{row:7,col:7},{row:7,col:8}]);
  assert.ok(result.points>0);
  assert.equal(board[7][7],null);
});
