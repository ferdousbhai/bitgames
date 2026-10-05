# Sound Wave Lab

Compare crystal tones and find the high or low sound.

- Ages: 4–8
- Learning: Pitch discrimination
- Activity: pitch

Play both sounds, then choose the higher or lower one. Replay as often as you like.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/sound-wave-lab assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs sound-wave-lab` after installing workspace dependencies.
