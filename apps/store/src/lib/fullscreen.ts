type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }
type FullscreenDocument = Document & { webkitExitFullscreen?: () => Promise<void> | void; webkitFullscreenElement?: Element | null }

function isFullscreen() {
  const doc = document as FullscreenDocument
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement)
}

/**
 * Asks the browser for real fullscreen. Must run inside the tap that starts the
 * game. Browsers without it (iPhone) still get the whole window from PlayScreen.
 */
export function enterFullscreen() {
  if (isFullscreen()) return
  const root = document.documentElement as FullscreenElement
  try {
    const request = root.requestFullscreen?.bind(root) ?? root.webkitRequestFullscreen?.bind(root)
    void Promise.resolve(request?.({ navigationUI: 'hide' } as never)).catch(() => {})
  } catch {}
}

export function exitFullscreen() {
  if (!isFullscreen()) return
  const doc = document as FullscreenDocument
  try {
    void Promise.resolve((doc.exitFullscreen?.bind(doc) ?? doc.webkitExitFullscreen?.bind(doc))?.()).catch(() => {})
  } catch {}
}
