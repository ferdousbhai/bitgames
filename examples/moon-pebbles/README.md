# Moon Pebbles

Gather moon gems for a friendly astronaut.

- Ages: 3–6
- Learning: Counting and stopping at a target
- Activity: collect

Tap moon gems or carry them to the rocket. Tap Done when you have the right number.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/moon-pebbles assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs moon-pebbles` after installing workspace dependencies.
