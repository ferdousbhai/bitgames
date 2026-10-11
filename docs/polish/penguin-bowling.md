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

# Simplify pass (2026-10-09)

- One voice for the whole game (`js/speech.js`), shared with the pin prediction. Counting, results and the end-of-game sentence wait their turn in the queue. Tapping a side interrupts what is being said. The game no longer calls `speechSynthesis` directly.
- Removed dead code: the confetti and firework system in `effects.js`, `audio.launch` and `audio.bang`, `game.best` and its stored score, and two unused CSS rules (`@keyframes bob` and the media-query `.badge`).
- Checks: Chromium and WebKit browser checks pass with 0 errors. A scripted play with recorded speech kept every line in order (strike, then counting, then the number bond, then "Where are they?").
- Second pass:
  - The sparkles pool is 96 instead of 900; it only carries small sparkle and glow bursts now. The unused `floor` option of `Pool` is gone.
  - `count.js` shares one ring geometry and one tint colour, and uses one `STEP` (0.7 s); `start` takes its end time from `Counter.duration`.
  - Tapping a side uses `voice.sayNow`. Muting and going Home call `voice.hush()`.
  - Removed the leftover `animation-delay` on the `.logo span` colour rules.
  - Checks: Chromium and WebKit browser checks, `original-quality.mjs` and the unit tests pass. A scripted roll with recorded speech kept the order (guess, "9 fell.", count, number bond, "Where are they?", side answer). Mute and Home each cancel speech. No console errors.
- Third pass:
  - The voice starts with `muted: audio.muted`, and the sound switch (also used when loading the saved setting) calls `voice.setMuted`.
  - The spoken pin count uses `pins(n)` from `prediction.js` (imported as `pinWord`, since `pins` is the rack); the local copy is gone.
  - Checks: Chromium and WebKit browser checks, `original-quality.mjs` and the unit tests pass. With speech stubbed, mute cancels speech, the prediction stays silent while muted and speaks again after unmuting. No console errors.
- Exit paths:
  - `start()` (▶, 🔁 and Enter on results) now calls `voice.hush()` first, so the results line no longer talks over the new game. `toTitle()` already hushed, and Escape and 🏠 go through it.
  - Checks: `node --check`, Chromium and WebKit `--run exits`, `original-quality.mjs` and the unit tests pass. With speech stubbed, Enter on results cancels speech and the game is in aim with the results card hidden three seconds later. No console errors.

# Round 1 of the decision pass (2026-10-11)

Source: the penguin-bowling section of [AUDIT_2026-10-10.md](AUDIT_2026-10-10.md) (6/10: the game waddles to the pins for the child, 45–66 spoken lines, no older tier, "X" and "/" on the results card). Kept: physics, earned strikes, bumpers, swipe and curve, the 💭 prediction, the bond card, calm celebrations.

## Design

1. **The child counts.** After a roll the standing pins wait to be tapped (on the lane or in the bond card). Each tap gives the next number, a ring and a soft rising tick. Numbers are said aloud only up to 5 (`voice.count`). The last one is said as "3 standing." If the child waits (4 s, or 2.6 s after a tap), the game counts on from where they stopped. "Tap the pins still standing." is said once per game. For the first two counts a still 👆 sits over the first pin.
2. **Harder tier, adaptive (`game.tier`).** After three counts the child did fully alone (2 or more pins each), the bond becomes "8 + ? = 10" with three number buttons (keys 0–9 also work). A right answer lights every pin at once and moves on. A wrong one greys that number, says "Let's count them." and counts together, which is slower. Two misses in a row drop back to tapping. The tier is remembered between visits. If the child gives no answer for 11 s, the game counts with them, with no penalty.
3. **Spare read is a real decision. The game no longer walks the penguin.**
   - The question is asked only when it matters. Pins off to one side: "Where are they?" ("One pin left. Where is it?" fixes the bug). Pins split unevenly: "Which side has more pins?", with the middle button hidden. Middle-only pins or an even split get no question; the rings show them.
   - A right answer lays a footprint trail down the lane in line with those pins. The child walks the penguin onto it with ◀ ▶. The trail turns green with one soft chime, and the aim dots then run along it.
   - A wrong answer gives no trail. That button greys, and the child hears a comparison ("1 on the right, 2 on the left. Which is more?") and tries again.
4. **Thinner voice.** Strike, spare and each "8 and 2 make 10." are said once per game (`sayOnce`, `newRound` on start). Where/which questions are spoken the first two times, then shown as pictures with a tick. Measured whole games: 24–39 lines (tier 2: 18–24), down from 45–66.
5. **No score.**
   - The 🎳 total pill, the title's "🎳 N" and the results' big total and X/strike counts are gone.
   - The frame card shows each slide's pins and each finished frame's sum, so "7 3 | 10" is itself a bond.
   - The results card is pictorial: "N ways to make 10". Each way is ten little pins, the fallen lying grey and the rest standing, with "7 + 3".
6. The swipe hint plays 3 times instead of forever.

## Changes (`examples/penguin-bowling/public/`)

- `js/count.js`:
  - `Counter` is child-driven: `begin`, `tap`, `countRest`, `showAll` (from :56).
  - New `Spot` footprint trail (:218).
- `js/main.js`:
  - `tier` state (:105) and `STEP_X` (:81).
  - `finishRoll` (:333), `bondDone` (:403), `setTier`, `countPin`, `pinAt`, `askHowMany` and `answerHowMany` (:417–510).
  - `askWhere` and `chooseSide` (:552–610): lopsided/split rule, trail, no auto-walk.
  - `gameOver` and `bondPicture` (:628–657).
  - `updateHud` (:673): per-roll numbers.
  - `updateTapHint` (:689).
  - Frame loop trail chime (:1172).
  - `walk()` and `walkTo` removed.
- `js/score.js`: bonus-score totals and the X/ marks are removed.
- `js/audio.js:101`: `tick(n)`.
- `index.html`: `#howmany`, `#tap-hint` and `#where-text` added; score pill, `#last`, `#final` and `#stars` removed.
- `style.css`: score and stars rules removed; pictorial `.way` results, tap and guess bond states, `.howmany` (with a side column on landscape phones), and the limited swipe hint (:355–390).
- `game.json`: how-to-play describes tapping, the ? tier and the trail.

## Evidence

- Scripted real-tap play: `scratchpad/polish/penguin-bowling/play.mjs`. It taps pins at projected screen points, answers the questions with one deliberate wrong answer each and walks to the trail with ◀ ▶. Full games ran at 834×1194, 1194×834, 390×844 and 667×375 with 0 console or page errors. Tier 1 promoted to 2 after the third self-count in every tier-1 run.
- Screenshots: `{p,l,ph,ls}-{count1-hint,count1-done,count2-ask,count2-wrong,ask-where,footprints-where,onspot,results}.png`.
- `browser.mjs --ids penguin-bowling --run penguin-bowling-r1`: 0 errors.
- `oq.mjs` reproduces the `original-quality.mjs` penguin checks: the prediction compares with the physics outcome, and Escape closes the dialog. Untouched, it returns to aim in about 8 s. Escape mid-count clears the count, bond and choices.
- `node --check` passes on every game JS file.

## Remaining ideas

- Older children: "bumpers off" offered by the tier, or "knock down exactly 3" targets.
- Phone portrait pins are small for tapping. The bond-card pins are the fallback; a bigger deck camera during counting could help.
- Themed pin icons (snowman/fish) in the bond and results.
- Family play: is tapping 6+ pins after a weak roll restful or tedious? The 2.6 s count-along softens it.

# Round 2 of the decision pass (2026-10-11)

Source: independent review 1 (7.2/10). Its blockers were: the tier-2 answer always sat in the middle; tier-1 taps snapped to any nearby pin; strong bowlers never reached the harder tier; 64–71 spoken lines a game under random play; nothing harder for ages 6–8; faint fallen-pin icons.

## Design

1. **Three adaptive tiers (`game.tier`, stored).** The number work gets harder, and the spare help shrinks, as the child grows.
   - **Tier 1, count:** the child taps each standing pin.
   - **Tier 2, bond:** "7 + ? = 10" with three neighbouring numbers. The right answer can be first, middle or last, and 0 can be a choice.
   - **Tier 3, plan (6–8):** the same bond on a 1–10 strip (two rows of five, like a ten-frame), and the spare is the child's own plan. The rings show the pins; there is no "where?" question and no footprints.

   Moving up and down:
   - Tier 1 to 2: three careful counts, of any size, including a single pin. Strong bowlers now move up too: the landscape careful run reached tier 2 at roll 10.
   - Tier 2 to 3: four right answers.
   - Down one tier: two misses in a row.
2. **Careful counting differs from random tapping.**
   - `pinAt` now tests the finger against each pin's drawn body, standing or fallen, as it lies.
   - A tap on a fallen pin (on the lane or in the bond) is not counted. The fallen group wobbles once, and the child hears "That one fell down. Count the pins standing up." once a game.
   - A slip means that count does not move the child up.
   - A wrong tier-2/3 answer means the child counts by tapping, not a free count-along.
3. **Spare scaffold fades by tier.** On a right "where?" answer:
   - Tier 1 gets the full footprint trail.
   - Tier 2 gets only the first prints by the penguin (`Spot.show(x, {short})`): where to stand, not where to slide.
   - Tier 3 is asked nothing.
4. **Quieter voice.**
   - Numbers are spoken only for the child's own taps, during the first two counts of a game (up to 5).
   - Counting along with a child who waits is silent: rings, numbers and rising ticks. A small total ("3 standing.") is said once a game.
   - Right-answer lines become "Yes!", said once a game. The "where?" right answers are spoken only while the questions are.
   - Wrong-side comparisons are spoken for the first three misses, and are always written on the card.
   - The tier question says "How many more make 10?" after a first slide.
5. **Themed, legible pins.**
   - Bond-card and results pins are the lane's own snowmen (or fish in Fishy Bay): 22 px in the bond, 16 px in the results.
   - Fallen pins lie on their side at opacity 0.8. Standing pins stand on a dash of their hat colour.
   - The results rows group the fallen pins in fives.

## Changes (`examples/penguin-bowling/public/`)

- `js/main.js`:
  - `tier` 1–3, `rights` and `wrongSides` (:106).
  - Quiet count-along and two counts aloud (:382, :394).
  - Promotion on careful counts (`bondDone` :412).
  - Hit test against each pin's body (`pinAt` :457) and `slipPin` (:485).
  - Random-position choices (`nearChoices` :502).
  - Strip and "more make 10" in `askHowMany` (:513).
  - In `answerHowMany` (:539): promote at :554, step back at :560, and a miss means the child counts by tapping.
  - Fallen bond pins tappable (:573).
  - Tier 3 skips "where?" (:623); spoken comparisons capped (:661); short trail (:679).
  - Number key 0 picks 0 when it is a choice.
- `js/count.js`: `step(q, how)` reports 'tap', 'auto' or 'all' (:119); `Spot.show(x, {short})` (:238).
- `style.css`:
  - Emoji pin icons (:305).
  - The fallen nudge (:315).
  - Results pins (:369).
  - Number strip, including tablet, phone and short-landscape placements (:397–401).
- `game.json`: how-to-play describes the tiers.

## Evidence

Scripted real-input play (`scratchpad/polish/penguin-bowling/play2.mjs`):
- It taps pins at their projected screen points and makes one deliberate fallen-pin tap and one wrong answer per tier.
- Random mode taps anywhere within ±130 px of the pins and picks random answers.
- Speech is stubbed and logged.
- Every run had 0 console or page errors.

| Run | Tiers over the game | Spoken lines |
| --- | --- | --- |
| Careful portrait, from tier 1 | 1 → 2 (roll 8) → 3 (roll 16) | 22 |
| Careful landscape, Fishy Bay, from tier 1 | 1 → 2 (roll 10) | 23 |
| Careful landscape, from tier 2 | 2 → 3 | 14 |
| Careful 667×375, tier 3 | 3 | 9–11 |
| Careful 390×844 | 1 → 2 → 3 | 21 |
| Passive (never taps), tier 1 | 1 | 17 (was 64 on random play) |
| Random taps, from tier 1 | brief 2, back to 1 | 25–30 |
| Random taps, from tier 2 | 2 → 1 after two misses | 33–35 (was 71) |

- Tier-2 answer positions seen: 0, 1 and 2 of 3.
- Screenshots in `scratchpad/polish/penguin-bowling/r2/`:
  - Tier pictures: `*-ask-num-t2/t3`, `*-trail-t1/t2`, `*-t3-plan`.
  - Counting: `*-slip`, `*-num-wrong-*`.
  - Results: `*-results`.
  - Icons at 2×: `icons-{snow,fish}.png`.
- Other checks:
  - `browser.mjs --ids penguin-bowling --run penguin-bowling-r2`: 0 errors.
  - `oq.mjs` (prediction and Escape checks): pass.
  - `node --check` passes on every JS file.

## Remaining ideas

- Bowling difficulty for strong tier-3 bowlers (7 strikes in 17 rolls with bumpers on): a calm "🛟 Bumpers down?" offer, or a narrower lane.
- Make the 💭 prediction part of tier 3 on second rolls ("3 standing: can you get all 3?").
- Random play still says about 33 lines when the child misses a lot. The "N and M make 10." sentences (one per new bond) are most of them.

# Round 3 of the decision pass (2026-10-11)

Source: independent review 2 (7.6/10). Its blockers were: careful bowlers leave 0–2 pins, so the tier-3 question collapses to "1" and careful play meets fewer bonds (2–3 a game) than random play (8); tier 3 brought no new kind of thinking; the "where?" rule accepted minority sides and called a centred pin "right"; an upright pin off the deck counted as fallen; the tenth-frame sum showed 20 or 29.

## Design

1. **Plans: a two-slide goal that makes aim deliberate (tiers 2 and 3).**
   - Each fresh rack offers two optional plans, pictured as a number over a ten-frame (knocked dots grey, standing dots blue): one knocks a few pins (1–5) and one knocks many (6–9). Both come from ways to make 10 not met yet this game. Sliding without choosing is fine.
   - Where the penguin stands sets how many fall. Measured with straight slides (10 each): the middle knocks 8–10, one step out 7–8, two steps 3–6, the edge 1. So "knock 4, leave 6" is a real aiming decision.
   - A 🎯 card under the rack map shows the plan, then "✓" or "→ 8".
   - A hit skips the question, because the child already knows how many are left. A miss gives one spoken tip each way per game ("To knock down fewer, stand nearer the side."). It is never a failure.
   - The spare then completes the plan's 10.
2. **The other part of the bond.** With three or fewer pins standing, tiers 2 and 3 ask half the time for the fallen part ("? + 2 = 10"). The fallen pins hide in the card, and on a second slide some have already been swept away, so the bond is the way to the answer. A wrong answer reveals the fallen pins to count and the child picks again. Three-number choices never include 0.
3. **Fair "where?"** (`zoneOf`). The middle column is the middle and the outer columns are the sides. A pin between them (the ±0.27 columns, or a head pin that drifted) counts for both.
   - "Where?" accepts any group within half a pin of the biggest, so 1 middle pin + 3 right pins accepts only "right", and a lone drifted head pin accepts middle or right.
   - "Which side has more?" is asked only when the answer is clear either way.
   - A wrong answer says "No pins on the left", "Most are on the right" or "They are on the left"; it never counts a pin twice.
4. **Off-deck pins** (`Pins.clearOffDeck`). When the roll settles, any pin in a gutter, on the bank or in the pit puffs away, even if it is upright, so nothing visible is "not counted".
5. **Tenth frame.** Each rack keeps its own sum ("10·10·9", "10·7"), so no frame shows more than 10.
6. **Results show what the child worked out.** All eleven ways to make 10 appear as a staircase.
   - Ways met are solid; ways not met yet are faint.
   - Ways the child worked out (a careful count with no slips, or a first-try answer) have a green edge.
   - Ways made as planned carry 🎯.
   - "7 you worked out" sits under the title and is said at the end.
7. **Voice.** "N and M make 10." is said for the first four new ways only. The plan question and the first plan are spoken once a game. Plan misses are shown, not spoken.

## Changes (`examples/penguin-bowling/public/`)

- `js/main.js`:
  - `markBond` :349
  - `finishRoll` :354: off-deck clear, plan result, plan hit skips the question
  - `bondDone` :437: careful counts marked
  - `nearChoices` :533: no 0
  - `askHowMany`/`answerHowMany` :548–640: fallen part
  - `offerPlan`, `tenFrame`, `choosePlan`, `updatePlanPill`, `planResult` :674–757
  - `sideCounts`, `pinsOn`, `askWhere`, `chooseSide` :760–880
  - `gameOver`/`bondPicture` :890: staircase
  - `rackSums` :964
  - Number keys pick a plan.
- `js/count.js:59`: `zoneOf` replaces `sideOf`.
- `js/lane.js:516`: `clearOffDeck`.
- `index.html`: `#plan`, `#plan-pill`, `#bonds-key`.
- `style.css`:
  - Plan picker, ten-frame and pill, plus phone and short-landscape placements (end of file).
  - `.guess-fallen`, `.tot.racks`, `.way.faint/.self`.
  - Number choices raised above the bond card.
  - Compact results on short screens.
- `game.json`: how-to-play mentions plans and "? + 2".

## Evidence

Scripted real-input play (`scratchpad/polish/penguin-bowling/play3.mjs`, screenshots in `r3/`):
- It walks the penguin with ◀ ▶ for plans and taps projected pins.
- It makes one deliberate wrong answer per question type.
- Speech is stubbed.
- Every run had 0 console or page errors.

| Run | Tiers | Ways met (worked out) | Plans (planned:fell) | Spoken |
| --- | --- | --- | --- | --- |
| Careful 834×1194, tier 3 | 3 | 8 (7) | 4:4 7:8 6:4 1:1 3:2 6:5 6:6 … | 26 (before trimming) |
| Careful 667×375 Night, tier 3 | 3 | 8 (7) | 1:1 3:3 4:4 9:9 … 4 of 11 hit | 20 |
| Careful 390×844 Fishy, tier 3 | 3 | 8 (6) | 8:8 5:5 1:1 2:2 … | 17 |
| Careful 1194×834, tier 2 | 2 → 3 at roll 8 | 7 (5) | 11 plans | 20 |
| Careful 834×1194, tier 1 | 1 → 2 (roll 6) → 3 (roll 16) | 4 (3) | — | 28 |
| Random 834×1194, tier 2 | 2 → 1 | 8 (2) | — | 25 |
| Passive 1194×834, tier 1 | 1 | 7 (0) | — | 13 |

- Careful tier-3 bowlers now knock 1–9 across a game (for example 1,9,7,3,3,7,4,6,1,9,8,2,…), where before they knocked 9 or 10. The ways they meet match random play, and the results card separates the ones they worked out (6–7 careful, 1–2 random).
- `unit3.mjs`:
  - `rackSums`: [9,1,7] gives 10·7 and [10,10,9] gives 10·10·9.
  - Side cases: a drifted head pin accepts middle or right; 1 middle + 3 right accepts only right; an even split is not asked.
  - A pin teleported upright onto the bank during settle is removed, hidden and left out of the count.
- `browser.mjs --ids penguin-bowling --run penguin-bowling-r3`: 0 errors.
- `oq.mjs` (prediction and Escape): pass.
- `node --check` passes on every JS file.

## Remaining ideas

- Plans of 2–3 need an angled slide from the edge; a child may find them hard. If families find this frustrating, weight the "few" offer towards 1, 4 and 5.
- A tier-1 strong bowler stays on tier 1 until three careful counts (about roll 6–11), so they meet few ways before plans unlock.
- On phones the results card covers the frame card at the top; it could be scrolled or shrunk a little.

# Round 4 of the decision pass (2026-10-11)

Source: independent review 3 (8/10). Blockers: plans were mostly luck (20–25% hits even from the ideal spot; 5–6 had no reliable spot); the results headline did not separate careful from random play; bond questions could be answered by reading the frame card or counting the lane; long passive waits (11–12 s per roll at tiers 2–3); phone results card overlapped the frame card.

## Design

1. **Plans that a careful child can make happen.**
   - Measured in real time (12 straight Go slides per spot), the ±7 cm slide wobble caused all the spread: with no wobble each spot gives one number every time. The wobble is now ±3.5 cm (`WOBBLE` 0.006). From the middle a slide knocks 8–10, one step out mostly 8, two steps 4–5, the edge 1 (83%).
   - Offers come only from numbers some spot gives: few {1, 2, 3, 4, 5} weighted to 1, 4 and 5; many {7, 8, 9} weighted to 8 and 9. 6 is never offered. Ways not met yet are four times as likely.
   - Tier 2 lays the first footprints at the plan's spot (`planSpot`); tier 3 remembers it alone.
   - One away is "Close to your plan!" (pale-green 🎯 card, soft chime, no tip). An exact hit still skips the question. Tips are spoken only when the slide was two or more away.
2. **The bond question can't be answered by copying.** While it is open (`veil`), the current frame's numbers show "?", the rack map shows "?", the plan's result and the 💭/💥 line hide. On tier 3 a snow cloud (`Mist`) settles over the deck ("The pins are hiding in a cloud.", said once a game), so 7 + ? = 10 has to come from the bond. Answering lifts the cloud. A kept 💭 prediction has just said how many fell, so then the question is always the standing part.
3. **Results lead with what the child worked out.** The title is "You worked out 6 ways to make 10", and the voice says it with "…and 5 just as you planned". "Ways met" is the second line. A child who worked none out sees "You met 8 ways to make 10".
4. **Shorter waits and a short game.** Tier 2–3 count-along starts after 7 s (was 11–12). At tier 1, after two count-alongs the child let the game do, the rest light together after 3 s instead of ticking pin by pin (`game.ignored`). A **Frames 5 / 10** chip on the title card gives a five-frame game, whose last frame keeps the bonus rules (`ScoreCard.reset(count)`).
5. **Plan pill is gone on the second slide**, so the spare question stands alone.
6. **Bumpers down?** Once a game, a tier-3 bowler with 2 exact plans and 4 within one is offered "🛟 Bumpers down?" in the plan card. It is never forced.
7. **Layout.**
   - The results screen hides the frame card and rack map (`#hud.over`), so nothing overlaps on phones.
   - Faint ways are readable (opacity .62, muted text); fallen pins are dark grey and lying down; phone result pins are 18 px.
   - The rack box is opaque (no ice-arch wedge).
   - The "Bumpers down?" button is a small pill.

## Changes (`examples/penguin-bowling/public/`)

- `js/main.js`:
  - `WOBBLE` :83
  - tier-1 lights-together count-along :441
  - `askHowMany` :561 (veil, cloud, 7 s)
  - `veil`/`unveil` :665–680
  - second slide drops the plan :698
  - `offerPlan` :718 (weighted reachable plans, bumpers offer)
  - `FEW`/`MANY`/`planSpot` :752–755
  - `choosePlan` :765 (tier-2 footprints)
  - `planResult` :800 (close)
  - `gameOver` :960 (headline)
  - `updateHud` :1018 ("?" frame)
  - `setShort` :1223
  - bumpers-down :1233
- `js/count.js`: `countRest(delay, { all })` :121, `Mist` :293.
- `js/score.js`: `SHORT_FRAMES`, `ScoreCard.reset(count)`.
- `index.html`:
  - Frames chip.
  - `#bumpers-down` in the plan card.
  - Results key: "worked out · N ways met · 🎯 N as planned".
- `style.css`: the Round 4 block at the end (chips, veil, near pill, bumpers pill, results).
- `game.json`: how-to-play mentions the cloud, footprints for plans, bumpers down and 5 frames.

## Evidence

Scripted real-input play (`scratchpad/polish/penguin-bowling/play4.mjs`, screenshots in `r4/`). It walks to the plan's spot and presses Go, taps projected pins, makes one deliberate wrong answer per question type, and stubs speech. Every run had 0 console or page errors.

| Run | Tiers | Plans exact (within one) | Headline | Spoken |
| --- | --- | --- | --- | --- |
| Careful 834×1194, tier 3 | 3 | 8/11 (11/11) | worked out 6 · 7 met · 🎯 6 | 15 |
| Careful 390×844 Fishy, tier 3 | 3 | 6/10 (10/10) | worked out 6 · 7 met · 🎯 5 | 16 |
| Careful 1194×834 Fishy, tier 2 | 2 → 3 | 3/11 (10/11) | worked out 5 · 7 met | 22 |
| Random 1194×834, tier 2 | 2 → 1 | 0/0–0/2 | worked out 1–2 · 6–7 met | 22–25 |
| Passive 1194×834, tier 1 | 1 | — | "You met 8 ways" | 10 |
| Careful 390×844 Night, 5 frames, tier 1 | 1 → 2 | — | 8–11 rolls | 16–27 |

- Careful plan hits over the final-code runs: 17/32 exact (53%), 31/32 within one. Random play hit 0 of the plans it picked.
- The veil was checked at every bond question (frame card "?", rack hidden, no plan result): 43/43. The tier-3 cloud was up at every tier-3 question.
- A passive tier-1 game takes about 3:20 in total (21 rolls).
- The phone results card (`ph1-results`, `phf-results`) sits clear of the HUD.
- `browser.mjs --ids penguin-bowling --run penguin-bowling-r4`: 0 errors.
- `oq.mjs` (prediction and Escape) and `unit3.mjs` (rack sums, sides, off-deck) pass.
- `node --check` passes on every JS file.

## Remaining ideas

- Exact plan hits from one step out (8) are still about 55%. A finer half-step for tier 3 would make 7 reachable as well.
- With bumpers down, the plan spots were not re-measured with curved slides.
- Tier-2 footprints for a plan sit on the side the penguin is nearest. A child could be asked to choose the side.

# Round 5 of the decision pass (2026-10-11)

Source: independent review 4 (8.4/10). Its blockers were:
- Tier-1 "worked out" credit went to random tapping, because the game supplied every number.
- Plans reduced to memorising four spots, and the "leave k" part was read, never used.
- Tier-2 bond questions could be answered by counting the lane.
- A 10-frame game was long.

Its bugs were: "N standing." was said with `sayNow` and not de-duplicated, and the tier-2 footprints were hidden behind the penguin.

## Design

1. **Tier 1: the child says how many.** After the child taps every standing pin (two or more), the numbers over the pins tuck away. The bond shows "?" with two neighbouring numbers, in random order. The lesson is cardinality: the last number counted tells how many.
   - A wrong pick brings the numbers back. The child hears "The last number you counted tells how many." once a game, then picks again.
   - With no answer after 10 s, the game goes on without the "worked out" mark.
   - The last tap no longer says "N standing." with `sayNow`. Taps count aloud up to 5 through `voice.count`. "N standing." is said once a game, only after a count-along.
2. **Careful counting is measured, not assumed.** A count is careful only if:
   - every standing pin was tapped;
   - no fallen pin was tapped;
   - no two taps came closer than 250 ms;
   - at most half the taps landed on bare ice;
   - the total was right the first time.

   One more rule: tapping a single pin still counts towards moving up, but it is not a way worked out. A hasty count takes one step back towards tier 2. A tier-2 miss takes two right answers back, so guessing among three numbers does not climb a tier.
3. **The cloud from tier 2 up.** Every bond question hides the deck under the snow cloud. The standing pins in the card are already hidden, so "7 + ? = 10" needs the bond (or counting on from the 7 fallen pins), not a count of the lane.
4. **Tier 3 plans are numeric: "leave 3".** The plan card asks "How many will you leave standing?". Each choice is the number with only that many upright dots, and no knocked gaps to count. The 🎯 pill reads "🎯 leave 3", then "✓" or "→ 2". Tips speak in the same terms ("To leave more standing, stand nearer the side."). Finding where to stand needs the conversion: leave 3 means knock 7.
5. **A plan made exactly asks for the other part** (it no longer skips the question):
   - Tier 2 ("knock 7") asks "How many more make 10?" under the cloud.
   - Tier 3 ("leave 3") asks "? + 3 = 10. How many fell down?"
   - 🎯 is kept whatever the answer; a first-try answer adds "worked out".
6. **Tier-2 plan footprints are visible.** The short trail is 35% wider, fully opaque and warm orange, and the plan's number stands in a disc at its far end. This makes "stand here for 8" readable from behind the penguin (`r5/l2-plan-aim.png`).
7. **Games are 5 frames by default.** Families can pick 10 on the title chip; the stored choice is kept.

## Changes (`examples/penguin-bowling/public/`)

- `js/main.js`:
  - `short` default :90
  - tier comments :105–117
  - tap voice :428
  - plan hit asks the other part :435
  - `bondDone` :455: careful rule :467, single pin :469, hasty step back :474
  - tap timing :495
  - `askHowMany(…, part)` :575 (cloud at tier 2+)
  - `numberChoices` :611
  - `askTotal`/`totalDone` :632–660
  - total answers :669
  - tier-2 rights penalty :707
  - `offerPlan` "leave" plans :789
  - `standRow` :835
  - footprints with number :860
  - `updatePlanPill` :869
  - `planResult` tips :887
  - stray taps :1436
  - plan number key uses `data-knock`
- `js/count.js`:
  - `Counter.labels(on)`.
  - `Spot.show(x, { short, label })`: wider and bolder short prints, plus a number disc.
- `index.html`: `#plan-text`; the Frames chip shows 5.
- `style.css`: Round 5 block (`.bond.guess-total`, `.ten.stand`).
- `game.json`: how-to-play describes saying how many, the cloud, "leave" plans and 5 frames.

## Evidence

Scripted real-input play (`scratchpad/polish/penguin-bowling/play5.mjs`, screenshots and logs in `r5/`):
- Speech is stubbed and logged.
- Careful mode makes one deliberate slip, one wrong total and one wrong answer per question type.
- Random mode taps within ±130 px of the pins and picks answers at random.
- Every run had 0 console or page errors when run alone. Four parallel Chromium instances once logged a WebGL context-lost warning at teardown; it did not appear when the run was repeated alone.

| Run | Frames | Tiers | Worked out (met) | Plans exact/near | Spoken |
| --- | --- | --- | --- | --- | --- |
| Careful 834×1194 Night, tier 1 | 10 | 1 → 2 (roll 5) → 3 (roll 16) | 5 (7) | 3/8, 4 near | 32 |
| Careful 1194×834, tier 1 | 10 | 1 → 2 (roll 7) | 5 (6) | 3/7, 4 near | 31 |
| Random 834×1194, tier 1 | 10 | 1 | 1 (9) | — | 26 |
| Random 1194×834 Fishy, tier 1 | 10 | 1 | 1 (10) | — | 28 |
| Random 834×1194, tier 2 | 10 | 2 → 1 (roll 3) | 3 (6) | 0/1 | 27 |
| Careful 1194×834 Fishy, tier 2 | 5 | 2 → 3 (roll 9) | 3 (4) | 2/5, 3 near | 20 |
| Careful 1194×834, tier 3 | 10 | 3 | 5 (6) | 4/11, 5 near | 19 |
| Careful 667×375, tier 3 | 5 | 3 | 2 (4) | 2/6, 3 near | 18 |
| Careful 834×1194, tier 3 | 5 | 3 | 2 (3) | 0/6, 4 near | 16 |

- Random tier-1 play now works out 1 way a game, against 5 for careful play (before: 3 against 2).
- The veil and the cloud were up at every tier-2 and tier-3 bond question: 48/48.
- A plan made exactly asked the other part ("? + 1 = 10" under the cloud: `r5/lc3-ask-fallen-t3.png`).
- Screenshots:
  - `pc1b-total-ask`, `lc1-total-wrong`: tier-1 total.
  - `p3-plan-card`, `lsc3-plan-ask`: "leave" plans.
  - `l2-plan-aim`: footprints with the plan number.
- `browser.mjs --ids penguin-bowling --run penguin-bowling-c1`: 0 errors.
- `oq.mjs` (prediction and Escape): pass. A tier-1 count the child leaves alone still counts along, with no total question, so `original-quality.mjs` is unaffected.
- `node --check` passes on `main.js` and `count.js`.

## Checklist status

The audit checklist was "all handled" coming into this round. The review's bugs are fixed: the last-tap voice, careful credit at tier 1 and the faint tier-2 footprints. Improvements 1, 2, 5 (the cloud, rather than veiling the rack), 6, 7 and 8 are done.

## Remaining ideas

- Improvement 3: a "which group will you go for?" spare decision at tier 3, showing the resulting bond.
- Improvement 4: a split spare that needs the curve at tier 3. It needs physics measuring first.
- On short landscape phones the plan question text is hidden, so only the dots (a ten-frame for "knock", upright dots for "leave") and the first spoken question tell the two plan kinds apart.
- Letting the child choose which side the tier-2 footprints go on.

# 2026-10-11: Round 6 (review 8.2)

## Design

1. **A strong bowler moves up sooner.** Tier 1 counts "big" rolls: strikes, spares and first slides of 8 or more. After two of them, two careful counts move the child to tier 2 instead of three. A careful single-pin count still counts towards moving up. In the careful 10-frame landscape run the child reached tier 2 at roll 5. The reviewer's run reached it at roll 11.
2. **Plans offer only numbers the spots really give.** I measured 20 straight Go slides per spot, on both sides (`measure6.mjs`):
   - middle: 8–10, mostly 9;
   - one step out: 7–10, mostly 8;
   - two steps out: 3–6, mostly 4;
   - edge: 1 (75–90%), else 2.

   Steps are quantised, so no half-step spot exists. Curves from any spot give 8–10, so a curve cannot honestly give 5. `FEW` is now `{1, 4}` and `MANY` is `{8, 9}`, so tier 3's plans are leave 9, 6, 2 or 1. In 36 planned slides this round, 26 came out exact (72%) and the other 10 were one away. Before, 2:1 and 5:3 were common outcomes.
3. **Tier-2 footprints fade out within a game.** The first two plans of a game get the numbered prints. After that the child finds the spot alone, and hears "Now you find where to stand." once per game. The prints come back for the next plan only after a plan that came out two or more away. In the runs the prints were shown as `PP-------`, and later plans still came out exact or near.
4. **"Where" card shows the answer.** A correct side replaces the question, or a wrong try's comparison, with the answer ("3 on the left"; for "more": "4 on the right").
5. **Results lead with the same number for everyone:** "You met 6 ways to make 10". The key line reads "▢ 4 worked out by you · 🎯 3 as planned". The voice says "You met 6 ways to make 10. You worked out 4 yourself, and made 3 just as you planned." Careful work now adds to the headline and never shows as a smaller number.
6. **Slow counters keep their count.** At tier 1 the game waits 3.5 s between taps (was 2.6 s) and 5 s before the first tap (6 s with a prediction; was 4/5 s).
7. **The results staircase reads as a picture.**
   - Ways met are solid with a warm edge.
   - Ways not met are pale and flat, with grey pins.
   - Ways worked out have a strong green edge.
   - On tablets the pins are 21 px.
8. **The scenery hushes during counting.** While the pins are counted or a bond question is open, the Fishy Bay whale does not spout, and the Night lamp halos hold still. The halos also breathe more slowly and less (1.2 rad/s, ±5%).

## Changes

- `examples/penguin-bowling/public/js/main.js`:
  - state: `big` :119, `plansMade` and `planOff` :138
  - big rolls :392
  - first-tap wait :450, between-tap wait :506
  - promotion rule :478
  - `FEW`/`MANY` and the measured comment :798, :836
  - footprints for the first two plans, and the "find where to stand" line :868–869
  - `planOff` :898
  - where-card answer :1025
  - results headline and voice :1081
  - resets :1291
  - `scenery.hush` :1687
- `examples/penguin-bowling/public/js/scenery.js`: `hush`, plus the halos' own slower clock (:161, :294, :303).
- `examples/penguin-bowling/public/index.html`: the results key line reads "N worked out by you".
- `examples/penguin-bowling/public/style.css`: Round 6 block (results contrast and pin size).
- `examples/penguin-bowling/game.json`: how-to-play says the footprints show only for the first two plans.

## Evidence

The runs used `scratchpad/polish/penguin-bowling/play6.mjs`, with speech stubbed and logged. Screenshots are in `r6/`. Every run had 0 console errors.

| Run | Frames | Tiers | Worked out (met) | Plans exact/near | Spoken |
| --- | --- | --- | --- | --- | --- |
| Careful 1194×834, tier 1 | 10 | 1 → 2 (roll 5) → 3 (roll 17) | 4 (6) | 6/8, 2 near | 31 |
| Careful 834×1194 Fishy, tier 2 | 10 | 2 → 1 → 2 → 3 (scripted misses) | 4 (6) | 5/8, 3 near | 25 |
| Careful 1194×834 Night, tier 2 | 10 | 2 → 1 → 2 → 3 | 4 (8) | 6/9, 3 near | 32 |
| Careful 1194×834 Fishy, tier 3 | 10 | 3 | 4 (6) | 9/11, 2 near | 17 |
| Random 834×1194 Night, tier 1 | 10 | 1 | 0 (7) | — | 28 |
| Random 1194×834, tier 1 | 5 | 1 | 0 (5) | — | 26 |

- The where-card text after a correct answer was always the answer: "3 on the left", "1 on the right" (`r6/lc1-trail-t1.png`).
- Results screenshots: `r6/pc2-results.png` (portrait) and `r6/lc1-results.png` (landscape).
- `browser.mjs --ids penguin-bowling --run penguin-bowling-c2`: 0 errors.
- `oq.mjs`: pass. `original-quality.mjs` drives only the prediction and one Go, which is unchanged.
- `node --check` passes on `main.js` and `scenery.js`.

## Checklist status

No checklist items were open. Both bugs are fixed: the stale where-text, and plan footprints that led to the wrong number. The blocker is fixed: tier 1 is now quicker for strong bowlers. Improvements 1–8 are done. For improvement 2, I dropped 5 instead of tying it to a curve, because curves measure 8–10 from every spot. For improvement 5, prints show only for the first two plans and again after a plan that came out far away.

## Remaining ideas

- More variety in plan numbers needs aim (angle) as well as standing spot. That could be a tier-3 "aim off the head pin" plan, once it has been measured.
- A "which group will you go for?" spare decision at tier 3.

# 2026-10-11: Round 7 (review 8.4)

## Design

1. **A wrong answer keeps the answer hidden.** The cloud and the veil now lift only when the right number is picked. Before, they lifted on any answer, so a second try could copy the frame card or the 🎯 pill.
   - Wrong "how many fell?": only the bond card's fallen pins come out to count (`.show-fallen`). The cloud, the frame card's "?" and the hidden plan pill stay.
   - Wrong "how many standing?": the cloud lifts so the pins can be tapped. The frame card and the pill stay hidden until the count is done.
2. **"10 + 0" means a strike.** A spare clears what the first slide left, and its way (say 9 + 1) was already met on that first slide. So a spare no longer records "10 + 0".
3. **"N standing." is said once a game,** through one flag (`game.standingSaid`), whatever the number. Before, `sayOnce` keyed each number separately.
4. **An age chip on the title card: 🐣 Ages 3–5 / 🐧 Ages 6–8.**
   - Each game starts from the chip, not from the last tier saved on the device.
   - 3–5 always starts at tier 1.
   - 6–8 starts at tier 2, or at tier 3 if the last 6–8 game ended there (`bigtier`).
   - Bumpers reset to the title chip at the start of every game. The tier-3 "Bumpers down?" offer lasts only that game.
5. **Results lead with the child's own work.**
   - Headline: "You worked out N ways to make 10". With none worked out, the plain title "Ways to make 10".
   - The voice follows the headline.
   - The staircase still shows every way met.
   - A random run now reads "Ways to make 10", where it used to read "You met 8 ways".
6. **Tier 3 gets curved plans: leave 7 and leave 8.** I measured 24 Go slides per setup (`measure7.mjs`):
   - middle with a left curve: 3 every time (24/24);
   - middle with a right curve: 3 in 14/24, otherwise 4;
   - one step out, curving away from the middle: 2 in 21–22/24 with the bumpers up. With them down it gives 0–1, so that plan needs bumpers.

   Picking a curved plan sets the curve button for the child. The plan card shows the same arrow ("↖️ curve"), and so does the 🎯 pill ("leave 7 ↖️"). The first curved plan of a game gets footprints, with one spoken line: "A curved plan. Stand on the footprints, then press Go."

   Curved-plan tips speak about the curve. Sliding without the curve gets "A curved plan needs the curve." After a curved slide the curve goes back to straight. Turning bumpers down picks the plans again.

   Tier 3 now sees leave 9, 8, 7, 6, 2 and 1, not just 9, 6, 2 and 1.
7. **Bigger pins to count on sideways tablets.** The landscape counting camera sits higher and uses a longer lens: fov 26 (was 40), up 5.2. The pins are about 40% bigger and the rows separate (`r7/cam-l40-deck.png` vs `cam-lB-deck.png`). Sideways phones use fov 34.
8. **The counting rings hold still.** The ±5% breathing is gone, including the rings kept for the spare.

## Changes

- `examples/penguin-bowling/public/js/main.js`:
  - tier/age state :119–122
  - slide's real curve :302
  - spare is not "10 + 0" :366
  - curve resets after a curved plan :402
  - "N standing." once :449
  - `setTier` stores only 6–8 :511
  - right answer lifts the cloud and veil :710
  - wrong fallen keeps the cloud :738
  - wrong standing lifts only the cloud :747
  - bumpers-down re-offers plans :807
  - curved plan picks :841
  - `CURVED`, `planCurve`, `CURVE_ICONS` :870–877
  - `choosePlan` curve and footprints :906–928
  - curved tips :970
  - results headline and voice :1141
  - `setBumpers({ keep })` :1305
  - per-game bumpers and tier in `start` :1368
  - `setLevel` :1399
  - `CAM.deck` per orientation :1632, :1668
- `examples/penguin-bowling/public/js/count.js`: rings no longer breathe (:161).
- `examples/penguin-bowling/public/index.html`:
  - the Ages chip;
  - the results key's "worked out" part is now its own span.
- `examples/penguin-bowling/public/style.css`: Round 7 block (`.show-fallen`, `.plan-curve`).
- `examples/penguin-bowling/game.json`: how-to-play mentions curved plans and the age chip.

## Evidence

The runs used `scratchpad/polish/penguin-bowling/play7.mjs`, with speech stubbed and logged. Screenshots are in `r7/` and `r7b/`. Every run had 0 console errors.

| Run | Frames | Tiers | Worked out (ways) | Plans exact/near | Curved plans |
| --- | --- | --- | --- | --- | --- |
| Careful 1194×834 Fishy, tier 1 | 10 | 1 → 2 → 3 | 5 (7) | 4/7, 2 near | — |
| Careful 834×1194, 6–8 tier 3 | 5 | 3 | 3 (4) | 3/5, 2 near | 0 |
| Careful 834×1194 Night, tier 3 | 10 | 3 → 2 (scripted misses) → 3 | 6 (7) | 10/11, 1 near | 3 (3:3, 2:2, 2:2) |
| Careful 1194×834, tier 3 | 10 | 3 | 6 (6) | 7/11, 4 near | 2 (3:3, 2:3) |
| Careful 1194×834 Fishy, tier 3 (after the fixes) | 10 | 3 | 6 (7) | 5/11, 6 near | 1 (3:3) |
| Careful 834×1194 Night, tier 2 (after the fixes) | 10 | 2 → 3 | 7 (7) | 8/11, 3 near | 1 (3:3) |
| Random 1194×834, tier 2 | 10 | 2 → 1 | 2 (7) | 0/3, 1 near | — |
| Random 834×1194, tier 1 (after the fixes) | 10 | 1 | 0 (8): "Ways to make 10" | — | — |

- After every scripted wrong answer the state matched the design:
  - fallen: cloud up, veil up, frame "?" kept, pill hidden;
  - standing: cloud down, veil up, frame "?" kept, pill hidden.
- Screenshot: `r7/lc3-num-wrong-fallen-t3.png`.
- "N standing." was said at most once in every run.
- The ways recorded "10 + 0" only in runs with a strike. pc3 had 4 spares and no "10 + 0".
- The age chip and bumpers were checked with `chip7.mjs`:
  - A device that last played tier 3 with the 3–5 chip starts at tier 1.
  - "Bumpers down" in one game is back ON in the next.
  - With the 6–8 chip, the next game starts at the saved tier (3, then 2 after a drop), and keeps it after a reload.
- Screenshots:
  - Landscape counting framing: `r7/cam-lB-deck.png`, `r7/lc1-count1-done.png`.
  - Curved plan card: `r7/pc3b-plan-ask.png`.
  - Curved plan pill and prints: `r7b/lc3-plan-curve-aim.png`.
  - Results: `r7/lc1-results.png` (own work), `r7b/pr1-results.png` (neutral).
- `browser.mjs --ids penguin-bowling --run penguin-bowling-c3`: 0 errors.
- `oq.mjs`: pass.
- `node --check` passes on `main.js` and `count.js`.
- `original-quality.mjs` drives Play → prediction → Go → Escape. That flow is unchanged; the new title chip is not on its path.

## Checklist status

No checklist items were open. All four bugs are fixed:
- the answer showing after a wrong try;
- spares recorded as "10 + 0";
- "N standing." said for each number;
- tier and bumpers carrying over to the next child.

All eight improvements are done:
1. The headline is the child's own work.
2. The cloud stays after a wrong answer.
3. Curved plans for tier 3. A curve, not an angle: the curve button is a deterministic choice a child can make, and its results are measured.
4. "10 + 0" is a strike only. Spares are left out rather than shown as their own way.
5. "N standing." once a game.
6. The age chip, and bumpers reset each game.
7. The landscape counting camera.
8. Still rings.

## Remaining ideas

- A "which group will you go for?" spare decision at tier 3.
- Sideways phones (667×375) could zoom further if the bond card moves aside.

# 2026-10-11: Round 8 (reviews 8.5 and 8.4)

## Design

1. **What was counted stays true.** The pins counted as standing now stay standing until the next slide. When the fallen pins puff away, each standing pin settles upright where it is and sleeps (`lane.js:539–551`). Before, a pin leaning on a fallen one could tip over while the child aimed. The count, the bond, the "where?" answer and the rack map then disagreed ("2 pins left" and then "1 pin on the left").
2. **"Where are the pins?" always adds up.** A pin between the middle and a side counts for both sides. So when the middle was also a right answer, the spoken counts could add up to more pins than were standing ("5 in the middle" and "4 on the right" with 7 up).
   - Now the question is asked only when every right answer is a side (`main.js:1125`). As before, pins in the middle need no question.
   - A wrong pick names every accepted side ("Most are on the left and on the right", `main.js:1163`). Left and right never share a pin, so each pin is counted once.
3. **A second try is still a choice.** After a wrong number, the game no longer leaves only the right button to press.
   - At tier 1 the numbers come back over the pins, and two fresh numbers are dealt: the answer and its other neighbour, never the one already tried. The child reads the last number counted to choose (`main.js:729`).
   - At tier 2 the fallen pins come out to count, and three numbers nearest the answer are dealt, leaving out every number already tried (`redeal`, `main.js:651`, `:767`).
   - At tier 3 the 1–10 strip keeps every other number live.
4. **Random tapping earns nothing.**
   - Taps closer than 0.4 s are a sweep, not a count (`main.js:531`; it was 0.25 s).
   - Moving up from tier 1 now needs one careful count of 3 or more pins whose total was said right first time (`game.bigCount`, `main.js:505`). Single pins plus big rolls no longer promote.
   - Random runs now end with "Ways to make 10" and 0 worked out, while careful runs reach 4.
5. **A 3–5 child stays at tier 2 longer.** Reaching the 1–10 strip takes 6 right answers and the fourth frame or later. 6–8 still needs 4 (`main.js:749`).
6. **The youngest plan too: "A few or a lot?"** At tier 1 each fresh rack offers two pictures of ten dots, either a few lying down or most of them, labelled "a few" and "a lot" (`offerRoughPlan`, `main.js:901–925`).
   - A few means 1–4 fall; a lot means 7 or more.
   - The first two plans of a game lay the footprint trail: the edge for a few, the middle for a lot. After that the child finds the spot. The prints come back after a plan that missed (`main.js:980`).
   - The 🎯 card shows "a few" or "a lot" and then ✓ or "→ 5" (`main.js:1004`).
   - A plan that missed gets one tip, once a game: "For a few, stand near the side." or "For a lot, stand in the middle." (`main.js:1032`).
   - Rough plans never count as "made as planned" ways. The tapped count follows as before.
   - Every first slide now carries a decision whose answer depends on where the penguin stands.
7. **One sentence per slide.**
   - A strike's line replaces the plan's tip (`planResult(..., { quiet: r.strike })`, `main.js:404`).
   - The cloud line is held back when a plan line has just been spoken, so the question is heard clearly (`game.planSpoke`, `main.js:641`, `:1030`).
   - The spoken count never skips a number: while the voice counts with the child, the numbers the game fills in after a pause are said too (`main.js:451`).
8. **No repeat question.** At tiers 2 and 3, a second slide that knocks nothing leaves the very pins just counted, so the pins light together with no question (`main.js:465`).
9. **The bond reads on one line.** Every part's number sits on one baseline. While "how many fell?" is open, the hidden fallen pins take no room, so the "?" sits level with the standing number: "? + 1 = 10" (`style.css`, Round 8 block).
10. **Sideways, the cards sit beside the lane.** The "where?" and plan cards now sit over the left snow bank:
    - tablets: at 42% height, at most 236 px wide;
    - phones: a compact column.

    The penguin and its spot stay in view while the child plans.
11. **Calmer while aiming.**
    - The penguin's idle sway is slower and smaller: 0.025 rad at 1.6 rad/s, where it was 0.08 at 4 (`penguin.js:178`).
    - The flippers barely move and the feet stay still.
    - The lamp halos and the whale hold still during aim, as they do while counting (`main.js:1870`).

## Evidence

The runs used `scratchpad/polish/penguin-bowling/play8.mjs`, with speech stubbed and logged. Screenshots are in `r8/`.

Two checks ran in every play8 run:
- **Upright check:** on every second slide, the standing count was compared again 1.5 s into aiming.
- **Count-skip check:** every spoken run of bare numbers must go 1, 2, 3, …

| Run | Frames | Tiers | Worked out | Upright check | Count skips | Errors |
| --- | --- | --- | --- | --- | --- | --- |
| Careful 834×1194, tier 1 | 10 | 1 → 2 | 4 | 0/10 changed | 0 | 0 |
| Careful 1194×834 Night, tier 1 | 10 | 1 → 2 → 1 (scripted misses) → 2 | 4 | 0/9 | 0 | 0 |
| Careful 1194×834 Night, tier 2 | 10 | 2 → 1 → 2 → 3 | 6 | 0/10 | 0 | 0 |
| Careful 834×1194 Night, tier 3 | 10 | 3 | 5 | 0/9 | 0 | 0 |
| Random 834×1194 Fishy, tier 1 | 10 | 1 | 0: "Ways to make 10" | 0/10 | 0 | 0 |
| Random 1194×834 Fishy, tier 1 (before the rough plan) | 10 | 1 | 0 | 0/10 | 1 (false positive: the "That one fell down" line sat between 1 and 2) | 0 |

- **Wrong-pick re-deal:**
  - a wrong "fell" pick at tier 2 (answer 9) re-dealt [8, 9, 10], all live (`fallen8.mjs`);
  - a wrong total at tier 1 re-dealt two numbers (`r8/lc1-total-wrong.png`: [1, 2] for 2 standing).
- **Where feedback:** no run said a middle count beside a side count. Wrong picks read "No pins in the middle" or "Most are on the left". Right picks read "Yes! N pins on the left/right", with N not more than the pins standing.
- **Missed spare:** a gutter second slide at tier 3 asked no question (counting finished, number buttons hidden, no cloud; `miss8.mjs`).
- **Speech:**
  - a strike no longer follows a plan line;
  - "Close to your plan!" is followed directly by "How many fell down?";
  - "The pins are hiding in a cloud." was kept for a later question.
- **Screenshots:**
  - landscape cards beside the lane: `r8/l-plan.png`, `r8/l-where-wrong.png`, `r8/lc2-ask-where-t2.png`;
  - phone landscape: `r8/s-plan.png`, `r8/s-where-wrong.png`;
  - the "?" in line: `r8/l-ask-fallen.png`, `r8/pc3-ask-fallen-t3.png`;
  - tier-1 plan: `r8/pc1-plan-ask.png`, with the pill and trail in `r8/pc1-plan-aim.png`.
- **Test commands:**
  - `browser.mjs --ids penguin-bowling --run penguin-bowling-c4`: 0 errors.
  - `oq.mjs` passes. It is the original-quality flow: Play → 💭 → Go → Escape.
  - `node --check` passes on `main.js`, `lane.js` and `penguin.js`.

## Checklist status

No checklist items were open.
- **Review 1:** all five bugs are fixed (where contradictions, the forced last tap, the landscape cards over the penguin, the "?" alignment, random tier-1 credit). Improvements 1–5 are done. Of improvement 6, the repeat question is gone; the tier-3 spare goal is left for later (see below).
- **Review 2:** all three bugs are fixed (the leaning pin, the skipped spoken numbers, the plan tip before the strike line). Improvements 1–7 are done.
- **Taps in order:** I did not make taps follow the counting order. Requiring front-row-first is harsh for 3-year-olds. The 0.4 s gap and the 3+ count rule separate careful counting from random tapping instead.

## Remaining ideas

- A tier-3 spare goal ("3 standing: can you get all 3?" or "which group will you go for?" on a split).
- Rough-plan success rates were not measured separately. They reuse the measured straight spots: the edge gives 1–2 and the middle 8–10.
