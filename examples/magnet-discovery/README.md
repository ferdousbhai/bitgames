# Magnet Discovery

Predict, test, and discover what a magnet attracts.

- Ages: 5–8
- Learning: Testing magnetic attraction
- Activity: experiment

Make a prediction, press Test, and see what happens. Try both ideas.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/magnet-discovery assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs magnet-discovery` after installing workspace dependencies.
