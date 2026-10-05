# Cloud Number Race

Choose the bigger or smaller number on floating clouds.

- Ages: 4–7
- Learning: Comparing numbers
- Activity: compare

Listen to the request. Compare the objects and tap your answer.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/cloud-number-race assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs cloud-number-race` after installing workspace dependencies.
