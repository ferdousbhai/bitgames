# Letter Trails

Trace large glowing letters with a friendly firefly.

- Ages: 4–7
- Learning: Letter formation
- Activity: trace

Watch the firefly, then start at number 1 and follow the arrows with your finger. You can also tap each glowing dot.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/letter-trails assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs letter-trails` after installing workspace dependencies.
