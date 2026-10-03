import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useState } from 'react'
import { GameFrame } from '#/components/GameFrame'
import { type AdminGame, listForAdmin, reviewGame } from '#/server/admin'
import { toy } from '#/lib/ui'

export const Route = createFileRoute('/admin')({
  head: () => ({ meta: [{ title: 'Review · BitGames' }, { name: 'robots', content: 'noindex' }] }),
  component: AdminPage,
})

const STORAGE_KEY = 'bitgames-admin-key'

function AdminPage() {
  const list = useServerFn(listForAdmin)
  const review = useServerFn(reviewGame)
  const [adminKey, setAdminKey] = useState('')
  const [games, setGames] = useState<AdminGame[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load(key = adminKey) {
    setError(null)
    try {
      setGames(await list({ data: { adminKey: key } }))
      try {
        sessionStorage.setItem(STORAGE_KEY, key)
      } catch {}
    } catch (e) {
      setGames(null)
      setError(e instanceof Error ? e.message : 'Could not load games.')
    }
  }

  useEffect(() => {
    let saved: string | null = null
    try {
      saved = sessionStorage.getItem(STORAGE_KEY)
    } catch {}
    if (saved) {
      setAdminKey(saved)
      void load(saved)
    }
  }, [])

  async function decide(game: AdminGame, decision: 'approve' | 'reject' | 'unpublish') {
    const note = decision === 'approve' ? undefined : (window.prompt('Note for the creator (what to fix):') ?? undefined)
    try {
      await review({ data: { adminKey, id: game.id, decision, note } })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    }
  }

  if (!games) {
    return (
      <form
        className="mx-auto mt-16 max-w-md space-y-4 rounded-[28px] border-4 border-white bg-cloud p-6"
        onSubmit={(e) => {
          e.preventDefault()
          void load()
        }}
      >
        <h1 className="text-2xl font-bold">🛡️ Game review</h1>
        <input
          type="password"
          value={adminKey}
          onChange={(e) => setAdminKey(e.target.value)}
          placeholder="Admin key"
          className="w-full rounded-2xl border-4 border-sky px-4 py-2 text-lg outline-none focus:border-sun"
        />
        <button className="toy rounded-full px-6 py-2 text-lg font-semibold text-white">Open</button>
        {error && <p className="text-berry">{error}</p>}
      </form>
    )
  }

  const waiting = games.filter((g) => g.status === 'review')
  const live = games.filter((g) => g.live)
  return (
    <div className="mt-6 space-y-10">
      {error && <p className="rounded-2xl bg-berry/15 px-4 py-2 text-berry">{error}</p>}
      <section>
        <h1 className="mb-1 text-3xl font-bold">🛡️ Waiting to be listed ({waiting.length})</h1>
        <p className="mb-4 text-ink-soft">
          These games already play at their creators' links. Approving lists them in the store so other families can
          find them. Your Claude Code agent can review them too: ask it to “review the submitted games”.
        </p>
        {waiting.length === 0 && <p className="text-lg text-ink-soft">Nothing to review. 🎉</p>}
        <div className="space-y-6">
          {waiting.map((game) => (
            <article key={game.id} className="rounded-[28px] border-4 border-white bg-cloud p-5">
              <GameHeader game={game} />
              <GameFrame
                gameId={game.id}
                title={game.title}
                src={game.review_url! + game.entry}
                className="mt-4 aspect-video w-full overflow-hidden rounded-2xl bg-ink"
              />
              <p className="mt-3 text-sm text-ink-soft">
                Before listing, check: gentle and happy, playable without reading, no losing that feels bad, no links, text input or
                data collection, licensed art credited.
              </p>
              <div className="mt-3 flex gap-3">
                <button
                  onClick={() => void decide(game, 'approve')}
                  className="toy rounded-full px-5 py-2 font-semibold text-white"
                  style={toy('var(--color-leaf)')}
                >
                  ✅ List in the store
                </button>
                <button
                  onClick={() => void decide(game, 'reject')}
                  className="toy rounded-full px-5 py-2 font-semibold text-white"
                  style={toy('var(--color-berry)')}
                >
                  ↩️ Don't list
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-4 text-2xl font-bold">🌍 In the store ({live.length})</h2>
        <ul className="divide-y-2 divide-white rounded-[28px] border-4 border-white bg-cloud">
          {live.map((game) => (
            <li key={game.id} className="flex items-center justify-between gap-4 p-4">
              <GameHeader game={game} />
              <button
                onClick={() => void decide(game, 'unpublish')}
                className="shrink-0 rounded-full border-2 border-berry px-4 py-1.5 font-semibold text-berry hover:bg-berry hover:text-white"
              >
                Take down
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function GameHeader({ game }: { game: AdminGame }) {
  return (
    <div>
      <h3 className="text-xl font-bold">
        {game.emoji} {game.title} <span className="text-sm font-normal text-ink-soft">({game.id} · {game.category})</span>
      </h3>
      <p className="text-ink-soft">{game.tagline}</p>
      <p className="text-sm text-ink-soft">How to play: {game.how_to_play}</p>
      {game.creator_id === null && <p className="text-sm text-ink-soft">Made by BitGames</p>}
      {game.status === 'review' && game.live ? (
        <p className="text-sm font-semibold text-tangerine">Update to a game that is already in the store.</p>
      ) : null}
      {game.pending_info && <p className="text-sm text-ink-soft">New details: {game.pending_info}</p>}
    </div>
  )
}
