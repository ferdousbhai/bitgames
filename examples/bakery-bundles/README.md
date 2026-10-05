# Bakery Bundles

Count buns arranged in equal bakery trays.

- Ages: 5–8
- Learning: Equal groups and multiplication
- Activity: arithmetic

Move the toys to tell the story. Make equal shares when sharing, then choose an answer.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/bakery-bundles assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs bakery-bundles` after installing workspace dependencies.
