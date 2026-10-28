#!/usr/bin/env node
/*
 * Číselná aréna / Abaku — controlled production WebSocket load test.
 *
 * PREPARE ONLY: this file does nothing to the server unless --execute is supplied.
 * Requires Node 24+ and a PRIVATE JSON file containing an array of distinct,
 * valid Abaku device-session tokens (one different Google account per client).
 * Never commit the token file or paste its contents into a support conversation.
 *
 * Examples (after explicit production approval):
 *   node abaku-production-loadtest.mjs --tokens-file /private/test-sessions.json --stages 2,10,25 --execute
 *   node abaku-production-loadtest.mjs --tokens-file /private/test-sessions.json --mode matches --stages 2 --execute
 *
 * The default `lobby` mode only connects authenticated players and sends `sync`.
 * The `matches` mode pairs test accounts, plays at most TWO passes per match,
 * disconnects BOTH players, and expects abandoned games without statistics.
 * A failure/disconnect may still cause a forfeit in production: use dedicated
 * test accounts, never real users' credentials.
 */

import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const EXPECTED_TARGET = 'https://130.61.49.108/abaku-api';
const WS_MESSAGE_INTERVAL_MS = 15_000;
const PROBE_INTERVAL_MS = 5_000;
const AUTH_TIMEOUT_MS = 9_000;
const MAX_CLIENTS = 1_000;

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Chybí hodnota --${name}`);
  return value;
}

const execute = process.argv.includes('--execute');
const mode = arg('mode', 'lobby');
const stages = arg('stages', '2,10,25').split(',').map(Number);
const rampSeconds = Number(arg('ramp-seconds', '10'));
const holdSeconds = Number(arg('hold-seconds', mode === 'matches' ? '20' : '45'));
const target = arg('target', EXPECTED_TARGET).replace(/\/$/, '');
const tokensFile = arg('tokens-file', '');

if (!['lobby', 'matches'].includes(mode)) throw new Error('Režim musí být lobby nebo matches.');
if (target !== EXPECTED_TARGET) throw new Error('Test dovoluje pouze přesný schválený produkční cíl.');
if (!stages.length || stages.some(n => !Number.isInteger(n) || n < 2 || n > MAX_CLIENTS))
  throw new Error('Počty hráčů musí být celá čísla 2–1000.');
if (stages.some((n, i) => i > 0 && n <= stages[i - 1]))
  throw new Error('Fáze musí být přísně rostoucí.');
if (!Number.isInteger(rampSeconds) || rampSeconds < 10 || rampSeconds > 120)
  throw new Error('Rozběh fáze musí být 10–120 sekund.');
if (!Number.isInteger(holdSeconds) || holdSeconds < 10 || holdSeconds > 120)
  throw new Error('Doba fáze musí být 10–120 sekund.');
if (mode === 'matches' && (stages.length !== 1 || stages[0] % 2 || rampSeconds > 20 || holdSeconds > 30))
  throw new Error('Test zápasů povoluje jednu sudou fázi, rozběh max. 20 s a výdrž max. 30 s.');

console.log(JSON.stringify({
  state: execute ? 'APPROVED_BY_CLI' : 'DRY_RUN_NO_TRAFFIC',
  target, mode, stages, rampSeconds, holdSeconds,
  protocol: 'authenticated WebSocket /ws, sync every 15 s',
  constraints: 'unique test identities; 1 socket/account; no unauthenticated load',
}, null, 2));

if (!execute) {
  console.log('Příprava hotova. Žádný požadavek na server nebyl odeslán.');
  process.exit(0);
}

if (!tokensFile) throw new Error('Před spuštěním je nutné --tokens-file se samostatnými testovacími účty.');
if (typeof WebSocket !== 'function') throw new Error('Je vyžadován Node.js 24+ s WebSocket klientem.');
const sessions = JSON.parse(readFileSync(tokensFile, 'utf8'));
if (!Array.isArray(sessions) || sessions.length < stages.at(-1))
  throw new Error('Soubor neobsahuje dost platných session tokenů.');
if (sessions.some(t => typeof t !== 'string' || !/^abaku_[A-Za-z0-9_-]{43}$/.test(t)))
  throw new Error('Soubor musí obsahovat pouze Abaku device-session tokeny.');
if (new Set(sessions).size !== sessions.length)
  throw new Error('Session tokeny se opakují; každý účet musí být unikátní.');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const wsUrl = `${target.replace(/^https:/, 'wss:')}/ws`;
let abortReason = '';
let socketErrors = 0;
let unexpectedClosures = 0;
let authFailures = 0;
const startedMatches = new Set();
let passEvents = 0;
let matchTrafficStarted = false;
let probes = 0;
let probeFailures = 0;
let consecutiveProbeFailures = 0;
const probeMs = [];
const authMs = [];
const clients = [];
const startedAt = Date.now();

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.ceil((p / 100) * sorted.length) - 1]);
}
function abort(reason) {
  if (!abortReason) {
    abortReason = reason;
    console.error(`STOP: ${reason}`);
  }
}
function send(client, message) {
  if (!client.authed || client.ws.readyState !== WebSocket.OPEN) return;
  client.ws.send(JSON.stringify(message));
}
function openClient(token, id) {
  return new Promise(resolve => {
    const client = {id, ws: null, authed: false, expectedClose: false, started: performance.now(),
      lastSync: 0, seenMatches: new Set(), sentPasses: new Set()};
    clients.push(client);
    let completed = false;
    const done = ok => { if (!completed) { completed = true; resolve(ok); } };
    let ws;
    try { ws = new WebSocket(wsUrl); }
    catch { socketErrors++; done(false); return; }
    client.ws = ws;
    const timeout = setTimeout(() => {
      if (!client.authed) {
        authFailures++;
        try { ws.close(); } catch {}
        done(false);
      }
    }, AUTH_TIMEOUT_MS);
    ws.addEventListener('open', () => {
      try { ws.send(JSON.stringify({type:'auth',idToken:token})); }
      catch { socketErrors++; done(false); }
    });
    ws.addEventListener('message', event => {
      let data;
      try { data = JSON.parse(event.data); }
      catch { socketErrors++; return; }
      if (data.type === 'authenticated') {
        clearTimeout(timeout);
        client.authed = true;
        authMs.push(performance.now() - client.started);
        done(true);
      } else if (data.type === 'error') {
        socketErrors++;
        if (!client.authed) { authFailures++; done(false); }
      } else if (data.type === 'match-start') {
        startedMatches.add(data.matchId);
      } else if (mode === 'matches' && data.type === 'match-state' && !matchTrafficStarted) {
        abort('Testovací účet má již rozehranou/starou partii. Zápasový test nelze bezpečně spustit.');
      } else if (mode === 'matches' && data.type === 'match-state' && !data.finished) {
        // Exactly two total accepted turns per match, then idle. Never trigger game completion intentionally.
        const key = `${data.matchId}:${data.turns}`;
        if (data.turns < 2 && data.mySide === data.turn && !client.sentPasses.has(key)) {
          client.sentPasses.add(key);
          setTimeout(() => send(client, {type:'pass'}), 150 + (id % 10) * 80);
        }
      } else if (data.type === 'turn-passed' && data.reason === 'pass') {
        passEvents++;
      }
    });
    ws.addEventListener('error', () => { socketErrors++; });
    ws.addEventListener('close', () => {
      clearTimeout(timeout);
      if (!client.expectedClose && client.authed) unexpectedClosures++;
      if (!client.authed) done(false);
    });
  });
}

function snapshot(stage) {
  const active = clients.filter(c => c.authed && c.ws?.readyState === WebSocket.OPEN).length;
  const result = {
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000), stage, active,
    authAttempts: clients.length, authFailures, socketErrors, unexpectedClosures,
    matchesStarted: startedMatches.size, passEvents, healthProbes: probes,
    healthFailures: probeFailures, authP95Ms: percentile(authMs, 95),
    healthP95Ms: percentile(probeMs, 95),
  };
  console.log(JSON.stringify(result));
  return result;
}

async function healthProbe() {
  const start = performance.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 3000);
  try {
    const response = await fetch(`${target}/health`, {signal:ac.signal, cache:'no-store'});
    probes++;
    const ms = performance.now() - start;
    probeMs.push(ms);
    if (!response.ok || ms > 2000) throw new Error(`Health ${response.status}, ${Math.round(ms)}ms`);
    consecutiveProbeFailures = 0;
  } catch {
    probeFailures++;
    consecutiveProbeFailures++;
    if (consecutiveProbeFailures >= 3) abort('Tři po sobě jdoucí neúspěšné/pomalé health kontroly.');
  } finally { clearTimeout(timer); }
}

async function cleanup() {
  // Close all accounts in one tick; abandoned matches do not update leaderboard.
  for (const client of clients) {
    client.expectedClose = true;
    try { client.ws?.close(1000, 'load test end'); } catch {}
  }
  await wait(1200);
  for (const client of clients) {
    if (client.ws?.readyState !== WebSocket.CLOSED) {
      try { client.ws?.close(); } catch {}
    }
  }
}

process.once('SIGINT', () => abort('Ruční zastavení SIGINT'));
process.once('SIGTERM', () => abort('Ruční zastavení SIGTERM'));

let probeTimer;
let syncTimer;
try {
  await healthProbe();
  if (abortReason) throw new Error(abortReason);
  probeTimer = setInterval(() => void healthProbe(), PROBE_INTERVAL_MS);
  syncTimer = setInterval(() => {
    if (mode === 'matches') return;
    for (const c of clients) if (c.authed && Date.now() - c.lastSync > WS_MESSAGE_INTERVAL_MS) {
      send(c, {type:'sync'});
      c.lastSync = Date.now();
    }
  }, 1000);

  for (const stage of stages) {
    if (abortReason) break;
    const startCount = clients.length;
    const increment = stage - startCount;
    const delay = Math.ceil(rampSeconds * 1000 / increment);
    console.log(`FÁZE: ${stage} účtů, náběh ${rampSeconds}s, výdrž ${holdSeconds}s`);
    for (let i = startCount; i < stage && !abortReason; i++) {
      // Do not wait for the connection to authenticate before beginning the next one.
      void openClient(sessions[i], i);
      await wait(delay);
    }
    await wait(1000);
    if (mode === 'matches') {
      if (abortReason) break;
      matchTrafficStarted = true;
      for (const c of clients) send(c, {type:'matchmake',seconds:60});
    }
    for (let elapsed = 0; elapsed < holdSeconds && !abortReason; elapsed++) {
      await wait(1000);
      if (elapsed % 10 === 0) {
        const sample = snapshot(stage);
        if (sample.authFailures > 0 || sample.unexpectedClosures > 0) {
          abort('Selhání autentizace nebo nečekané odpojení.');
        }
        if (stage >= 10 && sample.active / stage < 0.98) {
          abort('Méně než 98 % očekávaných klientů je připojeno.');
        }
      }
    }
    snapshot(stage);
  }
} catch (error) {
  abort(error?.message || 'Neznámá chyba');
} finally {
  clearInterval(probeTimer);
  clearInterval(syncTimer);
  await cleanup();
  snapshot('final');
  console.log(JSON.stringify({finished:true,aborted:Boolean(abortReason),reason:abortReason||null}));
  process.exitCode = abortReason ? 1 : 0;
}
