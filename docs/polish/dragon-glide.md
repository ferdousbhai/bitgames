# Dragon Glide polish

## Phase 1 calm pass (2026-10-09)

Audit scores before this pass: Calm 5, Focus 4, Educational 3, Engagement 5, Visual 9, Audio 7, UX 8, Technical 8 (see [the audit](AUDIT_2026-10-09.md)). Flying, fire, the four worlds, the family nests and the ring-counting mission are unchanged. The pass removes the score economy and the rush.

### What changed and why

| Change | Where |
| --- | --- |
| **One calm speed.** Every world cruises at `CALM_SPEED = 12` (was 15 → 16.5 → 17.5 → 18). The Gentle and counting missions still scale it with `pace`. | `public/js/worlds.js:7-8` and each world's `speed` |
| The rainbow star no longer speeds Ember up (×1.45) or kicks the FOV (+8°), and there is no FOV widening with speed. The gem magnet stays. Its banner reads "🌈 Rainbow star! Gems fly to you!". | `js/main.js:781-783`, `main.js:947`, `main.js:607-611` |
| **No score economy.** The 💎 count is now the number of gems found: +1 per gem, big gem or bubble. Rings and lanterns no longer add rising points. The HUD number changes without bouncing. | `main.js:384-387`, `main.js:579-606` |
| The combo line "💫 N rings in a row!" is removed, along with "+N", "+3 Pop!", "+2 ✨" and the "Yay!/Woo-hoo!" popups, the streak twirl and the miss "whiff". The "Bonk!" popup stays as funny physical feedback. | `main.js:390-394`, `main.js:579-622` |
| **No graded stars or best score.** The end card shows the worlds Ember flew through (🌼🍭🏰🌙) and what Ember found: 💎 gems, ⭕ rings, and 🏮 lanterns when any were lit. "New best", the best line and the title's best pill are removed. This also makes the `course.possible` denominator bug moot, since nothing divides by it any more. | `main.js:288-296`, `public/index.html` (`#results`) |
| **The nest waits for the child.** The 4.6 s auto-advance is gone. After the cheer, a "▶ 🍭" button (named after the next world, or "🪺 ▶" at the end) appears, and a tap anywhere or Space also flies on. Ember's bounce settles to a gentle rest, and the nest confetti stops after 3.5 s. | `main.js:665-688`, `main.js:844-859`, `style.css` `.fly-on` |
| **Nest framing.** With the arrival no longer cut short, the waiting view has Ember seated between both parents with every face visible. Screenshots `after/portrait-5b-nest-waiting.png` and `after/landscape-5b-nest-waiting.png` show it. No camera change was needed. | — |
| Particles are cut to soft amounts. Rings: one ring and 8 sparks (was two rings and 24 sparks). Gems: 5 or 10 sparks (was 12 or 26). Bubbles: 10 (was 26). Lanterns: 8 (was 20). Rainbow star: 14 (was 40). The rainbow trail is about a third of what it was. Air sparkles: 8/s (was 30/s). | `main.js:579-612`, `main.js:796-815` |
| A bump shakes the camera by 0.2 (was 0.35), and not at all under `prefers-reduced-motion`. | `main.js:617-618` |
| Audio: the ring chime is fixed, with no streak climb. Gem notes walk round a five-note scale and never climb forever. The fanfare has no square layer. The rawr is triangle-only and quieter (was sawtooth), the fire hiss is quieter and its sawtooth is now triangle, and the pop is quieter. The world loops are slower (tempo 112/120/104/92 → 92/96/88/80), and Candy Clouds plays triangle (was square). | `js/audio.js`, `worlds.js` |
| CSS: the infinite logo bob, Let's fly pulse, power pill pulse and tip nudge are off. `prefers-reduced-motion` also stills the loading flyer, the world row and the banner scaling. | `public/style.css:286-301` |

### Verification

- `node examples/_studio/tests/browser.mjs --browser chromium --ids dragon-glide --run calm`: BOOT + PLAY ready, 0 errors.
- `original-quality.mjs`: dragon-glide's mission choice persists and starts at zero.
- I played Meadow Isles to the nest, waited at least 3 s after the fly-on button appeared (the state stayed `nest`), tapped ▶, and flew Candy Clouds through to the end card. This was in portrait 834×1194 and landscape 1194×834, with 0 console errors. Before screenshots are in `audit/dragon-glide/`, after screenshots in `audit/dragon-glide/after/`.

### Remaining (Phase 2, from the audit)

- Give each world a purpose inside the steering: numbered rings flown in order, or gems gathered by colour or shape and arranged in the nest. Numbered rings need Blender work (Phase 3).
- Optionally let the child hover or slow down by holding still.
- A first-run choice could make Gentle flight the default.

## Phase 2: a purpose in every world (2026-10-09, not yet deployed)

### Design

Each world now has one gentle goal, so steering means something. The goal is pictured under the world's name as it starts and spoken aloud ("Meadow Isles! Fly through the rings in order, 1 to 5!"). A small chip under the 💎 count keeps it in view.

| World | Goal | What is learned |
| --- | --- | --- |
| 🌼 Meadow Isles | Numbered rings **1 → 5**, one at a time | Number order, numeral recognition |
| 🍭 Candy Clouds | Hearts float in pairs, one pink and one blue. **Bring home 4 pink hearts.** | Choosing by colour, counting, sorting by colour |
| 🏰 Sunset Castles | Numbered rings **1 → 10**, in short runs of 2–3; the chip is a ten-frame | Counting on to 10, the ten-frame |
| 🌙 Night Sky | A star, a moon and a heart, all the same gold, float in threes. **Bring home 3 stars.** | Choosing by shape, counting, sorting by shape |

- **Numbered rings.** A big purple numeral sits in the middle of each ring, so Ember flies through the number. The next number's ring is gold with a steady glow (no pulsing); later rings are pale. Each ring says its number and plays one note a step up a major scale. **A miss is not a failure:** the next ring ahead takes that number ("Number 3 is waiting for you!"). Each world lays out a few spare rings (8 for 1→5, 14 for 1→10). Spare rings beyond the goal quietly disappear. In ring worlds the plain cloud rings are switched off, so nothing muddles the count. Every numbered ring still counts for the shared ⭕ mission and the ⭕ tally.
- **Gathering.** The treasures are extruded runtime shapes with no Blender work. They sway gently but never spin, so the shape always reads. Every treasure goes in the basket. The chip shows slots for the wanted kind that fill as Ember collects them, plus a little 🧺 holding everything else. Speech: "2 pink hearts!", "A blue heart! Into the basket. Look for pink hearts!", "4 pink hearts! That's 4. Now fly home to the nest!" The groups never stop the flight, and seven per world leave room to choose other kinds.
- **At the nest** the family sorts the basket. One item at a time flies from Ember into its row on a tray, with the wanted kind first. Each item is counted aloud ("1, 2, 3, 4 … 4 pink hearts!"). Ring worlds show the numbers flown, 1 to N, as a row or ten-frame and say "You flew 1 to 5 in order!" The ▶ fly-on button waits until the sorting is done. The nest still waits for the child's tap.
- **End card.** The old row of world emoji is now one line per world showing what Ember brought home: numbers 1…N, or the sorted rows divided by a line. It is spoken once, for example "You flew 1 to 5 in order! You sorted 4 pink and 3 blue hearts! You flew 1 to 10 in order! You sorted 3 stars, 2 moons and 1 heart!" The 💎/⭕/🏮 tally stays.
- **Kept:** one calm speed, a nest that waits for a tap, the shared ⭕ ring-counting mission (adventure.js is untouched), the 🐢 Gentle flight, lanterns, bubbles, fire, the rainbow star and gems. When the counting mission is on, its spoken count wins for rings 1–4 (the two counts are the same in ring worlds), and the world goal adds "And let's count four rings!" to the start sentence. The magnet pulls gems only, never treasures, so the child's choice stays theirs.

### Changes

| File | What |
| --- | --- |
| `public/js/goals.js` (new) | Treasure kinds, shared outlines (star, heart, crescent moon) drawn as both 3D extrusions and inline SVG, numeral canvas textures, spoken sentences (`goalSentence`, `learnedSentence`, `countOf`, `sortedRows`) |
| `public/js/worlds.js:23,41,59,77` | Each world's `goal` |
| `public/js/course.js:89-200` | `slotsFor` spreads goal places evenly through a world. Also `numberedRings`/`numRing`/`relabel` (missed numbers wait) and `treasures`/`treasure` |
| `public/js/course.js:222-236` | The generator lays goal places first, with nothing over them, and turns off plain rings in ring worlds |
| `public/js/course.js:578-615` | Ring pass/miss and treasure pickup events. Only the current world's goal items show, so the next world's rings never appear behind the family at the nest |
| `public/js/main.js:160-180` | `say()`, which respects mute, and the combined world-goal + mission start sentence |
| `public/js/main.js:334-450` | Goal state, chip/banner/end pictures, and nest sorting driven by nest time, plus the fly-from-Ember animation (a fade only under reduced motion) |
| `public/js/main.js:746-775` | `numRing` / `numMiss` / `treasure` handling |
| `public/js/main.js:310-321, 844, 1049` | End-card lines and speech, recording the world at the nest, running the sort and delaying ▶ until it ends |
| `public/js/audio.js:238-250` | `number(n)` (major-scale step per number) and `treasure(n)` |
| `public/index.html` | `#goal` chip, `#sort` tray, `#learned` (replaces `#stars`) |
| `public/style.css:303-` | Chip, banner picture, tray and end-card styles. Short landscape phones hide the chip while the banner shows. Upright phones get a one-strip tray; sideways screens put the tray at the left |

### Evidence

Screenshots and scripts are in the session scratchpad at `p2/dragon-glide/`. `play.mjs` flies all four worlds with an autopilot that steers like a child: it misses ring 2 once and picks the other kind about a third of the time. `live.mjs` is real-time flight.

- I played the full trip in portrait 834×1194, landscape 1194×834, a 667×375 phone and a 375×667 phone in Chromium, and landscape in WebKit, with 0 console errors each time. In every run the missed ring 2 waited and was then flown, and both ring worlds reached 1→5 and 1→10.
- Spoken log, for example: "Number 2 is waiting for you!", "5! You flew 1 to 5 in order!", "A blue heart! Into the basket.", "3 stars! That's 3. Now fly home to the nest!" Final: "You flew 1 to 5 in order! You sorted 4 pink and 3 blue hearts! You flew 1 to 10 in order! You sorted 5 stars and 2 hearts!"
- With the ⭕ mission on, the start sentence was "Meadow Isles! Fly through the rings in order, 1 to 5! And let's count four rings!", and the mission counted normally.
- `browser.mjs --ids dragon-glide --run p2`: Chromium and WebKit both BOOT + PLAY ready with 0 errors.
- `node --test examples/_studio/tests/*.test.mjs`: 10/11 pass. The manifest-hash test fails until the coordinator rebuilds, as expected.
- `original-quality.mjs`: the full run stops at crash-racers, which another agent is editing. Its dragon-glide section, run on its own in Chromium and WebKit, passes: the mission choice persists and starts at zero.

### Left / open

- Family play is needed. Watch whether 4-year-olds read the pale numbered rings ahead as "not yet" and enjoy the nest sorting, which takes about 8–12 s for 6–8 treasures.
- When Ember lines up with a ring, Ember's body hides its numeral, though it is clear on the approach and in the chip. A copy above the ring is an option if children lose track.
- ~~A gather world can end with fewer than the wanted number.~~ Done (follow-up): see below.
- Phase 3 art: the runtime rings and shapes are probably enough, so Blender numbered rings are now optional.

### Follow-up: missed treasures come round again (2026-10-09)

A gathering world can no longer end short of its goal. If Ember gets within 100 units of the nest without enough of the wanted kind, Ember waits there: the world stops moving forward and what was laid out ahead is cleared. It says "More pink hearts are coming!" once, and spare groups (the full mixed group, so the choice stays real) float in one after another until the goal is met. Then the flight carries on to the nest. The code is in `course.js` `spare()` and the `drift` in the treasure case, and in `main.js` `updatePlay` (hold at `(world + 1) * WORLD_LENGTH - 100`). The play script's skip mode avoids the wanted kind 90% of the time on the course and 50% of the time on spare groups. Runs: Chromium portrait (4 pink after a wait, 3 stars after a wait) and WebKit 667×375 (4 pink and 3 stars after long waits), with 0 errors. The Chromium and WebKit `browser.mjs` checks pass with 0 errors. Nest sort cap (follow-up 2): the wanted kind is still counted aloud one by one. Every other kind then lands in its own row in one quick step, showing up to 5 items and then a small "+N". One short line is spoken: "And 3 blue hearts!" for a single small kind, or "And 14 other treasures!" otherwise. The end card caps each kind at 5 + "+N" too. In skip-autopilot runs with 13–18 treasures (14 blue hearts in one), the sort finished at 7.2–7.9 s of nest time, down from about 23 s. The `browser.mjs` checks pass in Chromium and WebKit, and skip runs in Chromium (portrait and 667×375) and WebKit (667×375) had 0 errors. On short landscape phones the tray uses 22px items, so 5 items plus +N fit on one line.


### Simplify pass (2026-10-09)

- One shared voice (`speech.js`, rate 0.85, pitch 1) replaces the game's speech code. `say(text, queue)` keeps its meaning (queue, or interrupt). The voice is passed to the adventure. The `renderChoice` callback now sets the `mission` body class, replacing the separate click listener.
- Magic delays removed. The world goal is queued straight away (it used to wait 900 ms). The end-card words queue after the nest sort instead of `finishTimer` (1300 ms). `start()` hushes leftovers from the last trip.
- One module-level `stillMotion` MediaQueryList.
- In the gather hold, `course.spare()` runs every 0.5 s instead of every frame.
- Dead code removed: `audio.whiff()`, `course.nextNumber()`, and the `.new-best` CSS with its two media-query copies.
- Checks: Chromium and WebKit `browser.mjs` passed with 0 errors. A Playwright autopilot run (Meadow Isles to Sunset Castles; Night Sky through the sort to results) spoke the goals, counts, hold line, sort counting and end words in order. There were 0 console errors in both engines. Tests: 11/11.
- Iteration 2: the ring progress uses the shared step row (`icon: () => document.createElement('i')`); the ring CSS moved to `.adventure-step i`, with the shared grey-out turned off because the pale ring border already shows "not yet". `renderChoice` only toggles the `mission` body class. `isMuted` is no longer passed to the adventure. The numbered-ring path uses `adventure.event()`'s return in place of the `counting` precheck. `game.said` was never read and is gone. The sound toggle now hushes the voice when it mutes. The calm-pass overrides were folded into their sources: the logo `bob`, Play and power `pulse` and tip `nudge` loops, the redundant `.big-go.alt { animation: none }`, and their keyframes are gone.
- Iteration 2 checks: Chromium and WebKit `browser.mjs` 0 errors; `original-quality.mjs` passed; tests 11/11. A Playwright run with stubbed speech showed the new choice button, the rings filling 1/4 to ⭐, the world goal then "1", "2", "3", reward in order, mute cancelling speech, and 0 console errors in both engines.
- Third pass: `renderChoice` and the `body.mission` class are gone. The three `.tip` lifts use `body:has(#adventure-goal:not([hidden])) .tip`. The goal is hidden exactly when the old class was off, because `enable` is never called here. The voice starts with `muted: sound.muted`, which is loaded from storage in `Sound`'s constructor, and `toggleSound` calls `voice.setMuted`. `goals.js` uses a module `Intl.ListFormat('en-GB')` for both "You sorted ..." lists. "And let's count four rings!" now takes its number word from `option.target`. The `[hidden]` goal rule is gone.
- Third pass checks: Chromium and WebKit `browser.mjs` 0 errors; `original-quality.mjs` passed; tests 11/11. A Playwright run with stubbed speech in both engines showed mute and unmute working. The goal and the tip lift (84px against 26px) applied only for "Count 4 rings", the play goal still said "And let's count four rings!", and there were 0 console errors.
