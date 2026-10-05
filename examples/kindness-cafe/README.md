# Kindness Café

Choose caring actions at a tiny toy café.

- Ages: 3–7
- Learning: Empathy and cooperation
- Activity: choice

Listen to the little story, then choose the helpful answer.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/kindness-cafe assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs kindness-cafe` after installing workspace dependencies.
