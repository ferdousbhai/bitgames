import { Link, createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { Turnstile } from '#/components/Turnstile'
import { createCreatorKey } from '#/server/keys'
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
  const [key, setKey] = useState<string | null>(null)
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
        BitGames has an MCP server. Connect a local agent such as Claude Code and it can build three.js games, and
        bring in 3D models from Blender if you also connect the{' '}
        <a className="underline" href="https://github.com/ahujasid/blender-mcp" target="_blank" rel="noreferrer">
          Blender MCP server
        </a>
        . Each game runs on your own free Cloudflare account (the agent deploys it there with Cloudflare's{' '}
        <code>cf</code> command), and BitGames lists it here. Every version stays private until an adult reviewer
        approves it for the store.
      </p>
      {key ? (
        <div className="mt-5 space-y-3">
          <p className="text-lg font-semibold">
            Here is your creator key. Copy it now, because it won't be shown again. Keep it private: anyone who has it
            can submit and change your games on BitGames.
          </p>
          <CopyBox label="Add BitGames to Claude Code" value={command} />
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
                setKey((await create({ data: { grownUp: true, turnstileToken: token } })).key)
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
    </section>
  )
}

function CopyBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
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
            await navigator.clipboard.writeText(value)
            setCopied(true)
          }}
          className="toy shrink-0 rounded-2xl px-4 font-semibold text-white"
          style={toy('var(--color-mint)')}
        >
          {copied ? '✅ Copied' : '📋 Copy'}
        </button>
      </div>
    </div>
  )
}
