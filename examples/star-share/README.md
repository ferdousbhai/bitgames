# Star Share

Share star biscuits equally between space explorers.

- Ages: 5–8
- Learning: Fair sharing and division
- Activity: arithmetic

Move the toys to tell the story. Make equal shares when sharing, then choose an answer.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/star-share assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs star-share` after installing workspace dependencies.
