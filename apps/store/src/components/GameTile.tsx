import { Link } from '@tanstack/react-router'
import type { Game } from '#/lib/types'
import { GameActions } from './GameActions'
import { enterFullscreen } from '#/lib/fullscreen'

/** Props for a link that starts a game at once, fullscreen (asked for inside the tap itself). */
export const playLink = (id: string) =>
  ({ to: '/game/$id', params: { id }, search: { play: true }, onClick: enterFullscreen }) as const

/**
 * A game's picture. One tap starts the game, like a video thumbnail: no second
 * Play button in between. `replace` swaps the game in place (used from inside
 * a game), so Back still leads out to where the child browsed from.
 */
export function GameTile({ game, replace }: { game: Game; replace?: boolean }) {
  return (
    <div className="relative">
      <Link
        {...playLink(game.id)}
        replace={replace}
        draggable={false}
        className="tile group relative flex aspect-square flex-col sm:aspect-[4/3] justify-between overflow-hidden rounded-[28px] border-4 border-white p-4 text-white shadow-[0_8px_0_rgba(43,45,66,0.12)]"
        style={{
          background: game.cover
            ? `linear-gradient(to top, rgba(43,45,66,0.75), transparent 55%), center / cover no-repeat url("${game.cover}"), ${game.color}`
            : `linear-gradient(145deg, ${game.color}, color-mix(in oklab, ${game.color} 70%, #2b2d42))`,
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/15"
        />
        <span aria-hidden className={`tile-emoji self-center drop-shadow-lg ${game.cover ? 'invisible' : ''} text-5xl sm:text-6xl`}>
          {game.emoji}
        </span>
        <span className="flex items-end justify-between gap-2">
          <span className="text-xl font-bold leading-tight drop-shadow">
            {game.title}
          </span>
          {game.together && (
            <span className="shrink-0 rounded-full bg-white/90 px-2 py-0.5 text-sm" title="Play together">
              👫
            </span>
          )}
        </span>
      </Link>
      <div className="absolute right-3 top-3"><GameActions game={game} compact /></div>
    </div>
  )
}
