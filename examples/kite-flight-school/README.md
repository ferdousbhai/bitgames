# Kite Flight School

Draw swooping sky trails for a rainbow kite.

- Ages: 3–6
- Learning: Hand-eye coordination
- Activity: trace

Start at the glowing dot. Hold and follow the trail, or tap each dot in order.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/kite-flight-school assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs kite-flight-school` after installing workspace dependencies.
