# Toy Town Builder

Build a miniature skyline from a block blueprint.

- Ages: 4–8
- Learning: Spatial construction from plans
- Activity: build

Tap the towers to add blocks. Match the heights in the blueprint, then Check.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/toy-town-builder assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs toy-town-builder` after installing workspace dependencies.
