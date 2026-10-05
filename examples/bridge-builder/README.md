# Bridge Builder

Lay equal planks across a little harbour gap.

- Ages: 4–8
- Learning: Length and unit iteration
- Activity: measure

Place equal units along the glowing length without gaps. Press Check.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/bridge-builder assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs bridge-builder` after installing workspace dependencies.
