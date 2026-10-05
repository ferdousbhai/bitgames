# Bear Balance

Balance a bear’s seesaw with numbered acorns.

- Ages: 4–7
- Learning: Equality and weights
- Activity: balance

Choose weights for the empty pan until both sides are equal. Press Check.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/bear-balance assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs bear-balance` after installing workspace dependencies.
