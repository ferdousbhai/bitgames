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
