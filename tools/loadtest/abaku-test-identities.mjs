#!/usr/bin/env node
/*
 * Číselná aréna — prepare and clean up short-lived test identities.
 *
 * Run ONLY from the checked-out Abaku project root on the Oracle host.
 * This tool imports the existing server/store.js rather than reimplementing
 * authentication or adding any public bypass to production.
 *
 * DRY RUN (no writes):
 *   node abaku-test-identities.mjs --action prepare --count 25 --db /path/to/abaku.sqlite
 *
 * PREPARE (database backup + 25 synthetic players + session tokens):
 *   node abaku-test-identities.mjs --action prepare --count 25 --db /path/to/abaku.sqlite --execute
 *
 * CLEANUP (only after all clients disconnected and matches abandoned):
 *   node abaku-test-identities.mjs --action cleanup --db /path/to/abaku.sqlite \
 *     --manifest /home/ubuntu/abaku-loadtest-private/RUN.manifest.json --execute
 *
 * Never paste generated bearer tokens in chat, shell commands or GitHub.
 */

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, statSync } from 'node:fs';
import { resolve, dirname, join, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { backup } from 'node:sqlite';

function option(name, fallback = '') {
  const pos = process.argv.indexOf('--' + name);
  if (pos < 0) return fallback;
  const value = process.argv[pos + 1];
  if (!value || value.startsWith('--')) throw new Error('Chybí hodnota --' + name);
  return value;
}
const action = option('action', 'prepare');
const count = Number(option('count', '25'));
const dbPath = option('db');
const privateDir = option('private-dir', '/home/ubuntu/abaku-loadtest-private');
const manifestPath = option('manifest');
const localApi = option('local-api', 'http://127.0.0.1:8790');
const execute = process.argv.includes('--execute');

if (!['prepare', 'cleanup'].includes(action)) throw new Error('Akce musí být prepare nebo cleanup.');
if (!isAbsolute(dbPath) || dbPath === '/' || !dbPath.endsWith('.sqlite'))
  throw new Error('Je potřeba absolutní cesta k existující produkční .sqlite databázi.');
if (!Number.isInteger(count) || count < 2 || count > 25)
  throw new Error('Příprava je omezena na 2–25 testovacích identit.');
if (!isAbsolute(privateDir) || privateDir === '/' || resolve(privateDir) === dirname(dbPath))
  throw new Error('Privátní adresář musí být mimo databázový adresář.');
if (resolve(privateDir).startsWith('/home/ubuntu/abaku-online'))
  throw new Error('Testovací tokeny nesmějí být v repozitáři.');

const modulePath = resolve('server/store.js');
console.log(JSON.stringify({
  action, mode: execute ? 'EXECUTE' : 'DRY_RUN_NO_CHANGES',
  count: action === 'prepare' ? count : undefined,
  dbPath, privateDir,
  safety: 'No network load, no production restart, no GitHub writes'
}, null, 2));
if (!execute) {
  console.log('Nebyla vytvořena žádná identita ani upravena databáze.');
  process.exit(0);
}
if (!existsSync(dbPath)) throw new Error('Databáze neexistuje. Nic nebylo změněno.');
if (!existsSync(modulePath)) throw new Error('Spusť z kořene repozitáře Abaku (chybí server/store.js).');

// Use the application store to make the session format exactly match prod.
const { openStore } = await import(pathToFileURL(modulePath).href);
const store = openStore(dbPath);

function ensurePrivateDirectory() {
  mkdirSync(privateDir, {recursive: true, mode: 0o700});
  const s = statSync(privateDir);
  if (!s.isDirectory() || (s.mode & 0o077) !== 0)
    throw new Error('Privátní adresář není bezpečný: vyžaduje práva 0700.');
}
function putSecret(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', {encoding:'utf8', mode:0o600, flag:'wx'});
  chmodSync(path, 0o600);
}
const idPrefix = 'abaku-loadtest:';
const namePrefix = 'LT-';

async function prepare() {
  ensurePrivateDirectory();
  const runId = Date.now().toString(36) + '-' + randomBytes(4).toString('hex');
  const backupPath = join(privateDir, runId + '.before.sqlite');
  const tokenPath = join(privateDir, runId + '.tokens.json');
  const outManifest = join(privateDir, runId + '.manifest.json');
  if ([backupPath, tokenPath, outManifest].some(existsSync))
    throw new Error('Kolize souborů; příprava zastavena.');
  // Node's SQLite backup API is safe with WAL while the application is running.
  await backup(store.db, backupPath);
  chmodSync(backupPath, 0o600);

  const identities = [], tokens = [];
  store.db.exec('BEGIN IMMEDIATE');
  try {
    for (let i = 0; i < count; i++) {
      const uid = idPrefix + runId + ':' + i;
      const nickname = namePrefix + runId.slice(-8) + '-' + String(i).padStart(2, '0');
      const profile = store.ensure(uid);
      store.rename(uid, nickname);
      const session = store.createSession(uid);
      identities.push({uid, publicId: profile.id, nickname});
      tokens.push(session.sessionToken);
    }
    const manifest = {schema:1, runId, dbPath, createdAt:new Date().toISOString(),
      backupPath, tokenPath, identities};
    putSecret(tokenPath, tokens);
    putSecret(outManifest, manifest);
    store.db.exec('COMMIT');
    console.log(JSON.stringify({created:identities.length, manifest:outManifest,
      tokens:tokenPath, backup:backupPath, note:'Do not publish or share these files.'}, null, 2));
  } catch (error) {
    try { store.db.exec('ROLLBACK'); } catch {}
    console.error('Příprava selhala. Zkontroluj soukromé soubory, mohou zůstat po rollbacku.');
    throw error;
  }
}

async function verifyNoActiveMatches(tokens) {
  const url = new URL(localApi);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.protocol !== 'http:')
    throw new Error('Kontrola aktivních zápasů musí používat pouze lokální HTTP API.');
  for (let i = 0; i < tokens.length; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(new URL('/api/match/current', url), {
        headers:{Authorization:'Bearer ' + tokens[i]}, signal:controller.signal
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data.match) throw new Error('Testovací účet #' + i + ' má aktivní partii.');
    } finally { clearTimeout(timer); }
  }
}

async function cleanup() {
  if (!isAbsolute(manifestPath) || !existsSync(manifestPath))
    throw new Error('Zadej úplnou cestu k existujícímu privátnímu manifestu.');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.schema !== 1 || manifest.dbPath !== dbPath ||
    !manifest.runId || !Array.isArray(manifest.identities) ||
    !manifest.identities.length || manifest.identities.length > 25)
    throw new Error('Manifest neodpovídá databázi nebo očekávanému formátu.');
  if (!resolve(manifestPath).startsWith(resolve(privateDir) + '/'))
    throw new Error('Manifest musí ležet v privátním adresáři.');
  const tokens = JSON.parse(readFileSync(manifest.tokenPath, 'utf8'));
  if (!Array.isArray(tokens) || tokens.length !== manifest.identities.length)
    throw new Error('Tokeny pro kontrolu aktivních partií chybí.');

  // Never delete an account still referenced by a live match: the game could
  // recreate it when recording a delayed forfeit.
  await verifyNoActiveMatches(tokens);
  const lookup = store.db.prepare('SELECT public_id, nickname FROM players WHERE uid=?');
  const remove = store.db.prepare('DELETE FROM players WHERE uid=? AND public_id=? AND nickname=?');
  store.db.exec('BEGIN IMMEDIATE');
  try {
    for (const account of manifest.identities) {
      if (!account.uid.startsWith(idPrefix + manifest.runId + ':') ||
        !account.nickname.startsWith(namePrefix))
        throw new Error('Neočekávaný účet; cleanup zastaven.');
      const row = lookup.get(account.uid);
      if (!row || row.public_id !== account.publicId || row.nickname !== account.nickname)
        throw new Error('Testovací účet se změnil; cleanup zastaven.');
      if (remove.run(account.uid, account.publicId, account.nickname).changes !== 1)
        throw new Error('Smazání nemělo přesně jeden záznam.');
    }
    store.db.exec('COMMIT');
    console.log(JSON.stringify({removedTestAccounts:manifest.identities.length,
      manifest:manifestPath,
      note:'Private token/manifest/backup files remain for manual retention handling.'}, null, 2));
  } catch (error) {
    try { store.db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

try {
  if (action === 'prepare') await prepare();
  else await cleanup();
} finally {
  store.close();
}
