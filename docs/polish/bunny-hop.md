# Bunny Hop: Phase 1 calm pass (2026-10-09)

Bunny Hop was already the calmest of the three: one tap, no failure, a journey through four places to Pip's burrow. This pass removes the remaining praise spam, the graded stars, best-score chasing and the continuous confetti. It also caps the speed ramp and fixes the missing way home.

## What changed and why

All paths are under `examples/bunny-hop/public/`.

**Bug: no way back to the menu**
- `index.html:36` adds a 🏠 button. It sits beside the sound button (`style.css:64`) and the HUD score moves to make room (`:57`). It shows in play, at the burrow and on results.
- `js/main.js:208,390` adds the button handler and an `Escape` shortcut, both routing to `toMenu()`.
- `toMenu()` (`js/main.js:211-226`) now also:
  - stops the music and clears the banner
  - resets the biome and weather, so there is no snow on the meadow menu
  - snaps the camera to Pip's close-up (`:223`). Without this the camera panned back across the whole 850-unit trip, and the menu briefly showed empty land with no Pip (seen in testing).
- The adventure helper already hushes mission speech on `#home` clicks.

**Bug: dark foreground flower on the menu**
- `js/world.js:181`: near-layer scenery is no longer placed within 5 units of the start. A flower right in front of the menu camera rendered as a big dark blur behind the mission chip and the Play button. The gap at the start of a trip is not noticeable in play.

**Pacing**
- `js/course.js:50`: `speedAt()` is a constant 6.6 instead of ramping from 6.2 to 9.4 by the snow. The trip takes about 2 minutes.

**Feedback**
- The streak counter above Pip stays: it counts a row of carrots 1, 2, 3 in one spot (`js/main.js:435`). It is a counting helper, now shown as a plain number without "+".
- Removed:
  - the "+5" golden popup
  - the random "Yum!/Crunch!" combo words
  - the 45%-chance "Nice hop!/Wheee!/Super!" praise and its sound on clearing a log (`:447`)
- The gentle "Boing!/Whoopsie!" on a bump stays, because it explains what happened.
- The munch note walks the scale with the row of carrots instead of climbing with a combo.

**Results** (`js/main.js:317`, `index.html:56-62`)
- The graded 1–3 stars, "🏆 New best!" pill and best line are gone, and the menu's best pill is removed. The best score is no longer stored.
- Results now say what Pip found: "Pip found N carrots and M golden ones on the way home." The golden carrots also appear as small icons. `game.golden` is counted at `:424`.

**Celebrations**
- At the burrow (`js/main.js:313`), the 90-piece confetti burst is now 16 soft petals. The confetti that kept bursting about 3 times a second on the results screen is removed.
- A finished mission (`js/main.js:142`) now shows what the child made ("↑ ↑ ↻ Pattern!" / "↑ ↑ ↑ ↑ Four hops!") with one `sound.chord()` and 10 soft petals. It used to be "⭐ … ⭐" and 35 confetti. `confettiBurst(…, soft)` is at `js/effects.js:132`.
- The bump shake drops from 0.35 to 0.15 (`js/main.js:440`). It is a real collision, so it keeps a small nudge.

**Audio** (`js/audio.js`)
- `fanfare()` (`:137`) for a new place is now a slow triangle arpeggio, with no square wave.
- `finish()` (`:142`) is shorter and softer.
- A new `chord()` (`:149`) plays for missions.
- The unused `nice()` was removed.
- The 116 bpm generative music was already gentle and is unchanged.

**CSS** (`style.css`)
- Removed the infinite logo bob, Play-button pulse, star pop and new-best pop.
- The tap-hint nudge is slower and smaller (2 s, 6 px) and stops once the hint fades.
- The loading hopper is slowed to 1.6 s. Banners and popups fade with no overshoot.
- Added a `prefers-reduced-motion` block (`:153`).

## Verification

- `browser.mjs --run calm` (Chromium, both orientations): 0 errors. The new 🏠 button passes the 44 px touch-target and centre-touch checks.
- `original-quality.mjs`: mission persistence passes. `node --test examples/_studio/tests/*.test.mjs` fails only on the stale `public/bitgames.json` manifest, which the coordinator rebuilds.
- Played full trips to the burrow with an auto-hopper (`?biome=3` in portrait and landscape, `?biome=1` in landscape). After each one:
  - pressed 🏠 on results and confirmed the state returned to `menu`, with Pip in a close-up and no stray snow
  - started a new trip and pressed 🏠 mid-trip, again landing on `menu`
- There were no console errors.
- Before screenshots: `…/scratchpad/audit/bunny-hop/`. After screenshots: `…/scratchpad/audit/after/bunny-hop-*.png`, under `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/183efacb-62c2-4cf6-9680-a97f4bb0fb5f/`.

## Remaining Phase 2 work (from AUDIT_2026-10-09)

- Carrot rows of a stated, spoken number.
- Rhythmic obstacle patterns to predict (log-log-rock), with a pattern stretch per biome.
- An optional 🐢 slower pace for 2–3 year olds.
- A per-biome collection to sort in the burrow "pantry", such as autumn leaves by colour or snowflakes by shape.
