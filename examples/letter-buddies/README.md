# Letter Buddies

Introduce big letters to their little-letter buddies.

- Ages: 4–7
- Learning: Uppercase and lowercase letters
- Activity: memory

Turn over two cards. Match their pictures or their related meanings.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/letter-buddies assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs letter-buddies` after installing workspace dependencies.
