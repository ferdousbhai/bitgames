# Space Station Schedule

Set a station clock for the next rocket launch.

- Ages: 6–8
- Learning: Hours and half hours
- Activity: clock

Turn the hour and minute hands using the buttons. Match the requested time, then Check.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/space-station-schedule assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs space-station-schedule` after installing workspace dependencies.
