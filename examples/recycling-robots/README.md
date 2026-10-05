# Recycling Robots

Sort toy recyclables with a cheerful robot team.

- Ages: 4–8
- Learning: Materials and recycling
- Activity: sort

Carry objects to their homes, or tap an object and then its home.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/recycling-robots assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs recycling-robots` after installing workspace dependencies.
