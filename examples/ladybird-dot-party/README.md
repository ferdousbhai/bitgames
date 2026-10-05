# Ladybird Dot Party

Add dots to a ladybird’s ten little garden seats.

- Ages: 3–6
- Learning: Ten-frame counting
- Activity: tenframe

Tap the ten little spaces to fill the requested number. Press Check.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/ladybird-dot-party assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs ladybird-dot-party` after installing workspace dependencies.
