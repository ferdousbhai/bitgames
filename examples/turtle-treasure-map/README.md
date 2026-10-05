# Turtle Treasure Map

Steer a turtle through a reef to a secret pearl.

- Ages: 4–8
- Learning: Grid navigation
- Activity: path

Use the arrow buttons to plan a route. Press Go to send your friend. Avoid the rocks.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/turtle-treasure-map assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs turtle-treasure-map` after installing workspace dependencies.
