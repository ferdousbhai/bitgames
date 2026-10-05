# Dino Egg Nest

Fill a dino’s nest with the right number of eggs.

- Ages: 2–5
- Learning: Subitising and number representation
- Activity: tenframe

Tap the ten little spaces to fill the requested number. Press Check.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/dino-egg-nest assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs dino-egg-nest` after installing workspace dependencies.
