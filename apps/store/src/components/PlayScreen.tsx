import { useEffect } from 'react'
import { GameFrame } from '#/components/GameFrame'

type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }
type FullscreenDocument = Document & { webkitExitFullscreen?: () => Promise<void> | void; webkitFullscreenElement?: Element | null }

/**
 * Asks the browser for real fullscreen. Must run inside the tap that starts the
 * game. Browsers without it (iPhone) still get the whole window from PlayScreen.
 */
export function enterFullscreen() {
  const root = document.documentElement as FullscreenElement
  try {
    const request = root.requestFullscreen?.bind(root) ?? root.webkitRequestFullscreen?.bind(root)
    void Promise.resolve(request?.({ navigationUI: 'hide' } as never)).catch(() => {})
  } catch {}
}

function exitFullscreen() {
  const doc = document as FullscreenDocument
  if (!(doc.fullscreenElement ?? doc.webkitFullscreenElement)) return
  try {
    void Promise.resolve((doc.exitFullscreen?.bind(doc) ?? doc.webkitExitFullscreen?.bind(doc))?.()).catch(() => {})
  } catch {}
}

/**
 * A game filling the whole screen, edge to edge, with a ✕ to leave. The page
 * behind it stops scrolling while it is open.
 */
export function PlayScreen({ gameId, title, src, onClose }: { gameId: string; title: string; src: string; onClose: () => void }) {
  useEffect(() => {
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
      exitFullscreen()
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 h-dvh w-full bg-black"
      // Games can't see the screen's notch or home bar from inside their frame, so keep the frame clear of them here.
      style={{
        padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
      }}
    >
      <GameFrame gameId={gameId} title={title} src={src} className="h-full w-full" />
      <button
        type="button"
        onClick={onClose}
        className="absolute rounded-full bg-black/45 px-3 py-1.5 text-xl font-bold text-white backdrop-blur hover:bg-black/65"
        // Top right, clear of the notch; games keep this corner free for it (see the guide).
        style={{ top: 'max(10px, env(safe-area-inset-top))', right: 'max(10px, env(safe-area-inset-right))' }}
        aria-label="Stop playing"
        title="Stop playing"
      >
        ✕
      </button>
    </div>
  )
}
