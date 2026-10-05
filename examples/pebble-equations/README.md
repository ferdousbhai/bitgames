# Pebble Equations

Build equal pebble piles on a pond seesaw.

- Ages: 5–8
- Learning: Number decomposition
- Activity: balance

Choose weights for the empty pan until both sides are equal. Press Check.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/pebble-equations assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs pebble-equations` after installing workspace dependencies.
