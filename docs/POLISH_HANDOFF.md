# BitGames handoff

Updated 2026-10-08. Work on `main`; all work previously on `master` is included. The previous quantity-driven generated-game release queue is superseded and must not resume.

## Owner direction and completed wipe

The owner reported that the later generated games were boring, low quality and too similar. Their children enjoy the original games plus Splash Tank in a separate repository. Three parallel source judges audited all 101 projects: majority findings were 73 removal candidates, 16 substantial-rework concepts and 12 retain candidates (the originals). Source judgments do not substitute for child play.

The owner approved the exact proposed 89-game wipe with **“Yes do it.”** All 89 generated project directories are now removed, along with their runtime, generator designs/builders, obsolete tests and workspace lockfile importers. The build is original-only, so it cannot recreate the retired games. The local catalogue contains **12 originals**. Splash Tank is untouched.

All **321 snapshotted original files** remain byte-for-byte unchanged after rebuilding. Seven direct Node preservation/shipment/learning checks pass, including exact surviving IDs, retired-path absence, manifest integrity and catalogue membership. Chromium passed all 12 originals in both orientations; WebKit passed 11, with Crash Racers reaching play/layout but failing the clean-console gate on an audio-device error. See `docs/audit/original-browser-preservation-2026-10-08.md`.

Evidence: [quality audit](audit/QUALITY_AUDIT_2026-10-08.md), [approved exact IDs and Workers](audit/proposed-wipe-2026-10-08.json), [execution status](audit/wipe-execution-2026-10-08.json), [original-file snapshot](audit/originals-before-wipe-2026-10-08.json).

## Remote retirement complete

Full access restored Cloudflare API connectivity. Exact live inspection found 14 approved target Workers and 14 first-party store games with 220 versions; 75 target Workers were already absent. The scoped cleanup deleted those 14 Workers, game rows and version histories. All 89 target Worker names are now absent. All 41 unrelated Workers, all original Workers, the store Worker/database and unrelated store records remain unchanged. Splash Tank remains untouched. All 14 retired live links return 404; all 220 old store playback endpoints are unavailable (502). All 12 original deployment URLs return 200.

See [remote execution evidence](audit/remote-retirement-2026-10-08.json) and [playback verification](audit/retired-playback-2026-10-08.json). No reseeding or store deployment was needed. Local original-only packaging prevents resurrecting retired projects. `./scripts/cf` invokes the installed Cloudflare CLI directly; authentication and account access are verified. Earlier DNS/sandbox failure reports are historical, not current blockers.

## Maintained tooling and future quality bar

Read [the studio guide](../examples/_studio/README.md). `node examples/_studio/build.mjs` packages only the originals; `node examples/_studio/tests/curriculum.test.mjs` runs the seven preserved-game gates. Use Blender 5.2 CLI and each original's reproducible builder, never hand-edit GLBs. Rebuild only affected games with eight rendering threads.

A future game must earn its place through compelling direct action, meaningful choices, discovery/creation and voluntary return in real family play. Education belongs inside the play. Build one strong prototype at a time; do not resume the 100+ goal, release reskins, or infer fun from green tests, assets or AI agreement. Historical pass/audit documents remain evidence of prior work, not instructions to recreate or republish retired games.
