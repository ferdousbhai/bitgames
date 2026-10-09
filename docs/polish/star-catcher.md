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

# Phase 2: real constellations (2026-10-09, not yet deployed)

Source: the audit's Phase 2 row ("Real constellations lit star by star and named on arrival, one per planet. Stars collected into a visible row instead of points").

## Design

- **One true constellation per planet.** Moon: Cassiopeia (5). Ring Planet: Southern Cross (4). Candy Planet: Orion (7). Snowy Planet: Little Dipper (7). Jungle Planet: Big Dipper (7). That makes 30 stars in a trip.
  - Shapes come from a gnomonic projection of each star's catalogue RA/Dec, seen as in the sky with east on the left.
  - The Little Dipper is turned on its side to fit the panel. Navi in Cassiopeia is lifted a little so the W reads clearly.
  - Betelgeuse is drawn orange and Rigel blue-white. The North Star is drawn larger.
- **Building it.** A calm sky panel in the top-left corner shows dim dots where every star belongs, plus a steady ring on the next one.
  - Each caught star (plain, pink or lilac) flies up in a soft arc and lights the next star. Every catch lights exactly one star.
  - A line grows from the earlier star once both ends of a line are lit.
  - Each star plays a soft bell one step higher, and its number is spoken ("1", "2", …).
  - While the star-counting mission runs, its own voice does the counting, so there is never a double count.
- **Completing it.** The planet glides in as the shape fills (journey progress = stars lit ÷ stars in the shape).
  - When the shape is complete, Kitty reaches the planet. The panel shows the name, the banner shows the name and a short line, and Kitty says "You made Cassiopeia! Cassiopeia looks like the letter W."
  - Stars stop falling during this calm moment. It lasts at least 6 s, and until the speech has finished (12 s at most).
- **Facts** (one simple, true fact each):
  - Cassiopeia looks like the letter W.
  - Sailors used the Southern Cross to find the way south.
  - Orion has three stars in a row for his belt.
  - The North Star is at the end of the Little Dipper's handle.
  - The Big Dipper points to the North Star.
- **Points are gone.** There is no score pill, point values, ×2 heart power-up or pink double bubble, and the title has no point legend.
  - A gem adds a small blue "twinkle" beside the current constellation, at most 6 per constellation. Gems still drive the three-gem mission.
  - The 🧲 magnet stays as a helper.
- **Natural ending.** After the fifth constellation, Kitty says "Time to fly home!". The sky eases into a deep night, and the journey bar's final 🏠 track fills over 4.5 s.
  - Home shows **Your night sky**: every constellation the child built, lit again one after another, with the line "⭐ 30 stars · 5 constellations".
  - It is spoken: "Welcome home! You lit 30 stars and made 5 constellations: Cassiopeia, the Southern Cross, … Tap one to hear about it."
  - Tapping a card brightens that constellation and speaks its name and fact.
  - **🚀 Fly again** starts a new trip; 🏠 returns to the title. The trip no longer loops forever.
- **Missions kept.** All three missions work on the shared `adventure.js`.
  - In the count-5 mission, the first constellation is the five-star Cassiopeia, so the mission count and the lit stars agree at every catch.
  - The mission card's star line is now Cassiopeia's W instead of the generic zigzag.

## Changes (`examples/star-catcher/public/`)

- `js/sky.js` (new):
  - constellation data and facts (`CONSTELLATIONS`)
  - `ConstellationView`: dim dots, lit stars, lines that grow, the next-star ring and twinkles
  - `Sky`: the panel, star flights, completion callback and the home night sky
  - All of it is runtime three.js (sprites, rounded `ShapeGeometry`, quad lines), drawn as a second orthographic pass in CSS pixels that follows DOM layout boxes.
- `js/main.js`:
  - `renderer.autoClear = false` with clear, scene, then sky pass in `frame()`
  - `game.phase` is build / arrive / homeward (`:76`)
  - `catchItem`, `starLit` and `toScreen` (`:368–408`)
  - `arrive`, `nextLeg` and `showFinale` (`:426–513`)
  - `renderJourney` with a final 🏠 (`:537`)
  - `resetTrip`, `flyAgain` and the finale Home (`:686–735`)
  - Kitty rests in the corner at home (`:790`)
  - Removed: points, score, `legPoints`, the heart/double power and the bubble.
  - The `?debug` hook now also exposes `sky`, `items` and `camera`.
- `js/audio.js`: `light(n)` (a soft bell per lit star) and `constellation()` (a slow chord).
- `index.html`:
  - `#sky-panel` and `#sky-name` replace the score pill.
  - `#powers` moves under the panel.
  - The legend is removed and the tag reads "light up the stars in the sky".
  - New `#finale` screen.
- `style.css`:
  - panel sizes (132×104 by default, 124×92 on short landscape, 172×132 on tablets)
  - on narrow portrait phones the journey and mission card start below the panel
  - legend rules removed
  - finale grid, cards and actions
  - `.sky-name` added to the reduced-motion block

## Evidence

- `node examples/_studio/tests/browser.mjs --browser chromium --ids star-catcher --run p2`: pass, 0 errors.
- The same with `--browser webkit`: pass, 0 errors.
- `original-quality.mjs`: all PASS, including "star-catcher: native mission choice persists and starts at zero".
- `node --test examples/_studio/tests/*.test.mjs`: 10/11. The one failure is the expected stale manifest, which needs the coordinator's rebuild.
- Own end-to-end play (`scratchpad/p2/star-catcher/play.mjs` steers with real mouse input to the lowest falling star):
  - 834×1194, 1194×834, 390×844 and 667×375 all reach the finale with all five names, "⭐ 30 stars · 5 constellations" and 0 console errors.
  - A full trip takes about 80–90 s of catching plus the arrival pauses.
  - Fly again restarts at 0/5 on Cassiopeia.
- WebKit, 834×1194 with real steering: all five legs and arrivals render correctly (`wk-leg*-arrive.png`), but headless WebKit runs at a low frame rate, so the bot did not reach home within 300 s.
- WebKit, 1194×834 (`wkfast.mjs` sends the same `sky.claim` a caught star makes): reaches the night sky with 5 cards and 0 errors (`wk-fast-1194x834-finale.png`).
- `mission.mjs` runs:
  - Count-5 mission: the mission count and lit stars rise together, and the mission completes on the fifth star of Cassiopeia.
  - Three-gem mission: a gem adds one twinkle and one mission count.
  - Reduced motion: stars light instantly with no flight or growth animation, and the leg completes.
- Screenshots are in `scratchpad/p2/star-catcher/`:
  - `p-finale-tap.png`, `l-finale.png`, `ph2-finale.png`, `pl-finale.png`, `wk-fast-1194x834-finale.png`
  - `m-constellation-arrive.png`, `p-leg1-arrive.png`, `pl-leg3-arrive.png`
  - `ph-leg4-panel.png`

## Left for later

- Family play: is a 30-star trip the right length? Each leg is now short (4–7 catches).
- Phase 3 art: constellation pieces (Blender) could replace the glow sprites. The exhaust trail is still dense.
- Rainbow and pink stars only add variety now. Consider whether they should light a coloured star.
- Short-landscape phones: the mission card sits bottom-left, as before.
