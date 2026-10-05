# Colour Cauldron

Brew bright new colours in a friendly witch’s pot.

- Ages: 3–6
- Learning: Primary and secondary colours
- Activity: mix

Tap two primary paint colours to make the target colour. Reset to try another blend.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/colour-cauldron assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs colour-cauldron` after installing workspace dependencies.
