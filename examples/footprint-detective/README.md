# Footprint Detective

Follow curious tracks to their woodland owners.

- Ages: 4–7
- Learning: Observation and animal tracks
- Activity: match

Look at the marks on the ground. Tap the animal that made them, or carry it to the tracks.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/footprint-detective assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs footprint-detective` after installing workspace dependencies.
