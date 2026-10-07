import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { toy } from '#/lib/ui'

const LOGO_COLORS = ['#ff6b9d', '#ff9f1c', '#ffbe0b', '#8ac926', '#2ec4b6', '#6c63ff']

function Logo() {
  return (
    <span className="text-3xl font-bold tracking-tight sm:text-4xl" aria-label="BitGames">
      {'BitGames'.split('').map((letter, i) => (
        <span
          key={i}
          aria-hidden
          className="inline-block"
          style={{ color: LOGO_COLORS[i % LOGO_COLORS.length], transform: `rotate(${i % 2 ? 4 : -4}deg)` }}
        >
          {letter}
        </span>
      ))}
    </span>
  )
}

export function Header() {
  const navigate = useNavigate()
  const currentQuery = useRouterState({
    select: (s) => (s.location.pathname === '/search' ? String((s.location.search as { q?: string }).q ?? '') : ''),
  })
  const [query, setQuery] = useState(currentQuery)
  useEffect(() => setQuery(currentQuery), [currentQuery])

  return (
    <header className="sticky top-0 z-20 border-b-4 border-white/70 bg-sky/85 backdrop-blur" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:gap-5">
        <Link to="/" className="shrink-0 rounded-2xl">
          <Logo />
        </Link>
        <form
          role="search"
          className="order-last w-full sm:order-none sm:w-auto sm:flex-1"
          onSubmit={(e) => {
            e.preventDefault()
            void navigate({ to: '/search', search: { q: query.trim() } })
          }}
        >
          <label className="flex items-center gap-2 rounded-full border-4 border-white bg-cloud px-4 py-2 shadow-sm focus-within:border-sun">
            <span aria-hidden className="text-xl">🔍</span>
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                void navigate({ to: '/search', search: { q: e.target.value }, replace: true })
              }}
              placeholder="Find a game…"
              aria-label="Find a game"
              className="w-full bg-transparent text-lg outline-none placeholder:text-ink-soft/70"
            />
          </label>
        </form>
        <Link to="/favorites" className="shrink-0 rounded-full bg-cloud px-4 py-2.5 text-lg font-semibold">❤️ Favorites</Link>
        <Link
          to="/make"
          className="toy ml-auto shrink-0 rounded-full px-5 py-2.5 text-lg font-semibold text-white"
          style={toy('var(--color-berry)')}
        >
          🛠️ <span className="hidden sm:inline">Make a game</span><span className="sm:hidden">Make</span>
        </Link>
      </div>
    </header>
  )
}
