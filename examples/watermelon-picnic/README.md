# Watermelon Picnic

Colour equal slices of a picnic watermelon.

- Ages: 5–8
- Learning: Part-whole reasoning
- Activity: fraction

Tap equal parts to colour the requested share. Press Check when ready.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/watermelon-picnic assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs watermelon-picnic` after installing workspace dependencies.
