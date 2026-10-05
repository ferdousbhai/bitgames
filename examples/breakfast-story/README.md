# Breakfast Story

Put a bear’s cosy morning in a sensible order.

- Ages: 3–6
- Learning: Everyday sequencing
- Activity: order

Tap the pictures in the order the story happens. Use Reset to start again.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/breakfast-story assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs breakfast-story` after installing workspace dependencies.
