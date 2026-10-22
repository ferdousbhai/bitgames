# BitGames handoff

Updated 2026-10-17. Work on `main`. The fun pass is committed (`d2c0bf7`), all twelve games are republished, and the store is seeded with the new versions.

## Direction (owner, 2026-10-16)

The earlier education passes made the games boring, and the owner's kids stopped enjoying them. The owner asked to strip out the forced education, the on-screen text and the monotonous voice, and to make every game intuitive with no instructions. See `AGENTS.md`.

- **Fun first.** Lively and juicy is welcome. Avoid strobe flashing, reward spam, frantic timers and nagging.
- **No words on screen** (a logo is fine) and **no text-to-speech**. Use pictures, big ▶ buttons and sound effects.
- **Bar:** a fresh independent reviewer must score each game 8.5/10 or higher, playing it in a real browser.
- **Roles:** Codex workers (`codex exec`) write the game code, one per game. Claude coordinates: it sends fix lists, spawns fresh reviewers and runs the shared checks.

## Status

| Game | Latest fresh review |
| --- | --- |
| Dragon Glide | ✅ 8.6 |
| Balloon Pop | ✅ 8.6 |
| Fish Pond | ✅ 8.5 |
| Star Catcher | ✅ 8.5 |
| Crash Racers | ✅ 8.5 |
| Rocket Garage | ✅ 8.5 |
| Paint Splash | ✅ 8.5 |
| Bumper Ducks | ✅ 8.5 |
| Penguin Bowling | ✅ 8.5 |
| Bunny Hop | ✅ 8.6 (round 14) |
| Memory Match | ✅ 8.6 (round 11); cosmetic-only follow-up (card-back contrast) |
| Cake Stack | ✅ 8.6 (round 10) |

Several passed games also got small follow-up fixes the reviewer suggested; they were checked with the shared mash check rather than re-reviewed. Each game's rounds, evidence and remaining ideas are in `docs/polish/<game-id>.md`.

## Touch-safety rule (all games)

Small children mash, rest a palm and press several fingers at once. None of that may exit, mute, end a round or skip a payoff screen.

- 🏠, 🔊, 🎵 and other "leave" or "finish" buttons are **press-and-hold** with a filling ring.
- A hold may start only when exactly **one pointer is down in the whole document**. Any other pointerdown cancels it, and no new hold starts until every finger lifts.
- After a hold fires, **swallow that finger's lift click**, so it can't press a button on the next screen.
- Never persist a mute. Escape and M must not exit or mute during play.
- Outside play, on the menu and results screens, Enter or Space may start or replay a round, a deliberate tap on ▶, 🔁 or 🗺 may navigate, and a grown-up's Escape may return to the title or M may toggle an unsaved mute. During play none of these may exit or mute.
- Holds are only for leaving or settings. A button that moves play forward (like Cake Stack's 🕯️) must answer a plain tap. Guard it against mashing by keeping it inactive for a moment, not with a hold: in round 8 a hold left tapping children stuck.

`examples/_studio/tests/mash.mjs` checks all of this: 30 s of mashing, three-finger palms, a finger held on a button while the hand rests on the canvas, quick taps on Escape, M, Backspace and random keys during play, and Enter or Space (quick, repeated or held) on a hold button that a short tap has left focused. `examples/_studio/tests/original-quality.mjs` checks that no words appear and no speech is called. Both run against a local preview, for example:

```sh
EXAMPLES_PORT=4213 node examples/_studio/serve.mjs
TMPDIR=/dev/shm EXAMPLES_ORIGIN=http://localhost:4213 EXAMPLES_CHROMIUM_EXECUTABLE=/usr/bin/chromium node examples/_studio/tests/mash.mjs
```

## Removed in this pass

- The shared voice and lesson helpers: `speech.js`, `adventure.*`, `studio-dialog.*`, `recipe-studio.js`, `gallery.*`, `colour-studio.*`, `colour-model.js` and `prediction.*`.
- `examples/_studio/originals/`.
- Paint Splash's colour-studio models and builders.
- `tests/workshop-fallback.mjs`.

`package-originals.mjs` now only writes manifests.

## Remaining

1. Store screens are changed but not committed or deployed. `PlayScreen.tsx`'s corner ✕ now follows the hold rule (keyboard still opens it at once), and the "Who's playing?" choice in `GameFrame.tsx` shows big 👫/🧒 pictures. They sit in the working tree beside separate unfinished store work (households, Google sign-in, talk, migration `0010_households.sql`) that isn't part of this pass, so they were left uncommitted. `GameFrame.tsx` mixes both.
2. Passed games keep the reviewers' leftover ideas in `docs/polish/<game-id>.md`. They were deliberately not done after passing, because late mechanics changes made Bunny Hop and Cake Stack worse before.
3. Not yet verified: sound by ear, physical iPads, and real two-device multiplayer through the store. Family play is the real test.

## Environment notes

- `/tmp` is a 32 GB RAM disk that other projects fill. Run Chromium with `TMPDIR=/dev/shm`.
- Codex's sandbox hides the GPU, so Chromium falls back to SwiftShader (CPU). Run browser-testing Codex workers with `-s danger-full-access` (owner-approved) and check the renderer is `ANGLE (Mesa, AGX…)`.

Security maintenance (2026-10-22): removed the retired workers.dev vendor origin from the store CSP and example policies. Games keep their immutable version URLs; libraries load from bitgames.store/vendor/.
