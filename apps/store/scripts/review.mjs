#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'

const HELP = `BitGames review CLI — JSON output; uses BITGAMES_ADMIN_KEY from the environment.
BITGAMES_ORIGIN defaults to https://bitgames.store (use http://localhost:3030 locally).

From the repository root:
  node apps/store/scripts/review.mjs queue [--scope all|waiting|listed] [--offset N]
  node apps/store/scripts/review.mjs inspect GAME [--listed]
  node apps/store/scripts/review.mjs status GAME [--version VERSION]
  node apps/store/scripts/review.mjs file GAME PATH --version VERSION [--offset N]
  node apps/store/scripts/review.mjs approve GAME --submission SUBMISSION --revision REVISION
  node apps/store/scripts/review.mjs reject GAME --submission SUBMISSION --revision REVISION --note "What to fix"
  node apps/store/scripts/review.mjs take-down GAME --revision REVISION --note "Reason"

Use the exact submission and revision returned by inspect. Decisions are never retried automatically.
`

function operation(argv) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
    help: { type: 'boolean', short: 'h' }, listed: { type: 'boolean' },
    scope: { type: 'string' }, offset: { type: 'string' }, version: { type: 'string' },
    submission: { type: 'string' }, revision: { type: 'string' }, note: { type: 'string' },
  } })
  if (values.help || !positionals.length) return null
  const [action, gameId, path] = positionals
  const allowed = {
    queue: ['scope', 'offset'], inspect: ['listed'], status: ['version'], file: ['version', 'offset'],
    approve: ['submission', 'revision'], reject: ['submission', 'revision', 'note'], 'take-down': ['revision', 'note'],
  }[action]
  if (!allowed) throw new Error(`Unknown command: ${action}. Run with --help.`)
  const expected = action === 'queue' ? 1 : action === 'file' ? 3 : 2
  if (positionals.length !== expected) throw new Error(`Invalid arguments for ${action}. Run with --help.`)
  for (const key of Object.keys(values)) if (!allowed.includes(key)) throw new Error(`--${key} is not valid for ${action}.`)
  const required = name => {
    if (!values[name]?.trim()) throw new Error(`--${name} is required for ${action}.`)
    return values[name]
  }
  const offset = () => {
    if (values.offset !== undefined && !/^\d+$/.test(values.offset)) throw new Error('--offset must be a nonnegative integer.')
    const n = Number(values.offset ?? 0)
    if (!Number.isSafeInteger(n)) throw new Error('--offset is too large.')
    return n
  }
  switch (action) {
    case 'queue': return { action, scope: values.scope ?? 'all', offset: offset() }
    case 'inspect': return { action, gameId, target: values.listed ? 'listed' : 'submission' }
    case 'status': return { action, gameId, ...(values.version ? { versionId: values.version } : {}) }
    case 'file': return { action, gameId, path, versionId: required('version'), offset: offset() }
    case 'approve': return { action, gameId, submissionId: required('submission'), revision: required('revision') }
    case 'reject': return { action, gameId, submissionId: required('submission'), revision: required('revision'), note: required('note') }
    case 'take-down': return { action, gameId, revision: required('revision'), note: required('note') }
  }
}

/** Also used by integration tests with an in-process HTTP handler. */
export async function runReviewCli(argv, {
  env = process.env, fetch: request = globalThis.fetch,
  stdout = text => process.stdout.write(text), stderr = text => process.stderr.write(text),
} = {}) {
  try {
    const body = operation(argv)
    if (!body) { stdout(HELP); return 0 }
    const key = env.BITGAMES_ADMIN_KEY
    if (!key || !/^\S{1,200}$/.test(key)) throw new Error('Set BITGAMES_ADMIN_KEY to the store admin key before running the CLI.')
    const origin = new URL(env.BITGAMES_ORIGIN ?? 'https://bitgames.store')
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
    if ((origin.protocol !== 'https:' && !(origin.protocol === 'http:' && local)) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
      throw new Error('BITGAMES_ORIGIN must be an HTTPS origin, or an HTTP localhost origin for development.')
    }
    const response = await request(new URL('/api/review', origin), {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(120_000),
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    })
    let result
    try { result = await response.json() } catch { throw new Error(`Review API returned HTTP ${response.status} without JSON. Check BITGAMES_ORIGIN and deploy the review API.`) }
    if (!response.ok) {
      stderr(JSON.stringify({ status: response.status, ...result }) + '\n')
      return 1
    }
    stdout(JSON.stringify(result, null, 2) + '\n')
    return 0
  } catch (error) {
    // Network errors can contain request details; never echo an admin key.
    const message = error instanceof Error ? error.message : 'Review command failed.'
    const safe = env.BITGAMES_ADMIN_KEY ? message.replaceAll(env.BITGAMES_ADMIN_KEY, '[redacted]') : message
    stderr(JSON.stringify({ error: safe }) + '\n')
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await runReviewCli(process.argv.slice(2))
