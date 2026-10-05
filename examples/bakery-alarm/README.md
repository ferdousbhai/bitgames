# Bakery Alarm

Set the kitchen clock for a pretend bake.

- Ages: 5–8
- Learning: Hours and quarter hours
- Activity: clock

Turn the hour and minute hands using the buttons. Match the requested time, then Check.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/bakery-alarm assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs bakery-alarm` after installing workspace dependencies.
