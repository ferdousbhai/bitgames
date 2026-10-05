# Gem Turner

Turn a crystal key until it fits the glowing lock.

- Ages: 4–7
- Learning: Mental rotation
- Activity: rotate

Turn the colourful key in quarter turns until it matches the pale outline. Press Check.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/gem-turner assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs gem-turner` after installing workspace dependencies.
