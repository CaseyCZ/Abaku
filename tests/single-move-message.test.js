import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const game=read('../game.html');
const script=read('../src/main.js');
const css=read('../arena-modern.css');

test('one visible status row below the local board, no duplicated golden summary',()=>{
  const boardEnd=game.indexOf('</div>',game.indexOf('id="board"'));
  const mobileStatus=game.indexOf('id="mobileGameMessage"');
  assert.ok(boardEnd>0&&mobileStatus>boardEnd);
  assert.equal((game.match(/id="mobileGameMessage"/g)||[]).length,1);
  assert.doesNotMatch(game,/id="lastMoveReview"/);
  assert.doesNotMatch(script,/byId\('lastMoveReview'\)|renderRecentMove\(|recentMove\.label/);
  assert.match(script,/notify\(`\$\{who\}: \+\$\{checked\.points\} bodů/);
  assert.match(script,/mobileMessage\.textContent = message/);
  assert.match(game,/src\/main\.js\?v=0\.2\.34/);
});

test('score animation, three-second tile highlights and turn continuation are retained',()=>{
  assert.match(script,/scoreRecap\.play\(\{player:who,breakdown:checked\.equationBreakdown/);
  assert.match(script,/showRecentMove\(checked,placements,who,\(\)=>\{/);
  assert.match(script,/recentMoveTimer=setTimeout\(\(\)=>\{/);
  assert.match(script,/until:Date\.now\(\)\+3000/);
  assert.match(script,/renderBoard\(\);\s*recentMoveTimer=setTimeout/);
  assert.match(script,/cell\.classList\.add\('recent-equation'\)/);
  assert.match(script,/cell\.classList\.add\('recent-tile'\)/);
  assert.match(script,/render\(\);\s*onDone\(\);/);
  assert.match(css,/\.board \.cell\.recent-equation\.occupied/);
});
