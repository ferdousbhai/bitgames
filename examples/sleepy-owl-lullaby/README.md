# Sleepy Owl Lullaby

Repeat a gentle bedtime song for a sleepy owl.

- Ages: 2–5
- Learning: Short sequence recall
- Activity: echo

Watch and listen to the song, then tap the pads in the same order. Replay whenever you like.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/sleepy-owl-lullaby assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs sleepy-owl-lullaby` after installing workspace dependencies.
