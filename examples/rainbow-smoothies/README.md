# Rainbow Smoothies

Mix two pretend fruit colours into a rainbow smoothie.

- Ages: 3–6
- Learning: Colour mixing
- Activity: mix

Tap two primary paint colours to make the target colour. Reset to try another blend.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/rainbow-smoothies assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs rainbow-smoothies` after installing workspace dependencies.
