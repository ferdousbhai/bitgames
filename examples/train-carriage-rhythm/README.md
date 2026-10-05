# Train Carriage Rhythm

Complete the toy train’s changing carriage pattern.

- Ages: 4–7
- Learning: Pattern prediction
- Activity: pattern

Look for the repeating rule. Tap the piece that fills the empty place.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/train-carriage-rhythm assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs train-carriage-rhythm` after installing workspace dependencies.
