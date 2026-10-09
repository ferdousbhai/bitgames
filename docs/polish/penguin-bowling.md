# Penguin Bowling: Phase 1 calm pass (2026-10-09)

Source: the [2026-10-09 audit](AUDIT_2026-10-09.md), Phase 1. Kept as before: physics, bumpers, swipe and curve, the 10-frame scorecard, the pin prediction dialog, the dancing pins on a strike and the waving crowd.

## What changed and why

All references are to `examples/penguin-bowling/public/`.

### Celebrations (`js/main.js:278`)

- **Strike**: the 140-piece confetti shower, 7 fireworks with bangs, launch whistles and the wiggling "STRIKE!" with three stars and "+10" are replaced by a calm "Strike!" banner, one soft rising sine/triangle chord, the crowd wave, the pins' dance and 16 slow pale sparkles (`js/effects.js:222` `glow`).
- **Spare**: the same calm moment.
- **Other rolls**: escalating praise words ("Nice… Fantastic!") and star grades are replaced by the plain count "💥 7", or "Wheee! 🐧" for zero. The triangle jingle and a few sparkles stay.
- **Game over** (`js/main.js:370`): the 6 fireworks, 1–3 star grade and "🎉 New best!" are removed. The card shows the total, pins knocked down, and strike (X) and spare (/) counts in the scorecard's own marks. The trophy becomes the penguin.
- **Title**: the "🏆 Best" pill is gone; "Last time: N" becomes "🎳 N".

### Camera shake (`js/main.js:143`)

Shake comes only from the physical impact. It is capped at 0.3 (was 0.6) and scaled by 0.03 (was 0.05). Nothing else shakes the camera.

### Audio (`js/audio.js`)

- The fanfare is a three-note sine/triangle chord; the square wave and the high-pass sizzle are gone.
- Cheer noise gain drops from 0.22/0.14 to 0.08/0.05, with fewer chirps.
- `bang` is no longer called; its gains are cut to about a third in case it is reused.

### Idle hint (`js/main.js`, aim loop)

One silent swipe-hand hint after 30 s, instead of after 6 s with a poke and squeak every 4 s. The first-two-throws teaching hint remains.

### CSS (`style.css`)

- Removed: the infinite logo bob, the Play/Go pulse, the strike banner wiggle, the trophy and badge bob, and the star pop-ins.
- Slowed: the swipe hint and the loading spinner.
- Softened: the banner's springy entrance.
- Added a reduced-motion block.

## Bugs fixed

- **Confetti lingering into the next aim** (`js/main.js:346`, `js/effects.js:119`): a new `Pool.clear()` and `Effects.clearCelebration()` hide all confetti, sparkles and firework rockets when aiming starts. Verified: 0 live particles at the next aim in both orientations.
- **Prediction dialog pins match the lane** (`style.css` end, `js/main.js:480`): the dialog shows ⛄ on the snowy lanes and 🐟 in Fishy Bay; picked pins tip over. This is a `body.pins-fish` class plus a style-only override in the game's own `style.css`. The shared `prediction.js` and `prediction.css` are untouched.

## Verification

- `browser.mjs --ids penguin-bowling --run calm`: passed, 0 errors.
- `original-quality.mjs`: the pin-prediction and Escape checks pass.
- Own playthrough (`pb.mjs`): full 10-frame games at 834×1194 and 1194×834, with a real swipe and the prediction dialog. Scores 202 and 194. No console errors.
- Screenshots: before `scratchpad/audit/penguin-bowling/before/`; after `scratchpad/audit/penguin-bowling/after-{p,l}-*.png` (strike, results, predict, aim-later).

## Remaining (Phase 2 and 3)

- **Earned strikes.** A near-straight full-power throw with bumpers on still strikes very often: 11 of 13 rolls in the audit run, and 3–4 strikes in 16–17 rolls in this pass's run, which had random aim jitter. Bumpers should guard the gutters, not aim the penguin.
- **Count standing pins aloud** every roll, with the "fell + standing" line always visible rather than opt-in.
- **Phase 3:** proper themed pin art in the prediction dialog (emoji stand-ins for now).

# Phase 2: counting inside every roll (2026-10-09)

Source: the audit's Phase 2 row, "Earned strikes (bumpers guard, don't aim). Standing pins counted aloud every roll". Kept: the three lanes, swipe and curve aiming, bumpers, the 💭 prediction, the 10-frame scorecard and the calm Phase 1 celebrations.

## Design

1. **Earned strikes.** Bumpers only guard the gutters; the penguin no longer waddles over to line itself up. The penguin is lighter (mass 6, was 10) so the pins push back, and every slide has a tiny random wobble (±0.006 rad, about ±7 cm at the pins), so the same throw from the same spot no longer gives the same pins. A good line is needed for a strike; knocking some pins down stays easy.
2. **Counting every roll.** After each roll, the camera stays on the pins. Each pin still standing gets a soft ring on the ice and a number above it, one at a time (0.7 s apart), spoken aloud: "1", "2", "3 still standing". A number bond card at the bottom shows two groups of pin pictures: the fallen pins lying down and the standing pins lighting up as they are counted, then "= 10". Then it says, for example, "7 fell and 3 standing. 7 and 3 make 10." A strike or spare shows 10 + 0 = 10 with the existing calm banner. The 💭 prediction stays optional; its comparison line now appears only when the child made a prediction, because the bond card already says the rest.
3. **Spares (spatial read).** Before a second roll, the rings stay under the pins that are left and the game asks "N pins left. Where are they?" Three picture buttons show the lane in thirds (left, middle, right). Picking a side with pins says "Yes! 2 pins on the left." and the penguin waddles to face them, but the child still aims and throws. Picking an empty side says "No pins in the middle. Look for the glowing rings." and greys that button. Swiping straight away is always allowed.
4. **Natural ending.** The results card names what was learned: "5 ways to make 10" with chips (10 + 0, 9 + 1, 8 + 2, 7 + 3, 4 + 6), spoken aloud.

All speech uses speechSynthesis and is silent when the game is muted.

## Changes (`examples/penguin-bowling/public/`)

- `js/count.js` (new): the `Counter` (rings, number sprites, timed spoken count, `keepRings` for the spare read) and `sideOf`.
- `js/main.js`:
  - `speak` at :69
  - `WOBBLE` at :88 and :274
  - `standingPins` at :289
  - `showBond` at :305
  - `finishRoll` at :323 (bond, count, `resultWait`)
  - `nextRoll` at :373 (bumper auto-walk removed; `askWhere` instead)
  - `askWhere` and `chooseSide` at :401–435
  - `gameOver` at :465 (ways to make 10; clears rings)
  - title and start reset the bond, picker and counter
- `js/penguin.js:77`: mass 10 → 6.
- `index.html`: `#bond` card, `#where` picker, and `.bonds-box` on the results card.
- `style.css`, end of file: bond card, pin icons, lit rack dots, picker (bottom centre on tablets; a left-edge column on upright phones; label hidden on short landscape phones), results chips, `body.bond-only` and reduced motion.
- Not edited: the shared `prediction.js` and `prediction.css`.

## Evidence

Scripted thrower: `scratchpad/p2/penguin-bowling/measure.mjs` and `centre.mjs`. Each result is the first ball on a full rack; the careful player is aim x ~ N(0, 0.18), angle ~ N(0, 0.025), power 0.6–1.

| Thrower | Before (mass 10, auto-walk) | After |
| --- | --- | --- |
| Stand in the middle, press Go (30 rolls) | 100% strikes | 33% strikes, mean 8.9, min 7 |
| Middle, full-power straight swipe | 0% (always 9) | 47% strikes, mean 9.3 |
| Careful player (60 rolls) | 42% | 23% strikes, mean 8.2 |
| Random toddler aim (30 rolls) | 17% | 3% strikes, mean 5.0, never 0 |
| Careful second ball lined up on the pins left | (not measured) | 74% spares (34/46) |

Before is the same harness with mass 10. In real play, the bumper walk put the penguin in the middle, where Go always struck.

Other tests:
- `browser.mjs --ids penguin-bowling --run p2`: Chromium and WebKit pass with 0 errors.
- `node --test examples/_studio/tests/*.test.mjs`: 11/11 pass.
- `original-quality.mjs`: all pass, including both pin-prediction checks. One earlier run showed a single `TimeoutError` line that did not reproduce in two clean reruns.
- Own playthroughs (`play.mjs`, real swipe and picker taps) at 834×1194, 1194×834, 390×844 and 667×375, plus full 10-frame games portrait (128) and landscape (179): no console errors.
- Screenshots: `scratchpad/p2/penguin-bowling/{p,l,ph,s,pf,lf}-*.png`.

## Left

- Family play: is the count (up to about 8 s on a gutter ball) restful or slow for a 4-year-old? Is the "Where are the pins?" question clear?
- The fallen-pin icons are small grey capsules. Phase 3 could draw themed pin icons (snowman and fish) for the bond card and the prediction dialog together.
- On a second roll, the bond counts the whole rack (for example 10 + 0 = 10). If the child made a prediction, the 💭 line counts only that roll (6 fell + 0 standing = 6).
