# Bumper Ducks: Phase 1 calm pass (2026-10-09)

The ducks, arenas, bonking physics, power-up gifts, napping robots and local multiplayer are what children love here, and they all stay. This pass removes the end-of-round alarm, the score shouting and the faster party music. Making rounds untimed, and replacing medals with a team total, is Phase 2.

## What changed and why

All paths are under `examples/bumper-ducks/public/`.

**Timer pressure**
- `js/main.js:1010`: the clock no longer turns pink, pulses every 0.6 s (`.timer.hurry` is removed from `style.css`) or beeps for the last 5 seconds. The 90-second round itself is unchanged.

**Bubble party**
- `js/sim.js:404`: the last-15-second shower spawns a bubble every 0.35 s, up to 16. It was every 0.18 s, up to 22.
- `js/main.js:1027`: the banner says "🫧 Bubbles! 🫧" instead of "🫧 BUBBLE PARTY! 🫧".
- `js/main.js:1254`: the music no longer speeds up for the party (`audio.updateMusic` lost its `fast` flag).

**Feedback**
- `js/main.js:~866-893`: removed the "+1", "⭐+3" and "💦+2" floating score labels. The duck's counter in the HUD still shows what it collected.
- "KA-BONK!" is gone. A hard bonk shows a small lower-case "bonk!".
- The QUACK and RIBBIT discovery words, WHEE, and the gift's power picture stay, since they say what happened.
- `js/main.js:868`: the bubble note walks a five-note scale (`game.run % 5`) instead of climbing like a combo.

**Camera**
- Bonks and splash landings are real physical bumps, so they keep a nudge, but a smaller one.
- Bonk shake now applies only for `s > 6`, capped at 0.35. It was `s > 4`, capped at 1 (`:894`).
- The splash landing shakes at 0.3 instead of 0.5 (`:936`).

**Celebrations**
- `js/main.js:804-809`: the round ends with "🫧 All done! 🫧" instead of "⏰ TIME! ⏰". The 90-piece confetti burst becomes 24 slow-drifting stars (`js/effects.js:205`).
- `js/main.js:167`: a finished counting mission shows "N 🫧" with one gentle chord and 10 twinkles, instead of `audio.star()` and 30 sparkles.

**Idle nudges**
- `js/main.js:780-783`: the steering hint used to reappear after every 6 s of rest. It now appears at most once per round, after 30 s without paddling. Resting is fine, and the robots nap too.

**Audio** (`js/audio.js`)
- Music tempo is 0.22 s per step, was 0.16 s with a 0.125 s party. The hi-hat ticks are gone.
- `cheer()` is now a slow triangle arpeggio plus `chord()`. The square-wave run and 10 crackle bursts are gone.
- `gift()` is triangle with no highpass hiss. `ribbit()` is triangle. The "speedy" power is triangle with a softer sweep.
- The count-in `beep()` is sine and triangle instead of square.
- The duck squeak gain drops from 0.35 to 0.25, and the splash highpass from 0.2 to 0.1.

**CSS** (`style.css`)
- Removed the infinite logo bob, GO-button pulse, hurry pulse, power-ring bob, waiting pulse and keys-hint bob.
- The drag-hint finger slows from 1.6 s to 2.4 s.
- Banners fade with no overshoot or tilt. The countdown enters from 1.3x instead of 2x.
- Added a `prefers-reduced-motion` block (`:263`).

## Verification

- `browser.mjs --run calm` (Chromium, both orientations): 0 errors. `original-quality.mjs`: mission persistence passes.
- `node --test examples/_studio/tests/*.test.mjs`: the only failure is the stale `public/bitgames.json` manifest, which the coordinator rebuilds.
- Played two full 90-second solo rounds in the bath (portrait and landscape) with keyboard steering and dashes, through to the podium.
  - Portrait scores were child 81 vs robots 41/45/50. Landscape was 95 vs 38/43/42.
  - At 0:04 the timer was neutral and silent. The podium showed a light star drift.
  - The only console message was the expected solo-mode "Multiplayer only works when the game is opened from BitGames" warning.
- Before screenshots: `…/scratchpad/audit/bumper-ducks/`. After screenshots: `…/scratchpad/audit/after/bumper-ducks-*.png`, under `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/183efacb-62c2-4cf6-9680-a97f4bb0fb5f/`.

## Left for Phase 2, and why

- **The timed round, medals and the "lead" scale-up on the top score pill.** Untimed play with a team total is the planned Phase 2 redesign, and removing these now would leave a round with no ending.
- **Pickup scoring and catalogue text.** Bubbles are 1, stars 3 and splash-outs 2, so `game.json` stays accurate.
- **The audit's Phase 2 list:**
  - an untimed default
  - coloured or numbered bubbles into a shared ten-frame jar
  - a team total instead of medals
  - arena discovery puzzles: frogs in order, ferrying boats
