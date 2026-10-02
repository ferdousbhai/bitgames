import { Link, createFileRoute } from '@tanstack/react-router'

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
      <section className="mt-10 rounded-[28px] border-4 border-dashed border-ink-soft/30 bg-white/60 p-6">
        <h2 className="text-xl font-bold">👩‍💻 For grown-ups</h2>
        <p className="mt-2 text-lg text-ink-soft">
          BitGames will have an MCP server. You'll connect your local AI agent to it, for example
          Claude Code, and the agent can then create, preview and publish three.js games. Models can
          come from Blender. Setup instructions will appear here when the server is live.
        </p>
      </section>
      <div className="mt-10 text-center">
        <Link to="/" className="toy inline-block rounded-full px-8 py-4 text-2xl font-bold text-white">
          🎮 Play games for now
        </Link>
      </div>
    </>
  )
}
