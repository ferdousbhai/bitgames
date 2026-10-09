# BitGames handoff

Updated 2026-10-09. Work on `main`.

## Current direction (2026-10-09)

The owner wants all twelve originals brought to 10/10 rather than any new games. The standard:

- **Gentle and relaxing.** Calm pacing, soft palettes and sound, no flashing, reward spam, countdown pressure or noisy celebration. Think the opposite of attention-maximising kids' media.
- **Builds sustained focus.** Play that rewards careful looking, planning, patience and finishing, so a child can stay with one activity for a long time.
- **Real educational value.** Learning sits inside the core action, not in quizzes bolted onto it.
- **Engaging through depth, not hooks.** Meaningful choices, discovery and creation that hold up on a return visit.

Work one game at a time and record each pass in `docs/polish/<game-id>.md`. The scorecard and three-phase plan are in [docs/polish/AUDIT_2026-10-09.md](polish/AUDIT_2026-10-09.md). Polish notes for the retired games are archived in `docs/archive/retired-polish-2026-10-07/`. Blender 5.2 runs on the owner's machine. The CLI is preferred because jobs can run in parallel; the Blender MCP server works but runs jobs one at a time.

## Phase 2 complete (2026-10-09, not yet deployed)

Every original now has its learning inside the core action, with calm untimed play as the default and lively modes kept as menu choices:

| Game | Core learning loop |
| --- | --- |
| Balloon Pop | Spoken, pictured counting requests (colour, shape, adding on, dots to quantity) filling ten-frame slots; Free popping kept |
| Bumper Ducks | Untimed Pond helpers round filling a shared ten-frame (place value, colour sorting); Race kept |
| Bunny Hop | Announced carrot rows counted into a tray, obstacle patterns with "What comes next?", 🐢 pace, pantry sums |
| Cake Stack | A friend's pictured order and AB/ABC patterns, then fair sharing among guests; Free stacking kept |
| Crash Racers | Delivery Town: match picture parcels to houses placed out of road order using the map; Race and Smash kept |
| Dragon Glide | One goal per world: numbered rings in order, or gathering by colour or shape, sorted at the nest |
| Fish Pond | True habitats across five places (new Blender Coral Reef, Arctic seals) and look-closer facts |
| Memory Match | Spoken names; twins, animal↔sound and animal↔baby modes |
| Paint Splash | Untimed colour mixing by overlapping wet primaries, painted together; Quick round kept |
| Penguin Bowling | Earned strikes, fallen + standing = 10 on every roll, find-the-pins before spares |
| Rocket Garage | Predict-then-test fair test on every launch with a ghost rocket and a findings notebook |
| Star Catcher | Real constellations built star by star, named with a fact, ending in a night sky |

Each game's `docs/polish/<game-id>.md` has the design, file:line changes, evidence and remaining ideas. Release still needs family play, then publishing each game's Worker and refreshing the store listings. The Fish Pond builder keeps shipped GLBs unchanged when a fresh export has the same geometry; other builders may want the same guard.

## Phase 2 design decisions (2026-10-09)

The owner delegated the open Phase 2 questions ("use your judgement"). These defaults hold until family play says otherwise.

| Game | Decision | Reason |
| --- | --- | --- |
| Paint Splash | Wet paint stays glossy and lighter for 8 s. Robots keep one primary each, so purple is the child's own discovery. Ask (don't auto-end) at 85% | Discovery and the child's choice of ending are the point. The paint pots make every mix reachable alone |
| Bumper Ducks | Count every landing aloud. Goals advance after each round | Counting objects aloud is the learning |
| Star Catcher | 30-star trip. Pink and lilac stars light ordinary stars | Short enough to finish; simple is clearer |
| Rocket Garage | No turbo on test flights. Fives counted aloud throughout | Fair tests change one thing; counting in fives is the skill |
| Bunny Hop | One "What comes next?" per place. Rows up to 10 at normal pace, capped at 5 on 🐢. No pantry collectables yet | Keeps the trip flowing; toddlers get one ten-frame row |
| Cake Stack | Leaving an order cake early is via 🏠 only. Each landed flavour is named. Guests appear on the share card, not in 3D | Orders are only 4–6 layers; naming reinforces sequencing |
| Crash Racers | Brief slow motion on big jumps stays | It's a stunt moment, not crash spectacle |
| Fish Pond | Clownfish is an interim rare lake visitor with a corrective note, until a sea/reef place is built (Phase 2/3) | Removing it would break the 15-creature book |

## Phase 1 calm pass complete (2026-10-09, not yet deployed)

All twelve originals had the Phase 1 calm pass described in the audit:
- strobes, infinite pulses, confetti storms, combo and score pressure, best scores and star grades removed
- sine/triangle audio
- a constant gentle pace
- idle nudges at 30 s or later

Bugs fixed in the same pass:
- 🏠 buttons in Bunny Hop and Star Catcher
- a remembered mute in Crash Racers
- Fish Pond habitats: the ice place became Icy Sea; the clownfish is an interim rare lake visitor with a corrective note until a sea place exists
- Dragon Glide's nest waits for a tap

Each game's changes, evidence and remaining Phase 2 work are in `docs/polish/<game-id>.md`. Chromium and WebKit smoke playtests pass for all twelve with 0 errors, and the node tests pass. The 321-file original snapshot is intentionally superseded. Timed rounds (Paint Splash, Bumper Ducks) and racing (Crash Racers) remain; the agreed Phase 2 direction makes calm, untimed play the default and keeps lively modes as menu choices. Before deploying, have the owner's children play the calm versions.

## Loose ends closed 2026-10-09

- Crash Racers' Web Audio `resume()` and `suspend()` calls now catch rejections, as the other originals already did. The WebKit `Failed to start the audio device` error no longer fails the clean-console check: WebKit and Chromium both pass with 0 errors. This intentionally changes one file (`crash-racers/public/js/audio.js`) in the 321-file original snapshot.
- GitHub's default branch is `main`. The remote `master` branch, fully contained in `main` at 7106b6f, was deleted.

## History: generated-game retirement (2026-10-08)

The previous quantity-driven generated-game release queue is superseded and must not resume.

## Owner direction and completed wipe

The owner reported that the later generated games were boring, low quality and too similar. Their children enjoy the original games plus Splash Tank in a separate repository. Three parallel source judges audited all 101 projects: majority findings were 73 removal candidates, 16 substantial-rework concepts and 12 retain candidates (the originals). Source judgments do not substitute for child play.

The owner approved the exact proposed 89-game wipe with **“Yes do it.”** All 89 generated project directories are now removed, along with their runtime, generator designs/builders, obsolete tests and workspace lockfile importers. The build is original-only, so it cannot recreate the retired games. The local catalogue contains **12 originals**. Splash Tank is untouched.

All **321 snapshotted original files** remain byte-for-byte unchanged after rebuilding. Seven direct Node preservation/shipment/learning checks pass, including exact surviving IDs, retired-path absence, manifest integrity and catalogue membership. Chromium passed all 12 originals in both orientations; WebKit passed 11, with Crash Racers reaching play/layout but failing the clean-console gate on an audio-device error (fixed 2026-10-09, see above). See `docs/audit/original-browser-preservation-2026-10-08.md`.

Evidence: [quality audit](audit/QUALITY_AUDIT_2026-10-08.md), [approved exact IDs and Workers](audit/proposed-wipe-2026-10-08.json), [execution status](audit/wipe-execution-2026-10-08.json), [original-file snapshot](audit/originals-before-wipe-2026-10-08.json).

## Remote retirement complete

Full access restored Cloudflare API connectivity. Exact live inspection found 14 approved target Workers and 14 first-party store games with 220 versions; 75 target Workers were already absent. The scoped cleanup deleted those 14 Workers, game rows and version histories. All 89 target Worker names are now absent. All 41 unrelated Workers, all original Workers, the store Worker/database and unrelated store records remain unchanged. Splash Tank remains untouched. All 14 retired live links return 404; all 220 old store playback endpoints are unavailable (502). All 12 original deployment URLs return 200.

See [remote execution evidence](audit/remote-retirement-2026-10-08.json) and [playback verification](audit/retired-playback-2026-10-08.json). No reseeding or store deployment was needed. Local original-only packaging prevents resurrecting retired projects. `./scripts/cf` invokes the installed Cloudflare CLI directly; authentication and account access are verified. Earlier DNS/sandbox failure reports are historical, not current blockers.

## Maintained tooling and future quality bar

Read [the studio guide](../examples/_studio/README.md). `node examples/_studio/build.mjs` packages only the originals; `pnpm examples:check` runs the seven preserved-game gates plus four tooling regression checks. Use Blender 5.2 CLI and each original's reproducible builder, never hand-edit GLBs. Rebuild only affected games with eight rendering threads.

A future game must earn its place through compelling direct action, meaningful choices, discovery/creation and voluntary return in real family play. Education belongs inside the play. Build one strong prototype at a time; do not resume the 100+ goal, release reskins, or infer fun from green tests, assets or AI agreement. Historical pass/audit documents remain evidence of prior work, not instructions to recreate or republish retired games.

## Post-retirement cleanup

The follow-up scan removed retired-game test helpers and the obsolete empty catalogue export, corrected stale README counts/deployment guidance, and made packaging use the canonical original IDs. Publishing validates the entire selected batch before deployment. Browser CLI inputs now reject unsafe report labels and empty ranges, and failures are included in JSON evidence. Rerunning the completed retirement script preserves its original before/after report without contacting Cloudflare.

The asset wrapper now handles Crash Racers' actual `cars.py`/`props.py` and the auxiliary texture builders. Paint Splash's bottle/cup builder lives at `examples/paint-splash/blender/colour_kit.py`; its deleted-library dependency is gone. A Blender 5.2.2 CLI rebuild into `/tmp` retained the shipped triangle geometry and palette, omitted unused UVs, and loaded successfully in the actual mixing/painting workshop. Shipped game files were not replaced. Catalogue filtering/covers and an original startup/play smoke check passed in Chromium. 

The final scan also removed the obsolete repository Blender MCP configuration and updated creator onboarding/agent guidance to Blender 5.2 CLI, reusable assets and reproducible builders.

Validation after the final cleanup: all 78 tests and workspace typechecks pass; 143 JavaScript files pass syntax and relative-import checks (helper templates checked at their shipment destination), and Blender builders parse. A fresh scan found no further actionable cleanup in the reviewed code/tooling. The 321 original snapshot files still match.
