# Star Catcher: Phase 1 calm pass (2026-10-09)

Source: the [2026-10-09 audit](AUDIT_2026-10-09.md), Phase 1. Missions, the constellation card, spoken counting, power-ups, planets and the UFO all remain.

## What changed and why

All references are to `examples/star-catcher/public/`.

### Motion

- **Rainbow star** (`js/main.js:232`): a steady pearly lilac replaces the per-frame hue cycling.
- **Halos and item pulses** (`js/main.js:~820`): the shared halo opacity pulse at about 0.8 Hz is gone (halos are a steady 0.4). The magnet, heart and special-star scale pulses are gone too.
- **Sparkle trails** (`js/main.js:~812`): emission drops from about 22/s to about 2.5/s per special item, and stops once the item bounces.
- **UFO lights** (`js/main.js:~870`): `sin(t*8)` blinking with emissive 0.6–2.2 becomes a slow alternating glow at `sin(t*1.2)` with emissive 0.8±0.3.
- **Rocket** (`js/main.js:733`): the fast flame flicker (sin 17/23/31) and glow flicker (sin 27) become a slow breathing.
- **Rocket accessories**: the badge, bubble and pilot joy wobble are slowed.
- **Dizzy reaction**: a gentle sway replaces the 4π spin.
- **Reduced motion**: with `prefers-reduced-motion`, the arrival barrel roll and the dizzy sway are skipped.

### Celebration

- **Planet arrival** (`js/main.js:449`): the 70-piece confetti burst is replaced by 12 pale, slow sparkles around Kitty, played once. The fanfare is now a soft sine arpeggio (`js/audio.js` `fanfare`).
- **Each catch**: the burst is 6–10 small particles instead of 20–36, and the ring is gone.
- **Power-up**: the burst is 10 particles instead of 30, and the ring is gone.

### Feedback

- **Numbers and score**: the "+N" popups, the score bump animation and the 🏆 best pill are removed. So is the title's "Best" line and its storage write.
- **Catch notes** (`js/main.js:412`, `js/audio.js:85`): the combo pitch climb is replaced by a note chosen by *where* the star was caught, low on the left and high on the right.

### Pacing

- **Constant pace** (`js/main.js:196`): `leg()` now keeps speed 2.3 and spawn interval 1.0 s at every planet. Later planets still add gems, pink and rainbow stars, power-ups and rocks; the rock rate is capped at 0.06.
- **Idle hint** (`js/main.js:885`): the drag-hand nudge now appears once per flight, after 30 s idle instead of 4 s. Its swing is slower and shorter.

### Audio

Quieter engine, boing, power-up and UFO drop sounds.

### CSS (`style.css`)

- Removed the infinite logo bob, the Fly button pulse and the pill/power bump animations.
- Added a reduced-motion block.

## Bugs fixed

- **🏠 Home** (`index.html` HUD, `js/main.js:623`; Esc also works): returns to the title and mission choice. It clears items, score, stops, power-ups, the UFO, speech and the journey. Before, only a reload left a flight.
- **Completed mission card** (`js/main.js:153`, `style.css` `.resolved`): the card shows the finished state for 3.5 s, fades and hides. Starting again resets it.
- **HUD band** (`js/main.js:679`, `:823`): `view.hudY` is measured from the score, journey and the top mission card. Falling items grow in just below that line instead of sliding through the HUD, and can only be caught once fully grown. The UFO now flies just under the band.
- **Mission pace persistence: intended, no change.** The choice is visible on the title button. `original-quality.mjs` asserts that the choice persists across reload, and Home now lets the child change it.
- **Mission label on return** (`goHome` calls `renderMissionChoice()`): the title button shows the picture label ("⭐⭐⭐⭐⭐ Count 5 stars") instead of the shared helper's plain label.

## Verification

- `node examples/_studio/tests/browser.mjs --browser chromium --ids star-catcher --run calm`: passed, 0 errors (layout, touch targets, both orientations).
- `original-quality.mjs`: "star-catcher: native mission choice persists and starts at zero" passes.
- Own playthrough (`sc2.mjs`) at 834×1194 and 1194×834:
  - The count-5 mission completes and its card hides (`goalHidden: true`).
  - Planet arrival plays.
  - Home returns to the title.
  - A new flight restarts at 0/5 with the card visible.
  - No console errors.
- Screenshots: before `scratchpad/audit/star-catcher/before/{p,l}-*.png`; after `scratchpad/audit/star-catcher/after-{p,l}-*.png`.

## Remaining (Phase 2 and 3)

- Real constellations, one per planet, lit star by star and named on arrival. This gives the game an ending.
- Collect stars into a visible row instead of points.
- Retire the 1/3/5 point legend and the ×2 power-up in favour of countable outcomes.
- The exhaust trail is still fairly dense pink; consider softening it during the Phase 3 art pass.
- Phase 3: constellation pieces (Blender).
