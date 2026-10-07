import { useGamePreferences, updateGamePreference } from '#/lib/use-game-preferences'
import type { Game } from '#/lib/types'

export function GameActions({ game, compact = false }: { game: Game; compact?: boolean }) {
  const { favorites } = useGamePreferences()
  const favorite = favorites.includes(game.id)
  return (
    <div className="flex flex-wrap gap-2 text-ink">
      <button type="button" aria-label={`${favorite ? 'Remove' : 'Add'} ${game.title} ${favorite ? 'from' : 'to'} favorites`} aria-pressed={favorite}
        className="min-h-11 min-w-11 rounded-full border-2 border-white bg-cloud px-3 py-2 font-semibold shadow-sm"
        onClick={() => updateGamePreference(game.id, 'favorite')}>
        <span aria-hidden>{favorite ? '❤️' : '🤍'}</span>{!compact && (favorite ? ' Favorited' : ' Favorite')}
      </button>
      <button type="button" aria-label={`Hide ${game.title}`}
        className="min-h-11 min-w-11 rounded-full border-2 border-white bg-cloud px-3 py-2 font-semibold shadow-sm"
        onClick={() => updateGamePreference(game.id, 'hide')}>
        <span aria-hidden>🙈</span>{!compact && ' Hide game'}
      </button>
    </div>
  )
}
