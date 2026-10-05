# Habitat Hotel

Give every animal a room that feels like home.

- Ages: 3–7
- Learning: Animal habitats
- Activity: sort

Carry objects to their homes, or tap an object and then its home.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/habitat-hotel assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs habitat-hotel` after installing workspace dependencies.
