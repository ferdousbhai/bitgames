# Cake Stack polish

## Phase 1 calm pass (2026-10-09)

Audit scores before this pass: Calm 6, Focus 7, Educational 5, Engagement 6, Visual 9, Audio 7, UX 8, Technical 8 (see [the audit](AUDIT_2026-10-09.md)). The stacking, the birthday friends, the flavour unlocks, the missions and the recipe studio are unchanged. The pass removes the pressure and hype around them.

### What changed and why

| Change | Where |
| --- | --- |
| The slide speed is one constant, `SLIDE_SPEED = 1.25`. The ramp by level (+0.12) and by cake height (+3% per layer, up to 3.0) is gone, so timing and patience stay the skill. The mission `pace` multiplier still applies. | `public/js/main.js:115-117` |
| The "lined up" glow is a steady warm glow. It used to flicker at about 3 Hz (`Math.sin(t * 20)`). | `main.js:324-325` |
| Perfect drops no longer give stars, show a "Perfect!" or "Perfect xN!" banner, or play a chime that climbs with the streak. The soft golden ring and one fixed two-note chime remain. Width regrowth after three perfect drops is a quiet mechanic and stays. | `main.js:394-398`, `js/audio.js:176-184` |
| Floating "⭐ / ⭐⭐" labels, the score pill, the "🏆 Best!" badge, the title's best score, "Last time" and "New best" are all removed, along with their `localStorage` best. | `main.js` (`land`, `updateHud`, `toTitle`, `start`), `public/index.html` |
| The decorated-layer "Yummy!" banner is removed. The toppers still pop on. | `main.js` (`decorateSide`) |
| **Candles wait for the child.** The 7 s `autoBlow` timer is removed; the finger points at the candles until the child taps. | `main.js:655-657` |
| **Party: one soft moment.** It used to be 220 confetti, 2×60 party poppers, camera shake 0.5, a sawtooth party horn with crowd noise, and a "⭐ +5" bonus with a score bounce. Now 28 slow pastel petals drift down (`effects.drift`, gravity 0.25, 4–5.5 s life) while the music-box Happy Birthday plays once. | `main.js:709-717`, `js/effects.js:131-138`, `js/effects.js:254-263` |
| The party card shows the cake the child made: each layer's flavour emoji from the bottom up, and the layer count. This replaces "⭐ +N". | `main.js:727-730`, `index.html` (`#card-cake`, `#card-count`), `style.css:120-121` |
| The mission reward drifts 14 petals (was a 90-piece confetti shower). The mission banner and its spoken reward are kept. | `main.js:923` |
| Perfect sparkles: 8 slow rising sparkles (was a 26-piece burst). | `effects.js:206-210` |
| Audio: the "cake ready" fanfare uses sine and triangle (was square). `cheer()`, used by the recipe studio, is a gentle sine chord (was a sawtooth horn plus noise). Splat and pop gains are lowered. The waltz step is 0.32 s (was 0.24 s). | `audio.js:176-184`, `audio.js:233-238`, `audio.js:254-262`, `audio.js:275` |
| The idle finger now waits 30 s (was 6 s). The first-drop finger and the candle finger stay. | `main.js:952-954` |
| CSS: the infinite logo bob, Play pulse, badge bob, goal bob, card-emoji bob, and the studio's next-step and next-recipe pulses are off. The finger taps three times, slowly, then rests. `prefers-reduced-motion` turns off the finger, title, card and button entrance animations. | `public/style.css:434-443` |

The recipe studio still passes each layer's position to `perfect(step)`, so a correct recipe sounds as a short rising scale.

### Verification

- `node examples/_studio/tests/browser.mjs --browser chromium --ids cake-stack --run calm`: BOOT + PLAY ready, 0 errors.
- `node examples/_studio/tests/original-quality.mjs`: all pass, including "Actual cake drops count three placed layers" and the mission persistence check.
- `node --test examples/_studio/tests/*.test.mjs`: 10/11 pass. The manifest-hash test fails only because `public/bitgames.json` is stale until the coordinator's build regenerates it.
- I played a whole cake (perfect, good and sloppy drops), the candles, the party, the card, the recipe check and the share tab in Chromium at 834×1194 and 1194×834, with 0 console errors. Before screenshots are in the scratch audit folder `audit/cake-stack/`, after screenshots in `audit/cake-stack/after/`.

### Remaining (Phase 2, from the audit)

- The friend orders a picture recipe (for example 🍓🍦🍓) on the layer dots, and the child waits for the matching flavour, then lines it up. This puts sequencing inside the core action.
- At the party, cut and share the actual cake equally between the guests, reusing the studio's equal-share logic.
- The studio's text buttons ("Check recipe ✓") could become picture-only for pre-readers.
- Trimmed slivers can land beside the camera in landscape and look oversized (`FLOOR_Y` path in `updateSlivers`).
