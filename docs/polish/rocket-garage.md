# Rocket Garage: Phase 1 calm pass (2026-10-09)

Source: the [2026-10-09 audit](AUDIT_2026-10-09.md), Phase 1. Kept as before: building, painting, unlocks, the 🧪 fair-test workshop, flight steering, turbo, the landing, flag and dance.

## What changed and why

All references are to `examples/rocket-garage/public/`.

### Strobe and shake

- **Launch pad** (`js/main.js:977`): pad lights no longer blink hard between 3 and 0.3 at `sin(t*12)` (about 2 Hz). They brighten steadily with the countdown.
- **Countdown rumble** (`js/main.js:967`): reduced to about a quarter amplitude, at a lower frequency.

### Celebrations

- **Landing** (`js/main.js:1579`): the 90-piece screen confetti plus continuous party confetti (`updateParty`) become 14 pale sparkles around the pilot, played once.
- **Turbo and fly-by**: bursts cut from 40 and 30 particles to 12 and 10.
- **Star catches**: the "+1" popup and ring are removed; the burst drops from 16 to 6 particles.

### Feedback

- **Catch notes** (`js/main.js:1176`, `js/audio.js` `catch`): the combo pitch climb is replaced by a note based on where the star was caught.
- **HUD**: the star pill bump and the turbo bar's triple bump are removed. The stars count stays, because it is what the child collected and feeds turbo.

### Audio (`js/audio.js`)

- **Dance song** (`:25`): 150 bpm square wave with claps becomes 100 bpm triangle with no claps.
- **Flight song** (`:17`): 132 bpm slows to 112 bpm.
- **Countdown beep** (`:172`): square at vol 0.18 becomes sine at 0.09, lower pitch.
- **Liftoff**: noise drops from 0.35 to 0.16, and the sawtooth (0.25) becomes a triangle (0.12).
- **Turbo**: the sawtooth becomes a triangle.
- **Fanfare** (`:238`): one soft sine/triangle chord.
- **Landing thump**: 0.3 drops to 0.18.

### Hints (`js/main.js:809-825`)

- The idle "press GO" finger now appears after 30 s instead of 15 s.
- The reward-card "fly again" finger appears after 30 s instead of 8 s.
- The finger's tap bob is slower and smaller.
- First-time teaching hints are unchanged.

### CSS (`style.css`)

- Removed: the infinite logo bob, the Play pulse, the GO throb, the twinkle on new-part badges and the hopping wipe emoji.
- Gentler: the countdown entrance (scale 2.2 becomes 1.25).
- Slower: the loading hop.
- Added a reduced-motion block.

## Bugs fixed

- **Finger hint covering GO** (`js/main.js:822`): the fingertip now rests on the lower-right edge of its target, clamped to the viewport, so the 🚀 and "GO!" stay visible. See `after-p-3-garage-built.png`.

## Verification

- `browser.mjs --ids rocket-garage --run calm`: passed, 0 errors.
- `curriculum.test.mjs`: the workshop comparisons still pass. Only the manifest-hash test fails, because manifests await the coordinator's rebuild.
- Own playthrough (`rg.mjs`) at 834×1194 and 1194×834, with no console errors:
  - title, then garage
  - change the tank and paint it
  - open the workshop
  - launch, countdown and steered flight
  - Moon landing party, then the reward card with 4 new parts
- Screenshots: before `scratchpad/audit/rocket-garage/before/`; after `scratchpad/audit/rocket-garage/after-{p,l}-*.png`.

## Remaining (Phase 2)

- Ask "farther, same or shorter?" before each launch after a part change, and show a ghost of the last distance.
- Count stars aloud in groups, and give them a meaningful use rather than a tally.
- The reward screen's dance loop still plays until the child leaves; consider ending it after one phrase.

# Phase 2: the fair test inside every launch (2026-10-09)

The 🧪 workshop's fair test now happens on every launch after a part change. The workshop, unlocks, building, painting, steering, landing and dance are unchanged.

## Design

- **Before launch.** GO compares the rocket's parts (paint is ignored) with the parts of the rocket that flew last. If nothing changed, it goes straight to the countdown. If something changed, the robot shows last time's rocket faded beside the planet it reached, and the changed part as old ➜ new. It asks aloud: "You changed the fins. Last time, it reached the Moon. Will it go farther, the same, or less far?" Three big picture buttons follow. Each shows last time's faded rocket under a dashed line, with this rocket higher, level or lower. The three glow in turn, so none looks like the right answer. Picking one says "You think farther. Let's find out!" and the countdown starts. 🔧 (or Esc) goes back to the garage. Keys 1–3 and ←/→ with Enter also work.
- **During flight.** The guess rides along in the top bar. On the journey track, last time's rocket appears as a faded ghost beside the 🚀. It flies at its own real speed (same take-off and cruise rules) and parks at the planet it reached, which is marked by a dashed line. Planets that only the ghost reached sit faded above this flight's goal. **Test flights have no turbo**, because a fair test changes one thing. Turbo still works on every flight where nothing changed (for example 🚀 "fly again").
- **After landing.** The reward card replays both rockets on the workshop's two-lane track: the 👻 lane for last time and this flight's lane, each wobbling by its real wobble. The card then shows the guess picture with ✔ (matched) or 💡 (a new discovery), never "wrong". The robot says one sentence from `explainFlight()` (`js/workshop.js`), which uses the workshop's own words and rules:
  - boosters → distance ("Small boosters gave it a push, so it went farther!")
  - nose/tank/fins → wobble only when the wobble really changed ("The tank changed the wobble, not the distance."), otherwise "The nose did not change the distance."
  - window/pilot/sticker → "just for fun. Same distance!"
  - several changes at once → "…hard to tell which one did it."
- **Over time: the 📓 notebook** (under 🏠 in the garage). It has one page per part: boosters, fins, tank, nose, window, pilot and sticker. Only fair tests (exactly one part changed) fill a page, which teaches changing one thing at a time. A page shows the tested part and a pictured finding (🪐⬆ distance, 〰️ wobble, 🪐= same distance, 🎨 just for fun) and reads it aloud when tapped. An empty page shows a grey silhouette and "?". Tapping it says "Change only the fins, then fly, to find out what they do." The 📓 wears a ✨ until a new page is seen. A test that finds a new page adds "I put it in your notebook!" and 📓✨ on the card.
- **Stars in fives.** Turbo now needs 15 stars (three fives; it was 14). The star pill shows a five-frame that fills, beside a gold 5 / 10 / 15… number, and each full five is said aloud ("five", "ten"…). The turbo bar is drawn in three segments. The reward card shows the stars as the gold fives number plus the stars left over (17 = [15] ⭐⭐).

## Changes (`examples/rocket-garage/public/`)

- `js/fairtest.js` (new): `fairTest`, `verdict`, guess pictures, the two-lane result race, notebook notes and sentences, and the `#predict` and `#notebook` dialogs.
- `fairtest.css` (new; linked in `index.html`): the dialogs, guess pictures, five-frame, turbo segments, journey ghost, reward test row, 📓 button, phone, tablet and reduced-motion rules.
- `js/workshop.js`:
  - `:20-24` exports the word tables and adds `placeName` ("Mars", not "the Mars")
  - `:54` adds `explainFlight(before, now)`, sharing `compareBuilds` and the wording
  - `isBuild` is exported
  - the workshop itself is unchanged
- `js/main.js`:
  - `:46` saves `last`, `notes` and `notesNew`
  - `:159` sets `TURBO = 15`
  - `:817` stops hints while the dialogs are open
  - `:886` sets up the predictor and notebook
  - `:985` makes `launch()` ask first
  - `:1087`/`:1119` handle the test flight, last build and no turbo
  - `:1133` draws the stars in fives
  - `:1151-1215` adds the ghost and the journey track
  - `:1297` counts fives aloud
  - `:1691` adds notebook notes
  - `:1736` adds the reward test
  - `:1771` shows reward stars in fives
  - `:1858` re-lays-out the GO column after the tray slides back. This fixes an existing bug: after going 🏠 mid-countdown, 🧪/🎲 used to sit over the tray in portrait.
- `index.html`: adds the `#notebook-btn`, `#guess`, five-frame star pill and `#reward-test` elements.
- `js/audio.js:46,94`: `resume()`/`suspend()` now catch rejections, as Crash Racers already does. WebKit raised an uncaught `Failed to start the audio device` during the longer playthrough.

## Evidence

- Own playthrough (`scratchpad/p2/rocket-garage/play.mjs`) in Chromium at 834×1194, 1194×834, 667×375 and 375×667, and in WebKit at 834×1194. The script runs:
  - first flight (no question)
  - boosters only (guess "same" → 💡 farther, notebook page)
  - tank only (guess "farther" → 💡 wobble, notebook page)
  - booster and sticker (guess "less" → ✔ with "hard to tell")
  - unchanged GO (no question)
  - the notebook
  It had 0 page errors and 0 console errors. Screenshots are `scratchpad/p2/rocket-garage/<engine>-<p|l|s|sp>-*.png`.
- Every single-part change from the default rocket was checked against `explainFlight` and the notebook sentence (`explain.mjs`). All match the real `reach`/`wobble` rules.
- `browser.mjs --ids rocket-garage --run p2`: Chromium and WebKit both pass with 0 errors.
- `node --test`: 10/11. Only the manifest-hash test fails, pending the coordinator's rebuild (two new files: `fairtest.css` and `js/fairtest.js`).

## Remaining

- Owner's call: test flights skip turbo, for a clean comparison. If the children miss turbo, an alternative is to keep it and add "then your stars gave a turbo push" to the result.
- Counting every five aloud is calm but frequent on long flights (up to about 10 times). It could stop after 15 if it feels chatty.
- Booster thumbnails are drawn at a shared scale, so the small booster looks tiny on its notebook page.
- Follow-up (owner): the reward screen's dance song now plays one phrase, about 10 s ending on the home note, and then goes silent instead of looping until the child leaves (`js/audio.js` `SONGS.dance.once`, checked in `updateMusic`). The pilot keeps dancing silently. Turbo skipped on test flights, counting fives aloud and the booster thumbnail scale stay as they are for family play. Chromium and WebKit `browser.mjs --run p2` pass with 0 errors.

# Simplify pass (2026-10-09)

- One voice (`js/speech.js`) is shared by the garage, the workshop, the launch question and the notebook. Answers to taps interrupt what is being said; star counts and the landing verdict wait in the queue. Closing the workshop calls `voice.hush()`.
- `workshop.js` now exports `el`, `keyGuard`, `buildRace` and `flyRace`, and `fairtest.js` uses them. That removes the copies in `fairtest.js` (`el`, `keyGuard`, its race builder and `runRace`). The workshop keeps its 1.9 s landing and the reward card keeps 1.7 s.
- `explain` and `explainFlight` now share one rule function (`ruling`). A check over 200,000 random build pairs gave the same sentences as before.
- The journey track and the ghost rocket write their positions only when they move, and `#journey-fill` is looked up once instead of every frame. The rocket thumbnail cache now drops only its oldest picture.
- Removed dead CSS: `@keyframes bob`, `.pill.bump` and `@keyframes bump`.
- Checks: Chromium and WebKit browser checks pass with 0 errors. A scripted play covered a first flight, a booster change with a guess, the reward race and the workshop save, test and say-again. Speech stayed in order.
- Second pass:
  - The local `speak` wrappers in `fairtest.js` and `workshop.js` are now direct `voice.sayNow` calls.
  - The workshop writes its two race lanes directly. One `won(result, slot)` helper decides the winning lane and card.
  - Muting and Home call `voice.hush()`.
  - Removed the leftover `animation-delay` on the `.logo span` colour rules.
  - Checks: Chromium and WebKit browser checks, `original-quality.mjs` and the unit tests pass. A scripted workshop test (save A, change the tank, guess A, test, say again) lit both lanes and cards on the tie. Speech stayed in order, and mute and Home each cancel speech. No console errors.
- Third pass:
  - `workshop.js` exports `changedWords(changed)`, used by the workshop question and the launch question.
  - `workshop.js` exports `ruling` and `PLURAL_SLOTS`. `noteFrom` takes the note kind from `ruling` (keeping "same" when a wobbly part didn't change the wobble), and the notebook's `plural` reads `PLURAL_SLOTS`. A check over 1,620 single and double part changes gave the same notes and explanations as before.
  - The voice starts with the saved mute setting, and the sound switch calls `voice.setMuted`.
  - Checks: Chromium and WebKit browser checks, `original-quality.mjs` and the unit tests pass. With speech stubbed, the workshop says "You changed the tank. Which rocket will fly farther?", mute cancels speech, muted taps stay silent and unmuting speaks again. No console errors.
- Exit paths:
  - `backToGarage()` (🔧 and 🔁 on the reward card, 🏠 mid-flight) and `toTitle()` hush; `goHome` only routes. `toTitle()` sets the title state before closing the dialogs, so the dialogs' `onBack → hintStep` hides the finger.
  - `hintStep` waits for layout with `requestAnimationFrame` instead of a 50 ms timer.
  - `keyGuard` stops key events on the dialog itself instead of in a window capture listener, so the guess dialog's 1/2/3 and arrow keys work again, while the garage still ignores keys pressed in a dialog.
  - Checks: `node --check`, Chromium and WebKit `--run exits`, `original-quality.mjs` and the unit tests pass. With speech stubbed: pressing 1 in the guess dialog picks a guess and launches; 🔧 on the reward card cancels speech and the garage is settled two seconds later; arrows still switch tabs in the garage; 🏠 cancels speech and leaves the title with the finger hidden. No console errors.

# Round 1 to 8.5: real decisions, two variables, missions (2026-10-11)

Source: the Rocket Garage section of [AUDIT_2026-10-10.md](AUDIT_2026-10-10.md) (8/10: one variable, infinite pulses, nothing for 6–8). All paths are under `examples/rocket-garage/public/`.

## Design

- **The garage no longer gives the answer away.** The reach bar was a live forecast: picking boosters slid the 🚀 to the next planet with a banner and a chime, so "farther, the same, or less far?" was answered before it was asked. The bar is now a record. The 🚀 sits under the place the last flight landed (`save.landed`). A booster's tray button wears its planet only after that booster has flown (`save.flown`; older saves are seeded from the places already visited). Guessing is now a real prediction, and the flight is the test.
- **⚡ Turbo is the child's in-flight choice.** Fifteen stars (three fives) make the bar a button, `⚡ ➜ 🔴`, with no pulse. Tapping it (or Space, Enter or T) carries the rocket one planet farther. Ignoring it lands where the boosters go. Robot explains it the first time in a session ("Tap the lightning to zoom on to Mars, or just land on the Moon"); after that it only says "Fifteen!". Test flights still have no turbo.
- **Robot's missions, the adaptive harder tier.** After 3 flights a dashed 📮 card waits quietly under 📓. Robot mentions it once, and nothing is judged until the child taps the card. The card is pictures only: planet, steady ━ or wobbly 〰️, and boosters. Robot reads it aloud.
  - Tier 1: land on a planet other than where this rocket goes. This uses one variable: boosters set the distance.
  - Tier 2: the planet plus steady or wobbly, always the opposite of the rocket on the pad. Two variables now: boosters for distance, and nose, tank and fins for the wobble (the notebook's own findings).
  - Tier 3: fixed boosters that fall one planet short, so the plan must include catching 15 stars and choosing the turbo. Turning the turbo down matters too: overshooting with it gets "keep the lightning for later".
  - Adapting: two missions done moves up a tier. Three tries without landing it moves down a tier with a new card. Three matched guesses in a row start at tier 2. ✕ puts the card away. It is never a gate.
  - A mission flight skips the farther/same/less question, because the card is its question. Afterwards the reward card repeats the card with ✔ or 💡 on each part, and Robot says one sentence: either done, or the single most useful thing to change (`missionVerdict`).
- **The 🧪 workshop now lives in the notebook** (a 🧪 button on the 📓 page). The garage keeps just 📓, 🎲 and GO.
- **Calmer:**
  - No infinite animations: the 🚀 "fly again" pulse, the 🧪 wiggle, the workshop nudges and the guess glow are removed. The guess glow now runs once, in turn.
  - Hint fingers bob 4 times, then rest.
  - Fives are said aloud only up to the turbo's fifteen.
  - Star drift-in now only helps genuine near misses, so steering matters.

## Changes

- `js/missions.js` (new): `makeMission`, `checkMission`, `missionVerdict`, `afterFlight` (tier up/down), `missionWords`, `missionPicture`, `sanitizeMission`.
- `js/parts.js:142`: `isSteady(rocket)` (no wobbly nose, tank or fins).
- `js/main.js`:
  - `:45-60`: save `landed`, `guessRun`, `mission` and `flown`.
  - `:513`: the reach bar shows the last landing.
  - `:599`: booster planet badges appear only after that booster has flown.
  - `choose()`: no reach banner or chime.
  - `:905-955`: the mission card in the garage.
  - `:1027`: mission flights skip the guess.
  - `liftoff()`: shows the mission chip and the turbo target.
  - `catchStar()`/`useTurbo()` `:1343-1381`: turbo is a choice, and fives are spoken up to 15.
  - `:1518`: smaller star drift-in.
  - `startParty()` `:1756-1777`: records the landing, guess run and mission check.
  - `renderMissionResult()` `:1857`: the mission result on the reward card.
  - `:2054`: turbo keys.
  - The 🧪 garage button wiring is removed.
- `js/fairtest.js`: the notebook takes `onTest` and shows a 🧪 "test again" button.
- `index.html`: `#turbo` is a `<button>` with `#turbo-to`; adds `#mission` and `#reward-mission`; removes `#experiment`.
- `fairtest.css`: turbo button, mission card, reward mission row, and narrow-screen flight bar (the chip drops under 🏠 at ≤520 px; tighter at ≤400 px); the guess glow plays once.
- `style.css` and `workshop.css`: infinite pulse, wiggle and nudge removed; fingers stop after 4 bobs.
- `game.json`: howToPlay and learning updated (turbo choice, missions, 🧪 in the notebook).

## Evidence

- `scratchpad/polish/rocket-garage/play.mjs` at 834×1194 and 1194×834 (Chromium, `--use-angle=gl`, speech stubbed) ran the following with **0 console or page errors**:
  1. first flight
  2. small boosters → guess → test flight → notebook page
  3. unchanged flight → turbo ready → tap → Ring Planet
  4. mission card → tier 1 done
  5. tier 2 missed wobble ("It got there, but it flew too steady!…")
  6. tier 3 done with ⚡ (`{done:true}`, "The turbo carried it the last stop!")
  7. notebook → 🧪 workshop
- `small.mjs` at 375×667 and 667×375 checked the seeded tier 3 card, turbo ready and used, and a wrong-booster reward. The flight bar fits after the narrow rules (sound button right edge 367 ≤ 375). Screenshots are `p-*`, `l-*` and `s-*.png` in the same folder.
- Spoken lines per trip are about 4 to 6: the question, the guess, 5, 10, 15 and the verdict. Before, a long flight counted up to "95".
- `m.test.mjs`: 1,800 generated missions are never already solved (except by the steady/wobbly ask) and never need a turbo from an unvisited base. Tier up, tier down and sanitising behave as expected.
- `browser.mjs --ids rocket-garage --run rocket-garage-r1`: BOOT and PLAY pass with 0 errors. `node --check` passes on every JS file. `curriculum.test.mjs`: the rocket comparison passes. The manifest and catalogue tests fail until the coordinator rebuilds (the new `js/missions.js`, and other games' metadata).

## Remaining ideas

- Stars are plentiful on long flights (55–95). The turbo choice is a decision, not a steering skill. Fewer, wider star patterns would make steering for the fifteen count.
- A notebook page for ⚡ ("fifteen stars = one planet farther") once the child has used it.
- Tier 3 could add "fix Robot's rocket", a diagnosis puzzle, without overwriting the child's own build.

# Round 2: earned turbo, predictions in missions, Robot's fix-it puzzle (2026-10-11)

Source: independent review 1 (7.8: calm 8.5, focus 7, learning 7.8, fun/depth 7.5). The blockers were that steering barely mattered, random tapping could tier up, the tray badges made tier 1 an emoji match, missions dropped the prediction, and tier 3 was recipe-following. All paths are under `examples/rocket-garage/public/`.

## Design

- **The turbo is earned by steering.** Stars now come in small groups of three, about two seconds apart, with at most nine groups a flight. Four in five groups sit out at the sides, usually the opposite side from the last one, and diagonals lean outward, never in toward a still rocket. The fifteen-star ⚡ is now a skill plus a choice.
- **Missions keep a prediction.** Every mission launch first asks "Where will it land?" with five planet buttons (the rocket and the card shown above them). The guess rides in the flight bar as 🤔 + planet, and the reward card marks it ✔ or 💡. A mission counts toward the next tier only when it is done **and** the landing was predicted. Done without the prediction just clears the card, and Robot names the booster fact ("Big boosters reach the Ring Planet.").
- **No more booster→planet badges in the tray.** The 📓 notebook now holds that record as a row of `booster ➜ planet` buttons (each speaks its sentence). Tier 1 needs recall, or looking it up in your own notebook.
- **Tier 3 is "Fix Robot's rocket".** Tapping the card puts Robot's own rocket (in his teal and purple) on the pad. It misses in exactly one way: the boosters miss the planet, or the wobble is the wrong kind. The child may change **one** part (🔧1 on the card). When it falls one planet short, catching fifteen stars and taking the turbo fixes it with no changes, which is accepted as the clever route. More than one change gets "Robot's puzzle is just one change. Tap his card to get his rocket back", and tapping the card then restores his rocket. The child's own rocket is kept in `save.mission.own` and comes back when the mission is done, put away, or swapped for an easier one.
- **Honest records.** Flights count only when they land (`save.last`, `save.flown` and `save.flights` moved from `liftoff()` to `startParty()`). The verdict uses what happened: "You had fifteen stars! Tap the lightning next time…" only when the turbo was ready and not taken. A miss can now add "And look at the wobble too!".
- **Thinner voice.** Fives are counted only on flights where a turbo is possible, and they stop being spoken once the child has used the turbo twice (`save.turbos`). "Robot has a mission" is said once per visit, not after every mission. "You guessed it!" is said only when the mission was done.
- **Calmer tray.** Only the tab holding the newest gift wears ✨. Booster thumbnails use an eased per-part scale, so the small booster reads clearly on notebook pages and race lanes.

## Changes

- `js/missions.js`:
  - New: `robotRocket`, `robotBuild`, `changesFrom`, `predictionWords` and `createWhere` (the "Where will it land?" dialog).
  - `makeMission` tier 3 is now the fix-it card `{dest, steady, robot}`.
  - `checkMission` adds `fix` and `changes`.
  - `missionVerdict` takes `turbo`, `turboReady` and `rocket`.
  - `afterFlight(state, done, matched)` gates tier-up on the prediction.
  - `missionPicture(m, {rocketThumb, marks})` draws Robot's rocket with 🔧1.
  - `sanitizeMission` drops old tier-3 booster cards and keeps `own`.
- `js/main.js`:
  - `:290` `boosterRadius`
  - `:555` one ✨ tab
  - Booster tray badge removed.
  - `:926-1000` the mission card, `putOnPad` and `restoreOwn` (Robot's rocket on and off the pad)
  - `:1083` mission launches ask `where`
  - `:1185` `flight.predicted`
  - `:1214` star group spacing
  - `:1239` `missionChip` and `predictedBit`
  - `:1382` `spawnPattern` rewritten
  - `:1423` silent stars when no turbo is possible
  - `:1444` `save.turbos`
  - `:1846` records moved to the landing
  - `:1855` prediction and verdict
  - `:2029` the newest-gift tab
  - The debug hook exposes `items` and `where`.
- `js/fairtest.js`: the notebook takes `flown` and renders the `.ft-flown` booster→planet row.
- `fairtest.css`: the where dialog (5 planets on one row down to 360 px), the Robot-rocket bit, the guess bit, the notebook flown row, and a wrapping reward mission row. `style.css`: `.item .goes` removed.
- `game.json`: howToPlay describes steering for side stars, "say where it will land", and the fix-it tier.

## Evidence (scratchpad `polish/rocket-garage/r2/`)

- `stars.mjs` (834×1194, 4 flights per cell, simulated in-page steering) gives stars caught per flight:

  | Boosters | Still | Random retargeting (every 0.3–1.1 s) | Careful |
  |---|---|---|---|
  | none | 0–9 | 6–17 | 21 |
  | small | 3–9 | 9–17 | 27 |
  | big | 6–12 | 4–18 | 30 |
  | mega | 6–12 | 18–21 | 30 |

  Round 1 was 16–45 caught with no or random steering, and 32–92 careful.
- `logic.test.mjs`:
  - Over 3,000 generated tier-3 cards, Robot's rocket never already succeeds, and every card is fixable with one part. About 22% can also be fixed by the turbo alone.
  - A random player at tier 1 (random booster, random guess) needs a median of 33 flights (p10 12) to reach tier 2. A careful player needs 2.
- `play2.mjs`, 834×1194 and 1194×834, Chromium `--use-angle=gl`, speech stubbed, **0 console or page errors**. It covered:
  - first flight
  - fair test with the reward race
  - abort mid-flight: `flights`, `last` and `flown` are unchanged, and no mission card appears
  - turbo ready, then used
  - tier 1 done with a wrong guess (wins stay 0, and the booster fact is spoken)
  - tiers 1→2→3 with right guesses
  - tier 3 flown unchanged with the turbo ready but not taken ("You had fifteen stars!…")
  - tier 3 with 3 changes, then a card tap restores Robot's rocket
  - tier 3 fixed with one change
  - the child's own rocket comes back
  - the notebook flown row

  It spoke 47 lines over 12 flights (about 4 a flight).
- `small.mjs` at 375×667, 667×375 and 360×640: the tier-3 card, the where dialog, the reward and the notebook fit, with 0 errors.
- `browser.mjs --ids rocket-garage --run rocket-garage-r2`: BOOT and PLAY pass with 0 errors. `node --check` passes on main.js, missions.js and fairtest.js.

## Remaining ideas

- The farther/same/less question could become "Where will it land?" for older children everywhere, not only in missions.
- A ⚡ notebook page ("fifteen stars = one planet farther") once the turbo has been used.
- Robot's rocket in the garage could wear a small 🤖 tag on the pad, so it is clear whose rocket it is.

# Round 3: visible wobble, the diagnosis guess, adaptive tier 1, a two-fault tier 4 (2026-10-11)

Source: independent review 1 of round 2 (8.3: calm 8.6, focus 8.2, learning 7.9, fun/depth 8.1, visual 8.5, voice 8.3, polish 8.2). The blockers were that wobble (half of tiers 2–3) was not visible, mission predictions copied the card, tier 1 repeated the same advice with no help, the star tally sat on every reward, and the 6–8 step-up ended at tier 3. All paths are under `examples/rocket-garage/public/`.

## Design

- **Wobble is binary and visible.** `wobble()` is 0.05 for every steady rocket and at least 0.5 (up to 1) with any wobbly nose, tank or fins. Boosters no longer add wobble. In flight, a wobbly rocket rolls about 9–18°, and a steady one under 1°. In the garage, a wobbly rocket rocks gently on its fins three times after a part goes on (and when the garage comes back), then settles. A steady one stands still. So a part's effect is seen before flying. The workshop race ships use the same numbers.
- **Wobbly parts are discoverable from the child's own tests.** A one-part test of a nose, tank or fins marks that part: steady ━ or wobbly 〰️. Mission flights with one change since the last landing count too. The logic is honest: a steady flight proves its part steady, and steady↔wobbly proves the changed part wobbly. The mark shows in the tray (bottom-left of the square) and as a "which parts wobble" row in the 📓. Untested parts never get a mark.
- **Predictions carry thinking.**
  - Tiers 1–2: "Where will it land?" shows the rocket and (tier 2) the ━/〰️ goal, but never the goal planet. The garage card is hidden while the dialog is open.
  - Tiers 3–4: the guess moves to the moment Robot's rocket first goes on the pad: "Robot's rocket, as it is: where will it land?" The answer shows at once as a soft trail along the planets to where his boosters reach, ✔ or 💡, and one sentence: "Yes! Robot's rocket lands on Mars. He wants the Ring Planet. One change!" or "…That is the right planet! So what is wrong? Watch it on the pad." That is the diagnosis: boosters or wobble. Tier 3–4 launches then go straight up. The diagnosis guess is what counts toward the next tier.
- **Tier 1 adapts.** The first miss gives the booster advice. The second miss says "Your notebook shows which boosters reach the Comet!" (or "…Try ones you have not flown yet!"), and back in the garage the 📓 opens with the booster ➜ planet row framed. The third miss swaps in a planet one booster size from the rocket on the pad ("Robot has a new card for you, one booster size away.").
- **Tier 4: Robot's rocket has two faults** (the boosters miss AND the wobble is wrong), with still one change per flight (🔧1 ➜ 🔧1 on the card). Each flight's rocket becomes the new starting point, and fixing one fault is a step, not a miss ("It lands on Mars now! Next, the wobble: which part wobbles?…"). No single change can fix it, so it is the fair-test method used as a plan. Tapping the card restores his rocket as it last flew.
- **Thinner turbo talk and no idle tally.** Fives are counted aloud only when the turbo fits the plan (not on a mission it would overshoot), and only until the first "Fifteen!" of a visit. On an overshooting mission, "Fifteen!" is not said and the ⚡ lights quietly. The reward card shows the star count only on flights where the turbo was possible and relevant.
- **Clearer mission card.** It is 66 px per picture on tablets (it was 46). A 🤖 tag stands at the front of the pad while Robot's rocket is on it.

## Changes

- `js/parts.js:107` `wobble()`: binary floor, and booster `none` no longer adds wobble.
- `js/main.js`:
  - `:325-345` `swayOnPad`/`updatePadSway`, called from `choose`, `putOnPad` and `toGarage`, and reset at launch.
  - `:627` tray ━/〰️ badge.
  - `:966` `missionCard` with `near`.
  - `:995` `renderPadTag`.
  - `:1050` the diagnosis on the first card tap.
  - `:1148` the launch skips `where` for diagnosed Robot cards and hides the card behind the dialog.
  - `:1518` `fivesAloud`/`turboRelevant`.
  - `:1605` flight sway amplitude.
  - `:1930` implicit one-change tests on mission flights feed `learnParts`.
  - `:1949` tier-3/4 `matched` from the diagnosis, and `afterFlight` gets `check`/`rocket`.
  - `:2052` reward stars only when relevant.
  - `:2120` `hint` opens the notebook on the booster row.
  - `save.known` is persisted.
- `js/missions.js`:
  - `TIERS = 4`.
  - Card fields `two`, `base`, `diag`, `diagOk` and `got`.
  - `robotRocket(…, two)`.
  - `makeMission(…, {near})`.
  - `robotBuild` uses `base`.
  - `missionVerdict(…, {next, flown, known})` with half-fixed, hint and look-up wording.
  - New `diagnosisWords`.
  - `afterFlight` returns `step`, `hint` or `nearer`.
  - `missionPicture({hidePlace})`.
  - `createWhere` gains a diagnose mode (trail reveal, ✔/💡, a 🔧➜🚀 back button).
- `js/fairtest.js:94-140`: `sanitizeKnown`, `learnParts`, `partSentence` and `WOB_MARK`. The notebook takes `known`, renders `.ft-wob`, and `show({look:'flown'})` frames the booster row.
- `js/workshop.js:165`: the race ship sway is `wobble * 16°`, so steady ships are still.
- `index.html`: `#pad-tag`. `fairtest.css`: the round-3 block (bigger mission card on tablets, pad tag, tray badge, notebook wobble row, framed booster row, diagnosis trail). `game.json`: howToPlay.

## Evidence (scratchpad `polish/rocket-garage/r3/`)

- `logic.test.mjs`:
  - Over 5,000 random builds, the steady maximum wobble is 0.05 and the wobbly minimum is 0.56.
  - 3,000 tier-3 cards: none already succeeds, and all can be fixed with one change.
  - 3,000 tier-4 cards: none can be fixed with one change, and all can be fixed with two one-change steps. In every one, the as-is landing differs from the goal, so the diagnosis guess matters.
  - Tier-1 misses go `again → hint → nearer`, and the nearer card avoids the planet that was missed.
  - `learnParts` marks classic ━ and fish 〰️ from one fins test, and learns nothing from a wobbly→wobbly test.
  - A random tier-1 player still needs a median of 34 flights to tier 2.
- `play3.mjs`, run at 834×1194 and 1194×834 (Chromium `--use-angle=gl`, speech stubbed), **0 console or page errors**, 14 flights each.
  - Paths covered:
    - The pad rocks after the ball tank goes on (wobbler roll −0.045 rad mid-sway).
    - Flight `wob` is 0.62 wobbly and 0.05 steady.
    - The tank test learns `tank:stripes ━, tank:ball 〰️`, and the tray shows the badges.
    - The where dialog has no goal planet.
    - Tier-1 misses give "…Try ones you have not flown yet!", then the notebook opens framed, then a new card.
    - Tiers 1→2→3.
    - The tier-3 diagnosis ("Yes! Robot's rocket lands on the Alien Planet. That is the right planet! So what is wrong? Watch it on the pad."), then a one-change fix that launches straight up.
    - Tier 4: diagnosis, then step 1 ("It lands on Mars now! Next, the wobble…", `step`), then step 2 ("Both fixed, one change at a time!").
    - The 🤖 pad tag, the child's rocket coming back, and the notebook's wobble row.
  - **45 spoken lines over 14 flights (3.2 a flight).** Fives were counted once in the session.
- `random.mjs` (834×1194, 16 flights of random parts, mission taps, guesses, steering and turbo): 0 errors, 62 lines (3.9 a flight). The tier-1 card cycled through again, hint and nearer, and was never the same sentence three times running. Random play learned no wobble parts (it never made a one-part test).
- `small.mjs` at 667×375 and 375×667: the diagnosis reveal with the 🔧➜🚀 button, the tray badges and the notebook fit, with 0 errors.
- `browser.mjs --ids rocket-garage --run rocket-garage-r3`: BOOT and PLAY pass with 0 errors. `node --check` passes on parts.js, missions.js, fairtest.js, main.js and workshop.js.

## Remaining ideas

- An open 🧪 workshop challenge ("one rocket to Mars steady, one wobbly, race them") for children past tier 4.
- With only two planets unlocked, the "nearer" card can be the same planet again (no other choice exists).
- The notebook's wobble row has no heading. A small 〰️/━ legend would help non-readers link it to the tray.

# Round 4: every guess before the build, honest help, a varied tier 4 and an open race (2026-10-11)

Source: round-3 reviews (8.6 and 8.1). The blockers were a soft-lock (mission miss, then 🚀, then 🔧 left the tray and GO away), tier 1–2 predictions that copied the build, the same miss sentence repeated, a "new card" that was not new, the diagnosis read from a small thumbnail, misleading notebook pictures, and a tier 4 that played out the same way every time. All paths are under `examples/rocket-garage/public/`.

## Design

- **The guess always comes before any part changes.** On picking up a card, the camera eases down to the boosters for 1.6 s (the garage buttons rest), then asks "as it is: where will it land?". On tiers 1–2 the question is about the child's own rocket, and on 3–4 about Robot's. The dialog shows the rocket at 112–160 px with its boosters close up beside it. The answer lights as a trail, and one sentence follows: "Yes! Your rocket lands on Mars. Robot wants the Moon. What will you change?" Mission launches then go straight up. The tier moves up only when the mission is done and this guess was right. The reach bar is hidden during the guess, so it cannot give the answer away.
- **Tier 2+ fair tests ask for the planet.** Once mission tier 2 is reached, a changed-part launch asks "Where will it land now?" with the five planets instead of farther / same / less far. A wrong guess hears where the rocket went first. The chip and the reward show the rocket and the planet that was picked.
- **Honest tier-1 help.** After the third miss, a new card appears only when a different planet one booster size away exists. Otherwise the same card stays: the reward says "Let's try it together!", the garage opens on the booster tab with the finger on the booster to try, and Robot says "Try the small boosters!". The notebook opens by itself only on the first second-miss. After that the 📓 wears a still yellow ring, and tapping it opens on the booster row.
- **Thinner voice.** A miss sentence already said this visit becomes a short line ("The Moon. Mars is one booster size farther."). Fives are counted aloud on one flight per visit at most. The reward drops "Try again?". On a missed card that is still on, the 🚀 is hidden (the same rocket would land the same), unless the turbo could carry it the one missing stop.
- **Tier 4 varies.** About 40% of tier-4 cards are 'wobbly2': the rocket lands on the right planet but must fly steady, and two parts wobble. Fixing one still leaves a wobble ("One wobbly part fixed! It still wobbles a little, so another part wobbles too."), so the child finds two causes, one test at a time. Steps count faults left (`faultsLeft`), not checks passed.
- **An open race after tier 4.** The 🧪 workshop gets a 🏁 challenge, shown as two pictures (🔴━ and 🔴〰️): make A and B land on the same planet, one steady and one wobbly, and race them. There is no score, only the race and "the wobble never changes the distance!". Robot mentions it once, on reaching tier 4.
- **Clearer records.** A notebook wobble page always shows the wobbly part, even when the test went from wobbly to steady. Distance icons are 📏⬆ and 📏= (no 🪐, which can be read as the Ring Planet). The wobble row has a tappable "━ steady 〰️ wobbly" key. The reach bar's 🚀 stays hidden until Robot's rocket has flown. Only the newest gift wears a ✨, on the reward card and in the tray. The 📮 card sits on a solid plate.

## Changes

- **Soft-lock fix.** `js/main.js:954` `backToBuilding()` removes `away` from the tray and GO and shows the reach bar again. The predictor and where `onBack` handlers call it, and so does `backToGarage(true)` whenever the launch stopped for a question (`:2218`).
- **`js/main.js`, other changes:**
  - `:425`: the look camera.
  - `:548`: `renderReach` waits on Robot's rocket.
  - `:617`: one ✨ per tray.
  - `:886`: `helpBooster` and its finger.
  - `:935`: `raceChallenge`.
  - `:1102`: `lookThenAsk`/`endLook`; the mission card goes to the as-is question for every tier.
  - `launch`: no where-question at launch, and `predictor.ask(test, {planets})` from tier 2.
  - `:1565`: `fivesAloud`/`fivesOn`.
  - `:2000`: the honest nearer/help step.
  - `:2028`: `toldMiss` and `missionShort`.
  - `:2061`: 🚀 hidden on a missed card.
  - `:2224`: the notebook opens once, then is framed.
  - `save.hinted` and `save.raceTold` are persisted.
- **`js/missions.js`:**
  - `robotRocket`/`makeMission` (`:85`, `:114`): 'wobbly2', and `near` falls back to the same planet.
  - `:157` `faultsLeft`; `afterFlight` steps on fewer faults.
  - `:183` the wobbly2 step line.
  - `:214` `missionShort`.
  - `:225` `diagnosisWords` for the child's own rocket.
  - `:320` `createWhere` is now only the as-is question, with the big rocket and booster chip, and separate first-time wording for own and Robot cards.
  - `predictionWords` and the launch mode are removed.
- **`js/fairtest.js`:**
  - `:40` `verdict` for planet guesses.
  - `:49` `testChip`.
  - `:71` the wobble page shows the wobbly part.
  - `:156` the 📏 icons.
  - `:266` the planet mode of `createPredict`.
  - `:313`/`:382` the wobble key.
- **`js/workshop.js:196-230`:** the `challenge`/`onChallenge` race goal.
- **CSS:**
  - `fairtest.css`: the round-4 block (big as-is rocket, booster chip, `body.looking`, planet chip, framed 📓, wobble key, solid mission plate).
  - `workshop.css`: the challenge chip.
  - `style.css:216`: the ✨ only on the last gift.
- **`game.json`:** howToPlay.

## Evidence (scratchpad `polish/rocket-garage/r4/`)

- **`logic.test.mjs`: all pass.**
  - Over 3,000 tier-4 cards (1,180 of them wobbly2), every card has two faults. None can be fixed with one change, and all can be fixed with two one-change steps. Every wobbly2 card lands on the right planet, and fixing one wobbly part is a `step`.
  - A nearer card with only Moon and Mars falls back to the same planet. With three planets it picks the other neighbour.
  - The wobble page shows `fins:fish` for a fish ➜ classic test.
  - Planet verdicts match only the exact planet.
- **`play4.mjs`: careful runs at 834×1194 and 1194×834, 12 flights each, 0 console or page errors.**
  - The soft-lock path (🚀 after a changed part, then 🔧) ends with the tray and actions back (`tray:"" actions:""`).
  - The look phase runs (`look:true`, reach bar hidden).
  - Tiers 1→2→3 go through the as-is guesses. Mission launches go straight to the countdown.
  - The tier-2 planet fair test gives "You guessed it! Big boosters push harder…".
  - The tier-3 reach bar has no 🚀 before Robot's rocket flies.
  - Tier-4 wobbly2: the step says "One wobbly part fixed!…" with 🚀 hidden, then "Both fixed…". The race challenge is told once and shows in the workshop.
  - **36 spoken lines over 12 flights (3 a flight).**
- **`help.mjs`** (only the Moon and Mars, missing on purpose six times):
  - The run goes again → hint (the notebook opens) → help (the card stays Mars, the booster tab opens, the finger points at the small boosters, and Robot says "Try the small boosters!").
  - The second cycle frames the 📓 instead of opening it.
  - The repeat miss line is short ("The Moon. Mars is one booster size farther."). 0 errors.
- **`random.mjs`** (the reviewer's harness, 20 random flights at 834×1194):
  - 0 errors and no stuck states. Tier stayed 1 and no wobble parts were learned.
  - Fives were counted on one flight only. Repeated miss advice came back as the short line.
  - Most of the 107 lines were answers to the random taps themselves (notebook pages, card taps).
- **`small.mjs`** at 667×375 and 375×667: the as-is dialog fits without scrolling. 0 errors.
- **Checks:** `browser.mjs --ids rocket-garage --run rocket-garage-r4` gives BOOT + PLAY with 0 errors. `node --check` passes on main, missions, fairtest, workshop and parts.

## Remaining ideas

- The 🧪 button in the notebook could wear a small 🏁 while the race challenge is open.
- The look phase could also play a soft camera "whirr" sound, to make the pause read as deliberate.
- The planet-guess chip on the reward card is small in landscape.

# Round 5: softer Robot hello, an honest reach bar and a balanced reward card (2026-10-11)

Source: the coordinator's open audit item (Robot's square-wave beeps) and the last independent review (8.6). That review raised three visual and logic bugs, plus ranked improvements 1, 5, 6 and 7. All paths are under `examples/rocket-garage/public/`.

## Design

- **Robot's hello is soft.** Tapping Robot plays three rounded notes, sine, triangle and sine, at a lower volume, with no square buzz.
- **The tier 1–2 "as it is" guess is a real inference.** The review found that the reach bar's 🚀 showed the last landing while the own-rocket card waited. With the rocket unchanged, the child could copy the answer from the bar. Now, while an own-rocket card waits for its guess (`diag === null`), the bar keeps its 🚩 flags but hides the 🚀 and greys every planet. This is the same as Robot's cards already did. The record comes back as soon as the guess is made.
- **A turbo landing no longer disagrees silently with the boosters.** When the turbo carried the last flight one stop past the boosters' reach, the bar shows a still ⚡ in place of the dash into that planet. If the child then guesses the same rocket, the reveal adds one sentence: "Last time the turbo carried it one stop farther, to Mars." So the record and the rule always agree.
- **The reward card is balanced when 🚀 is hidden.** In portrait, the card splits into two even halves: the planet and stars on one side, the buttons centred on the other. A lone 🔧 now sits in the middle of its half. The landscape row is centred.
- **The where-dialog ✔/💡 sits inside the planet button's corner** (inset 6/5 px, 18 px) and no longer overlaps the border.

## Changes

- `js/main.js`:
  - `:2278-2281`: Robot tap tones are `sine`, `triangle` and `sine` at vol 0.07–0.08 (closes the audit item).
  - `:73`: `MISSION_AFTER` moved above its first use.
  - `:68`, `:75`: `save.landedTurbo` is added and persisted.
  - `:1996`: `landedTurbo` is set on landing (turbo used, and the landing is one past `reach`).
  - `:556-566`: `renderReach` hides the 🚀 while a tier 1–2 card waits for its guess, and marks the ⚡ dash.
  - `:1003`: the `aside` passed to `createWhere` holds the turbo note.
- `js/missions.js:320,349`: `createWhere` takes `aside(card, build)` and appends it to the reveal sentence.
- `style.css` (round-5 block, `:420`): `.btns` is centred, the portrait reward card uses two even columns, and `.dash.turbo` shows ⚡.
- `fairtest.css` (round-5 block, `:363`): the `.where-mark` inset.

## Evidence (scratchpad `polish/rocket-garage/r5/`)

- **`play5.mjs`: 834×1194 and 1194×834, Chromium `--use-angle=gl`, speech stubbed and logged, 0 console or page errors.**
  - Robot is found by raycast and tapped. The OscillatorNode types logged are only `sine` and `triangle`.
  - After 3 free flights, the own-rocket card waits with `goal:false` (no 🚀 on the bar). After the guess, `goal:true`.
  - The ✔ mark's box (178,573–200,591) sits inside its button (76,568–206,698).
  - A turbo flight (no boosters → Mars) gives `landedTurbo:true`. After the guess, the bar shows `.dash.turbo` and the 🚀 under Mars.
  - The reveal said: "Yes! Your rocket lands on the Moon. Robot wants the Comet. What will you change? Last time the turbo carried it one stop farther, to Mars."
  - 14 and 15 spoken lines over 7 flights.
- **`miss.mjs`** (an overshoot miss with 🚀 hidden) at 834×1194, 1194×834 and 375×667: the 🔧 is centred in its half (portrait) or on the card (landscape, 960 = 960). Screenshots: `p-07`, `l-07` and `s-07-miss-hidden-again.png`.
- **`narrow.mjs`** at 375×667: the reach bar with ⚡ fits (62–261 px), with no horizontal scroll.
- **Checks:**
  - `browser.mjs --ids rocket-garage --run rocket-garage-c1`: BOOT and PLAY, 0 errors.
  - `node --check` passes on `main.js` and `missions.js`.
  - `curriculum.test.mjs`: the rocket comparison test passes. The manifest and catalogue tests wait on the coordinator's build.

## Checklist

- Robot tap square-wave beeps: **closed** (`js/main.js:2278-2281`).

## Remaining ideas (from the review, not done this round)

- A non-lookup reasoning step for tier 4, such as a "which part did it?" card, or turbo plus booster planning.
- A picture-first notebook page for pre-readers, and the workshop behind one "race Robot" entry.
- One unlock per landing, tied to the planet reached, in place of a planet's whole set.

# Polish round 1 (bug pass): honest turbo advice on two-fault cards (2026-10-11)

Source: the two latest independent reviews (8.6 and 8.6). This pass fixes every bug they list. It makes no redesigns. All paths are under `examples/rocket-garage/public/`.

## Bugs and fixes

- **The tier-4 turbo route gave misleading advice.** On a two-fault card, when the turbo, not the boosters, reached the planet, Robot said "It lands on the Ring Planet now! Next, the wobble…". He then said the same on the next flight, and the place fault counted as fixed.
  - `js/missions.js:166`: `checkMission` now reports `carried`, which means the place was reached past the boosters' reach.
  - `:187`: the verdict now says "The turbo carried it to the Ring Planet, but his boosters still stop at Mars. Fix the boosters, then the wobble!"
  - `:221`: the repeat line is "Turbo again. His boosters still stop at Mars."
  - `:270`: `afterFlight` no longer counts a carried landing as a fixed fault, so it is not a "step".
  - `:178`: a two-fault card that is done with the wobble fixed and the turbo says so honestly.
  - `js/main.js:2124`: the reward card marks the planet 💡, not ✔, when the turbo carried it on an unfinished two-fault card.
- **"Tap the card to hear it" was inaccurate.** The tap starts the camera look and the "where will it land?" question, not a reading. `js/main.js:1033` now says "Robot has a mission card. Tap it when you are ready!"
- **"Fifteen!" was spoken on every flight where the turbo became ready.** `js/main.js:1558`: the offer is said once a visit. After that, the ⚡ lights with its soft chime and no voice.
- **The "🔧1 ➜ 🔧1" chip spilled under the planet tile.** `js/missions.js:310` tags Robot's two-fault tile `two`. In `fairtest.css:368-369`, that tile becomes 8:5 wide with the chip centred, so the chip fits inside it.
- **The reward race stressed the old landing.** Last flight's planet also grew, and a full-disc 🔴 looked bigger than this flight's 🪐.
  - `js/workshop.js:179`: each reached stop is tagged with its lane (`reached-a` or `reached-b`).
  - `fairtest.css:371-372`: on the reward race, only this flight's planet grows, with a soft yellow ring. Last flight's planet stays its own size at 0.6 opacity.
  - The ship's centre measures exactly on the planet's centre (384 = 384 px in portrait, 944 = 944 px in landscape). The workshop dialog's race is unchanged.

## Evidence (scratchpad `polish3/rocket-garage/`, `play.mjs`)

- **Setup:** Chromium `--use-angle=gl`, speech stubbed and logged, at 834×1194 and 1194×834, with 0 console or page errors.
- **Two-fault card with short boosters, flown twice with 0 changes and the turbo taken:**
  - Portrait: Mars to the Ring Planet. Landscape: Comet to the Alien Planet.
  - The two lines are the turbo sentence and then "Turbo again…".
  - `got` stays 0 and `misses` goes 1 then 2. The marks are ✔ 💡 💡.
- **"Fifteen" over two turbo-ready flights:** spoken once.
- **Chip:** it spans 33–119 px inside its tile (23–129 px). The next tile starts at 135 px. Screenshots: `p-02-garage-card.png`, `p-03-tier4-reward-0.png` and `l-03…`.
- **Reward race:** `p-01-reward-race.png` and `l-01-reward-race.png`.
- **Checks:**
  - `browser.mjs --ids rocket-garage --run rocket-garage-f1`: BOOT and PLAY, 0 errors.
  - `node --check` passes on `main.js`, `missions.js` and `workshop.js`.
  - `curriculum.test.mjs`: the rocket comparison test passes.

## Still open (review ideas, not bugs)

- Robot's rocket thumbnail on the card is still small.
- Ideas from the reviews: a "steady or wobbly?" prediction for tests that change only the nose, tank or fins; a non-lookup step for tier 4; idle Robot and pad lights that settle; a pilot that stops dancing after the song; and a ⚡ notebook page.

# Polish round 2 (bug pass): no repeated lines, honest two-fault wins, Robot's boosters visible (2026-10-11)

Source: the two latest independent reviews (8.6 and 8.6). This pass fixes every bug they list and takes a few small, safe improvements. It makes no redesigns. All paths are under `examples/rocket-garage/public/`.

## Bugs and fixes

- **Mission lines repeated word for word.** Examples: "Both fixed, one change at a time!…" (5–6 times), the "It lands on X now! Next, the wobble…" step line, the wobbly2 step line, and the tier-1 hint line. The cause was that the repeat rule skipped done, step and hint verdicts.
  - `js/main.js:2027`: every mission line already heard this visit becomes a short form. Short forms already heard are skipped until the briefest one.
  - `js/missions.js:228` (`missionShort`) now has short forms for done (tier 4, tier 3 and tier 1–2), step and hint, plus a brief fallback for misses ("The Moon again.", "Still a wobble.").
- **The struggling tier-1 loop.** With no nearer planet, the card looped through again, hint and help forever.
  - `js/main.js:2015`: a card is helped once. The next third miss puts it away (`next = 'rest'`), with "The Moon again. Let's just fly for fun. Robot's card will wait." (`js/missions.js:189`, `js/main.js:2139`).
- **The turbo could stand in for the booster fix on a two-fault card.** Fixing only the wobble and taking the turbo gave "Both done!" and counted as a predicted win.
  - `js/missions.js:172`: `done` now needs `!(m.two && carried)`.
  - The verdict says "…his boosters still stop at the Comet. Fix the boosters!" and drops "then the wobble" when the wobble is already right. The old "Both done… turbo" line is gone.
- **The 🔧1 ➜ 🔧1 chip covered Robot's boosters, and his thumbnail was tiny.**
  - `fairtest.css:372-381`: Robot's tile is now a column, with the rocket image above and the tag below in flow, never over it.
  - The image is 64 px on the garage card (80 px on tablets), 56 px on the reward card and 40 px in the flight chip.
  - The old 8:5 overlay rules (`:368-369`) are removed.
- **The in-flight chip had no Robot rocket.** `js/main.js:1370` passes `rocketThumb`.
- **A multi-part test named every changed wobble-slot part as the cause, then contradicted itself.** `js/workshop.js:82` now says: "Something changed the wobble, not the distance. Change one part at a time to find out which!" It names no part.

## Small improvements

- **The notebook grows during missions** (`js/main.js:1988`). A mission flight on Robot's rocket is measured from his rocket as the card put it on the pad, so a one-change fix is a fair test. In the careful run the notebook holds booster, tank, fins and nose by about flight 6, and the tray holds 10 marks. It previously had 2 pages after 22 flights.
- **"As it is" answers and questions** (`js/missions.js:251-262`, `:378`, `:470`). A heard answer becomes "Yes! The Moon. The right planet, so what is wrong?", then just "Yes! The Moon.". The question is spoken in full twice, short twice, then left to the pictures (🔊 still says it).
- **Card shapes** (`js/missions.js:127-129`):
  - Steady and wobbly cards take turns.
  - At tier 4, about 1 card in 6 is a one-fault tier-3 card.
  - "Easier" steps down from the lower of the state's tier and the card's tier (`:320`).
- **A calm garage** (`js/main.js:2427-2445`):
  - Robot no longer waves every 8 s. He waves only when something happens.
  - His sway and bob, and the pad lights' breathing, ease to still 5 s after the last touch.
- **The pilot rests after the song** (`js/main.js:2168`, `:2223`). The pilot and friend dance for the one-phrase song (9 s), then ease into a still pose.
- **Smaller sparkle bursts** (`js/main.js:757`, `:781`). The part and paint bursts are halved: 9 and 11 particles at power 2.4, down from 18 and 22.
- **Debug only:** `window.rg` exposes `robot` and `padLights` for the idle checks.

## Evidence (scratchpad `polish3/rocket-garage/r2/`)

- **Setup:** Chromium `--use-angle=gl`, speech stubbed and logged, at 834×1194 and 1194×834. 0 console or page errors in every run.
- **`t4.mjs` (careful tier-4 play; 24 flights in portrait, 16 in landscape):**
  - No mission line longer than 3 words repeats.
  - The only repeats are the intended "first two times" question lines.
  - Cards: wobbly2, both and tier-3, with steady and wobbly alternating.
  - Notebook: `booster, tank, fins, nose`.
  - Idle 8 s: Robot's y is 1e-5, and all pad lights are 1.0.
  - The flight chip has Robot's image.
  - Screenshots: `p-01-garage-card.png` and `l-01…` (tag under the rocket, boosters visible), `p-02-flight-chip.png` and `p-03-reward.png`.
- **`misc.mjs`:**
  - The multi-part test says the new "Something changed the wobble…" line.
  - The pilot's pose is identical 700 ms apart after the song, with arms at 0.
  - The struggle sequence is again, hint, help, again, hint, then rest, with the card put away.
  - Turbo with only the wobble fixed: `done:false`, marks ✔ 💡 ✔, wins 0, and "Fix the boosters!". Screenshots: `mp-turbo-reward.png` and `ml-…`.
- **Checks:**
  - `browser.mjs --ids rocket-garage --run rocket-garage-f2`: BOOT and PLAY, 0 errors.
  - `node --check` passes on `main.js`, `missions.js` and `workshop.js`.
  - `curriculum.test.mjs`: the rocket comparison test passes.

## Still open (review ideas, not bugs)

- A "steady or wobbly?" (━ / 〰️) prediction for one-part nose, tank or fins tests.
- A "which part did it?" two-flight card for 6–8.

# 2026-10-11 round 3: bug-free pass

Source: two independent reviews (8.8 and 8.7). This pass fixes every listed bug and adds a few small, safe changes. There are no redesigns. All paths are under `examples/rocket-garage/public/`.

## Bugs and fixes

- **Fair-test verdicts repeated word for word.** A careless child heard "Ooh, a new discovery! Something changed the wobble…" in full on 3 of 13 flights.
  - `js/main.js:2150-2163`: each visit now tracks which verdicts were heard (`toldTest`). All several-part verdicts count as one line.
  - The second time a verdict comes up, it is short (`verdictShort`, `js/fairtest.js:56`), for example "Several parts changed again. One at a time tells you which!", "Mars." or "Just the wobble changed again.".
  - After that, a right guess hears only "Yes!", and a wrong one hears nothing; the race and the ✔ / 💡 still show the answer.
- **A wrong guess on a several-part test was called "a new discovery".** It now says "Hmm, not that!" (`js/fairtest.js:47`).
- **wobbly2 cards were always steady**, so most tier-4 cards practised only "remove the wobble". `js/missions.js:121-127`: steady and wobbly now take turns first. A wobbly2 card (two wobbly parts, which needs steady) can only appear on a steady turn, in half of them.
- **The turbo was invited on a two-fault card that does not count it.** At 15 stars the voice said "Fifteen! Tap the lightning…", then "the turbo carried it… but his boosters still stop".
  - `js/main.js:1605`: `turboRelevant()` is false on `m.two` cards, so there is no invitation, no counting the fives aloud and no star tally.
  - The two miss lines that suggested the turbo (`js/missions.js:210-211`) and the "again" button's turbo exception (`js/main.js:2115`) now skip `m.two` cards.
- **Robot's rocket was small on the reward card, with the ✔ over it.** `fairtest.css:383-386`: it is now 64 px tall (48 px on short landscape screens), and its ✔ sits outside the picture's corner.
- **A lost WebGL context left the garage blank.**
  - `js/main.js:93-110`: when the context comes back, the room environment is rebuilt. If it does not come back within 2.5 s, a calm 😴 🚀 ▶ screen appears (`index.html:76`, `style.css:22`). The game saves first, so tapping it reopens the garage with progress kept.
  - `js/main.js:282`: when the thumbnail context comes back, the part and rocket pictures are drawn again.
- **"Turbo again" named the planet as `m.dest - 1`.** It now uses `reach(rocket)` (`js/missions.js:244`).

## Small improvements

- **Mission lines treat the same sentence about another planet as heard** (`js/main.js:2080` `lineKey`). An example is "It lands on X now! Next, the wobble…". A card that is put away keeps its own brief line.
- **The prediction echo** is said in full twice per visit, then becomes "Farther? Let's see!" (`js/fairtest.js:250`).

## Evidence (scratchpad `polish3/rocket-garage/r3/`)

- **Setup:** Chromium `--use-angle=gl`, speech stubbed and logged, at 834×1194 and 1194×834. There were 0 console or page errors.
  - The host was under heavy load, with other workers' browsers. Some runs ended with "Target crashed" or `ERR_INSUFFICIENT_RESOURCES` before boot, so they were retried. This came from the environment, and runs that finished had no errors.
- **`t4.mjs`, careful tier-4 play (20 flights in portrait, 16 in landscape):**
  - The card sequence is S, W, S, W… (portrait: bothS 3W wobbly2S 3W wobbly2S bothW bothS bothW 3S bothW wobbly2S bothW).
  - Only the intended "first two times" question lines repeat.
  - Screenshots `p-03-reward.png` and `l-03-reward.png` show Robot's rocket larger, with the ✔ clear of it.
- **`misc.mjs` (portrait):**
  - Random visit of 14 flights:
    - The first several-part miss gave the full sentence with "Hmm, not that!".
    - The next gave "Several parts changed again. One at a time tells you which!".
    - After that there was only "Yes!" or silence.
    - The echo moved to "Farther? Let's see!" from the third guess.
  - Two-fault card one short, turbo taken twice:
    - No "Fifteen!" line, and no star tally.
    - "Again" was hidden.
    - The lines were "…his boosters still stop at the Ring Planet" and "Turbo again. His boosters still stop at the Ring Planet.".
  - Context loss (`WEBGL_lose_context`):
    - Lost then restored: the wake screen stays hidden, and the garage draws again (`mp-restored.png`).
    - Lost for good: the wake screen appears (`mp-wake.png`). Tapping it reloads with `visited` kept.
- **Checks:**
  - `browser.mjs --ids rocket-garage --run rocket-garage-f3`: BOOT and PLAY, 0 errors.
  - `node --check` passes on `main.js`, `missions.js` and `fairtest.js`.
  - `curriculum.test.mjs`: the rocket comparison test passes.

## Still open (review ideas, not bugs)

- Same as above: a ━ / 〰️ prediction for one-part wobble-slot tests, and a "which part did it?" card for 6–8.
