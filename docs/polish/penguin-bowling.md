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
