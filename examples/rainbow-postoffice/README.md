# Rainbow Post Office

Deliver rainbow parcels to their matching mailboxes.

- Ages: 2–4
- Learning: Colour recognition
- Activity: match

Match the parcel to the mailbox colour. Tap a parcel or carry it to the mailbox.

Play locally with `pnpm examples:serve`, then select this game at http://localhost:4173. Rebuild graphics with `pnpm --dir examples/rainbow-postoffice assets`. Shared source and full build instructions: [studio](../_studio/README.md).

Each public folder is a standalone shipment with local assets, speech (where the browser supports it), synthesised sound, keyboard controls, and no network calls beyond the store’s Three.js vendor. Deploy with `node examples/publish.mjs rainbow-postoffice` after installing workspace dependencies.
