import { Link, createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useState } from 'react'
import { Turnstile } from '#/components/Turnstile'
import { createCreatorKey, manageCreatorKey } from '#/server/keys'
import { toy } from '#/lib/ui'

export const Route = createFileRoute('/make')({
  head: () => ({ meta: [{ title: 'Make a game · BitGames' }] }),
  component: MakePage,
})

const STEPS = [
  { emoji: '💡', title: 'Dream it up', text: 'Think of a game. A bunny that hops over carrots? A rocket that collects stars?' },
  { emoji: '🤖', title: 'Ask your AI helper', text: 'With a grown-up, tell your AI helper what you want. It builds the game for you.' },
  { emoji: '🎨', title: 'Try it and tweak it', text: 'Play your game, then ask for changes. Bigger! Faster! More sparkles!' },
  { emoji: '🎉', title: 'Share it', text: 'When it is ready, a grown-up can share it so everyone can play.' },
]

function MakePage() {
  return (
    <>
      <section className="mt-6 text-center">
        <span aria-hidden className="float inline-block text-8xl">🛠️</span>
        <h1 className="mt-2 text-4xl font-bold sm:text-5xl">Make your own game!</h1>
        <p className="mx-auto mt-3 max-w-xl text-xl text-ink-soft">
          You don't need to know how to code. You and your AI helper can build it together.
        </p>
      </section>
      <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, i) => (
          <li key={step.title} className="rounded-[28px] border-4 border-white bg-cloud p-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sun text-xl font-bold">
              {i + 1}
            </span>
            <span aria-hidden className="mt-3 block text-5xl">{step.emoji}</span>
            <h2 className="mt-2 text-2xl font-bold">{step.title}</h2>
            <p className="mt-1 text-lg text-ink-soft">{step.text}</p>
          </li>
        ))}
      </ol>
      <GrownUps />
      <div className="mt-10 text-center">
        <Link to="/" className="toy inline-block rounded-full px-8 py-4 text-2xl font-bold text-white">
          🎮 Play games for now
        </Link>
      </div>
    </>
  )
}

function GrownUps() {
  const create = useServerFn(createCreatorKey)
  const [grownUp, setGrownUp] = useState(false)
  const [credentials, setCredentials] = useState<{ key: string; recoveryCode: string } | null>(null)
  const key = credentials?.key
  const [client, setClient] = useState<'claude' | 'codex' | 'other'>('claude')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const command = key
    ? `claude mcp add --transport http bitgames ${origin}/mcp --header "Authorization: Bearer ${key}"`
    : ''

  return (
    <section className="mt-10 rounded-[28px] border-4 border-dashed border-ink-soft/30 bg-white/70 p-6 text-ink">
      <h2 className="text-2xl font-bold">👩‍💻 For grown-ups: connect an AI agent</h2>
      <p className="mt-2 text-lg text-ink-soft">
        BitGames has an MCP server. Connect Claude Code, Codex, or another local coding agent and it can build three.js games, and
        bring in 3D models from Blender if you also connect the{' '}
        <a className="underline" href="https://github.com/ahujasid/blender-mcp" target="_blank" rel="noreferrer">
          Blender MCP server
        </a>
        . Your agent builds and tests locally, then deploys to your Cloudflare account using Cloudflare's{' '}
        <code>cf</code> command. As soon as the agent ships a game, you get a link to play it and share it with your
        family. An adult reviewer then decides whether to list it in the store, so other families can find it too.
      </p>
      {key ? (
        <div className="mt-5 space-y-3">
          <p className="text-lg font-semibold">
            Here is your creator key. Copy it now, and save the recovery code separately. Keep both private: anyone who has the key
            can ship and change your games on BitGames.
          </p>
          <CopyBox label="Creator key" value={key} />
          <CopyBox label="Recovery code — save separately" value={credentials!.recoveryCode} />
          <p className="text-ink-soft">The recovery code restores access to the same games if you lose or revoke your key. A rotation replaces both credentials. If you lose both, this app cannot recover your games.</p>
          <label className="block font-semibold" htmlFor="agent-client">Your coding agent</label>
          <select id="agent-client" value={client} onChange={e => setClient(e.target.value as typeof client)} className="rounded-xl border-2 border-sky bg-white px-4 py-2">
            <option value="claude">Claude Code</option><option value="codex">Codex</option><option value="other">Other MCP client</option>
          </select>
          {client === 'claude' && <CopyBox label="Run in your game project folder" value={command} />}
          {client === 'codex' && <>
            <CopyBox label="Set the key in the terminal where you launch Codex (bash/zsh)" value={`export BITGAMES_CREATOR_KEY='${key}'`} />
            <CopyBox label="Add BitGames to Codex" value={`codex mcp add bitgames --url ${origin}/mcp --bearer-token-env-var BITGAMES_CREATOR_KEY`} />
            <details><summary className="cursor-pointer">Prefer a project configuration?</summary>
              <CopyBox label="Add to your trusted project’s .codex/config.toml" value={`[mcp_servers.bitgames]\nurl = "${origin}/mcp"\nbearer_token_env_var = "BITGAMES_CREATOR_KEY"`} />
            </details>
            <a href="https://developers.openai.com/codex/mcp" target="_blank" rel="noreferrer" className="underline">Codex MCP setup documentation</a>
          </>}
          {client === 'other' && <CopyBox label="Streamable HTTP MCP connection" value={JSON.stringify({ url: `${origin}/mcp`, headers: { Authorization: `Bearer ${key}` } }, null, 2)} />}
          <p className="text-ink-soft">Restart or reconnect your agent after configuring it. Ask it to read get_context, then build your game. It will need your one-time Cloudflare login with <code>npx cf auth login</code>.</p>
          <p className="text-ink-soft">
            Then ask your agent something like: “Make a BitGames game where a puppy collects bones. Model the puppy in
            Blender.”
          </p>
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-lg">
            <input
              type="checkbox"
              checked={grownUp}
              onChange={(e) => setGrownUp(e.target.checked)}
              className="h-6 w-6 accent-grape"
            />
            I'm a grown-up (18+)
          </label>
          <button
            type="button"
            disabled={!grownUp || !token || busy}
            onClick={async () => {
              if (!token) return
              setBusy(true)
              setError(null)
              try {
                setCredentials(await create({ data: { grownUp: true, turnstileToken: token } }))
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
                // A Turnstile token works once, so get a fresh one.
                setToken(null)
                setAttempt((n) => n + 1)
              } finally {
                setBusy(false)
              }
            }}
            className="toy rounded-full px-6 py-3 text-lg font-semibold text-white disabled:opacity-50"
          >
            🔑 Get a creator key
          </button>
          {grownUp && (
            <div className="w-full">
              <Turnstile action="creator-key" onToken={setToken} resetKey={attempt} />
            </div>
          )}
          {error && <p className="w-full text-lg text-berry">{error}</p>}
        </div>
      )}
      <KeyManagement onCredentials={setCredentials} />
    </section>
  )
}

function KeyManagement({ onCredentials }: { onCredentials: (value: { key: string; recoveryCode: string } | null) => void }) {
  const manage = useServerFn(manageCreatorKey)
  const [credential, setCredential] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  async function submit(action: 'rotate' | 'revoke') {
    if (!credential || busy) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await manage({ data: { credential, action } })
      if (result.revoked) { onCredentials(null); setMessage('Creator key revoked. Your games remain available. Use your saved recovery code here to restore access.') }
      else { onCredentials({ key: result.key, recoveryCode: result.recoveryCode }); setMessage('New credentials created for your existing games. Save them above and update your agent configuration.') }
      setCredential('')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update credentials.') }
    finally { setBusy(false) }
  }
  return <details className="mt-6 border-t-2 border-sky pt-4">
    <summary className="cursor-pointer text-lg font-semibold">Already have games? Recover, rotate or revoke your key</summary>
    <p className="my-3 text-ink-soft">Enter your current creator key or saved recovery code. Creating a new key keeps all your games and immediately invalidates the old key and recovery code. Revoking a key stops agent access; keep your recovery code.</p>
    <label htmlFor="management-credential" className="block font-semibold">Creator key or recovery code</label>
    <input id="management-credential" type="password" autoComplete="off" value={credential} onChange={e => setCredential(e.target.value)} className="my-2 w-full rounded-xl border-2 border-sky px-4 py-2" />
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={!credential || busy} onClick={() => void submit('rotate')} className="toy rounded-full px-5 py-2 font-semibold text-white disabled:opacity-50">Create replacement credentials</button>
      <button type="button" disabled={!credential || busy} onClick={() => { if (window.confirm('Revoke agent access? Your saved recovery code will still work.')) void submit('revoke') }} className="rounded-full border-2 border-berry px-5 py-2 font-semibold text-berry disabled:opacity-50">Revoke creator key</button>
    </div>
    {message && <p role="status" className="mt-3 text-ink-soft">{message}</p>}
  </details>
}

function CopyBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(false)
  useEffect(() => { setCopied(false); setError(false) }, [value])
  return (
    <div>
      <div className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-soft">{label}</div>
      <div className="flex items-stretch gap-2">
        <code className="block flex-1 overflow-x-auto whitespace-pre rounded-2xl bg-ink px-4 py-3 text-sm text-white">
          {value}
        </code>
        <button
          type="button"
          onClick={async () => {
            try { await navigator.clipboard.writeText(value); setCopied(true); setError(false) }
            catch { setError(true) }
          }}
          className="toy shrink-0 rounded-2xl px-4 font-semibold text-white"
          style={toy('var(--color-mint)')}
        >
          {copied ? '✅ Copied' : '📋 Copy'}
        </button>
      </div>
      {error && <p role="status" className="mt-1 text-sm text-berry">Copy was blocked. Select and copy the text above.</p>}
    </div>
  )
}
