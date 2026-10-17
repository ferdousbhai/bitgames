import { type ReactNode, useEffect, useRef, useState } from 'react'
import { GameFrame } from '#/components/GameFrame'
import { exitFullscreen } from '#/lib/fullscreen'
import { toy } from '#/lib/ui'

/**
 * A game filling the whole screen, edge to edge. Hold the corner ✕ for 0.7s
 * with one pointer (shown by a filling ring), or activate it with the keyboard,
 * to open a "what next?" sheet: keep playing, stop, or tap
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

  const cornerRef = useRef<HTMLButtonElement>(null)
  const cornerAction = useRef(() => {})
  cornerAction.current = menuContent ? () => setMenu(true) : onStop
  const [holdProgress, setHoldProgress] = useState(0)

  useEffect(() => {
    const pointers = new Set<number>()
    let starter: number | null = null
    let spoiled = false
    let frame = 0
    const cancel = () => {
      starter = null
      cancelAnimationFrame(frame)
      setHoldProgress(0)
    }
    const down = (event: PointerEvent) => {
      pointers.add(event.pointerId)
      if (pointers.size !== 1) {
        spoiled = true
        cancel()
        return
      }
      if (spoiled || !cornerRef.current?.contains(event.target as Node) || event.button !== 0) return
      cancel()
      starter = event.pointerId
      const began = performance.now()
      const tick = (now: number) => {
        if (starter === null || spoiled) return
        const progress = Math.min(1, (now - began) / 700)
        setHoldProgress(progress)
        if (progress < 1) {
          frame = requestAnimationFrame(tick)
          return
        }
        // Keep the guard through the lift, even if opening the sheet unmounts us.
        const heldPointer = starter
        const swallow = (click: MouseEvent) => {
          click.preventDefault()
          click.stopImmediatePropagation()
          cleanup()
        }
        const lifted = (lift: PointerEvent) => {
          if (lift.pointerId !== heldPointer) return
          clearTimeout(expiry)
          expiry = window.setTimeout(cleanup, 500)
        }
        const cleanup = () => {
          clearTimeout(expiry)
          document.removeEventListener('click', swallow, true)
          document.removeEventListener('pointerup', lifted, true)
          document.removeEventListener('pointercancel', lifted, true)
        }
        let expiry = window.setTimeout(cleanup, 30_000)
        document.addEventListener('click', swallow, true)
        document.addEventListener('pointerup', lifted, true)
        document.addEventListener('pointercancel', lifted, true)
        cancel()
        cornerAction.current()
      }
      frame = requestAnimationFrame(tick)
    }
    const up = (event: PointerEvent) => {
      pointers.delete(event.pointerId)
      if (event.pointerId === starter) cancel()
      if (pointers.size === 0) spoiled = false
    }
    // Pressing the ✕ moves focus into the game's frame, which blurs this window
    // too; only a real loss of focus (another tab or app) ends the hold.
    let blurCheck = 0
    const blur = () => {
      clearTimeout(blurCheck)
      blurCheck = window.setTimeout(() => {
        if (document.hasFocus()) return
        cancel()
        pointers.clear()
        spoiled = false
      })
    }
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('pointerup', up, true)
    document.addEventListener('pointercancel', up, true)
    window.addEventListener('blur', blur)
    return () => {
      cancel()
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('pointerup', up, true)
      document.removeEventListener('pointercancel', up, true)
      window.removeEventListener('blur', blur)
      clearTimeout(blurCheck)
    }
  }, [gameId])

  const cornerLabel = menuContent ? 'Stop or pick another game' : 'Stop playing'
  const safeArea = 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'
  return (
    // Games can't see the screen's notch or home bar from inside their frame, so keep the frame clear of them here.
    <div className="fixed inset-0 z-50 h-dvh w-full bg-black" style={{ padding: safeArea }}>
      <GameFrame key={gameId} gameId={gameId} title={title} src={src} className="h-full w-full" />
      <button
        type="button"
        ref={cornerRef}
        onClick={(event) => {
          // Native keyboard/assistive activation has no pointer click count.
          if (event.detail === 0) cornerAction.current()
        }}
        onContextMenu={(event) => event.preventDefault()}
        className="absolute flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-2xl font-bold text-white backdrop-blur hover:bg-black/65"
        // Top right, clear of the notch; games keep this corner free for it (see the guide).
        style={{ top: 'max(10px, env(safe-area-inset-top))', right: 'max(10px, env(safe-area-inset-right))', touchAction: 'none', userSelect: 'none' }}
        aria-label={cornerLabel}
        title={cornerLabel}
      >
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 44 44">
          <circle cx="22" cy="22" r="20" fill="none" stroke="currentColor" strokeWidth="3" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - holdProgress} opacity={holdProgress > 0 ? 1 : 0} />
        </svg>
        <span aria-hidden="true">✕</span>
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
