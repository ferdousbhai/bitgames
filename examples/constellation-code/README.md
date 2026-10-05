# Constellation Code

Repair a star map by finding the missing number.

- Ages: 5–8
- Learning: Number sequences
- Activity: pattern

Look for the repeating rule. Tap the piece that fills the empty place.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/constellation-code assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs constellation-code` after installing workspace dependencies.
