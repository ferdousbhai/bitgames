# Fruit & Veggie Ferry

Load two tiny ferries for a healthy island picnic.

- Ages: 3–6
- Learning: Food classification
- Activity: sort

Carry objects to their homes, or tap an object and then its home.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/fruit-veggie-ferry assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs fruit-veggie-ferry` after installing workspace dependencies.
