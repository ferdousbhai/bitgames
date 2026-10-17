# Bunny Hop

## Round 14 (2026-10-16)

- **Corner controls:** pointerup/cancel and the compatibility pointer click blur their button. Native keyboard clicks never invoke hold actions; intentional `:focus-visible` keyboard focus requires Enter/Space down→up for at least 1000 ms. Auto-repeat cannot restart the hold; overlapping keys spoil it until both lift. Removed instant M/Escape leave/mute shortcuts on home/results too. Pointer holds and the sole-pointer pace menu tap remain (`public/js/main.js:944`, `:983`). The pointer blur restores Space/Enter hopping after a corner tap.
- **Portrait:** lead is 0.54 at aspect 0.75, interpolating to 0.72 at square. The suggested 0.66 actually moves Pip farther left; settled-frame vertex projection measured an ear at −16.46 px there, versus **+30.74 px** with 0.54 (`main.js:65`).
- **Variety:** every fourth double hop adds a full corkscrew around Y alongside the familiar flip. Takeoff velocities, hop timing, calm/rapid balance and the held three-hop wave are unchanged (`public/js/bunny.js:114`, `:276`). Kept Round 13 gold pull unchanged (optional item).

### Evidence

Scripts, JSON and JPEGs live in `/dev/shm/bitgames-work/codex/bunny-hop/`. `round14.mjs` passed **96** short touch/mouse tap → quick/repeated/held Enter/Space sequences across menu, play, home and results (menu has mute/pace; home is hidden). Also verifies deliberate keyboard focus, short press rejection, overlapping/re-pressed key rejection until all keys lift, full hold acting only on release, sound restored on reload, and Space hopping after a home-button tap. State fixtures freeze the frame loop and select each state; these are control tests, not full-trip playthroughs.

Production Bunny physics, 30 s at 240 Hz, complete airborne peaks above the path (isolated from obstacles/springs):

| Input | Peak heights (m) | Doubles / corkscrews |
| --- | --- | --- |
| 2 taps/s | 3.615 | 20 / 5 |
| 3 taps/s | 3.792 | 23 / 5 |
| 5 taps/s | 3.310–3.333 | 30 / 7 |
| 9 taps/s | initial 2.743; then 1.518–1.816 | 45 / 11 |
| Hold | 1.104 → 1.484 → 3.826 | 12 / 3 |

`round14.json` contains raw results. GPU renderer **ANGLE (Mesa, AGX G13/G14, OpenGL ES 3.2)**; **0 page errors, 0 speech calls**. Inspected `r14-portrait-flip768.jpg` (corkscrew) and `r14-steady768.jpg` (settled framing). `portrait14.mjs` projects every ear mesh vertex over frames 120–299 of steady 2 taps/s at 768×1024; minimum left clearance **30.74 px** (`portrait14.log`). Shared `EXAMPLES_IDS=bunny-hop` mash check **PASS** (`round14-mash.log`), including keyboard, palms/resting hands and 30 s mashing. JavaScript syntax and scoped diff whitespace **PASS**. One browser at a time, all closed. No build, commit or publish; only owned game files and this doc edited. Physical-device play and listening remain unverified; fresh independent fun review remains necessary.

## Round 13 (2026-10-16)

- Holding keeps the gentle three-hop wave, but the third hop now doubles automatically at its apex. Regular big arcs rise from 2.11 m to 3.68–3.69 m at 60 Hz (near 3.8 m with finer physics steps), with a flip on the double. Manual hop physics are unchanged (`public/js/bunny.js`, `public/js/main.js`).
- Rapid-input flips (tap gaps below 0.18 s) pull gold from 2.7 m with a stronger drift; ordinary tapping retains the 1.4 m pull (`public/js/course.js`).
- Growing-garden 🔁 remains tappable with `aria-disabled`: a soft click and wiggle answer taps while `start()` continues guarding the payoff. Butterflies face the camera with shallow, broad flaps. Short-screen high hops get more camera lift. Removed title tooltips and added the sound aria-label.
- Fixed the shared check's focused-button keyboard failure: stray Enter/Space cannot activate home/sound during play. Single-pointer holds remain available.

### Reproducible 30-second comparison

`/dev/shm/bitgames-work/codex/bunny-hop/round13.mjs` runs the actual game frame at fixed 60 Hz in GPU Chromium. It pre-generates the same seeded course and adds three standard gold carrots at x=60/120/180 so every input meets gold within 30 s. The before pass restores the old held-third takeoff/flip and old gold pull in memory. Peak includes springs/stomps, not just ordinary hops; flips include spring flips. These are controlled comparisons, not a promise of identical random-trip scores.

| Input | Peak m before → after | Flips before → after | Carrots before → after | Gold before → after | Bumps before → after |
| --- | --- | --- | --- | --- | --- |
| 2 taps/s | 5.667 → 5.667 | 20 → 20 | 50 → 50 | 4 → 4 | 1 → 1 |
| 3 taps/s | 5.617 → 5.617 | 29 → 29 | 48 → 48 | 3 → 3 | 1 → 1 |
| 5 taps/s | 5.617 → 5.617 | 31 → 31 | 54 → 54 | 4 → 4 | 0 → 0 |
| 9 taps/s | 5.283 → 5.283 | 44 → 44 | 49 → 69 | 1 → 5 | 1 → 1 |
| Hold | 5.692 → 5.558 | 14 → 13 | 46 → 48 | 0 → 3 | 0 → 0 |

Raw evidence: `round13-before.json`, `round13-after.json`. Initial unmodified-course measurements revealed that this seed's masher never passed a gold within 30 s (nearest 18.7 m); this motivated the matched gold encounters above. Calm 2/3/5 measurements stayed identical in both setups.

Visual script: `visual13.mjs`; JPEGs inspected: `r13-spring844.jpg`, `r13-butterflies768.jpg`, `r13-growing.jpg`. Spring near peak at y=4.09 has clear space below the corner controls. Growing 🔁 tap stayed on results and produced one feedback animation. Renderer: **ANGLE (Mesa, AGX G13/G14, OpenGL ES 3.2)**. All measurement/visual runs: **0 page errors, 0 speech calls**. Browser closed after each script. Checks: JavaScript syntax and scoped diff whitespace PASS. Shared `EXAMPLES_IDS=bunny-hop` mash check **PASS**, including focused Enter/Space, key auto-repeat, touch mashing, palms and resting hands (`round13-mash.log`). No physical-device or listening test; fresh independent fun review remains necessary.

## Round 12 (2026-10-16)

### Changes
- Holding now repeats a gentle **8.2 → 9.5 → 11.5** takeoff wave, with an automatic full flip on the third hop. Releasing resets the wave; manual taps keep their existing double-hop response (`public/js/bunny.js`, `public/js/main.js`).
- Rapid tapping softens only after eight rapid intervals, to **10.5 / 9** instead of **10 / 8**. Ordinary 2–5 taps/s are unchanged.
- Lifted the home scene by lowering the camera and its aim, clearing the results card; raised portrait path framing from factor 0.76 to 0.64.

### Measurements and evidence
- Production physics, 30 s per input at 240 Hz, peak height above the path in metres (complete airborne arcs, including double hops):

| Input | Before | After |
| --- | --- | --- |
| 2 taps/s | 3.615 | 3.615 |
| 3 taps/s | 3.792 | 3.792 |
| 5 taps/s | 3.310–3.333 | 3.310–3.333 |
| 9 taps/s | first 2.743; then 1.091–1.211 | first 2.743; then 1.518–1.816 |
| Hold | 1.104, no flip | 1.104 → 1.484 → 2.180, flip every third hop |

- Script: `/dev/shm/bitgames-work/codex/bunny-hop/round12.mjs`; raw takeoffs and peaks: `round12-before.json`, `round12-after.json` in that directory. Chromium renderer **ANGLE (Mesa, AGX G13/G14, OpenGL ES 3.2)**; **0 page errors, 0 speech calls**. Browser closed after each run.
- JPEGs inspected: `r12-home-{768,1024,390}.jpg` (full garden/family), `r12-winter{768,390}.jpg`. Winter forced using the shuffled route's actual snow index.
- Checks: JavaScript syntax and scoped diff whitespace PASS. Shared `EXAMPLES_IDS=bunny-hop` mash check **PASS**, including keyboard, palms and resting hands; report copied to `round12-mash-report.json`.
- Limits: no physical tablet or listening test; independent fun review still needed.

## Round 11 (2026-10-16)

### Changes
- **Gentle tap-chain cut:** count actual rapid taps, excluding queued takeoffs. Gaps of 0.18 s or more reset the count (so a 0.3 s gap always restores full height); landing without a queued tap also clears it. Only six consecutive rapid intervals soften hops to **10 / 8**, from full **11.5 / 10**. Manual hops retain stomp-chain eligibility at every rate. Holding remains 8.2 (`public/js/bunny.js:82`, `:217`).
- **Portrait tablet:** camera lead is 0.6 through aspect 0.75, interpolating to 0.72 at aspect 1; Pip has room to flip at 768×1024 (`public/js/main.js:65`).
- **Landscape home:** distance capped at 10.5 instead of 13, aiming at 1.9 so the burrow and family fill more of the screen (`main.js:1161`).
- **Door flowers:** moved forward from z −3.5 to −1.2, centred on the door, and lowered/tightened into an arch around it (`main.js:661`).
- **First homecoming:** six flags, adding one per trip up to 48 (`main.js:630`).
- **Corner hold:** 1000 ms, up from 700 ms (`main.js:125`).

### Verification
- Browser script `/dev/shm/bitgames-work/codex/bunny-hop/round11.mjs`: production Bunny physics simulated for 30 s per rate at 240 Hz, logging every takeoff in `round11-speeds.json`. **2, 2.8, 5 taps/s: 11.5 hop / 10 flip throughout. 9 taps/s: starts 11.5 / 10, settles to 10 / 8. Hold: 8.2, no automatic flip.** These are isolated physics measurements, not whole-course carrot comparisons.
- Chromium renderer: **ANGLE (Mesa, AGX G13/G14, OpenGL ES 3.2)**. Script checks six first-trip flags, tablet lead, an 800 ms home-button press staying in play, **0 page errors / 0 speech calls**. Screenshots: `r11-portrait-flip768.jpg`, `r11-home-{1024,768,390,844}.jpg` in the same directory.
- Shared `examples/_studio/tests/mash.mjs` with `EXAMPLES_IDS=bunny-hop`: **PASS**, including keyboard taps, palms and resting hands. JavaScript syntax and scoped `git diff --check`: **PASS**.
- Remaining limits: no physical tablet or listening test; independent fun review still needed.

## Round 10 (2026-10-16)

### Changes
- Timing: after three hops without a 0.14 s landing pause, tap chains settle to 8.2 takeoff / 5.5 flip lift instead of 11.5 / 10. A short grounded pause restores full hops and stomp eligibility. Holding retains its steady 8.2 hop; bumps, carrot spill, pace and trip lengths are unchanged (`public/js/bunny.js:61`, `:83`, `:222`).
- Home keeps changing: nine flowers form an arch above the burrow, rotating four seasonal palettes on successive trips, including after the 25 garden spots fill. Garland starts with three flags, adds one per trip to 48 and periodically changes colours (`public/js/main.js:626`, `:655`).
- Hedgehog family moved to its own left patch; later neighbours sit in an open foreground row. Heap shifted right, away from the family (`main.js:673`, `:723`, `:849`).
- Narrow portrait lead is 0.6. Home camera is closer and aimed higher, raising the scene above the results card (`main.js:65`, `:1157`).
- Menu pace accepts a sole-pointer tap on release; a second finger cancels it. During play the existing hold remains; completed holds still swallow the lift click (`main.js:982`, `:1055`).

### Verification
- Same seeded route, 45 wall seconds each, real GPU: holding **65 carrots / 0 gold / x299**, mashing **61 / 0 / x280**, timed **97 / 4 / x299**. Simulation times 45.0–45.1 s. Timed earned 59% more carrots than mashing. All three: **0 page errors, 0 speech calls**. Script: `/dev/shm/bitgames-work/codex/bunny-hop/compare10.mjs`.
- `round10.mjs` verifies Mesa AGX renderer, menu taps and a three-finger resting palm, full-hop restoration, auto vs tap stomp rewards, mature home growth and portrait/landscape screenshots. Evidence is under `/dev/shm/bitgames-work/codex/bunny-hop/` (`r10-portrait-play.jpg`, `r10-home-390.jpg`, `r10-home-844.jpg`, `r10-home-768.jpg`).
- JavaScript syntax and scoped `git diff --check`: PASS. Final `round10.mjs`: PASS, **0 page errors / 0 speech calls**, renderer **ANGLE (Mesa, AGX G13/G14, OpenGL ES 3.2)**. Inspected all three home JPEGs: family, foreground neighbours and heap are separate and visible; portrait grass is reduced. Shared `TMPDIR=/dev/shm EXAMPLES_IDS=bunny-hop EXAMPLES_ORIGIN=http://localhost:4213 EXAMPLES_CHROMIUM_EXECUTABLE=/usr/bin/chromium node examples/_studio/tests/mash.mjs`: **PASS** (30 s mashing, palms and resting hands; stays in play, saves no mute). All browser processes launched for this round closed.
- Only game files and this living polish doc changed for this round. No build, commit or publishing. Physical-device play and sound by ear remain unverified.

## Fun pass, round 9 (2026-10-16)

### Changes
- Removed the flat pantry and overlapping sideways carrots; the falling carrot heap carries the haul (`public/js/main.js:626`).
- A pennant garland gains one visible flag every trip through trip 48; later trips rotate all its colours. It sprouts during the existing protected home payoff (`main.js:626`). The garden, surprise keepsakes and skill marks remain.
- Hedgehog neighbours sit behind the left side, outside the babies' x-range. Both hedgehog groups are smaller on wide phones (`main.js:655`, `:697`).
- Portrait path aim is 0.76 (`main.js:69`). Turtle places are 78 units, retaining all four shuffled places and the surprises (`public/js/biomes.js:170`).
- Only tap-initiated hop chains grant stomp skill, stone-stack marks and carrot rain; auto-hop bounces still work and sound playful. Buffered taps retain eligibility; springs and bumps clear it (`public/js/bunny.js:60`, `:83`, `:122`, `:147`; `main.js:1083`).
- At home/results, foreground world props and props projecting into the lower screen are hidden; the burrow stays visible (`main.js:1282`). Short landscape has a smaller results strip (`public/style.css:140`).

### Verification
- Browser script: `/dev/shm/bitgames-work/codex/bunny-hop/round9.mjs`. Real GPU renderer: **ANGLE (Mesa, AGX G13/G14, OpenGL ES 3.2)**.
- Identical three-stomp event sequences through the running game's event handler: auto-hop **0 skill / 0 chains**, tap-hop **2 skill / 1 chain**. Mature trip 20 has 20 pennants.
- Inspected JPEGs: `r9-portrait-play.jpg`, `r9-home-390.jpg`, `r9-home-844.jpg`, `r9-home-768.jpg` in the same evidence directory. Babies, heap and burrow remain visible; the 844×390 result strip clears the scene.
- Full turtle trip with no input reached home in **73.7 game seconds**. Browser run: **0 page errors, 0 speech calls**. JavaScript syntax checks passed.
- Shared `EXAMPLES_IDS=bunny-hop … node examples/_studio/tests/mash.mjs`: **PASS** (30 s mash, palms and resting hands; stays in play, saves no mute). `git diff --check` passed for the touched files.
- No build, commit or publishing (worker scope). Physical-device play and sound by ear remain unverified.

## Fun pass, round 8 (2026-10-16)

### Changes
- Growth starts 1.15 s after arriving, before the results card. Replay is dimmed and disabled until all sprouts settle and the carrot drop finishes; the start handler also guards keyboard and synthetic clicks. Early skill stars fly from the carrot score; later ones fly from the card.
- 🐇/🐢 uses the same sole-pointer 0.7 s hold as 🏠/🔊, including palm cancellation. Pace is session-only; the old saved pace is removed. Completed holds swallow the next ghost click.
- Holding still helps the littlest players, with a lower 8.2 takeoff (about 1.12 high) on repeated auto-hops. Deliberate taps keep 11.5 (about 2.2 high) and the flip. Springs and stomp bounces keep their full strength.
- A compact carrot pantry gains two carrots every trip through trip 24, with a seasonal cloth colour changing every four trips indefinitely. Later hedgehog neighbours arrive at trips 6, 9 and 12. Trip ten therefore still changes the home after the original garden and keepsakes fill up.
- Removed the home emoji banner. Heap carrots fall from just above the pile (2.0 plus layer height), below the HUD.
- Hedgehogs moved to the front right, away from the babies and cairn; the pond/frog moved inward to the front left.
- Portrait shows more path ahead (half-width 4.5, lead 0.72) with the path lower (0.82 aim factor), reducing the empty foreground.
- 🐢 places are 145 units instead of 210, with all four biomes and trip surprises retained. Snow path is a darker blue (`#5786bd`).

### Source map
- Payoff/replay: `public/js/main.js:226`, `:657`, `:1230`; banner removal: `:383`.
- Pace and ghost clicks: `public/js/main.js:106`, `:134`, `:1002`, `:1019`; hold ring: `public/style.css:138`.
- Auto-hop arc: `public/js/bunny.js:79`; later home additions: `public/js/main.js:622`.
- Heap, hedgehogs and pond: `public/js/main.js:825`, `:698`, `:744`.
- Portrait play: `public/js/main.js:61`; shorter 🐢 places: `public/js/biomes.js:169`; snow path: `public/js/biomes.js:109`.

### Verification
- `compare8.mjs`: same seed, 70 wall seconds per bot. Held: **61 carrots / 1 gold**, 48.0 game seconds. Timed: **99 carrots / 4 gold**, 47.8 game seconds. Held auto-hop peaks were about 0.93, ordinary timed hops about 1.93; timed flips/bounces reached higher. 0 page errors and 0 speech calls. Results in `compare8-results.json`. SwiftShader throttled both runs, so these are ~48 game seconds rather than 70 game seconds; they had comparable travel (310 vs 318).
- `round8.mjs` passed: 12 pace taps and a three-finger resting palm did not change pace; a solo 0.85 s hold did; no pace key was saved; reloading restored rabbit pace. 🐢 length was 145.
- Trip-ten arrival: at home time 1.4001, the first sprout was already growing (`t=0.2501`) before the card. Replay stayed disabled and a dispatched click could not restart. It enabled after all sprouts and heap drops finished. 33 home decor groups, 0 page errors, 0 speech calls.
- Scripts and JPEGs live in `/dev/shm/bitgames-work/codex/bunny-hop/`: `round8.mjs`, `home8.mjs`, `compare8.mjs`, `portrait768-play.jpg`, `trip10-growth768.jpg`, `trip10-home768.jpg`, `trip10-home390.jpg`. Shared mash check PASSed with `EXAMPLES_CHROMIUM_ANGLE=swiftshader`: 30 s random taps, palms and resting hands stayed in play with sound on; report saved as `mash-report.json`. The final `home8.mjs` captures at 390×844 and 768×1024 show the pantry, pond/frog and hedgehog family in frame, with clear space between them and the babies; 0 errors and 0 speech calls.
- The requested `gl` renderer failed to create a WebGL context before game startup (`BindToCurrentSequence failed`). Browser verification uses Chromium SwiftShader, supported by the shared harness.
- `docs/POLISH_HANDOFF.md` is absent in the shared tree; no shared files, build, commit or publishing touched.

## Fun pass, round 7 (2026-10-16): the hold rule and the review list

### Changes
- **Hold rule** (`holdable()` in `main.js`):
  - **Where:** 🏠 and 🔊 need a 0.7 s hold on every screen: menu, play, home and results.
  - **Who:** a document-level set tracks every pointer that is down. A hold starts only when its finger is the only one down.
  - **Cancelling:** any other finger landing anywhere cancels the hold and spoils it until every finger has lifted. Only the starting pointer ends it. Any pending animation frame is cleared before a new hold starts, and the tick stops once the hold is cancelled.
  - **Clicks:** finger and ghost clicks never act; only the keyboard presses at once.
  - **Keys:** M and Escape do nothing during play.
- **No saved mute:** sound starts on every visit, and the old `bunnyhop.muted` key is removed.
- **The burrow is spread away from the snow:** all four places shuffle 85% of the time, so snow comes last only about a third of the time.
- **A less cluttered home:**
  - The garden now has 25 spots. The front flower row and the lantern in front of Pip are gone, and the lanterns moved to the sides.
  - At most 5 little bunnies.
- **Careful play out-earns mashing:** golden showers rain 8, or 14 for the flip-only 🌟, and a stomp chain rains 10. 70 s bots: careful play got 132 carrots, holding 79, and mashing 74.
- **Variety within a trip:**
  - Each place has favourite patterns (`biome.favour`): meadow has bubbles and puddles, grove has springs and stomp chains, autumn has rolling hedgehogs, and snow has brooks and flip carrots.
  - A pattern never repeats one of the last two.
  - There are two new patterns: `roller` (one hedgehog rolling towards Pip) and `brook` (two stepping stones). Hopping both brook stones is a perfect stream, so the lily pad and frog can be reached on ordinary trips.
- **Portrait camera:** a little less path across (4.0), so Pip is bigger, and the path sits lower with less empty ground below.
- Grove side scenery no longer has small mushrooms that look like obstacles.

### Evidence
- **Shared check:** `TMPDIR=/dev/shm … examples/_studio/tests/mash.mjs` PASSes for bunny-hop.
- **`palm.mjs` (CDP touch):**
  - 24 three-finger palms fired nothing.
  - A palm held for 1.2 s fired nothing.
  - A resting hand (one finger on each button and two on the canvas, 1.5 s) fired nothing.
  - On the menu a tap on 🔊 did nothing and a hold toggled it. One finger held in play went home.
- **`brook.mjs`:** stone, stone, then `perfect`.
- **JPEGs in `/dev/shm/bunny-hop/`:** `p390-after.jpg`, `p768-after.jpg`, `r7-home-full390.jpg`, `r7-home-full1024.jpg`.

## Fun pass, round 6 (2026-10-16): review 8.3 (variety 7.5)

### Changes
- **The garden lasts.**
  - `DECOR` has 32 spots. After the scenery come a vegetable patch (carrots growing on mounds), a row of flowers along the front, three lanterns that glow at night, and a pink swing.
  - The tree that hid the chimney moved to `[4.7, -5.6]`.
  - The scale-up after a full garden is capped at 1.3× (was 1.8×).
  - Once the garden is full, a trip's growth pops up the existing trees and bushes instead of re-planting.
- **Keepsakes grow each time a surprise is met again** (`bunny-hop:metCount`):
  - **Hedgehog family:** up to 3.
  - **Balloon bunch:** up to 4 colours.
  - **Rainbow:** a double rainbow on the second meeting.
  - **Little bunnies:** up to 2 extra friend bunnies. More come as the garden grows, up to 6.
- **Skill leaves a mark** (`bunny-hop:marks`):
  - A perfect stream adds a lily pad on the pond, then a frog.
  - Each stomp chain adds a stone to a stack beside Pip, up to 5.
  - At the results, each thing skill grew gets a 🌟 that flies from the card down to its spot (`flyStar`). The card's star dims, and the thing pops up as the star lands. The garden now pops up after the results card shows.
- **The friend** runs 1.9 behind Pip and further back (z -1.7), clear of him.
- **Rare pattern:** the heart or golden staircase now comes on about half the trips.
- **`shuffleTrip`:** checked over 20,000 rolls in the browser.
  - Each of 🌼, 🍄 and 🍂 started about 29% of trips and ❄️ about 12%. Snow came last 68% of the time.
  - It was not biased, so "🍄 first 6 of 8" was chance.
  - A trip now never starts where the last one started.
- **Minor:**
  - Stepping stones are bigger (1 × 0.6), light grey with moss, and darker with snow caps in the snow.
  - Landscape phones show more path ahead (`lead 0.45 + 0.15 * short`).

- **Multi-touch hold fix:** `holdable()` tracks the starting `pointerId` and clears any pending rAF before starting. A second pointer landing anywhere (window capture) cancels the hold and spoils the press, so its clicks don't act either. The tick also stops if the hold was cancelled. Checked with `palm.mjs` (CDP `Input.dispatchTouchEvent`): 24 three-finger palms on 🏠 and 🔊, each lifted after 80–300 ms, fired nothing. A palm held 1.2 s fired nothing, and a single finger held 0.95 s still went home.

### Evidence
- **Screenshots:**
  - `r6-stars-full390.png` (a 🌟 in flight)
  - `r6-home-full390.png` and `r6-home-mid1024.png` (hedgehog family, balloon bunch, stone stack, swing, lanterns and flower row)
  - `r6-friend-1024.png`
- **Scripts:** `bias.mjs` (the shuffle check), `stones.mjs` (4 stones and a perfect stream) and `home6.mjs`.
- **Every run:** 0 errors and 0 `speak` calls. A full portrait trip ran clean.

## Fun pass, round 5 (2026-10-16): review 8.0 (variety 7.5, polish 8)

### Changes
- **The burrow grows with skill.** `game.skill` collects points during the trip:
  - golden carrot: 1
  - flip-only 🌟: 2
  - stomp chain: 2
  - perfect stream (every stone, no splash after the first): 3

  At home the garden grows `1 + min(6, floor(skill / 2))` things.
- **Surprise picks:**
  - Weighted by `1 / (1 + times seen)²`, with the counts kept in `bunny-hop:seen`.
  - Only the last trip's last two kinds are barred.
  - Over 12 🔁 trips, each of the five kinds came up 4 to 6 times out of 24 picks.
- **Stepping stones work.**
  - They are rounder, taller and grey (recoloured rock), and reach is 1.2 (was 0.75).
  - The stream no longer slows Pip.
  - The plink fires from the bunny's own landing (`course.landing(x)`, called from `bunny.update`'s `landed`), so a hop straight on from a stone still counts.
  - A bot crossing a stream landed on all four stones and got a `perfect` (rainbow twinkle and chime).
- **Snow is easier to read:**
  - The path is a trodden blue track (`#7ea7d8`).
  - Stream water is a darker icy blue, and the stream oval is smaller (z scale 2.2).
  - Snowmen are gone from the snow scenery; they appear only as path obstacles.
- **Bumps cost a little more, kindly:** a 0.6 s dizzy stop (`game.dizzy`), then a slow start (0.25).
  - 70 s bots: careful play got 126 carrots and 6 🌟, holding got 82 and 3 🌟, and mashing got 79 and 4 🌟.
- **New toy moment: soap bubbles.** Seven iridescent bubbles drift high and low over the path. Hop into one and it pops with a rising note.
- **Minor:**
  - Shower carrots start lower (4.2–5.4) and further ahead, so they don't clutter the top-left under the buttons.
  - Short screens follow high hops more (`follow 0.3 + 0.6 * short`).
  - The hedgehog keepsake sits front right of Pip, and the balloon is tied to the left of the burrow, clear of the chimney.
  - The dead ternary is gone.

### Evidence
- **Screenshots:**
  - `r5-stream.png`: the stones.
  - `r5-snow-stream.png`: the snow path.
  - `r5-spring-844.png`, `r5-shower-844.png` and `r5-bubbles-844.png`.
  - `home-390x844-24.png`.
- **Scripts:** `stones.mjs` (stream landings and the perfect event) and `r5b.mjs` (the surprise spread).
- **Every run:** 0 errors and 0 `speak` calls. A full portrait trip ran clean.

## Fun pass, round 4 (2026-10-16): review 7.8 (fun 7.5, variety 7)

### Changes
- **Careful play now beats holding and mashing.**
  - The carrot magnet is 1.2 (was 1.6).
  - Ordinary golden carrots hang at 4.1 with an air pull of 1.4 (was 3.8 and 2.4). A hop whose top meets one gets it, and a random hop sails under it.
  - Holding still gives single hops only.
  - A bump now spills two carrots from the count. They tumble onto the path just ahead (`course.scatter`) and can be munched back by staying down.
  - 70 s bots: careful play got 150 carrots and 6 🌟, holding got 109 and 3 🌟, and mashing got 103 and 2 🌟. A full careful trip got 204 and 7 🌟.
- **The burrow keeps growing.**
  - Past the 16 garden spots, trees, bushes and mushrooms grow 8% bigger each trip, up to 1.8×.
  - Little bunnies at home: 2, plus 1 per 6 garden things, plus the friend once met, up to 6.
  - Each surprise met leaves a keepsake (`bunny-hop:met`):
    - the hedgehog moves in by the door
    - the balloon is tied by the door, bobbing
    - a rainbow arches behind the burrow
    - a pond with a stepping stone
  - Keepsakes pop up with a twinkle the first time.
- **No repeats:** `shuffleTrip()` never gives the same order twice running. The mood is rolled again if it matches the last one.
- **Trip shapes:**
  - Every fourth trip (`bunny-hop:trips`) is a party trip with four surprises.
  - Every trip also gets one rare pattern: a heart of 18 carrots round a spring's bounce, or a staircase of carrots up to a flip-only 🌟.
- **Night reads as night:**
  - a darker sky, fog, ground and hills
  - dimmer light
  - moonlit grey-blue clouds
  - the moon moved into view (40, 40, -265)
  - fireflies in every place but the snow
  - `?mood=night|sunset|day` forces a mood.
- **844x390 menu:** the camera sits further back (6.6) and looks at 1.3, so Pip's feet stand clear above 🐇/🐢 and ▶.
- The unused `name:` strings are gone from `biomes.js`.
- The hedgehog, balloon and rainbow builders are now shared functions (`makeHedgehog`, `makeBalloon`, `makeRainbow` in `course.js`), used for both the path and the burrow.

### Evidence
- **Screenshots:**
  - `r4-night-1024.png` and `r4-night-390.png` (moon, stars, fireflies)
  - `r4-menu-844.png`
  - `home-1024x768-24.png` and `home-390x844-24.png` (a grown garden with keepsakes and 6 bunnies)
- **Scripts:** `compare.mjs` for the bot comparison, and `party.mjs` (a party trip had 4 surprises plus the rare `goldstairs`).
- **Every run:** 0 errors and 0 `speak` calls.

## Fun pass, round 3 (2026-10-16): review 7.5 (variety 6.5, polish 7)

### Changes
- **Every trip is new.** `newTrip()` runs from the menu and from 🔁:
  - It reshuffles the route. Snow comes last 60% of the time; otherwise all four places shuffle, and the burrow's garden swaps snowy models for plain ones.
  - It picks a time of day from `MOODS` (`world.js`): day 45%, sunset 30%, or night 25% (dark sky, stars and a moon, dimmer light, still bright enough to play).
- **Two surprises a trip**, one early and one late. They avoid last trip's pair (`bunny-hop:surprises`). Two kinds are new:
  - **Stream:** water across the path with four stepping stones a hop apart. Each stone plinks a note higher. Landing in the water splashes and slows Pip a little. Golden carrot at the end.
  - **Hedgehogs:** three curled hedgehogs, built in code, roll towards Pip. Hop over them or bounce off their backs (with a giggle).
- **More moments in the course:**
  - **Puddles:** run through for a splash, hop in for a big one, with an arc of carrots over them.
  - **Flip-only golden carrot:** at 4.7 with a bigger glow; the air magnet works only during a flip. It rains 12 carrots.
  - **Stomp chain:** three low things spaced for a bounce off each. Three stomps without touching the ground rain 8 carrots.
  - The gap between patterns is now `speed * rand(0.5, 1) + 1.5` (was `0.9-1.5, +2`).
- **Rewarding skill:**
  - The flip-only golden carrot, and the stomp-chain rain.
  - The garden (`bunny-hop:garden`, 16 spots in `DECOR`) grows one thing per trip plus one per 🌟, up to two extra. The new things spring up one after another.
- **Springs can't be skipped.** `boing()` also fires when Pip is dropping below 1.6 anywhere from just behind the pad to 1.2 past it, or taking off from it. Holding down for 25 s triggered both springs on the way.
- **No accidental quits or mutes.** During play, 🏠 and 🔊 need a 0.7 s hold, with a gold ring filling round the button (`.round.holding`). A tap on them is a hop. On the menu and at home a tap still works, and Escape and M still work at once.

### Evidence
Scripts and screenshots are in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/15b3f60d-f934-46df-bd6d-46889fd68ba3/scratchpad/bunny-hop/`.
- **`r3.mjs`:**
  - Quick taps on 🔊 and 🏠 left the trip playing and the sound on.
  - A 0.95 s touch-hold on 🏠 went to the menu (`hold-ring.png` shows the ring).
  - Six 🔁 trips each had a new order, mood and surprise pair.
- **Screenshots:**
  - `strip-stream.png` and `strip-hedgehogs.png`
  - `mood-sunset.png` and `mood-night-play.png`
  - `portrait-home.png`: the burrow at night, 109 carrots and 3 🌟.
- **Every run:** 0 errors and 0 `speak` calls.

## Fun pass, round 2 (2026-10-16): review 7.8 (variety 6.5)

### Changes
- **Trips differ.** `shuffleTrip()` (`biomes.js`) puts the meadow, grove and autumn in a new order for each trip. The snow always comes last, before the burrow. The menu shows the coming trip's first place, and the trip bar's stops follow the order.
- **One rare surprise a trip**, never the same as last trip's (remembered in `bunny-hop:surprise`):
  - **A friend:** a little bunny catches up and runs beside Pip, copying his hops a beat later. It joins the little bunnies at home.
  - **A balloon:** run into it and Pip floats up for 4.6 s over a wavy line of 14 carrots. Then it pops with a sparkle. The balloon is runtime geometry.
  - **A rainbow run:** three springs in a row, each with its carrot arc, under a soft rainbow (torus bands).
  - `?surprise=friend|balloon|rainbow` tries one out.
- **The burrow grows.** Each trip home is counted (`bunny-hop:trips`) and adds one thing to the garden, up to 10 (mushrooms, a pumpkin, a fence, flowers, a snowy tree, a bush, a snowman). This trip's new thing springs up with a twinkle.
- **Golden carrots are easier to reach.** They hang at 3.8 (was 4.2) and pull in from 2.4 while Pip is in the air. A well-timed single hop nearly gets one, and a flip always does. Random kid-mashing now catches some (2 in one run).
- **The home camera** backs off on upright screens (`3.9 / (tan * aspect)`), and the heap moved closer to Pip. The heap, Pip, the burrow, the little bunnies and the garden all fit at 390x844 and 768x1024.
- **No scenery looks like an obstacle.** Stumps, toadstools, pumpkins, rocks and snowmen no longer appear in the near or side layers; toadstools, pumpkins and snowmen show only further back, larger, in the mid layer.
- **The phone-landscape menu:** a smaller title (`15vh`), ▶ beside the pace switch, Pip lower in the frame, and butterflies kept under the title on every sideways screen.
- **Pip is bigger on landscape phones** (`9 - 3 * short`).
- **Hold to keep hopping:** a held finger, mouse button or key hops again each time Pip lands.
- `game.json`: a shorter `howToPlay` and a fun-first `learning`.

### Evidence
Scripts and screenshots are in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/15b3f60d-f934-46df-bd6d-46889fd68ba3/scratchpad/bunny-hop/`.
- **Surprises:** `strip-balloon.png`, `strip-rainbow.png` and `strip-friend.png`.
- **Home:** `home-390x844-3.png`, `home-768x1024-9.png` and `home-844x390-6.png`.
- **Phone screens:** `phone-menu.png` and `phone-kid.png`.
- **Hold to hop:** held for 3 s, the mouse gave 3 take-offs and Space gave 4.
- **Every run:** 0 errors and 0 `speechSynthesis.speak` calls.

## Fun pass (2026-10-16)

The owner's direction: the learning passes made the games boring for his kids. Strip forced education, text and the voice; make play fun and self-evident for ages 3–8.

### Removed
- All learning tasks:
  - counted carrot rows with their ten-frame tray, and baskets that asked for fewer carrots
  - the fork with sums
  - the "What comes next?" obstacle patterns, with the mist, the ? marker and the per-obstacle notes
  - the burrow pantry questions, count-on, the winter goal, and the flower garden pattern
  - adaptive tiers saved in `localStorage` (`bunny-hop:tier`)
- Learning missions: the `adventure.js` chip and steps.
- The TTS voice: `speech.js` is no longer imported.
- Every sentence on screen: the menu subtitle and hint, "Let's hop!", the "Tap to hop!" pill, the results title, place names in banners, and the floating `Popups`.
- `js/learning.js` is deleted. Also removed:
  - flowers to pick (`FLOWERS`), `OBSTACLE_NAMES` and `OBSTACLE_NOTES`
  - `world.plantRow`, `quiet` and `flowerQuiet`
  - `Course.shapeRow`, `shapeRhythm` and friends
  - the audio functions `chord`, `wonder`, `step` and `hushMusic`
  - about 300 lines of CSS

### Added (the fun)
- **Procedural course**, adapted from the pre-education version (`c539179`): ground carrot lines, carrot arcs over logs, an air staircase (top at 3.4 m, so it needs a flip), double obstacles, and golden carrots up high. Patterns never repeat back to back. The first four teach without words: ground carrots, then two log-with-arc patterns, then a spring.
- **Springy mushrooms** (a squat `mushroom_blue`): run or drop onto one and Pip gets a big "boiiing" (`SPRING` = 16, about 4.3 m), an automatic flip, purple puffs, and a rainbow arc of 7 carrots along the bounce. The camera rises a little with him.
- **Stomp bounces**: dropping onto the top of a log, rock or snowman bounces Pip off it (`bunny.bounce(12)`) instead of bumping. Each bounce in a row rings a note higher, and snowmen puff snow.
- **Golden carrot shower**: catching a golden carrot (now at 4.2 m) rains 6 carrots out of the sky. They bounce on the path ahead, with a falling twinkle cascade.
- Munch notes climb the scale while carrots come close together (`combo`).
- **Home payoff**: two little bunnies (clones of Pip at about half size) hop for joy by the burrow. The carrots Pip brought tumble into a heap by the door, one soft note each, up to 30. Tap Pip or a little bunny and it giggles and hops.
- **Results**: one card showing 🥕 N plus a 🌟 for each golden carrot, and a big 🔁. Play is a big ▶. Banners show only the place's emoji (🌼 🍄 🍂 ❄️ 🏡).
- **Hand hint**: a drawn 👆 with a tap ring. It shows until the first tap, and comes back only after 6 s with no tap while an obstacle is within 14 m.
- 🐇/🐢 pace switch kept (picture-only). It now answers with two quick high notes or two slow low ones instead of speech.
- Gentle speed ramp from 6.4 to 8.0 (was constant 6.6). Places are 210 long (was 240), so a trip takes about 2 minutes.

### Files
All under `examples/bunny-hop/`:
- `game.json`
- `public/index.html`
- `public/style.css`
- `public/js/main.js` (rewritten)
- `public/js/course.js` (rewritten)
- `public/js/bunny.js`
- `public/js/audio.js`
- `public/js/effects.js`
- `public/js/biomes.js`
- `public/js/world.js`
- `public/js/learning.js` (deleted)

### Evidence
Playwright with Chromium (`--use-angle=gl`). Scripts and screenshots are in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/15b3f60d-f934-46df-bd6d-46889fd68ba3/scratchpad/bunny-hop/`.

- **Portrait 768×1024 (touch)**: a full trip to the burrow took 137 carrots. The results show the carrot heap and the little bunnies. Pressing 🏠 returns to the menu.
- **Landscape 1024×768**, `?biome=3`: the spring flip with its carrot rainbow, then home.
- **Phone 844×390**: menu screenshot. Random "kid" tapping for 25 s gave 58 carrots, 3 bumps, 1 stomp and 2 springs. The idle hand came back after 6 s.
- **Golden carrots**: an in-page bot caught 4 of the 4 it saw in 50 s.
- **Shower**: the falling carrots show in `portrait-shower2.png`.
- **Every run**: 0 console or page errors and 0 `speechSynthesis.speak` calls (stubbed and counted). No visible element with words on the menu or results.

### Coordinator notes
- `js/speech.js`, `js/adventure.js` and `adventure.css` are no longer used by this game. Drop `bunny-hop` from `helpers` in `examples/_studio/package-originals.mjs`, and stop the shared `speech.js` copy for it.
- `examples/_studio/tests/original-quality.mjs` still lists `bunny-hop` among the mission games, so it will fail until bunny-hop is removed from that list.
- `public/bitgames.json` needs a rebuild.

## Earlier history (short)
- **2026-10-04**: Blender bunny and four places. Tappable Pip and scenery, glowing golden carrots, butterflies, snowy trees, and framing fixes for phones and iPads.
- **2026-10-05 to 2026-10-07**: learning missions, then the flip pattern.
- **2026-10-09, calm pass**:
  - 🏠 button and Escape, with `toMenu()` resetting the camera, weather and music
  - no menu flower in front of the camera
  - soft petals instead of a confetti spam
  - gentler fanfare and finish sounds, and reduced motion
- **2026-10-09 to 2026-10-11, education passes**: counted rows, obstacle patterns, a pantry, a fork, a flower garden and adaptive tiers. Bug passes reached reviewer scores of 8.5 for learning, but kids found it boring. All of this was removed in the fun pass above.
- **Fixes kept from those passes**:
  - adaptive render quality and coarse-pointer pixel ratio
  - portrait camera framing
  - butterflies kept in view with softer colours
  - home and mute buttons
  - Pip's happy hops at home

## Round 14 review: 8.6, passed (2026-10-17)

A fresh reviewer scored 8.6: intuitive 9, fun 8.5, variety 8, no text 9.5, polish 8.5. Keys and palms were safe on the menu, in play, on the walk home and on results. Ideas for after release, deliberately not done now, because the game has passed and late mechanics changes made it worse before (round 10):
- A child holding a finger down catches about 1 golden carrot in 5. One fix is to give the held big hop the same gold pull as rapid flips (`main.js:1298`, `course.js:507/510`), or to time it to the next golden carrot (`bunny.js:103`).
- At a calm 2 taps per second every arc is the same 3.46 m flip, and calm tappers rarely meet a golden carrot at 4.1 m (`bunny.js:114`, `course.js:12`).
- On a sideways phone (844×390), Pip's spring or flip peak crowds the top-left controls, and ground carrots clip at the bottom (`main.js:56–63`, `1218–1219`).
- On an upright phone (390×844), Pip sits about 90 px from the left edge (`view.lead`, `main.js:65`).
- Fast mashing flattens arcs to about 1.75 m. An occasional full-height "super hop" would add surprise.
