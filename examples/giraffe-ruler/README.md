# Giraffe Ruler

Measure a toy giraffe with colourful cube units.

- Ages: 4–7
- Learning: Measuring with equal units
- Activity: measure

Place equal units along the glowing length without gaps. Press Check.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/giraffe-ruler assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs giraffe-ruler` after installing workspace dependencies.
