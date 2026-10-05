# Rain Drop Rhythm

Copy a gentle rain song on a lily-pad drum.

- Ages: 3–7
- Learning: Beat, rests and pattern memory
- Activity: rhythm

Listen to the rhythm. Set each step to a beat or a rest, then play your pattern.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/rain-drop-rhythm assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs rain-drop-rhythm` after installing workspace dependencies.
