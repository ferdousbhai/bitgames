# Bead Bridge

Finish a jewel bridge for the royal snail.

- Ages: 3–7
- Learning: AB, AAB and ABC sequences
- Activity: pattern

Look for the repeating rule. Tap the piece that fills the empty place.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/bead-bridge assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs bead-bridge` after installing workspace dependencies.
