# Rhyming River

Hop between lily pads with words that rhyme.

- Ages: 5–8
- Learning: Rhyming word families
- Activity: rhyme

Listen to the word. Hop to the lily pad whose word ends with the same sound.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/rhyming-river assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs rhyming-river` after installing workspace dependencies.
