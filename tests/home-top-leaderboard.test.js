import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {topThreePlayers} from '../src/home-top-leaderboard.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('top three match the complete all-time leaderboard ordering without inventing scores',()=>{
  const sample={period:'all',players:[
    {nickname:'První',played:10,wins:9,winRate:90},
    {nickname:'Druhý',played:8,wins:6,winRate:75},
    {nickname:'Třetí',played:3,wins:2,winRate:66.67},
    {nickname:'Čtvrtý',played:2,wins:1,winRate:50}
  ]};
  assert.deepEqual(topThreePlayers(sample).map(p=>[p.place,p.nickname,p.winRate]),[
    [1,'První',90],[2,'Druhý',75],[3,'Třetí',66.67]
  ]);
  assert.equal(topThreePlayers({period:'week',players:sample.players}),null);
  assert.deepEqual(topThreePlayers({period:'all',players:[]}),[]);
  assert.equal(topThreePlayers({players:null}),null);
});

test('home page includes all-time podium and retains access to full instructions',()=>{
  const page=read('../index.html');
  const script=read('../src/home-top-leaderboard.js');
  const css=read('../arena-home.css');
  assert.match(page,/id="homeTopPlayers"/);
  assert.match(page,/id="homeTopStatus"/);
  assert.match(page,/href="\.\/leaderboard\.html">Zobrazit celý žebříček/);
  assert.match(page,/href="\.\/how-to-play\.html" data-welcome-action="rules"/);
  assert.match(page,/href="\.\/how-to-play\.html" class="gold-button hero-primary"/);
  assert.doesNotMatch(page,/<a class="header-link" href="\.\/how-to-play\.html">Jak hrát<\/a>/);
  assert.match(script,/\/api\/leaderboard\?period=all/);
  assert.match(css,/\.home-top-players\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});
