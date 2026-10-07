# Firefly Lanterns

Light a woodland lantern with just enough fireflies.

- Ages: 2–4
- Learning: One-to-one counting
- Activity: collect

Tap fireflies or carry them into the lantern. Tap Done when you have the right number.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/firefly-lanterns assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs firefly-lanterns` after installing workspace dependencies.
