# Sunlight Sprouts

Discover which supplies help a garden grow.

- Ages: 4–7
- Learning: Plants and their needs
- Activity: experiment

Make a prediction, press Test, and see what happens. Try both ideas.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/sunlight-sprouts assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs sunlight-sprouts` after installing workspace dependencies.
