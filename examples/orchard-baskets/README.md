# Orchard Baskets

Pick a tiny picnic from a candy-coloured orchard.

- Ages: 2–5
- Learning: Counting and quantity
- Activity: collect

Tap apples or carry them into the basket. Tap Done when you have the right number.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/orchard-baskets assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs orchard-baskets` after installing workspace dependencies.
