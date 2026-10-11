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

- **Calmer background (follow-up):**
  - The exhaust trail drops from about 120 puffs a second to about 18 in flight and 5 at home. The puffs are smaller, slower and in muted colours, and the nozzle glow and swerve sparkles are fainter. The change is in `js/main.js` `updateRocket`.
  - At home, the sky scroll eases to a stop, the background clock runs at 20% speed, and drifting planets stand still, so the constellations are the only focus. This is in `frame()`.
  - Chromium and WebKit browser checks pass again with 0 errors, and a full trip in Chromium at 834×1194 still reaches home with 0 errors (`calm-leg2-lit3.png`, `calm-finale.png`).

## Left for later

- Family play: is a 30-star trip the right length? Each leg is now short (4–7 catches).
- Phase 3 art: constellation pieces (Blender) could replace the glow sprites.
- Rainbow and pink stars only add variety now. Consider whether they should light a coloured star.
- Short-landscape phones: the mission card sits bottom-left, as before.

# Simplify pass (2026-10-09)

- One voice (`js/speech.js`) is shared with the mission helper.
  - Star counts, the start line and finale taps interrupt what is being said; the planet fact, "Off to…", "Time to fly home!" and the welcome-home line wait in the queue.
  - The arrive phase waits for the fact's `onend`, or until nothing is left to say after a hush, instead of polling `speechSynthesis` with a 12 s cap.
- `clearPlayfield()` holds the teardown that the finale and a new trip both need.
- `renderJourney()` rebuilds the bar only when the trip moves to a new leg. Every other frame it changes only the widths that moved.
- `sky.js` changes:
  - Flight sprite materials are disposed.
  - `Backdrop` has a `dispose()`, which `closeFinale` calls.
  - `lit` keeps a count instead of filtering every frame.
- Removed dead code:
  - the `Rings` effect
  - `TOTAL_STARS`
  - `@keyframes bob`
- Checks: Chromium and WebKit browser checks pass with 0 errors. A scripted trip with recorded speech reached home after 5 constellations, with the counts, facts and "Off to…" lines in order. The mission choice still cycles and survives going home.
- Second pass:
  - The mission options carry their own `pictures` and `caption`, and the shared helper draws the button. `renderMissionChoice` and the `.mission-choice-*` CSS are gone; the ↻ size and no-wrap pictures are kept on `#adventure-choice .adventure-*`.
  - The gem mission is marked `gems: true` instead of being matched by its label.
  - The `missionCounting` guess is replaced by `adventure.event()`'s return. The sky stays quiet for a star the mission counted (`'counted'` or `'done'`).
  - `renderJourney` rounds the homeward fill to 1/500 and moves the bars with `transform: scaleX`.
  - Taps use `voice.sayNow`. Muting calls `voice.hush()`.
  - Removed the leftover `animation-delay` on the `.logo span` colour rules.
  - Checks: Chromium and WebKit browser checks, `original-quality.mjs` and the unit tests pass. In a scripted 5-star mission, the mission counted 1–4 and then said the reward. After that the sky counted aloud, as before. Mute cancels speech. No page errors; headless WebKit logs one "Failed to start the audio device" console error from its audio device.
- Third pass:
  - The finished mission card uses one timer that adds `.resolved`; the CSS opacity transition fades it. The second timer and the `hidden` write are gone. The card has `pointer-events: none`, so the faded card can't block taps, and Home or a new trip clears `.resolved`.
  - The progress caption and gem row read `option.target`. The custom progress sets its own `aria-label`.
  - Removed the unused `emoji` on the two options that set `pictures`, and the `#adventure-goal[hidden]` rule (now in `adventure.css`).
  - The voice starts with the saved mute setting, and the sound switch calls `voice.setMuted`.
  - Checks: Chromium and WebKit browser checks, `original-quality.mjs` and the unit tests pass. With speech stubbed: the goal is hidden on the title and in free flight, shows in play, fades to opacity 0 (not hidden) after completion and is gone at Home; the mission button hides in play and returns at Home. Starting while muted is silent, unmuted start says the goal, mute cancels speech. No console errors.
- Exit paths:
  - `start()` keeps the handle of the 400 ms timer that hides the title, and `resetTrip()` (🏠, Escape, fly again) clears it with the mission timers and the hush, so 🏠 right after ▶ no longer leaves a bare scene.
  - Checks: `node --check`, Chromium and WebKit `--run exits`, `original-quality.mjs` and the unit tests pass. With speech stubbed, 🏠 100 ms after ▶ cancels speech and two seconds later the title is visible (no `hidden` or `fade`) in the title state. No console errors.

# Round 1: every catch is a choice (2026-10-11)

Source: the star-catcher section of the [2026-10-10 audit](AUDIT_2026-10-10.md) (5.5/10: the constellation filled itself whatever was caught, leftover magnet/pink/rainbow/gem economy, no step up for 6–8, Southern Cross mixed with the North Star, no music switch, Kitty clipped at home).

## Design

- **Numbered stars.** Every falling star carries a number. Only the number the panel needs lights the next star of the constellation. A wrong number does not light anything: the star floats softly back up and shrinks away, a soft two-note "hmm" plays (never a buzzer), and the next star's ring in the panel brightens for a moment. Careful steering now differs from sweeping up everything.
  - About half the stars carry the needed number (always at least one on its way). The rest are near neighbours: one before or after, or a step away when counting in steps. These are the mix-ups worth noticing.
  - Waves are now counting lines: up to four stars carrying the next numbers in order, lowest first, to swoop through and count on.
  - When a star lights, other stars with the same number fade away. When a constellation is finished, every remaining star fades, so a new constellation never starts with the old numbers.
- **Adaptive levels (never a gate).** Shown on the banner and said once per trip:
  - 0 *Match the numbers*: the panel shows the number to find.
  - 1 *What number comes next?*: the panel shows the last number lit and a "?".
  - 2 *Count by twos*, 3 *Count by fives*: the same "?", counting in steps.
  - After each constellation, at most one wrong catch moves up a level and four or more move back down. A trip starts one level below the last level reached (a warm-up, and kind to a younger sibling). After two wrong catches on one constellation, the "?" turns into the number as a scaffold, then closes again after the next correct catch.
  - The *Gentle star counting* mission (slower pace) always matches the numbers 1 to 5.
- **Panel.** It is larger (150×118 on phones, 220×170 on tablets). The whole shape is drawn as a faint ghost from the start, so the child sees the picture being built. Two labels at most: the star to catch next, and the star lit last. Each sits in the clearest of eight spots around its star, inside the panel, so close stars (Orion's belt) never get overlapping numbers.
- **Constellation pool.** The Southern Cross is gone (it could never share a sky with the North Star). Cygnus (the Northern Cross), Cepheus (the little house) and Lyra (with Vega) are added, projected from catalogue RA/Dec like the others. Each trip draws five of the seven: a five-star one first (for the count-to-five mission), then four at random. Every one can be seen from the northern half of the world (Orion sits on the equator), so the night sky at home is one real sky.
- **Night sky riddles.** At home the cards start without names. The voice asks for each constellation by its shape ("Find the W.", "Find the little house.", "Find the hunter with a belt of three stars."). A correct tap names it, says its fact and asks the next one. A wrong tap says that card's own name and asks again, so every tap teaches something. The trip ends with "You know your whole night sky."
- **Removed arcade economy:** the magnet power-up and its timer bar, the nose badge, the pink and lilac stars, gems and twinkles, the gem mission and the power-up popups.
- **Thinner voice.** Each star's number is said for the first five (5, 10, 15, 20, 25 when counting by fives; the same rule as `voice.count`), then the bell and the panel carry the count. The fact is said once without "You made X!" in front of it, the "Off to the …" line is banner-only, and the wrong-number hint ("That one is 6. What comes after 4?") is said at most twice per constellation. A careful full trip spoke 38 lines in flight, and the riddles at home add one per find.
- **Music switch.** A 🎵 button in the HUD and at home (key N) fades only the music; the bells, voice and effects stay. The choice is remembered.
- **Kitty at home** now rests fully on screen (`view.w - 1.6`, `-view.h + 2.2`). On narrow phones she waits beside the last card instead, clear of the buttons. The drawn constellations re-follow their cards whenever the riddle line changes height.

## Changes (`examples/star-catcher/`)

- `public/js/main.js`
  - `LEVELS`, `level()` and `neededValue()` (`:95–116`)
  - mission card drawn from the trip's first constellation (`drawConstellation`, `:118`); the gem mission is removed and the gentle mission now reads "Catch stars 1 to 5"
  - `KINDS` is only star and rock (`:201`)
  - `spawn`, `labelStar`, `pickNumber`, `spawnWave` (`:277–356`)
  - `catchItem`, `wrongStar`, `starLit` (`:370–421`)
  - `arrive` fades the leftover stars and calls `adapt` (`:444`)
  - `nextLeg`, `adapt`, `beginConstellation` (`:470–520`)
  - `showFinale`, `showRiddle`, `tapSky` (`:526–575`)
  - `toggleMusic` (`:650`); `start` sets the warm-up level and calls `voice.newRound()` (`:740`)
  - Kitty's home spot (`:878`)
  - `updateItems` (`:939`) drops the magnet pull and the special-star sparkles, floats wrong stars up and shrinks fading ones
  - the `?debug` hook also exposes `neededValue`, `level`, `finale` and `tapSky`
- `public/js/sky.js`
  - the seven-constellation pool with riddles (`:14`) and `planTrip()` (`:102`)
  - `ConstellationView` (`:186`) gets ghost lines, `setLabel` (`:261`), `labels` ('all' or 'ask') and `call`; the twinkles are gone
  - `Sky` gets `trip`, `begin(index, el, values)`, `set labels` (`:477`) and `call()` (`:482`)
- `public/js/effects.js`: `numberTexture(text)` (`:181`), cached number sprites; `Popups.showAt` is removed.
- `public/js/audio.js`: `setMusic` (`:64`), `notThis` (`:101`), a single `catch` note; `powerUp` and `powerDown` are removed.
- `public/index.html`: the 🎵 buttons, `#powers` removed, a new tag line.
- `public/style.css`: panel sizes, the `.round.off` music state, `.finale-cell.found` and `.finale-count`, the journey placed right of the panel on portrait tablets, room for three HUD buttons on short landscape phones; the power, gem and side-popup rules are removed.
- `game.json`: `howToPlay` and `learning` describe the numbered stars, the levels and the riddles. `bitgames.json` hashes need the coordinator's rebuild.

## Evidence

Scripts and screenshots are in the session scratchpad, `polish/star-catcher/`.

- `node --check` passes on `main.js`, `sky.js`, `audio.js` and `effects.js`.
- `EXAMPLES_ORIGIN=http://localhost:4213 node examples/_studio/tests/browser.mjs --ids star-catcher --run star-catcher-r1`: BOOT + PLAY ready, 0 errors.
- `play.mjs` steers with real mouse input to the star with the needed number, and stubs `speechSynthesis` to log what is said:
  - 834×1194, full trip, about 115 s. Cassiopeia (0 misses) → level 1, Big Dipper (2) stays, Little Dipper (0) → twos, Cygnus (1) → fives, Orion at fives. At home: one wrong tap ("That one is the Big Dipper. Find the W."), then five finds, ending "You know your whole night sky."; the cards show their names only once found. 51 spoken lines in all (38 in flight, 13 at home), 0 errors.
  - 1194×834 (full trip), 390×844 (sloppy, any star) and 667×375: 0 errors.
  - Sloppy play hears "That one is 3. Find 2." and the constellation waits for the right number.
- `mission.mjs` (1194×834):
  - The mission choice persists across reload and starts at "0 / 5".
  - Five correct catches complete it: the mission counts 1–4 and says the reward, and the sky stays quiet.
  - 🎵 adds `.off` and stores `false`.
  - 🏠 returns to the title.
  - 0 errors.
- `snap.mjs`: two-digit labels ("10") stay readable on a tilting star (`s-twodigit.png`), and a wrong star floats up while the ring brightens (`s-wrong.png`).
- `panels.mjs` draws all seven constellations at 0 and 3 lit (`pn-*.png`). The labels stay inside the panel and clear of each other, including Orion's belt (`pn-4-3.png`).
- Screenshots: `p-leg0-lit2.png`, `p2-leg0-lit2.png`, `l-leg1-arrive.png` (Cepheus), `p-finale.png`, `p-finale-found.png` (Kitty fully visible), `pl-leg0-lit2.png`, `ph-leg0-lit2.png`, `m-start.png`.

## Remaining ideas

- Family play: whether a level-0 three-year-old copes with distractors, or whether they need more of the needed number. The gentle mission gives 65%.
- A "count back" level (the stars light from the top number down) and teen numbers, for children who master fives.
- Waves could also carry a deliberate gap ("3, 4, _, 6") to make spotting the missing number the challenge.
- The mission card's tiny ☆ row could use the bigger panel instead.
- WebKit was not rerun this round.

# Round 2: each row is one choice (2026-10-11)

Source: independent review 1 (7.4/10). The blockers were that careful play and random sweeping finished at the same time, there were about 51 spoken lines a trip, the top tier stopped at counting by fives, and there was one mechanic with no choice of route or shape.

## Design

- **Rows of choices.** Stars no longer stream down on a spawn timer. One row of two or three numbered stars falls side by side, spread across the sky. Only one row is on screen at a time.
  - Catching a star resolves the row and the others fade.
  - A right pick brings the next row after 0.45 s.
  - A wrong pick floats away with a soft "hmm". The right star of that row stays a moment longer (1.3 s, and it can't be caught) to show which one it was. The next row waits 1.8 s.
  - A row that drifts past untouched is replaced with no cost.
  - After two wrong picks in a row on one star, rows drop to two stars until it is found, and the panel shows the number instead of "?".
  - Because rows start fresh for each needed number, stale distractors are gone: no 4 or 16 appears while counting by fives.
- **Each level has its own mix-ups** (`LEVELS[].near`). These are the number already lit, the one skipped, counting by ones instead of in steps, or the digits swapped.
- **Six levels, easiest first:**
  - match (two stars a row)
  - what comes next
  - count back from 10 ("like a rocket")
  - twos
  - fives
  - big numbers from 11, 12 or 13, where 31 sits beside 13
  - On the "?" levels, the first star shows its number.
- **Adaptation by the share of wrong picks, not a raw count.** It moves up at ≤17% wrong on this constellation and ≤20% across the last two at this level. It moves down at ≥40% across the last two. The memory clears on a level change. A trip still starts one level below the last level reached.
- **Choosing the next shape.** At each planet, after the fact, two constellation cards show the whole shape drawn in stars with a short picture caption ("It looks like a little house", "A big spoon that points north"). The child taps one to build next. The voice asks once per trip. The trip is now the first five-star shape plus four the child chose from the remaining pool (`planTrip` returns `{ trip, pool }`).
- **Thinner voice:**
  - Numbers are counted aloud star by star only on the trip's first constellation at the match level. The gentle mission keeps its own count.
  - Every other constellation's numbers are said once at the planet as a little counting rhyme before the fact ("5, 10, 15, 20, 25! Cassiopeia looks like the letter W.").
  - One spoken hint per constellation, queued rather than interrupting, so a number never cuts it off. Hints read "We have 4 already. What comes after 4?" when the child picks the star already lit.
  - "Time to fly home!" joins the last fact.
  - Each find at home is one line: "Yes! fact. Next riddle."
- **Panel labels** are 2.9× the star size (about 31 px digits on the tablet panel, which grows to 250×190). The home sky stops new drifting planets and removes any that are there, so nothing sits behind the riddle and cards.
- The UFO is now scenery only and drops nothing.

## Changes (`examples/star-catcher/public/`)

- `js/main.js`
  - `LEVELS` with `values` and `near` (`:118`)
  - `rowValues`, `spawnRow`, `resolveRow` and `spawnRock` (`:334–377`); `pickNumber` and `spawnWave` are removed
  - `catchItem`, `wrongStar` (one queued hint) and `starLit` (counts only when `game.counting`) (`:391–455`)
  - `arrive` says the counting rhyme (`:476`)
  - `afterArrival`, `chooseNext`, `flyHome` and `nextLeg(def)` (`:505–560`)
  - `adapt` by share (`:566`); `beginConstellation` (`:580`)
  - `world.calm` on finale and reset (`:603`, `:891`)
  - the reveal in `updateItems` (`:1049`)
  - the row loop in `frame()` (`:1149`)
  - the debug hook adds `LEVELS` and `chooseNext`
- `js/sky.js`
  - `planTrip` → `{ trip, pool }` (`:105`)
  - label size (`:271`); the first "?" shows its number (`:347`)
  - `offer`, `pick`, `showChoice` and `closeChoice` (`:446–480`), with a `choiceRoot` pass
- `js/world.js`: `calm(on)` (`:197`)
- `index.html`: the `#choose` cards and the title tag line
- `style.css`: `.choose` and `.choose-cell` (`:153`); the tablet panel is 250×190 and the portrait journey starts at 272px
- `game.json`: `howToPlay` and `learning`

## Evidence (scripts and shots in the session scratchpad `polish/star-catcher/`)

- `node --check` passes on main, sky and world. `browser.mjs --run star-catcher-r2`: BOOT + PLAY ready, 0 errors.
- `play2.mjs` (real mouse steering, speech stubbed):

| Run | Flight time | Path | Spoken lines | Errors |
|---|---|---|---|---|
| 834×1194 careful from level 0 | 150 s | 0 misses; match → next → back → twos → fives → big | 18 in flight, 24 in all | 0 |
| 834×1194 random sweeper from level 0 | 296 s | stays at match; 4–12 misses a shape | 18 in flight, 24 in all | 0 |
| 1194×834 careful from fives (stored 5) | 169 s | climbs to big numbers | 17 in all | 0 |
| 1194×834 random from fives | over 400 s for four shapes | demoted every shape: fives → twos → back → next → match | 15 for four shapes | 0 |
| 834×1194 mixed (every fourth row random) | 169 s | 1 miss a shape, still climbs | 28 in all | 0 |
| 667×375 careful from stored 3 | 179 s | back → twos → fives → big | 17 in all | 0 |
| 390×844 gentle mission | 235 s | stays at match (two stars a row) | 19 in all | 0 |

- `mission.mjs`:
  - The mission choice persists across reload and starts at 0/5.
  - It completes at 5/5. The mission counts 1–4 and says the reward.
  - The music switch is stored, and Home returns to the title.
  - 0 errors.
- Screenshots:
  - `sp-row0.png`: a row of 13 / 12 / 21 with 12 needed
  - `sp-wrong0.png`: after a wrong pick the 2 lingers
  - `r2c-leg1-choose.png`, `L5c-leg2-choose.png`, `pl-leg1-choose.png` and `ph-leg2-choose.png`: choice cards in all four layouts
  - `L5c-finale.png`: a clean home sky with no drifting planet

## Remaining ideas

- The gentle mission (pace 0.6) makes a slow trip, about 235 s. It could speed up after its five-star mission is done.
- A missing-number row ("3, 4, _, 6" shown in the panel) and tens would add more for 7–8 year olds.
- Let the child trace lines between lit stars before the shape is named.
- WebKit was not rerun this round.

# Round 3: join the dots, fresh sequences, a faster climb (2026-10-11)

Source: independent review 1 of round 2 (7.8/10). The blockers were:

- Sequences were fixed, so after one trip a child recited them from memory.
- The top tier stopped at teen numbers.
- Building the constellation was decoration: one mechanic, with no decision of its own.
- A capable child climbed one level per shape.
- Planets drifted behind the HUD and the cards.
- Orion's belt merged into one blob, and number labels read differently over the star and over the sky.

## Design

- **Join the dots.** In flight the caught stars still light in the panel, but no lines are drawn.
  - When the shape is full, it moves into a big card at the planet with a number beside every star. The scene behind is dimmed and Kitty waits low and to one side.
  - The child joins the dots by tapping the stars in counting order. That is the order they were caught, so 10, 9, 8 when counting back, or 9, 12, 15 for a pattern.
  - Each line appears once both of its stars are joined, so the cross, the W or the house is drawn by the child's own number order. Only after that is it named, with the fact.
  - A tap out of order plays the soft "hmm" and rings the star that comes next. It is counted as a miss for adapting, and one spoken hint is given per shape.
  - Tapping a number counts as tapping its star. When stars are close together, a tap nearly as close to the wanted star counts as that star.
  - At the match level a ring marks every next star. Above it, the ring marks only the first.
- **Every sequence starts somewhere new:**
  - next counts on from 2–8
  - back counts down from 8–15
  - twos start at an even number from 2 to 10
  - fives start at a multiple of 5 from 5 to 20
  - big starts at 12–41, never 11, 22 or 33, or a multiple of ten, so the swapped digits always make a different number
- **Two new top tiers:**
  - *Tens*: jumps of ten from any number (7, 17, 27…). Only the tens digit changes. The mix-ups are counting by ones (18), the one already lit and the one skipped.
  - *Pattern*: the panel shows the last two numbers and a "?". The jump (2, 3, 4, 5 or 10, up, or 2 or 10 down) is the puzzle, and it never repeats twice in a row. The first two stars show their numbers.
  - The banner names the start ("Count by twos from 6") instead of a fixed rhyme.
- **Faster climb:** a flawless shape (no wrong catches or taps, at least 8 right picks) moves up two levels instead of one. A careful child from a new device now goes match → back → fives → tens → pattern.
- **Visual fixes:**
  - **Planets stay below the HUD band.** The next planet waits in place and grows as the shape is lit. Its top, rings included, is clamped below `view.hudY`. Drifting planets grow in just below the band.
  - **Number plates.** Every number (falling stars, panel, join card) is dark digits on a solid cream plate with a gold rim. 4, 10 and 31 read the same over a star or the sky, and the star's face no longer shows through.
  - **Close stars stay separate.** Glows are capped by the distance to the nearest star, and lines stop a little short of their stars. Orion's belt is spread slightly (as Navi was in Cassiopeia), and the choice cards are taller (240 px), so the belt reads as three dots.
  - **Brighter ghost.** The ghost lines start at opacity 0.34 and fade as stars are lit, so the picture to build is clear from the first second.
  - **Mission card.** The gentle mission card is just "⭐ Catch stars · n / 5". The unreadable ☆ row is gone.
  - **Opaque cards.** The panel backdrop is 0.8 (0.95 in the join card), the choice cards are 0.96, and the scene behind the join and choice cards is dimmed.

## Changes (`examples/star-catcher/public/`)

- `js/main.js`
  - `LEVELS`, `between`, `jump` (`:127`)
  - `renderMissionProgress` is caption only (`:160`); `drawConstellation` is removed
  - `startJoin` and `joinTap` (`:474–515`); `sky.onComplete` now starts the join
  - `arrive` puts the name in the card caption; `afterArrival` → `sky.unjoin`
  - `adapt` with `flawless` (`:612–618`)
  - `renderJourney` treats join as the end of the track (`:731`)
  - Kitty waits during join, arrive and choose (`:1001`)
  - `#join` pointer handler (`:904`)
  - `wrongStar` hints are aware of the pattern level and of counting back
- `js/sky.js`
  - Orion's belt (`:71`)
  - `placeLabels` and `labelList` (`:278`, `:319`): greedy placement over 12 spots, clear of every star and of earlier labels; modes 'all' / 'ask' / 'ask2' / 'join'
  - glow caps (`:348`), the fading ghost (`:357`) and line gaps (`:362`)
  - `dim` (`:427`)
  - `join`, `starAt`, `joinStar` and `unjoin` (`:544–590`)
  - `begin` sets `linesBy = 'joined'`
- `js/world.js`: planet `reach` (`:139`), the clamped rest height and the grow-in approach (`:242–252`), drifters grow in below the HUD (`:193`)
- `js/effects.js`: plated `numberTexture` (`:182`)
- `index.html`: `#join` / `#join-card` / `#join-cap`
- `style.css`
  - `.join` and `.join-card` (`:171–183`), including the narrow-portrait offset
  - `.hud-right` gets `z-index: 3`, so 🏠, 🎵 and 🔊 stay tappable over the join overlay
  - choice cards are 240 px; the `#adventure-goal svg` rule is removed
- `examples/star-catcher/game.json`: `howToPlay` and `learning`. The `bitgames.json` hashes need the coordinator's rebuild.

## Evidence (session scratchpad `polish/star-catcher/r3/`)

- `node --check` passes on main, sky, world and effects. `browser.mjs --ids star-catcher --run star-catcher-r3`: BOOT + PLAY ready, 0 errors.
- `play3.mjs` (real mouse steering, real clicks on the join card, speech stubbed):

| Run | Flight | Path | Spoken lines (flight / all) | Errors |
|---|---|---|---|---|
| 834×1194 careful from 0 | 159 s | 0 misses: match → back → fives → tens → pattern | 18 / 24 | 0 |
| 834×1194 random from 0 | 327 s | 2–18 misses a shape; next → match, then stays at match | 23 / 29 | 0 |
| 1194×834 careful from stored 4 | 179 s | twos → big → pattern ×3 (jump 3 every time, which led to the no-repeat rule) | 11 / 17 | 0 |
| 390×844 gentle mission | 238 s | match throughout | 14 / 20 | 0 |

- `fast.mjs` at 834×1194, 1194×834, 667×375 and 390×844: the join card, a wrong tap (ring plus one hint), the joined shape with its name, and the choice cards over a dimmed scene. 0 errors.
- `mission.mjs`:
  - The mission persists and starts at 0/5; it completes at 5/5, with 1–4 counted and then the reward.
  - The music switch is stored, and Home returns to the title.
  - 0 errors.
  - The mission card is now a slim caption (`r3m/m-start.png`).
- Screenshots:
  - `pc-leg0-join3.png`: half-joined Cygnus
  - `lf-L1-joinwrong.png`: Big Dipper at fives, with the ring on 15 after a wrong tap
  - `pc-leg4-arrive.png`: a tens Cassiopeia (4, 14, 24, 34, 44) named
  - `pf-L0-row.png`: a 37 / 73 / 38 row on plates
  - `lc-leg4-lit2.png`: the pattern panel "8, 11, ?", with the planet below the HUD
  - `c-orion-z.png`: the belt as three dots
  - `sp-L0-join.png` and `sl-L0-joinwrong.png`: phones

## Remaining ideas

- The pattern tier is the ceiling: a strong 8-year-old stays there for the rest of the trip. A later step could hide the second number ("3, _, 9, ?").
- The join card has no keyboard path (the arrow keys fly only). Tab-focusable stars would help switch users.
- The gentle mission is still slow (about 238 s) because of its 0.6 pace.
- The rocket marker on the journey bar overlaps the next stop's emoji at the end of a track (pre-existing).
- WebKit was not rerun this round.

# Round 4: a choice that matters, hidden numbers, a higher ceiling (2026-10-11)

Feedback from round 3 (8.5 and 8.1): the shape choice was cosmetic, the join replayed visible
numbers, pattern was the ceiling (and +10 patterns were easier than tens), the hints on twos
and fives said "What comes after 2?", the pattern panel did not show which number came first,
the gentle mission locked the trip at matching, the join card had no keyboard path, and the
journey rocket, panel corners and title planets still overlapped.

## Design

- **The choice is a challenge.** Each next-shape card carries a way of counting ("7 ⭐ · By fives +5"). The two are the level reached and one above it, or, just after a climb, the one before and the new one. The harder rule goes with the bigger shape, so the child trades a short, steady shape against a longer stretch. The voice names the pair once a trip ("Count by twos, or count by fives? Pick a shape."). A rule the child has just heard at the cards is not repeated at blast-off unless its line adds a tip.
- **Hidden numbers in the join.** Above matching, one number in the join card shows "?" (two from tens up, never side by side). When the join reaches it, the "?" star is ringed and three numbers appear in the card: the missing one and two telling mix-ups, never numbers already on the card. A wrong number fades, the ring brightens, and there is one hint per shape that names the rule. The order caught in flight is now used to work out a missing term.
- **The rule stays on screen.** Under the panel: "By fives +5 · 15 → ?" or, for patterns, "15 → 13 → ?". The order of the last numbers is no longer ambiguous, and the rule no longer lives only in a 4 s banner.
- **Hints name the step** (`stepHint`):
  - twos, fives and tens: "Counting by fives, what comes after 20?"
  - counting back: "Count back one from 12."
  - patterns: "From 22 to 24 is 2 more. What is 2 more than 24?"
- **A higher ceiling.**
  - *Pattern* jumps grow in turn: first 2 or 5, then 3, 4 or 2 down, then 4, 5 down, 10 down or 3. The +10 pattern, which was easier than tens, is gone.
  - A new top tier, *big jumps*, uses jumps of 9, 11, 12 and 20 up and 3, 4, 9 and 11 down. Every value stays between 1 and 99. Its mix-ups are the tens or the ones moved by one.
  - Big numbers no longer offer "2" as the swap of 20.
- **Gentle mission releases.** Matching and the 0.6 pace hold only until the five stars are caught (`missionHeld`). After that the trip climbs one level per shape, and it never overwrites the free-flight level.
- **Home sky revisits the maths.** Every other riddle asks how a shape was counted ("Which one did we count by fives?"), but only when no other shape was counted that way. After a wrong tap, the wanted card glows once.
- **Keyboard and switch access:**
  - In the join card, the arrow keys (or Tab) move a gold ring from star to star, and Enter or Space joins the ringed star.
  - The picker numbers are buttons, and the first one takes focus.
  - The first choice card takes focus.
- **Polish:**
  - The rocket rides inside a wider active track, and the next stop has a margin, so the rocket no longer covers a stop emoji.
  - On the title, no planets drift, and the first planet waits low on the left. It then eases into place.
  - The join backdrop is opaque.
  - Panel padding keeps a star's ring and plate inside the box. Labels stay clear of the rounded corners and of the lines, and the panel plates are a little smaller.

## Changes (`examples/star-catcher/`)

- `public/js/main.js`
  - `pickJump` / `patternOf`, the `LEVELS` fields `rule`, `ask` and `tip`, the `leap` level, and `missionHeld` (`:120–175`)
  - `stepHint` (`:177`), used by `wrongStar`, `joinAt` and `pickHidden`
  - `renderRule` (`:484`)
  - the join flow: `startJoin`, `hiddenStars`, `openPicker`, `pickHidden`, `joinStar`, `joinKey`, `joinAt` (`:540–660`)
  - `offerLevels` and `afterArrival` with the rule cards, `chooseNext(def, lvl)`, and `nextLeg(def, lvl, picked)` (`:697–785`)
  - `adapt` with `climbed` and a one-step climb after the mission (`:797`)
  - `showFinale` and `tapSky` with rule riddles and the wanted card's glow (`:838–900`)
  - the keydown join path, and the `track on` journey markup (`:944`)
  - `world.calm(true, { title: true })` on the title
- `public/js/sky.js`
  - `place`: edge padding (`:254`)
  - `placeLabels`: inset box and line avoidance (`:287`)
  - `labelList` '?' for hidden stars
  - `focusRing`
  - `join(el, ring, hidden)`, `hiddenNext`, `picking`, `moveFocus` (`:560–600`)
  - the opaque join backdrop
- `public/js/world.js`: the title rest spot for the waiting planet, and `snap` then ease (`setStop`, `update`, `calm`)
- `public/index.html`: `#sky-rule`, a `<b>` in each choice card, and `#join-pick`
- `public/style.css`: `.sky-rule`, `.journey .track.on`, `.choose-cell b`, `.join-pick` and the stop margin
- `game.json`: `howToPlay` and `learning`. The coordinator's rebuild refreshes the `bitgames.json` hashes.

## Evidence (session scratchpad `polish/star-catcher/r4/`)

- `node --check` passes on main, sky and world. `browser.mjs --ids star-catcher --run star-catcher-r4`: BOOT + PLAY ready, 0 errors.
- `play4.mjs` (real mouse steering, real clicks on the join, picker and cards, speech stubbed). All runs had 0 console or page errors:

| Run | Flight | Path | Spoken (flight / all) |
|---|---|---|---|
| 834×1194 careful from 0 (`final/`) | 165 s | match → back → twos → big → tens → leap; 5 pickers right first time | 19 / 25 |
| 1194×834 mixed from stored 5 (`final/`) | 202 s | fives → big → big → pattern → leap; hints "Counting by…" / "From 22 to 24 is 2 more…" | 18 / 24 |
| 834×1194 random from 0 | 366 s | match/next all trip, 4–21 misses a shape, picker wrong taps | 27 / 33 |
| 667×375 careful from stored 3 | 200 s | back → fives → big → tens → leap | 17 / 23 |
| 390×844 gentle mission | 189 s (was 238–270) | 5/5 matched, then next → back → twos → fives | 22 / 28 |

- `keys.mjs`: a whole leg by keyboard only (Enter to start, arrows plus Enter to join, Tab plus Enter in the picker, Enter on the focused card). 0 errors. Shot: `k-focus2.png`.
- Shots:
  - `lc-leg0-pick.png` / `ls-leg3-pick.png`: the picker in the join card
  - `pc-leg1-choose.png` / `ls-leg2-choose.png`: rule cards
  - `pc-leg2-lit2.png`: the chip "By fives +5 · 10 → ?"
  - `ls-leg4-lit2.png`: the chip "15 → 17 → ?" on a phone
  - `final/t*-title-16.png`: a clean title

## Remaining ideas

- The 124×92 panel on sideways phones is still tight for three plates in a pattern. The chip carries the order there.
- The voice adds one line per planet for the card pair (once per pair). Watch that it stays welcome.
- WebKit was not rerun.

## 2026-10-11 — bug pass (round 1 of the third review)

Fixes for the five bugs in the latest review. There is no redesign, and the score-bearing flows are unchanged.

- **The journey rocket touched a stop emoji** (`🏠🚀` at 390 px, `🚀🌙` at 834 px). The active track had no margin, and the rocket rides from edge to edge of it, so the gap at fill 0 or 1 was 0.6–2.5 px. Fix: `.journey .track.on` gets `margin: 0 .3em; flex: none` (`public/style.css:91`), and the inactive tracks on sideways phones are 12 px (`:138`) so the bar still fits. Measured gaps from the rocket to its neighbour stop are now 6.8–10.4 px at 390, 360, 667×375, 834, 1194 and 1280 wide (they were 0.6–2.5 px), with no overflow.
- **The wanted card's glow after a wrong tap at home was invisible.** Fix: the wanted `.finale-cell` gets a `wanted` class for 1.6 s, a gold border with a soft glow that eases in and out with no pulse (`public/style.css:254–256`, `public/js/main.js:902–906`), alongside `sky.highlight(want)`. Only one card holds the class at a time. Shot: `pc-finale-wrong.png`, taken 0.8 s after a wrong tap; the wanted card stands out clearly.
- **At 667×375, Kitty was cut off at the bottom during join and choose.** The waiting target was `view.yMin - 0.3`, and the rocket's lowest edge sat at the screen edge at every size (374/375 px at 667×375, 1188/1194 px at 834×1194). Fix: the target is now `view.yMin + 0.3` (`public/js/main.js:1222`). The rocket's bottom is now 22 px above the edge at 667×375, 38 px at 390×844 and 54 px at 834×1194, and it stays clear of the cards. The join card's DOM top is 48 px against a journey bottom of 40 px at 667×375 in all five legs, so the card does not cover the bar.
- **Planets sat behind the falling number rows.** Fix: while `game.phase === 'build'`, `world.quiet` is set (`public/js/main.js:1449`), and the waiting planet and the drifters ease to 30% opacity (`public/js/world.js:5–27`, `:265–272`). Each clone owns its materials, and drifter materials are disposed on removal (`:244`). The planets come back to full strength at arrival, join, choose and on the title. All 20 build-phase samples read `world.fade = 0.3`. Shots: `ph-leg3-lit2.png`, `lm-leg4-lit2.png`, `sl-leg1-lit2.png`.
- **The 1..n arrival rhyme repeated on every match shape.** Fix: the rhyme is skipped when the values are `1..n` and the shape is not the trip's first (`public/js/main.js:676–679`). In a random run at match for all five shapes, the plain shapes now say the fact alone. The 5..11 match shapes keep their rhyme, which still teaches.
- The `?debug` hook also exposes `rocket` and `world` as getters, for the probes only.

**Evidence** (session scratchpad `polish3/star-catcher/after/`). Real-mouse play with speech stubbed and logged:

| Run | Flight | Path | Console errors |
|---|---|---|---|
| 834×1194, careful, from level 0 | 173 s | back, fives, big, tens, pattern | 0 |
| 1194×834, mixed, from level 5 | 208 s | tens, pattern, leap ×3 | 0 |
| 667×375, careful, from level 3 | 200 s | fives, big, tens, pattern, leap | 0 |
| 390×844, gentle mission | 218 s | next, back ×3, twos | 0 |
| 834×1194, random, from level 0 | 382 s | match ×5 | 0 |

Probes: `jbar.mjs` for the journey gaps and `kitty.mjs` for the rocket bounds. `node --check` passes on main.js and world.js. `browser.mjs --ids star-catcher --run star-catcher-f1` gives BOOT + PLAY ready with 0 errors.

## 2026-10-11 — bug pass (round 2 of the third review)

Both reviews scored 8.5. This pass fixes every bug they listed and takes three small, safe items from their top improvements. There is no redesign: the flight, the join, the cards and the home sky work as before.

**Bugs**

- **Planets sat inside the star lanes, faded but not moved** (both reviews). `PLANET_QUIET` is now 0.15, down from 0.3 (`public/js/world.js:5`). While the planets are quiet, the waiting planet also eases out toward its own edge (`x = side · w · (0.6 + 0.45 · aside)`, `:291–292`). New drifters start toward the sides (`:229`), and none start while numbers fall (`:319`). Quiet now covers the join too (`public/js/main.js:1473`), so the planet no longer sits behind Kitty under the join card. It comes back at arrival. In every run, each build sample with three or more stars lit read `fade = 0.15`, with the planet's centre off screen (x = 851–858 at 834 wide, −17 to −37 or 1217–1233 at 1194, 678–689 or −12 to −22 at 667). Shots: `ph-leg3-lit2.png`, `lm-leg2-first.png`.
- **At 667×375 during choose, Kitty's flame touched the bottom-right edge.** On screens shorter than 500 px, the waiting target is `view.yMin + 0.75` (it was `+ 0.3`, `main.js:1245`). The mesh bottom moved from 364 to 348 px, and the flame clears the edge (`kitty2.mjs`, `after-choose-667x375.png`). Tablets are unchanged.
- **At 390×844 during join, Kitty's nose cone overlapped the join card.** The join card's bottom padding on portrait phones is 166 px (it was 132, `public/style.css:210`). Card bottom and Kitty top are now 678/689 px at 390×844 and 574/605 px at 360×740. Before, they overlapped (704/690 and 608/604). No size overlaps now. Shot: `np-leg1-join0.png`.
- **The '11' join label sat on the start of its line to 10** (667×375). `placeLabels` now also scores each of the 12 spots by how close it lies to a direction one of the star's own lines leaves in. Within 1 rad it costs up to one label height (`public/js/sky.js:309–327`). Shots: `sl-leg2-join0.png` and `sl-leg1-join0.png`, where every label sits beside its lines.
- **Fast correct taps at home cut off each 'Yes! fact' line.** A counter, `finale.telling`, tracks found-lines still being said (`main.js:850`, `:905–912`). A correct tap while one is still playing queues only `<Name>! <next riddle>`, with no cut and no stale fact. Wrong taps still cut in and reset the counter (`:915`). In seven runs with five correct taps 0.5 s apart, there was 0 `<cancel>`.
- **Tapping a found card replayed its whole fact every time.** The first replay says the fact. Later taps say only `That's <spoken name>.` (`main.js:917–921`). The log reads "Cygnus is a swan flying…", then "That's Cygnus the swan." three times.

**Small improvements from the reviews' top items**

- **The first pick of a '?' level is now a reasoning pick** (both reviews' #1). `beginConstellation` pre-lights the first star at 'ask' levels and the first two at pattern and leap (`sky.prelight`, `public/js/sky.js:698`, called at `main.js:837`). They are given, so there is no bell and no catch. The first catch is the step: 'Count on +1 · 6 → ?', 'By tens +10 · 6 → ?', '76 → 65 → ?'. Across all 33 logged first picks at 'ask'/'ask2', the needed star was never the number on show. The pattern rule line drops its words (`main.js:504`), so the three numbers fit the 124 px phone panel without an ellipsis. The banner still names the rule. Match (and the gentle mission) is unchanged.
- **The choice cards show a number picture, not words** (#2/#3). Each level has a `sample` ('2 → 4 → ?', '7 → 17 → ?', '9 → 20 → ?', '3 = 3'), and the card chip reads `5 ⭐ · 2 → 4 → ?` (`main.js:740`). The rule's words move to the card's `title` and stay in its `aria-label`. Shots: `pc-leg2-choose.png`, `sl-leg3-choose.png`.
- **A scaffold for a struggling child** (#4). After three wrong picks in a row for one star, the next row falls at 70% speed. The needed star is 1.25× larger and steady, with no pulse (`main.js:385–391`, `:1357`). Misses still count for `adapt()`. In the random run it fired 4 times (`pr-help.png`). The run took 273 s, down from 382 s for last pass's random run.

**Evidence** (session scratchpad `polish3/star-catcher/r2/`, `play6.mjs` with real mouse steering and clicks and speech stubbed and logged, plus the `kitty2.mjs` bounds probe):

| Run | Flight | Path | Console errors |
|---|---|---|---|
| 834×1194, careful, from level 2 | 150 s | twos, fives, tens, pattern, leap | 0 |
| 1194×834, mixed, from level 5 | 180 s | tens, pattern, leap ×3 | 0 |
| 667×375, careful, from level 3 | 185 s | fives, big, pattern, leap ×2 | 0 |
| 667×375, careful, from level 6 | 164 s | pattern, leap ×4 | 0 |
| 1194×834, mixed, from level 3 | 188 s | twos, fives, big, tens ×2 | 0 |
| 390×844, gentle mission | 189 s | next, back, twos ×3 | 0 |
| 834×1194, random, from level 0 | 273 s | match, next, back ×3 | 0 |

`node --check` passes on main.js, sky.js and world.js. `browser.mjs --ids star-catcher --run star-catcher-f2` gives BOOT + PLAY ready with 0 errors. The flows that `original-quality.mjs` drives (mission choice and start) are unchanged.

**Still open (design, not bugs):** a second kind of flight decision for 6–8, such as a gap row ('3, 4, _, 6'). Both reviews list it as the remaining fun-depth blocker. It is a redesign-sized change and was left for a design pass.

## 2026-10-11 — bug pass (round 3 of the third review)

Both reviews scored 8.6–8.7. This pass fixes every bug they listed. There is no redesign: the flight, the join, the cards and the home sky play as before.

- **The gentle mission said its goal twice** ('Catch stars 1 to 5' from the picker, then 'Catch stars 1 to 5!' from `start()`). The game now passes its own `announce` to `createAdventure` and records when a goal was said (`public/js/main.js:204`, `:215–218`). If the picker said it in the last 20 s, `start()` queues only `Find number 1!` after it, with no cut (`:1143–1147`). A mission restored from storage says `Catch stars 1 to 5! Find number 1!` once. Logs (`r3/mission.mjs`): picked: "Catch stars 1 to 5", then "Find number 1!" with no `<cancel>`. Stored: "Catch stars 1 to 5! Find number 1!". Free flight is unchanged.
- **At 390×844 during the join, Kitty's nose and antenna touched the join card.** On tall phones (aspect < 0.6), Kitty now waits at `view.yMin + 0` (it was `+ 0.3`, `main.js:1266`). Short sideways screens and tablets are unchanged. In a real join (`r3/join.mjs`), the gap from the card's bottom to Kitty's top is now 9 px at 390×844 (it was −7), 25 px at 360×740 (12), 18 px at 412×915 (0) and 39 px at 375×667. Kitty's flame stays 26 px above the bottom edge at 390×844. Shot: `after-join-390x844.png`.
- **During choose, the waiting planet sat at full size behind the right-hand card.** `world.quiet` now covers `choose` too (`main.js:1496`), so the planet stays at 15% and set to one side while the cards are read. It comes forward only at arrival. Every choose sample in the runs read `fade = 0.15`.
- **The answer-revealing scaffold followed misses on the whole shape, not on this star.** `wrongStar` now opens the '?' only after two wrong picks for the current star: `if (game.streak >= 2)` (it was `game.misses >= 2`, `main.js:476`). A right catch closes it again, as before. The probe (`r3/unit.mjs`, level 'next') gave: wrong, wrong → 'all' ('2 → 3'). Right → 'ask'. One wrong on a later star stays 'ask' ('3 → ?'). Two wrongs open it again.
- **'Big jumps' could draw jumps of −3 and −4**, which are smaller than the pattern level's jumps. The leap tiers are now `[[9, 11, -11], [20, -9, 12], [12, -9, 11, -11, 20]]` (`main.js:167`). Over 600 draws with 5–7 stars, leap jumps were {−11, −9, 9, 11, 12, 20}, and every number stayed within 1–99. Pattern jumps stay {−10, −5, 3, 4} after its first tier.
- **Home sky: tapping a found card cut off the queued riddles of fast finds.** While a find is still being told and the voice is speaking, a found card now only glows (`main.js:924–933`). The `telling` counter is reset only by a wrong tap, which cuts in by design. The `voice.speaking` guard means a counter left stuck after a hush can never silence the cards.
- **Home sky: a found card tapped twice said 'That's Lyra the harp.' twice.** A tap on the same found card within 2.5 s of the last one says nothing new (`finale.lastCard` / `lastAt`, `main.js:927–931`).
- **The '10' and '8' pills touched in the pattern panel.** This reproduced every time on Orion at 'ask2', where '62' and '53' overlapped by 8 px: the first label took the only free spot the second one had, and the old hard 'inside' test refused a spot that was 1 px over the edge. `placeLabels` (`public/js/sky.js:288–360`) now does three things. It scores each spot after nudging it inside, so a slight spill costs 4 per px and only a spill over 0.3 × h rules it out (`:325–333`). Any overlap with a placed number, including a 0.12 × h margin, costs 3 × h. If the numbers still touch, it places the list in reverse order and keeps the result with fewer touches (`:342–345`). Probe (`lab.mjs`, every shape at pattern/leap, panel plus join card): 0 touching pairs in 70 samples at 1194×834, 50 at 667×375 and 50 at 390×844 (it was 8 of 8 on Orion). Shot: `f/lh-leg3-lit2.png` ('7', '11' and '?' apart).
- The `?debug` hook also exposes `catchItem`, for the probes only.

**Evidence.** `/tmp` (tmpfs) filled up during this pass, so the probes and shots are in `~/.cache/star-catcher-pw/r3/`. Runs used `play7.mjs` with real mouse steering, speech stubbed and logged, and Chromium `--use-angle=gl`. Each finale does fast finds 0.45 s apart, with a tap on the last found card between finds, then double taps on one found card.

| Run | Flight | Path | Console errors |
|---|---|---|---|
| 1194×834, careful, from level 7 | 145 s | tens, twos, pattern ×3 (−2, +4, −10) | 0 |
| 1194×834, careful, from level 7 (before the label fix) | 156 s | tens ×2, pattern, leap ×2 (−9, +11) | 0 |
| 834×1194, mixed, from level 3 | 167 s | back, twos, fives ×2, big | 0 |
| 390×844, gentle mission, careful | 178 s | match, next, back ×2, twos | 0 |
| 390×844, gentle mission, random | 343 s | match ×5; the streak scaffold helped 8 times | 0 |

In every finale, each queued '<Name>! <next riddle>' line was spoken, and the taps on found cards in between stayed silent. Double taps gave one line: the fact, then 'That's Cygnus the swan.' once per pair. `node --check` passes on main.js and sky.js. `browser.mjs --ids star-catcher --run star-catcher-f3` gives BOOT + PLAY ready with 0 errors. `original-quality.mjs` drives the mission choice and start, and only the spoken start line changed: 'Find number 1!' after a goal that was just picked.

**Still open (design, not bugs):** a second kind of flight decision for 6–8, such as a gap row ('3, 4, _, 6') or two stars caught in order. Both reviews list it as the fun-depth blocker. It is redesign-sized and was left out of this bug pass.
