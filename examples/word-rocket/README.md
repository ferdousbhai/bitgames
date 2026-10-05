# Word Rocket

Build short words to power a reading rocket.

- Ages: 5–8
- Learning: CVC word building
- Activity: spell

Look at the picture and listen to the word. Tap its letters in order.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/word-rocket assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs word-rocket` after installing workspace dependencies.
