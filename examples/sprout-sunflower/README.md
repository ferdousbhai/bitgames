# Sprout to Sunflower

Help a seed tell the story of how it grows.

- Ages: 3–6
- Learning: Plant life cycle
- Activity: order

Tap the pictures in the order the story happens. Use Reset to start again.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/sprout-sunflower assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs sprout-sunflower` after installing workspace dependencies.
