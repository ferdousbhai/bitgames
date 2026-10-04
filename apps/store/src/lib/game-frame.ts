/**
 * CSP on the embedding document controls the child's navigations, including
 * location changes initiated by the game. The child's own response CSP alone
 * cannot constrain navigation to another document. This wrapper also works in
 * browsers without support for the iframe csp attribute.
 */
export function gameFrameDocument(src: string, origin: string): string {
  const url = new URL(src, origin)
  if (url.origin !== origin || !/^\/game-assets\/[0-9a-f-]{36}\/index\.html$/.test(url.pathname)) throw new Error('Invalid game playback URL.')
  const base = new URL('.', url).href
  const attribute = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  return `<!doctype html><html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${attribute(base)}; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<style>html,body,iframe{margin:0;width:100%;height:100%;border:0;overflow:hidden}iframe{display:block}</style>
</head><body>
<iframe id="game" title="Game" src="${attribute(url.href)}" sandbox="allow-scripts allow-pointer-lock" allow="autoplay; gamepad *" referrerpolicy="no-referrer"></iframe>
<script>
const game = document.getElementById('game');
addEventListener('message', (event) => {
  if (event.source === game.contentWindow) parent.postMessage(event.data, '*');
  else if (event.source === parent) game.contentWindow.postMessage(event.data, '*');
});
game.addEventListener('load', () => game.focus());
</script></body></html>`
}
