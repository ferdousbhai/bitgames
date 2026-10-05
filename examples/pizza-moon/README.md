# Pizza Moon

Share moon-shaped pizzas in equal slices.

- Ages: 5–8
- Learning: Equal parts and fractions
- Activity: fraction

Tap equal parts to colour the requested share. Press Check when ready.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/pizza-moon assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs pizza-moon` after installing workspace dependencies.
