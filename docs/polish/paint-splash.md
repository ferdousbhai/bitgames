# Paint Splash: polish log

## Phase 1 calm pass (2026-10-09)

The audit is in [AUDIT_2026-10-09.md](AUDIT_2026-10-09.md). Rolling, pickups, multiplayer, the gallery and the colour studio are kept. The 75 s timer stays: the untimed default is Phase 2.

### What changed and why

| Change | Where | Why |
| --- | --- | --- |
| The final-10 s hurry state is gone: no pink pulsing timer, no per-second ticks, no music speed-up. The timer just counts. | `public/js/main.js:1176`, `:1228`; `.timer.hurry` removed from `public/style.css`; `audio.tick()` removed | Frantic-timer pressure. |
| The countdown is softer: "3, 2, 1, 🎨" (no "GO!") at 0.9 s steps. Numbers fade in without zoom or overshoot. Beeps are soft sines. The waiting 🎨 no longer pulses. | `main.js:725-735`, `style.css` `.countdown`, `audio.js:185` | Softer start. |
| Pickup banners (💥 SPLASH!, 💧 Splish splash!, 🌈 Rainbow!) are gone; the paint on the ground shows what happened. | `main.js:943` | Removes shouty banners. |
| Pickups are calmer: respawn waits are `PICKUP_WAIT` (bucket 7–12 s, water 8–14 s, rainbow 18–26 s; was 2.5–6 s and 9–15 s). Caps drop to 2 buckets and 1 water. The bucket floats and spins more slowly, and its colour drifts slowly (hue speed 0.25 to 0.06). Rainbow trail sparkles drop from 10 to 3 per second. | `main.js:34`, `:893`, `:1082`; `public/js/items.js:5-7`, `:84` | Constant item stream and colour cycling. |
| **Shared result:** the per-player % and the AWARDS ranking (including "Colour swapper" and "Speedy roller") are gone. Results show "🤝 We painted N% together!" and one card per painter: animal, ⭐ for you, 🤖 for bots, and a dab of their colour. | `computeFinal()` `main.js:798`, `renderResults()` `:853`, `style.css` `.card .swatch` | Removes ranking; the result is the picture made together. |
| No white camera flash when the picture is kept. The 🖼️ button does one small hop instead (no 3× pulse). | `keepFinishedPicture`, `index.html` `#flash` removed, `style.css` | Strobe-like flash. |
| The reveal shows 28 slow petals in the painters' colours (was 220 confetti) and one soft sine chord (was a square-wave fanfare with a hiss). | `main.js:792`, `audio.js:196` | One soft moment. |
| Music has one steady tempo (0.22 s per step, was 0.17 and then 0.14). Splash and water sounds are about half as loud. The water squeak and piglet voice are triangle waves instead of square and sawtooth. | `audio.js` | Slower, softer audio. |
| The idle drag hint waits 30 s (was 4 s). It still shows at the start. The "you" marker bobs and spins slowly. | `main.js:32`, `:1198` | Idle nudges and busy motion. |
| These infinite CSS animations are removed: logo bob and Let's-paint pulse. The loading spinner is slowed. Results cards fade up instead of springing. A `prefers-reduced-motion` block is added. | `public/style.css` | No pulses; reduced motion is honoured. |

### Verification

- `node examples/_studio/tests/browser.mjs --browser chromium --ids paint-splash --run calm`: BOOT + PLAY ready, 0 errors.
- `node examples/_studio/tests/workshop-fallback.mjs`: PASS.
- Scratch replica of the paint-splash part of `original-quality.mjs` passed: the gallery keeps 3 pictures, and the controls are isolated.
- Played a 20 s round (`?debug&seconds=20`) plus the colour studio in Chromium at 834×1194 and 1194×834. 0 console errors.
- Screenshots: `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/183efacb-62c2-4cf6-9680-a97f4bb0fb5f/scratchpad/audit/paint-splash/before/` and `.../after/`. Compare `*-2-countdown`, `*-6-results` and `*-7-results-kept`.
- `public/bitgames.json` is now stale until the coordinator's rebuild.

### Not changed here

- The `final` message now carries only `{ seat }` rows. All devices run the same version, so this is fine. A device still on the old page would ignore the missing pct and award fields.
- The in-play HUD colour bar still shows each colour's share of the ground. It is a picture of the colours more than a score, but it reads as a race. Phase 2 should replace it with a single "together" fill.
- Shared studio and gallery files (`colour-studio.js`, `studio-dialog.*`, `gallery.*`) were not touched (coordinator-owned).

### Remaining (Phase 2)

- No timer by default: finish when done.
- Overlapping red, yellow and blue rollers mix colours using `colour-model.js`, so the studio's learning sits inside the main game.
- Optional guide outlines to fill.
- A single cooperative coverage bar.
