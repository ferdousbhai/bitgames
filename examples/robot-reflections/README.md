# Robot Reflections

Light both halves of a robot’s panel symmetrically.

- Ages: 5–8
- Learning: Spatial reasoning
- Activity: mirror

Tap squares on the empty side to reflect the pattern across the dotted line. Press Check.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/robot-reflections assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs robot-reflections` after installing workspace dependencies.
