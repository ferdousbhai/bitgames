# Castle Block Blueprints

Raise little castle towers to match the royal plan.

- Ages: 4–8
- Learning: Height and spatial reasoning
- Activity: build

Tap the towers to add blocks. Match the heights in the blueprint, then Check.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/castle-block-blueprints assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs castle-block-blueprints` after installing workspace dependencies.
