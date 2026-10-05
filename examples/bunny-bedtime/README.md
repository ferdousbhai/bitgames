# Bunny Bedtime

Set a cosy clock for bunny’s daily routine.

- Ages: 5–8
- Learning: Clock reading and daily routines
- Activity: clock

Turn the hour and minute hands using the buttons. Match the requested time, then Check.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/bunny-bedtime assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs bunny-bedtime` after installing workspace dependencies.
