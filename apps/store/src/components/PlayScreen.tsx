import { type ReactNode, useEffect, useState } from 'react'
import { GameFrame } from '#/components/GameFrame'
import { exitFullscreen } from '#/lib/fullscreen'
import { toy } from '#/lib/ui'

/**
 * A game filling the whole screen, edge to edge. The ✕ in the corner opens a
 * "what next?" sheet, like the end of a video: keep playing, stop, or tap
 * another game to switch straight to it. The page behind stops scrolling, and
 * the screen stays fullscreen from one game to the next. Without a menu
 * (a creator's preview) the ✕ just stops.
 */
export function PlayScreen({
  gameId,
  title,
  emoji,
  src,
  menu: menuContent,
  onStop,
}: {
  gameId: string
  title: string
  emoji?: string
  src: string
  /** What the "what next?" sheet offers below Keep playing and Stop. */
  menu?: ReactNode
  onStop: () => void
}) {
  // The sheet belongs to the game it was opened over, so it is put away when a new game starts.
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const menu = menuFor === gameId
  const setMenu = (open: boolean) => setMenuFor(open ? gameId : null)

  useEffect(() => {
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
      exitFullscreen()
    }
  }, [])

  useEffect(() => {
    if (!menu) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setMenu(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu])

  const cornerLabel = menuContent ? 'Stop or pick another game' : 'Stop playing'
  const safeArea = 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'
  return (
    // Games can't see the screen's notch or home bar from inside their frame, so keep the frame clear of them here.
    <div className="fixed inset-0 z-50 h-dvh w-full bg-black" style={{ padding: safeArea }}>
      <GameFrame key={gameId} gameId={gameId} title={title} src={src} className="h-full w-full" />
      <button
        type="button"
        onClick={menuContent ? () => setMenu(true) : onStop}
        className="absolute flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-2xl font-bold text-white backdrop-blur hover:bg-black/65"
        // Top right, clear of the notch; games keep this corner free for it (see the guide).
        style={{ top: 'max(10px, env(safe-area-inset-top))', right: 'max(10px, env(safe-area-inset-right))' }}
        aria-label={cornerLabel}
        title={cornerLabel}
      >
        ✕
      </button>
      {menu && menuContent && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="What next?"
          className="sheet absolute inset-0 z-30 overflow-y-auto overscroll-contain bg-ink/85 text-white backdrop-blur-md"
          style={{ padding: safeArea }}
        >
          <div className="mx-auto max-w-7xl px-4 pt-5 pb-8">
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <button
                type="button"
                autoFocus
                onClick={() => setMenu(false)}
                className="toy flex min-h-16 items-center gap-3 rounded-full px-6 py-3 text-2xl font-bold text-ink sm:text-3xl"
                style={toy('var(--color-sun)')}
              >
                ▶ Keep playing
                {emoji && <span aria-hidden className="text-3xl leading-none">{emoji}</span>}
              </button>
              <button
                type="button"
                onClick={onStop}
                className="toy flex min-h-16 items-center gap-2 rounded-full px-6 py-3 text-2xl font-bold text-white sm:text-3xl"
                style={toy('var(--color-berry)')}
              >
                ✕ Stop
              </button>
            </div>
            {menuContent}
          </div>
        </div>
      )}
    </div>
  )
}
