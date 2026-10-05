# Snail Spiral

Follow a glimmering spiral to the snail’s flower.

- Ages: 2–5
- Learning: Fine motor control and curves
- Activity: trace

Start at the glowing dot. Hold and follow the trail, or tap each dot in order.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/snail-spiral assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs snail-spiral` after installing workspace dependencies.
