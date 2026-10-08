import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { originalIds } from '../catalogue.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const run = (file, args, options = {}) => spawnSync(process.execPath, [join(root, file), ...args], { encoding: 'utf8', ...options });

test('asset CLI resolves every original builder outside the repository and stops on Blender failures', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bitgames-assets-'));
  const log = join(dir, 'calls.jsonl');
  const blender = join(dir, 'blender');
  writeFileSync(blender, `#!${process.execPath}
import { appendFileSync } from 'node:fs';
appendFileSync(process.env.ASSET_TEST_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');
process.exit(process.env.ASSET_TEST_FAIL ? 1 : 0);
`);
  chmodSync(blender, 0o755);
  const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, ASSET_TEST_LOG: log };
  try {
    const result = run('examples/_studio/assets.mjs', [...originalIds, 'crash-racers'], { cwd: dir, env });
    assert.equal(result.status, 0, result.stderr);
    const calls = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
    const scripts = calls.map(args => args.at(-1));
    assert.ok(scripts.some(path => path.endsWith('/crash-racers/blender/cars.py')));
    assert.ok(scripts.some(path => path.endsWith('/crash-racers/blender/props.py')));
    assert.ok(!scripts.some(path => path.endsWith('/crash-racers/blender/models.py')));
    for (const name of ['colour_kit.py', 'tablecloth.py', 'nest_blanket.py', 'mat_texture.py']) {
      assert.ok(scripts.some(path => basename(path) === name), `Missing auxiliary builder: ${name}`);
    }
    assert.equal(new Set(scripts).size, scripts.length, 'Duplicate game IDs must not cause duplicate rebuilds');
    for (const args of calls) assert.deepEqual(args.slice(0, -1), ['--background', '--threads', '8', '--python-exit-code', '1', '--python']);
    rmSync(log);
    for (const ids of [[], ['balloon-pop', '../store'], ['firefly-lanterns']]) {
      assert.notEqual(run('examples/_studio/assets.mjs', ids, { cwd: dir, env }).status, 0);
    }
    assert.throws(() => readFileSync(log), /ENOENT/, 'Invalid batch must not start Blender');
    assert.notEqual(run('examples/_studio/assets.mjs', ['crash-racers'], { env: { ...env, ASSET_TEST_FAIL: '1' } }).status, 0);
    assert.equal(readFileSync(log, 'utf8').trim().split('\n').length, 1, 'A failed builder must stop the batch');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('publishing rejects empty, retired and traversal IDs before any deploy', () => {
  for (const args of [[], ['firefly-lanterns'], ['balloon-pop', '../apps/store']]) {
    const result = run('examples/publish.mjs', args);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /no games were deployed/);
  }
});

test('browser CLI rejects invalid inputs and empty selections before launching a browser', () => {
  for (const args of [['--browser', 'other'], ['--limit', '0'], ['--offset', '-1'], ['--offset', '12'], ['--ids', ''], ['--ids', 'retired'], ['--run', '../outside'], ['--browser'], ['--unknown'], ['--limit', '1', '--limit', '2']]) {
    const result = run('examples/_studio/tests/browser.mjs', args);
    assert.notEqual(result.status, 0, args.join(' '));
    assert.doesNotMatch(result.stderr, /browserType\.launch/);
  }
});

test('completed retirement cannot overwrite its original evidence on rerun', () => {
  const evidence = join(root, 'docs/audit/remote-retirement-2026-10-08.json');
  const before = readFileSync(evidence);
  for (const args of [[], ['--execute']]) {
    const result = run('scripts/retire-generated-games.mjs', args, { env: { ...process.env, CLOUDFLARE_API_TOKEN: 'invalid-test-token' } });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /already completed/);
    assert.deepEqual(readFileSync(evidence), before);
  }
  assert.notEqual(run('scripts/retire-generated-games.mjs', ['--unexpected']).status, 0);
});
