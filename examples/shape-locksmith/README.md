# Shape Locksmith

Open a fairy castle with wonderfully shaped keys.

- Ages: 2–5
- Learning: Shape recognition
- Activity: match

Look at the delivery request and tap its matching toy.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/shape-locksmith assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs shape-locksmith` after installing workspace dependencies.
