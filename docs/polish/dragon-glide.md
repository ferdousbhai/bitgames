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
- Exit paths (iteration 9): `toTitle()` already hushes and clears the sort; the nest arrival roars on 500/800 ms timers now play only while `game.state === 'nest'`, and Escape on the results card now goes to `toTitle()` like its 🏠 button.
- Exit-path checks: Chromium and WebKit `browser.mjs --run exits` 0 errors; `original-quality.mjs` passed; tests 11/11. A Playwright run with stubbed speech and recorded audio params: staying at the nest plays the roars; Escape dispatched on the arrival frame hushed and left no roar and a clean title 3 s later. Escape on results returned to the title, cancelled the end words and said nothing more. 0 console errors in both engines.

## Round 1 of the 2026-10-11 pass: real choices, a stretch tier, no economy (not yet deployed)

The 2026-10-10 re-audit gave it 6: the numbered ring was the only ring, so the game chose for the child. A wrong treasure cost nothing. The 💎 count, the magnet and the tallies were still there. There was no harder tier, and Ember hid the ring numeral.

### Design

- **Rings come in pairs.** Both rings glow alike. One shows the number that comes next, and the other shows a near miss picked for the lesson: a different-looking number for 1→5, the next-but-one or the last one when counting on to 10, one off when counting down, and the odd neighbours when counting by twos. A wrong ring gives no progress and two low, soft notes. It says "That's 6. We need 3!" once per world, and the same number waits on the next pair. A missed pair says "3 is waiting for you!" once. After two wrong rings in a row, the wrong ring of the next pair rests pale as a quiet hint. The numeral now sits **above** its ring, so Ember never hides it (audit bug).
- **The basket holds exactly what was asked for.** It has one row of slots per kind, and each empty slot is a faint outline in its kind's colour. Another kind, or one more than asked for, floats up and away with "That's a moon. We need stars!" or "We have 3 stars already!", each said once per world. Once the basket is full, counting stops, the rest of the world's treasures drift off, and no more groups are laid out. After two wrong treasures, only the wanted kinds keep their glow.
- **A stretch tier, chosen from play rather than unlocked.** After each world, ≤1 slip (wrong ring or wrong treasure) moves the next world up a tier, and ≥3 slips at the stretch tier moves it back down. The level is stored as `dragon-glide-level`, so the next trip starts where the child is. Easier tier: count 1→4–5, bring home 3–5 of one colour, count 1→7–10 with near-miss decoys, and bring home 3–4 of one shape. Stretch tier: count down from 5–7, bring home two colours at once (2–4 each), count by twos to 12–16, and bring home two shapes at once.
- **Randomised every trip:** target, wanted kind, counts, decoys and side.
- **No goal can be missed.** Ring worlds now hold before the nest too ("5 is coming!"), with spare pairs drifting in, as gather worlds already did.
- **Economy removed:** the 💎 HUD, the rainbow star and its magnet, the power bar, and the results tallies are gone, along with their dead CSS. Gems remain as uncounted sparkle and song.
- **Thinner voice.** Ring numbers are spoken up to 10, then shown and played as notes only. A single-kind basket counts with `voice.count` (aloud to 5). The nest unpacks the basket with soft notes and one sentence ("You brought home 4 blue and 3 pink hearts!") instead of re-counting each item. Hints and waiting lines are said once per world (`voice.newRound()` at each world start). A full trip with a few mistakes spoke 35–44 lines, against 45–66 before, and each line is shorter.

### Changes

| File | What |
| --- | --- |
| `public/js/worlds.js:24,43,61,79` | Each goal is an easier/stretch spec. Candy Clouds gems are gold, so nothing en route looks like a heart |
| `public/js/goals.js:135-175` | `makeGoal` (random per trip, per level), `decoyFor`, `goalDone`, `stillWanted` |
| `public/js/goals.js:79, 180-225` | Coloured empty slots; sentences for up, down, by twos and two kinds; `neededWords` |
| `public/js/course.js:105-200` | `fork()` ring pairs with the numeral on top, `relabel()` (numbers wait, nearest pair glows, hint dims the decoy) and `passGate()` (right, wrong or miss) |
| `public/js/course.js:213-236` | `spare()` drifts in ring pairs or treasure groups while Ember waits; `release()` |
| `public/js/course.js:266-279` | Goals come from `course.goals`, so the next world's goal is drawn as Ember flies on, after the level updates. A clear run-up before each pair or group, and no groups once the basket is full |
| `public/js/course.js:602-660` | Moving-pair crossing check; refused treasures float away; the hint glow. Rainbow star and magnet removed |
| `public/js/main.js:115,181,299-360` | `game.level`, `course.wants`, `startGoal`, the slot-row chip |
| `public/js/main.js:363-405` | Nest unpacking without per-item speech |
| `public/js/main.js:667-760` | Event handling: `numRing`/`numWrong`/`numMiss`, treasure taken or refused, once-per-world lines |
| `public/js/main.js:800, 929` | The level step after each world; the hold for any unmet goal |
| `public/js/main.js:1051` | The wide end card's camera steps back (9.4 → 10.6) so four rows clear the parents' heads |
| `public/js/audio.js:206` | `nope()`: two soft low notes. `power()`/`powerDown()` removed |
| `public/index.html`, `public/style.css` | Score pill, combo, power bar and tally removed; `.want + .want` divider |

### Evidence

Scripts and screenshots are in the session scratchpad, `polish/dragon-glide/` (`play.mjs` for an accelerated autopilot that picks wrongly at a set rate, and `live.mjs` for real time).

- Full trips, all with 0 console/page errors:
  - Portrait 834×1194 at a 20–25% wrong rate: easier tiers 1→5, 3 blue, 1→7, 3 stars.
  - Landscape 1194×834 starting at the stretch tier: 7→1, 4 blue + 3 pink, by twos to 12, 3 stars + 3 hearts.
  - Portrait with a careless 55% wrong rate starting at the stretch tier: it fell back to the easier tier after Meadow Isles, waited in both kinds of world, and finished every goal.
- With the counting mission on, only correct rings counted ("One, two, three, four! Four rings!"), and the ring number was not doubled.
- Screenshots show the numerals above the rings, clear of Ember (`lp-12s.png`), the dimmed decoy hint (`m1-hint-w0.png`), the two coloured slot rows (`l1-w1-fly.png`, `lc-12s.png`), the two-row nest tray (`l2-w1-nest.png`) and the end card without tallies (`l2-results.png`, `nl-results.png`).
- `EXAMPLES_ORIGIN=http://localhost:4213 node examples/_studio/tests/browser.mjs --ids dragon-glide --run dragon-glide-r1`: BOOT + PLAY ready, 0 errors. `node --check` passes on every edited JS file.

### Remaining ideas

- Family play is needed to see whether 3–4-year-olds read "pick the next number". On an easier-tier trip, the very first pair already shows the hint (the other ring rests pale) until one right ring is flown (`main.js` `startGoal`).
- Odd-only forks for 7–8-year-olds, or counting on from a random start (for example 4→9), would add a third ring tier.
- The basket could also be used at the nest, with the child placing the treasures in rows rather than watching them unpack.
- In the landscape end card a parent sometimes turns away mid-cheer (this predates the pass).

## Round 2 of the 2026-10-11 pass: the nest is the child's puzzle, a third tier, help while waiting (not yet deployed)

Review 1 scored it 7.5 (fun/depth 6.8, voice 7). The main problems: the nest was a show, careful play and random play ended the same way, the stretch tier was the top for 7–8-year-olds, one level was shared by both kinds of goal, a child who never chose was never stepped down, the hold could last minutes, and the goal sentence could be cut off.

### Design

- **The nest is a puzzle the child solves** (`public/js/nest.js`, new). Ember's basket is unpacked into the tray and the child works with it. ▶ appears only after the puzzle is solved, and there is still no timer.
  - **Ring worlds:** the numbers flown, with one missing in the middle (`6 7 ? 9 10`). The child taps one of three tiles. The near misses follow the lesson and never repeat a number already in the row.
  - **One-kind basket:** "How many stars came home?" The child can tap each treasure to count it (spoken up to 5, then a soft note) and then taps the numeral.
  - **Two-kind basket:** the treasures come out one at a time and the child taps the shelf each belongs on ("Look at the colour." / "Look at the shape." is said once after a wrong tap). On a "more than" basket the two shelves line up one to one, and the child then answers "How many more blue than pink?"
  - A wrong tap dims that tile or wiggles the treasure and plays the soft two-note `nope()`. It counts toward the next world's level, so careful play at the nest matters too.
- **A third, challenge tier for 6–8** (`worlds.js` `tiers`, `goals.js makeGoal`):
  - Meadow Isles counts on from a middle number (5→10).
  - Sunset Castles counts by threes (to 15–18) or by fives (to 25–30). The decoys are one off or a whole step off (14/16/20 when 15 is next).
  - Both gather worlds ask for "Bring home 7 hearts, with more blue than pink!" The child chooses the split (7+0, 5+2, 4+3). The basket refuses the smaller kind once it reaches the most it can have ("That's enough pink hearts. Now only blue hearts!"). The chip shows the rule as a picture (blue ♥ > pink ♥) and one slot per treasure, grouped by kind, so the comparison can be seen as the slots fill.
- **One level per kind of goal** (`game.levels = { rings, gather }`, stored as `dragon-glide-level`; an old single number is migrated). After each world, `stepLevel` counts flight slips, plus half a slip for each pair or treasure group flown past without choosing, plus nest slips. A total of ≤1 steps up (to 2 at most) and ≥3 steps down.
- **Help while waiting.** After two spare pairs or groups have passed, or 45 s of holding, the next spare comes up to Ember's place. It keeps easing toward Ember (`Course.ease`) with the wrong ring dimmed or the wanted kind glowing, and "Here it comes, right to you!" is said once. An idle autopilot's trip fell from 827 s to 450 s.
- **Fire links to the lesson.** In gather worlds a bubble now holds one of the world's treasures. Popping the right one by fire (or by flying into it) puts it in the basket, and a wrong one floats away. A wrong bubble is not counted as a slip, because fire picks the nearest bubble rather than the one the child chose.
- **Thinner voice.** All flight lines now queue, so the goal sentence is never cut off. Ring numbers are spoken only at the easier tier, and only up to 5. Treasures are no longer counted aloud in the air; only a finished row and "The basket is full" are said. The in-flight "N! Now fly home to the nest." is gone. Careful trips spoke 19–22 lines, against 31–41 in review 1. Very muddled or idle trips spoke 30–35.

### Changes

| File | What |
| --- | --- |
| `public/js/nest.js` (new) | `nestPuzzle`: missing number, how many, shelf sorting, and how many more |
| `public/js/worlds.js:24,48,66,88` | Three tiers per goal |
| `public/js/goals.js:141-205` | `makeGoal` (start/step/down, `total` + `more`), `decoyFor` (`skip`), `fewerMax`, `goalDone` / `stillWanted` for "more than" baskets |
| `public/js/goals.js:225-262` | Sentences for counting on, by threes or fives, and "more than"; `moreWords` |
| `public/js/course.js:106,206,238,262,292` | `fork`/`treasures` with `near` (help), `spare` returns whether one was sent, `ease`, `passGroup` (the `treasureMiss` event) |
| `public/js/course.js:451,817` | Bubbles holding treasures, and `pop` |
| `public/js/main.js:120,830` | `loadLevels`, `stepLevel` (called on ▶) |
| `public/js/main.js:335` | The "more than" chip; `--cols` for even rows of numbers |
| `public/js/main.js:385` | `sortAtNest` runs the puzzle; ▶ waits for it |
| `public/js/main.js:700-760` | Queued, thinner speech; `numMiss`/`treasureMiss` counting; bubble refusals |
| `public/js/main.js:972` | Hold help |
| `public/js/main.js:609` | Enter/Space work on a focused tile or shelf |
| `public/js/main.js:1089`, `world.js:373` | The moon leaves the portrait end card too (review bug) |
| `public/style.css:273, 349-` | Even number rows; rule, slot, tile, shelf and hand styles. On upright phones the puzzle sits low and moves up for ▶ once solved |

### Evidence

Scripts are in the session scratchpad at `polish/dragon-glide/`. `play2.mjs` is the accelerated autopilot that also solves the nest puzzles at a set wrong rate, with an `idle` mode that never chooses. `tap.mjs` uses real touch taps on the tiles, and `dbg.mjs` checks the count puzzle.

- Every run had 0 console/page errors.
- **Careful portrait 834×1194 from tier 0:**
  - The worlds played 1→4, 3 pink, by twos to 12, then 3 stars + 2 moons. Levels ended `{rings 2, gather 2}`.
  - 21 lines spoken; 307 s.
- **Landscape 1194×834 at 30% wrong from tier 1:**
  - The worlds played count down from 6, 3 pink + 2 blue (one wrong shelf), by fives to 30 (stepped up), then 3 stars + 3 moons.
  - Three wrong shelves dropped gather to 0.
- **Portrait at 45% wrong from tier 2:**
  - Meadow counted on from 5 to 10 with help ("Here it comes, right to you!").
  - Candy brought home 7 hearts as 4 blue + 3 pink, then "How many more blue than pink?" was answered with 1.
  - It stepped down to by twos and to two kinds, and ended `{0, 0}`.
- **Idle (never chooses) from tier 2:** both levels fell to 0. The holds are now about 30–60 s, not minutes.
- **Phones 375×667 and 667×375:**
  - The tray fits. On upright phones it sits under the family, and once solved it moves up above ▶ (`pq-w3-puzzle.png`, `dbg2.png`).
  - The shelves line up (`lp-w3-puzzle.png`).
  - The portrait end card has no moon peeking (`pq-results.png`, `pc-results.png`).
- **Real taps** (`tap.mjs`): a wrong tile dims and counts `nestSlips: 1`; the right tile fills the gap; ▶ then appears.
- **Speech:** the speech stub shows that the first ring count is queued after the goal sentence, with no cancel in between.
- **Counting mission:** still counts 1–4 and rewards.
- `browser.mjs --ids dragon-glide --run dragon-glide-r2`: BOOT + PLAY ready, 0 errors. `node --check` passes on every JS file.

### Remaining ideas

- Lanterns could light in counting order in Sunset Castles. Ring worlds' bubbles still hold gems.
- The "more than" basket could vary the comparison ("fewer", "one more than").
- Family play is needed to see whether 3-year-olds understand tapping a shelf for the lifted treasure.

## Round 3 of the 2026-10-11 pass: a rule the child keeps, constructive nest work, a cleaner hold (not yet deployed)

Review 1 of round 2 scored it 8.2 (fun/depth 7.5, polish/UX 7.9). The blockers it named:
- At the challenge tier the basket refused whatever would break "more blue than pink", so a random flyer met the goal as well as a careful one.
- A child who never steered still had every treasure eased onto Ember.
- The nest offered 3 tiles with free retries.
- There was no replay hook.
- Bugs: clutter during the hold, the landscape tray over a parent, the start banner over the first pair, the moon behind the nest subtitle, and parents caught upside down.

### Design

- **The challenge basket no longer keeps the rule for the child.** The goal is "Bring home 7 hearts, with more blue than pink" or, half the time, "with **one more** blue than pink" (an odd total, so the split is exact: 4 + 3).
  - The basket takes either kind until it is full, so the rule can now be broken. The chip shows the rule as a picture (blue > pink, or blue = pink +1), with the slots grouped by kind.
  - When the rule can no longer be kept, Ember says once "Oh! Remember, more blue than pink." That counts as one slip.
  - At the nest the child sorts the basket onto the shelves. A broken basket is then put right by the child: "Hmm, that's not more blue than pink. Tap a shelf to swap one!" Each tap moves one treasure to the other shelf, and the child decides how many.
  - Then the question: "How many more blue than pink?", or for "one more" the number bond "7 in all: 3 pink and how many blue?"
  - The family keeps the corrected basket, and the end card shows it.
- **Nest puzzles are harder to guess and more constructive.**
  - The easier tier shows 3 tiles; the tiers above show 4.
  - At the challenge tier the missing-number row has **two gaps** that are never side by side. The child fills them in order.
  - "How many came home?" is now built: each treasure is tapped into a **ten-frame**. Each tap counts one (aloud up to 5).
  - After the first wrong tile in a puzzle, there is no plain retry. The question is re-posed with a steady highlight walking along the row as it is read once ("Let's count. 2, 4, and then?", "Count the extra ones at the end.").
- **Help no longer does the steering.** After two spares, or 45 s of waiting, the next spare is placed just above or below Ember (2.8 units, beyond touching distance), so one small move is still the child's. Only after 75 s does it ease right onto Ember. Help brings a kind that keeps the basket's rule (`bestKinds`). In round 2 the helped spare chased Ember, so steering toward it never reached it.
- **The nest keeps the basket (replay hook, not a reward).** Each gathering nest shows last trip's sorted treasures in a low line on the island, kind by kind (`dragon-glide-kept`). Once the child solves the puzzle, the new basket takes their place. There is no count, badge or score.
- **Bugs fixed:**
  - **Hold clutter:** small things that have passed Ember now also fade with time. While Ember waits, nothing moves past, so they used to hang half-shrunk in front of the camera. The hold check shows 0 treasures behind Ember at every 10 s sample.
  - **Landscape tray:** the nest camera slides the family right, clear of the tray (`trayShift`, which shares `shiftPast` with the end card).
  - **Start banner:** the first goal slot moved from 70 to 100, and goal slots are laid out within 20 units of their place (was 60). The banner and its goal picture also step aside once a ring pair or treasure group is within 48 units (`bannerMakesWay`).
  - **Moon:** at the nest it rests up on the right in landscape, and leaves the picture on upright screens.
  - **Parents:** they no longer barrel-roll at the nest. Ember hops into the nest instead of rolling.
  - **Upright phones:** the solved tray drops its tiles, so it no longer covers the family above ▶.

### Changes

| File | What |
| --- | --- |
| `public/js/goals.js:160` | `makeGoal` picks `rule` (`more` or `one`, with an odd total for `one`) |
| `public/js/goals.js:190-223` | `ruleKept`, `ruleReachable`, `stillWanted` (no refusal for a "more than" basket), `bestKinds` |
| `public/js/goals.js:267` | `moreWords` handles "one more" |
| `public/js/nest.js:37-90` | `tiles` (3 or 4 tiles, with a retell once), `readAlong`, `nearBy` |
| `public/js/nest.js:94` | Missing number with up to two gaps |
| `public/js/nest.js:142` | The ten-frame count |
| `public/js/nest.js:231-280` | `fix()` (swapping between the shelves) and `ask()` (how many more, or the bond) |
| `public/js/course.js:69,127,866` | `helps`; the help offset (`helpOffset`); only `close` help eases onto Ember |
| `public/js/course.js:95,332` | The first slot at 100; slots laid out within 20 units |
| `public/js/course.js:621` | Passed small items fade with time |
| `public/js/main.js:189,413` | Keepsakes loaded and saved; the learned entry is updated after a fix |
| `public/js/main.js:194` | `course.helps` |
| `public/js/main.js:770` | Broken-rule slip and reminder |
| `public/js/main.js:995` | `close` help after 75 s |
| `public/js/main.js:1043` | `bannerMakesWay` |
| `public/js/main.js:1091-1136` | `shiftPast`/`trayShift` and the nest moon |
| `public/js/main.js:844` | Ember hops into the nest |
| `public/js/world.js:323` | `keepsakes()` |
| `public/js/world.js:436` | No parent barrel rolls |
| `public/style.css:409-` | Ten-frame, read-along highlight, fixing shelves, slimmer solved tray on phones |

### Evidence

Scripts and screenshots are in the session scratchpad, `polish/dragon-glide/`:
- `play3.mjs`: the accelerated autopilot, which now also counts into the frame, swaps and fills two gaps.
- `hold3.mjs`: a child who never steers.
- `fix.mjs`: real clicks or taps through a broken basket.
- `keep.mjs`: keepsakes.
- `live.mjs`: real time.

Every run had 0 console/page errors.

- **Careful portrait 834×1194, from tiers 1/1:**
  - Worlds: count down from 7; 4 blue + 3 pink; by threes to 15 with two gaps; then "one more heart than stars" (4 + 3, "7 in all: 3 stars and how many hearts?").
  - Levels ended `{2, 2}`. 19 lines spoken, 316 s.
- **Careful landscape 1194×834, from tier 2:** two gaps in 6…10; "one more pink than blue" kept in the air; by fives to 25. 17 lines spoken.
- **Careless (35–45% wrong), landscape and portrait, from tier 2:**
  - Baskets broke the rule (3 blue + 3 pink for "more blue", 2 + 5 for "one more"), were swapped right at the nest, and then the question was answered.
  - The re-posed row was read ("Let's count. 5, 6, and then?").
  - Levels fell to `{0, 0}` or `{0, 1}`. 31–36 lines spoken, 441–506 s, against 316 s for careful play. So careless play now leads to more work at the nest, not just a lower tier.
- **Idle child (`hold3.mjs`, Candy Clouds):**
  - Helped hearts sat just above Ember (`hold-landscape-50.png`). With no steering, the basket stayed at 1 until the 75 s close help.
  - 0 treasures behind Ember at every sample, against 5 of 7 in review 1.
- **Nest screenshots:**
  - `r3c-w0-puzzle.png`, `r3c-w1-puzzle.png`: the family is clear of the left tray in landscape.
  - `r3c-w3-nest.png`: the moon is up on the right, away from "You flew all the way!".
  - `r3p-w1-puzzle.png`: the ten-frame.
  - `fix-landscape-fixing.png`, `fix-pphone-fixing.png`: swapping.
  - `fix-pphone-solved.png`: the slim solved tray above ▶ on a 375×667 phone.
  - `keep-*.png`: keepsakes below Ember.
- **Start of a world in real time** (`lv2b-2_5s.png`, `lv2b-6s.png`): the banner shows over open sky. The first pair arrives after it, at about 5–6 s.
- `EXAMPLES_ORIGIN=http://localhost:4213 node examples/_studio/tests/browser.mjs --ids dragon-glide --run dragon-glide-r3`: BOOT + PLAY ready, 0 errors. `node --check` passes on every edited JS file.

### Remaining ideas

- Family play is needed:
  - Do 6–8-year-olds watch the grouped chip slots to keep "one more"?
  - Do 3-year-olds understand tapping a frame square?
- The "fewer than" wording and "exactly 2 more" are still open variations.
- The ring worlds have no keepsake. A small numeral flag at the nest could remember the last count.

## Round 4 of the 2026-10-11 pass: mistakes that cost work, no tapping by elimination, a chosen challenge (not yet deployed)

Review 1 of round 3 scored 8.1 (fun/depth 7.5). The blockers were:
- the "Count 4 rings" mission talked over the numbered rings ("1, 2, 3" during a countdown or a count by fives) and threw a party;
- nest tiles could be solved by elimination;
- the tier-1 basket refused wrong kinds, and its nest was matching only;
- fire carried no decision;
- replay was thin;
- the ring pair crowded on upright screens.

### Design

- **The counting mission rests in numbered-ring worlds.** In those worlds it neither counts nor speaks; in the gathering worlds it counts plain cloud rings. Its finish is now one soft two-note chime and "Four cloud rings!". The banner party, twirl and sparkle bursts are gone.
- **Tiles can't be beaten by elimination.** A wrong tile is no longer disabled. The tiles rest while the row is counted along with the steady highlight (aloud only the first time), then come back as a **fresh set** of near misses. At the one-kind nest the tiles only appear once every treasure has been counted into the ten-frame.
- **Mistakes in the air now cost work at the nest (the "oops" corner).** At tiers 0 and 1, a basket asked for by kind takes up to two wrong ones into a dashed oops corner of the chip, and any more float away:
  - tier 0: another kind;
  - tier 1: another kind, or one more than a row holds.

  Each wrong one is a slip, and the line "Oops, a … came too. We'll give it back at the nest." is said once a world. At the nest:
  - **tier 0:** "We asked for stars. Give the others back to the sky!" The child finds and taps each odd one out before counting. A wrong tap shakes the treasure, and "Keep the stars!" is said once.
  - **tier 1:** shelves now have one dashed place per treasure asked for. A ☁️⤴ cloud takes back anything that doesn't fit: another kind, or a treasure for a shelf that is already full. The cloud is always shown at this tier, so it never hints that something needs giving back. Misplacing a treasure costs a slip, with one spoken hint.
- **The tier-1 nest asks a number question.** After unpacking: "3 moons and 2 stars. How many in all?" A wrong tile counts all the shelves along. The middle tier now asks more than tier 0.
- **A chosen challenge for replay.** At the nest before a numbered-ring world (Candy Clouds → Sunset Castles), the solved tray offers how to count there: `1 2 3`, `2 4 6`, `3 6 9`, `5 10 15`.
  - The way that fits the child's level is already chosen, so ▶ alone is fine.
  - Picking another sets that tier, and that step for 3s or 5s.
  - "How shall we count next? Pick one, then fly on." is said once per session.
- **Fire belongs to the gathering worlds.** Numbered-ring worlds no longer have bubbles. The old 6 s "Tap or 🔥 to puff fire!" tip is gone. Instead, "🔥 Tap to pop a bubble!" shows once, only when a treasure bubble is coming in a gathering world. A treasure flown into on purpose counts like a loose one (an extra goes to the oops corner); one popped by fire never does.
- **Upright ring pairs.** On screens held upright, the pair is centred, 0.82 scale and more diagonal (dx 2.15, dy 1.55). Both rings and numerals stay on screen and apart. In ring worlds no filler (gems, lanterns, obstacles) is laid within 60 units before a pair: it is open sky until the pair. There are 22 units of clear sky behind it.
- **The nest is still before the puzzle.**
  - The confetti shower lasts 1.2 s, and the dots fade (life 1.3 s, end size 0).
  - The tray comes at 3.3 s, and also waits for the "Home to the nest!" banner to go.
  - Once solved, only the chosen tile stays in the tray.
- **Bug found while testing:** the new open-sky skip could make `Course.generate` loop forever when a fractional slot position rounded below its mark. The page froze (Playwright "Target closed") at Sunset Castles. It is now guarded (`Math.max(this.nextZ + 1, …)`).

### Changes

| File | What |
| --- | --- |
| `public/js/main.js:140-153` | Mission options, quiet `celebrate`, `missionFits`/`beginMission` (also called from `start`/`leaveNest`, re-enabled in `toTitle`) |
| `public/js/main.js:201` | `course.oops` (up to 2 extras; tier 0 other kinds, tier 1 also over-count) |
| `public/js/main.js:316-` | `startGoal` uses `game.picked` (level and step); `extra: {}` |
| `public/js/main.js:370-378` | HUD oops corner; aria "N to give back" |
| `public/js/main.js:419,455` | Tray at 3.3 s and waits for the banner; `onGiveBack` empties the oops corner |
| `public/js/main.js:754` | The `ev.extra` treasure event |
| `public/js/main.js:891` | `pickNext()`, the count chooser |
| `public/js/main.js:1025` | The bubble-led fire tip replaces the 6 s tip |
| `public/js/main.js:1140` | A shorter confetti shower that fades |
| — | `countParty`, `COUNT_BEAT` and the mission banner hold removed |
| `public/js/nest.js:40-112` | `tiles()` re-deals fresh near misses after a rest (no disabling); `readAlong` returns its duration; randomised `nearBy`; `giveAway`, `shake`, `extras` |
| `public/js/nest.js:170-225` | One kind: give back, then count; tiles after counting |
| `public/js/nest.js:227-312` | Shelves with places, the cloud, `room()`, `put()`, `inAll()` |
| `public/js/course.js:70,727,849` | `oops` hook on loose and flown-into bubble treasures |
| `public/js/course.js:110-153` | The upright pair layout and scale; 22 units of clear sky behind |
| `public/js/course.js:344-355` | Open sky before a pair (guarded); no bubbles in ring worlds |
| `public/js/goals.js:143-177` | `makeGoal(spec, level, stepPick)` and `countChoices(spec)` |
| `public/js/audio.js:243` | `counted()` is one soft rising pair |
| `public/style.css` | Counting-party CSS removed; round-4 block at `:413` (oops corner, places, cloud, resting tiles, `.next-pick`, solved tray keeps only the right tile) |

### Evidence

Scripts and screenshots are in the session scratchpad, `polish/dragon-glide/`:
- `play4.mjs`: the autopilot. It now gives back, uses the cloud and handles "in all". `PICK`/`MISSION` env.
- `nestunit.mjs`: a direct nest-puzzle check.
- `live.mjs`: real time.

Every run had 0 console/page errors.

- **Careful portrait 834×1194, from tier 0** (`r5cp`):
  - Worlds: 1–5; 4 blue (ten-frame); the chooser; 1–9; then 3 moons + 2 stars with one oops heart given back, and "3 and 2 make 5".
  - Levels ended `{1, 2}`. 34 lines spoken, 319 s.
- **Careful landscape, from tier 0** (`r4cl`): 29 lines, 318 s. "2 hearts and 2 moons. How many in all?"
- **Careless 50% landscape from tier 2** (`r5xl`):
  - Two wrong tiles each came back as fresh sets, not crossed off ("tile 7 (wrong) … tile 7 (wrong) … tile 8").
  - 14 nest slips in Night Sky.
  - Levels fell to `{0, 0}`; 441 s against 319 s for careful play.
- **Careless 45% portrait with the mission on** (`r6xp`):
  - In Meadow/Sunset the mission is silent.
  - In Candy/Night it counts cloud rings and ends "Four cloud rings!" with no party.
  - The chooser pick `5 10 15` led to "Count by fives … to 25".
  - Night: a heart and a 4th star both went back with the cloud.
- **`nestunit.mjs`:** a wrong tile made the row `resting`. After 8 s it re-dealt `[2,3,4,6]` → `[2,4,5,6]`, all enabled. The steps were star→star, heart→heart, star→sky (over-count), moon→sky. 1 slip, solved "2 and 2 make 4!".
- **Screenshots:**
  - `r5lvP-strip.png`: real-time upright Meadow, with both numerals of each pair on screen and open sky round them.
  - `r4lvP-strip.png`: Sunset by fives.
  - `r4xp-w3-puzzle.png`: tier-0 give-back.
  - `r5xl-w3-puzzle.png`: shelves with places and the cloud.
  - `r5cp-w1-nest.png`, `r4ph-w1-nest.png`: the chooser on iPad and phone.
  - `r4ml-w2-fix.png`: resting tiles.
- `EXAMPLES_ORIGIN=http://localhost:4213 node examples/_studio/tests/browser.mjs --ids dragon-glide --run dragon-glide-r4`: BOOT + PLAY ready, 0 errors. `node --check` passes on every edited JS file.

### Remaining ideas

- The ring worlds still have no keepsake (the end card shows the numbers).
- The chooser shows once per trip. A title-screen choice for Meadow Isles (count up, down or on) would add another chosen challenge.
- The shared adventure chip still shows ⭐ when the mission is done (shared code).
- Family play is needed:
  - Do 3-year-olds find the odd one out without help?
  - Do 6–8-year-olds pick the harder count?
