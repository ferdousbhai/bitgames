# Picnic Word Basket

Pack a picnic by spelling simple snack words.

- Ages: 5–8
- Learning: Food word spelling
- Activity: spell

Look at the picture and listen to the word. Tap its letters in order.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/picnic-word-basket assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs picnic-word-basket` after installing workspace dependencies.
