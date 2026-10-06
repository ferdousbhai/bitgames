# Picnic Pairs

Uncover matching snacks beneath picnic blankets.

- Ages: 2–5
- Learning: Visual working memory
- Activity: memory

Turn over two cards. Find the cards that go together.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/picnic-pairs assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs picnic-pairs` after installing workspace dependencies.
