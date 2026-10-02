import { Link } from '@tanstack/react-router'
import type { Game } from '#/lib/types'

export function GameTile({ game, size = 'md' }: { game: Game; size?: 'md' | 'lg' }) {
  return (
    <Link
      to="/game/$id"
      params={{ id: game.id }}
      className="tile group relative flex aspect-square flex-col sm:aspect-[4/3] justify-between overflow-hidden rounded-[28px] border-4 border-white p-4 text-white shadow-[0_8px_0_rgba(43,45,66,0.12)]"
      style={{ background: `linear-gradient(145deg, ${game.color}, color-mix(in oklab, ${game.color} 70%, #2b2d42))` }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/15"
      />
      <span aria-hidden className={`tile-emoji self-center drop-shadow-lg ${size === 'lg' ? 'text-8xl' : 'text-5xl sm:text-6xl'}`}>
        {game.emoji}
      </span>
      <span className="flex items-end justify-between gap-2">
        <span className={`font-bold leading-tight drop-shadow ${size === 'lg' ? 'text-3xl' : 'text-xl'}`}>
          {game.title}
        </span>
        {game.together && (
          <span className="shrink-0 rounded-full bg-white/90 px-2 py-0.5 text-sm" title="Play together">
            👫
          </span>
        )}
      </span>
    </Link>
  )
}
