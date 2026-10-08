// The owner approved these exact 89 retirements; no prefix-based deletion.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const root = new URL('../', import.meta.url);
assert.ok(process.argv.slice(2).every(arg => arg === '--execute'), 'Usage: node scripts/retire-generated-games.mjs [--execute]');
const reportFile = new URL('docs/audit/remote-retirement-2026-10-08.json', root);
// Preserve the completed before/after evidence on accidental reruns, before reading credentials.
const previous = existsSync(reportFile) ? JSON.parse(readFileSync(reportFile)) : null;
if (previous?.mode === 'completed' && previous.verified) {
  console.log('Retirement already completed and verified; original execution evidence preserved.');
  process.exit(0);
}
const manifest = JSON.parse(readFileSync(new URL('docs/audit/proposed-wipe-2026-10-08.json', root)));
assert.equal(manifest.localDirectoriesRemoved, 89);
assert.equal(manifest.requiresExactScopeConfirmation, false);
const targets = manifest.games;
const ids = targets.map(g => g.id);
const names = targets.map(g => g.worker);
assert.equal(new Set(ids).size, 89);
assert.equal(new Set(names).size, 89);
assert.ok(names.every((name, i) => name === `bitgames-${ids[i]}`));
assert.ok(manifest.protectedGameIds.every(id => !ids.includes(id)));
const token = process.env.CLOUDFLARE_API_TOKEN || JSON.parse(readFileSync(join(homedir(), '.config/cloudflare/config/default.json'))).oauth_token;
assert.ok(token, 'Cloudflare authentication required');
async function api(path, method = 'GET', body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok || data.success === false) throw new Error(`${method} ${path}: HTTP ${response.status}: ${JSON.stringify(data.errors)}`);
  return data;
}
const accounts = (await api('/accounts')).result;
assert.equal(accounts.length, 1, 'Select and verify the target account before handling multiple accounts');
const accountId = accounts[0].id;
const accountPath = `/accounts/${accountId}`;
const storeConfig = readFileSync(new URL('apps/store/cloudflare.config.ts', root), 'utf8');
const databaseId = /DB: bindings\.d1\(\{\s*id: "([a-f0-9-]+)"/.exec(storeConfig)?.[1];
assert.ok(databaseId, 'Expected store D1 binding');
const dbPath = `${accountPath}/d1/database/${databaseId}`;
const database = (await api(dbPath)).result;
assert.equal(database.name, 'bitgames');
async function query(sql, params = []) {
  const result = (await api(`${dbPath}/query`, 'POST', { sql, params })).result;
  assert.ok(result.every(r => r.success));
  return result.flatMap(r => r.results || []);
}
async function listWorkers() {
  const data = await api(`${accountPath}/workers/scripts`);
  if (data.result_info?.total_pages > 1) throw new Error('Worker inventory requires pagination');
  return data.result.map(w => w.id).sort();
}
const beforeWorkers = await listWorkers();
assert.ok(beforeWorkers.includes('bitgames-store'), 'Store Worker must belong to this account');
const protectedWorkers = manifest.protectedGameIds.map(id => `bitgames-${id}`);
assert.ok(protectedWorkers.every(name => beforeWorkers.includes(name)), 'All protected original Workers must exist');
const beforeGames = await query('SELECT id, creator_id, revision, live, live_url, live_version, play_version FROM games ORDER BY id');
const beforeVersions = await query('SELECT id, game_id, upstream_url, decision FROM game_versions ORDER BY id');
const tables = await query("SELECT name FROM sqlite_master WHERE type = 'table'");
const hasUploads = tables.some(t => t.name === 'uploads');
const beforeUploads = hasUploads ? await query('SELECT game_id, COUNT(*) AS count FROM uploads GROUP BY game_id') : [];
const versionKeys = await query('PRAGMA foreign_key_list(game_versions)');
assert.ok(versionKeys.some(k => k.table === 'games' && k.from === 'game_id' && k.on_delete === 'CASCADE'), 'Verify live version cascade before deleting games');
const selectedGames = beforeGames.filter(g => ids.includes(g.id));
assert.ok(selectedGames.every(g => g.creator_id === null), 'Refuse to purge a creator-owned row without further ownership inspection');
const workerSettings = [];
for (const name of names.filter(name => beforeWorkers.includes(name))) {
  const settings = (await api(`${accountPath}/workers/scripts/${name}/settings`)).result;
  const bindings = (settings.bindings || []).map(b => ({ name: b.name, type: b.type }));
  assert.ok(bindings.every(b => b.type === 'assets'), `${name} has non-asset bindings: inspect exclusive ownership before deletion`);
  workerSettings.push({ name, bindings });
}
const report = { date: new Date().toISOString(), accountId, databaseId, mode: 'inspected',
  approvedIds: ids, beforeWorkers, selectedWorkers: workerSettings, selectedGames,
  selectedVersions: beforeVersions.filter(v => ids.includes(v.game_id)),
  selectedUploads: beforeUploads.filter(v => ids.includes(v.game_id)),
  absentWorkersBefore: names.filter(name => !beforeWorkers.includes(name)), deletedWorkers: [],
  protectedWorkers, verified: false };
const save = () => writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
save();
console.log(JSON.stringify({ mode: report.mode, accountId, totalWorkers: beforeWorkers.length,
  targetedWorkers: workerSettings.length, absentTargets: report.absentWorkersBefore.length,
  targetedStoreGames: selectedGames.length, targetedVersions: report.selectedVersions.length,
  targetedUploads: report.selectedUploads.length }));
if (!process.argv.includes('--execute')) process.exit(0);
// Revision-bound deletions affect only approved first-party rows observed in this inspection.
for (const game of selectedGames) {
  if (hasUploads) await query('DELETE FROM uploads WHERE game_id = ? AND EXISTS (SELECT 1 FROM games WHERE id = ? AND creator_id IS NULL AND revision = ?)', [game.id, game.id, game.revision]);
  await query('DELETE FROM games WHERE id = ? AND creator_id IS NULL AND revision = ?', [game.id, game.revision]);
}
const afterGames = await query('SELECT id, creator_id, revision, live, live_url, live_version, play_version FROM games ORDER BY id');
const afterVersions = await query('SELECT id, game_id, upstream_url, decision FROM game_versions ORDER BY id');
const afterUploads = hasUploads ? await query('SELECT game_id, COUNT(*) AS count FROM uploads GROUP BY game_id') : [];
assert.ok(afterGames.every(g => !ids.includes(g.id)), 'Target game rows remain');
assert.ok(afterVersions.every(v => !ids.includes(v.game_id)), 'Target version rows remain');
assert.ok(afterUploads.every(v => !ids.includes(v.game_id)), 'Target upload rows remain');
assert.deepEqual(afterGames, beforeGames.filter(g => !ids.includes(g.id)), 'Unrelated game metadata changed');
assert.deepEqual(afterVersions, beforeVersions.filter(v => !ids.includes(v.game_id)), 'Unrelated version history changed');
report.storeRowsRemoved = selectedGames.length;
report.storeVersionsRemoved = report.selectedVersions.length;
report.storeVerified = true;
report.mode = 'executing';save();
for (const { name } of workerSettings) {
  await api(`${accountPath}/workers/scripts/${name}`, 'DELETE');
  report.deletedWorkers.push(name);save();
  console.log(`Deleted verified target: ${name}`);
}
const afterWorkers = await listWorkers();
assert.ok(names.every(name => !afterWorkers.includes(name)), 'Target Workers remain');
assert.deepEqual(afterWorkers, beforeWorkers.filter(name => !names.includes(name)), 'Unrelated Worker inventory changed');
report.afterWorkers = afterWorkers;
report.afterStoreGameIds = afterGames.map(g => g.id);
report.remainingTargetWorkers = [];
report.remainingTargetGameIds = [];
report.remainingTargetVersionIds = [];
report.verified = true;report.mode = 'completed';save();
console.log('Verified approved target Workers, store games, version history and uploads absent; unrelated resources preserved.');
