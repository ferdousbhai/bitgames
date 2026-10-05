# Parcel Weights

Find the parcel that balances a delivery scale.

- Ages: 5–8
- Learning: Missing addends
- Activity: balance

Choose weights for the empty pan until both sides are equal. Press Check.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/parcel-weights assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs parcel-weights` after installing workspace dependencies.
