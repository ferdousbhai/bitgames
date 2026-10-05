# Float Boat Lab

Test toy objects in a tiny water tank.

- Ages: 4–8
- Learning: Prediction and buoyancy
- Activity: experiment

Make a prediction, press Test, and see what happens. Try both ideas.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/float-boat-lab assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs float-boat-lab` after installing workspace dependencies.
