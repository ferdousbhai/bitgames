# Birdsong Tuner

Listen closely to tune a miniature birdsong concert.

- Ages: 3–7
- Learning: High and low sounds
- Activity: pitch

Play both sounds, then choose the higher or lower one. Replay as often as you like.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/birdsong-tuner assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs birdsong-tuner` after installing workspace dependencies.
