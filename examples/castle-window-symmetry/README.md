# Castle Window Symmetry

Restore mirrored jewel panes in a fairy castle.

- Ages: 5–8
- Learning: Grid reflection
- Activity: mirror

Tap squares on the empty side to reflect the pattern across the dotted line. Press Check.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/castle-window-symmetry assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs castle-window-symmetry` after installing workspace dependencies.
