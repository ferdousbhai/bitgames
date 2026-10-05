# Ribbon Tailor

Choose just the right ribbon for a toy costume.

- Ages: 3–6
- Learning: Length comparison
- Activity: compare

Listen to the request. Compare the objects and tap your answer.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/ribbon-tailor assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs ribbon-tailor` after installing workspace dependencies.
