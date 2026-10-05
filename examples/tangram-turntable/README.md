# Tangram Turntable

Fit five triangles, a square, and a parallelogram into a complete tangram.

- Ages: 4–8
- Learning: Tangram composition and rotation
- Activity: rotate

Turn the colourful key in quarter turns until it matches the pale outline. Press Check.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/tangram-turntable assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs tangram-turntable` after installing workspace dependencies.
