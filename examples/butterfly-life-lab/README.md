# Butterfly Life Lab

Unfold a caterpillar’s remarkable transformation.

- Ages: 4–8
- Learning: Butterfly metamorphosis
- Activity: order

Tap the pictures in the order the story happens. Use Reset to start again.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/butterfly-life-lab assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs butterfly-life-lab` after installing workspace dependencies.
