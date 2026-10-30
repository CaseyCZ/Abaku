import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('all game settings headings follow the existing text-size option',()=>{
  const shared=read('../shared-game-settings.css');
  assert.match(shared,/\.game-settings-body h2\s*\{[^}]*font-size:calc\(23px \* var\(--arena-game-text-scale\)\)/);
  assert.match(shared,/\.game-settings-section h3\s*\{[^}]*font-size:calc\(15px \* var\(--arena-game-text-scale\)\)/);
  assert.match(shared,/\.game-settings-report-problem\s*\{[^}]*font-size:calc\(13px \* var\(--arena-game-text-scale\)\)/);
});

test('settings toggles are symmetric and expandable rows have touch targets',()=>{
  const shared=read('../shared-game-settings.css');
  assert.match(shared,/\.game-settings-toggles \.check-line:last-child:nth-child\(odd\)/);
  for(const selector of ['.game-settings-details summary','.version-history summary','.game-settings-report-problem']){
    const start=shared.indexOf(selector);
    assert.ok(start>=0,selector);
    assert.match(shared.slice(start,shared.indexOf('}',start)),/min-height:44px/,selector);
  }
  assert.match(shared,/summary::before\s*\{[^}]*content:"▸"/);
  assert.match(shared,/\[open\] summary::before\s*\{[^}]*content:"▾"/);
});

test('settings describe a new time limit as effective from the next turn',()=>{
  const local=read('../game.html');
  const home=read('../index.html');
  assert.match(local,/Změna délky tahu platí až od dalšího tahu/);
  assert.match(home,/Nový limit času platí až od dalšího tahu/);
});
