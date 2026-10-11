# Bumper Ducks: Phase 1 calm pass (2026-10-09)

The ducks, arenas, bonking physics, power-up gifts, napping robots and local multiplayer are what children love here, and they all stay. This pass removes the end-of-round alarm, the score shouting and the faster party music. Making rounds untimed, and replacing medals with a team total, is Phase 2.

## What changed and why

All paths are under `examples/bumper-ducks/public/`.

**Timer pressure**
- `js/main.js:1010`: the clock no longer turns pink, pulses every 0.6 s (`.timer.hurry` is removed from `style.css`) or beeps for the last 5 seconds. The 90-second round itself is unchanged.

**Bubble party**
- `js/sim.js:404`: the last-15-second shower spawns a bubble every 0.35 s, up to 16. It was every 0.18 s, up to 22.
- `js/main.js:1027`: the banner says "🫧 Bubbles! 🫧" instead of "🫧 BUBBLE PARTY! 🫧".
- `js/main.js:1254`: the music no longer speeds up for the party (`audio.updateMusic` lost its `fast` flag).

**Feedback**
- `js/main.js:~866-893`: removed the "+1", "⭐+3" and "💦+2" floating score labels. The duck's counter in the HUD still shows what it collected.
- "KA-BONK!" is gone. A hard bonk shows a small lower-case "bonk!".
- The QUACK and RIBBIT discovery words, WHEE, and the gift's power picture stay, since they say what happened.
- `js/main.js:868`: the bubble note walks a five-note scale (`game.run % 5`) instead of climbing like a combo.

**Camera**
- Bonks and splash landings are real physical bumps, so they keep a nudge, but a smaller one.
- Bonk shake now applies only for `s > 6`, capped at 0.35. It was `s > 4`, capped at 1 (`:894`).
- The splash landing shakes at 0.3 instead of 0.5 (`:936`).

**Celebrations**
- `js/main.js:804-809`: the round ends with "🫧 All done! 🫧" instead of "⏰ TIME! ⏰". The 90-piece confetti burst becomes 24 slow-drifting stars (`js/effects.js:205`).
- `js/main.js:167`: a finished counting mission shows "N 🫧" with one gentle chord and 10 twinkles, instead of `audio.star()` and 30 sparkles.

**Idle nudges**
- `js/main.js:780-783`: the steering hint used to reappear after every 6 s of rest. It now appears at most once per round, after 30 s without paddling. Resting is fine, and the robots nap too.

**Audio** (`js/audio.js`)
- Music tempo is 0.22 s per step, was 0.16 s with a 0.125 s party. The hi-hat ticks are gone.
- `cheer()` is now a slow triangle arpeggio plus `chord()`. The square-wave run and 10 crackle bursts are gone.
- `gift()` is triangle with no highpass hiss. `ribbit()` is triangle. The "speedy" power is triangle with a softer sweep.
- The count-in `beep()` is sine and triangle instead of square.
- The duck squeak gain drops from 0.35 to 0.25, and the splash highpass from 0.2 to 0.1.

**CSS** (`style.css`)
- Removed the infinite logo bob, GO-button pulse, hurry pulse, power-ring bob, waiting pulse and keys-hint bob.
- The drag-hint finger slows from 1.6 s to 2.4 s.
- Banners fade with no overshoot or tilt. The countdown enters from 1.3x instead of 2x.
- Added a `prefers-reduced-motion` block (`:263`).

## Verification

- `browser.mjs --run calm` (Chromium, both orientations): 0 errors. `original-quality.mjs`: mission persistence passes.
- `node --test examples/_studio/tests/*.test.mjs`: the only failure is the stale `public/bitgames.json` manifest, which the coordinator rebuilds.
- Played two full 90-second solo rounds in the bath (portrait and landscape) with keyboard steering and dashes, through to the podium.
  - Portrait scores were child 81 vs robots 41/45/50. Landscape was 95 vs 38/43/42.
  - At 0:04 the timer was neutral and silent. The podium showed a light star drift.
  - The only console message was the expected solo-mode "Multiplayer only works when the game is opened from BitGames" warning.
- Before screenshots: `…/scratchpad/audit/bumper-ducks/`. After screenshots: `…/scratchpad/audit/after/bumper-ducks-*.png`, under `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/183efacb-62c2-4cf6-9680-a97f4bb0fb5f/`.

## Left for Phase 2, and why

- **The timed round, medals and the "lead" scale-up on the top score pill.** Untimed play with a team total is the planned Phase 2 redesign, and removing these now would leave a round with no ending.
- **Pickup scoring and catalogue text.** Bubbles are 1, stars 3 and splash-outs 2, so `game.json` stays accurate.
- **The audit's Phase 2 list:**
  - an untimed default
  - coloured or numbered bubbles into a shared ten-frame jar
  - a team total instead of medals
  - arena discovery puzzles: frogs in order, ferrying boats

# Bumper Ducks: Phase 2, learning inside the core loop (2026-10-09)

## Design

**Pond helpers** is the new calm default. It has no clock. Every duck works together to fill one shared ten-frame at the top of the screen. That includes the child's own duck, friends' ducks and the robots.

- Each counted bubble floats from the duck that caught it into the next space. It is counted aloud as it lands ("one… two…"), on a rising note.
- When ten fill, the game says "Ten!" ("Ten! 2 tens." for the second) with one soft chord. The full frame then slides onto the shelf beside it as one group of ten, and an empty frame starts. This shows place value with objects.
- In Pond helpers, bubbles carry four gentle colours: blue, green, pink and yellow. Each is a tinted shell around a coloured bead.
- **The goals** take turns: 1 ten, 5 green, 2 tens, 7 pink, 3 tens, 10 blue.
  - A tens goal shows its tens as empty outlined slots on the shelf.
  - A colour goal shows a big bubble in the goal colour, and a frame where only that many spaces are open, ringed in that colour. Other colours pop harmlessly and are not counted, so the child learns to choose.
  - The menu shows the goal as a picture: little ten-frames, or coloured dots in one frame. It is spoken when picked and again at GO ("Let's fill 3 tens together!", "Let's find 5 green bubbles together!").
  - Tapping the selected Pond helpers button again picks the next goal. A finished round moves on to the next goal, so Again! progresses.
- **The ending** has no medals.
  - For tens, the bars light one by one with "10", "20", "30!", then "3 tens make 30! Well done, team!".
  - For a colour goal, the bubbles light one by one as they are counted, then "We found 5 green bubbles!".
  - Each duck has a kind note in a pond-coloured panel: "Cool helped 11 times", or "King cheered the team on". Ducks are listed in player order, never ranked.
- **Bonks and splash-outs** stay as fun. In Pond helpers they never score and the team never loses anything.
- **Robots in Pond helpers:**
  - The child leads; the robots are helpers. They go only for bubbles the jar wants, paddle at 42% pace, never dash for bubbles, and chase a bonk 8% of the time instead of 25%.
  - **Showing a bubble.** For more than half the bubbles they pick, a robot swims over, stops beside it and waits 3–5 s. The bubble twinkles in its colour and the robot gives a little hop (a `show` event). Then the robot drifts away and leaves the bubble for the child.
  - **Helper share.** Once the robots hold a quarter of the jar (`botHelps × 3 ≥ kidHelps`, so also at the very start), they only show bubbles. A robot that is showing or has done its share floats through jar bubbles without taking them (`duck.leave`). In practice the child's own catches are about 60% or more of the jar.
  - They still nap when the child rests. The jar waits for the child.
- **Bumper race** (lively) is unchanged and stays a pictured menu choice (⏱️💥 "Race"). It keeps the 90 s round, stars, the bubble shower, score pills and the medal podium.

## Changes (all under `examples/bumper-ducks/public/`)

- `js/config.js:72-102`: `MODES`, `BUBBLE_COLOURS`, `GOALS`, `goalTarget`, `validGoal` and `duckName`.
- `js/sim.js`
  - `:20-31`: the Sim takes `mode` and `goal`, and holds the shared `jar`.
  - `:61-68`: `party` applies only to lively, and `counts(it)` decides what goes in the jar.
  - `:112`: a calm round ends when the jar reaches its target.
  - `:354`: no splash-out points in calm.
  - `:379-390`: a calm pickup goes into the jar. The `got` event carries `c`, `ok` and `n`.
  - `:418-429`: calm spawning is 4 starting bubbles, then one every 3 s up to 5, with no stars. The pond stays uncluttered and a 3-tens round takes a minute and a half or more.
  - `:456-475`: colours are added to items and events, and `bubbleColour()` keeps 2 or more goal-colour bubbles on the water.
  - `:568-573`: friend devices mirror the jar from `got` events.
  - `:601-609`: `syncJar()` takes the host's jar, and item rows carry their colour.
- `js/bot.js:39,75,102-104`: calm robot behaviour.
- `js/water.js:88-116`: `makeBubbleMaterial(tint)`.
- `js/view.js:100-106,254-258`: the coloured bubble look.
- `js/main.js`
  - `:122-123`: mode and goal state, remembered.
  - `:166-171`: the mission stays quiet during calm play, because the jar counts aloud. Its reward is still said.
  - `:204-227`: `say()`, `goalWords()` and `sayGoal()`.
  - `:439-470`: the pictured mode buttons.
  - `:705-708`: `setup` carries `mode` and `goal`.
  - `:743-746`: the calm round starts.
  - `:864-878`: the calm ending, which advances the goal.
  - `:928-944`: `got` drops into the jar. Missions count only jar bubbles in calm.
  - `:662,683` and `sendNet`: `st` and `end` carry `jar`.
  - `:1136-1290`: the jar UI. This covers flying dots, counting aloud, the ten slide, catch-up after missed events and reduced motion. With reduced motion there is no flight or slide; the jar fills at once.
  - `:1334-1400`: team results.
- `index.html:37,59,75`: `#modes`, `#jar` and `#team`. The results title has an id.
- `style.css:263-360`: modes, the jar, ten bars, flying dots and team results, at every size.
  - On short phones in landscape, the modes join the right-hand column. The duck row shrinks to fit beside that column, and at 568×320 the logo is 28 px, so nothing in the menu sits under the column.
  - On upright phones up to 700 px tall, the headings make way.
  - At 320×568, the duck and place tiles shrink and the mode buttons show pictures only.

## Sync protocol (additive, all clients on the same version)

- `setup` gains `mode` and `goal`. `goal` is checked against `GOALS`.
- `item` and `got` events gain `c`. `got` also gains `ok` and `n`.
- `st` and `end` gain `jar`, an array of colour indices.
- `itemList` rows gain a 5th colour element.

The host stays authoritative. Friends mirror the jar from events and correct it from `st` every 2 s. A new host after migration continues from its own jar.

## Evidence

Scripts and screenshots are in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/183efacb-62c2-4cf6-9680-a97f4bb0fb5f/scratchpad/p2/bumper-ducks/`.

- **`play.mjs`** plays a whole calm round with an autopilot driving the real input.
  - Portrait 834×1194: 3 tens in 45 s and 2 tens. Landscape 1194×834: 7 pink.
  - Phones: 667×375 (2 tens), 375×667 (5 green), 568×320 (1 ten). WebKit 834×1194: 1 ten.
  - Every run ended with the correct count-up, total and helper notes. The only console message was the expected solo "Multiplayer only works…" warning.
- **`slide.mjs`** follows the tenth bubble, the full frame sliding onto the shelf (`slide-motion-*.png`), and a reduced-motion run where it fills at once. 0 errors.
- **`sync.mjs`** runs host and friend sims in Node through the real messages, with 20% of events dropped.
  - For all 6 goals, the friend's jar matches the host's. Colour goals hold only their colour, and the helps add up to the target.
  - Lively still ends at 90 s with plain bubbles.
- **`menus.mjs`** checks every menu button at 375×667, 320×568, 667×375, 568×320, 834×1194, 1194×834 and 768×1024. All are at least 44 px, uncovered and on screen.
  - Lively mode shows the timer, not the jar, and ends with the 4-row podium.
- **The standard checks:**
  - `browser.mjs --ids bumper-ducks --run p2` passes in Chromium and WebKit with 0 errors.
  - `original-quality.mjs`: all 15 checks pass, including the bumper-ducks mission check.
  - `node --test`: 10 of 11 pass. The failure is only the stale manifest hash for `index.html`, which needs the coordinator's rebuild.
- **Parent's-eye view:**
  - The frame and the slide into tens read clearly without words.
  - Counting aloud gives every bubble a moment.
  - The ending says what was learned, and nobody comes last.

## Follow-up: the child leads, and the short-landscape menu (2026-10-09)

**Changes**
- `js/bot.js`: robots paddle at 42% pace in Pond helpers and never dash for bubbles. They show bubbles (hold beside one for 3–5 s, then leave it), and set `duck.leave` while showing or once they have done their share.
- `js/sim.js`:
  - `pickups()` skips jar bubbles for a duck with `leave` set.
  - Calm spawning is 4 starting bubbles, then one every 3 s, up to 5.
- `js/main.js`:
  - The robots' share rule: `helpedEnough` when `botHelps × 3 ≥ kidHelps`.
  - The `show` event: a twinkle on the bubble in its colour, and the robot hops. It goes to friends through the normal event outbox.
- `style.css`, short landscape:
  - The duck tiles size to fit beside the right-hand column: `min(76px, (100vw − 236px) / 6 − 8px)`.
  - At 568×320 the logo is 28 px with a 100 px left margin.

Counting every landing aloud and the goal progression are unchanged.

**Timings and child share** (`play.mjs`, wall-clock time). The new `child` autopilot paddles at 45% with a wobble, re-decides every 1.2–2 s, picks among the 3 nearest bubbles, sometimes heads for the wrong colour, and rests about 30% of the time.

| Run | Goal | Time | Child's share |
| --- | --- | --- | --- |
| Child, portrait, Chromium | 3 tens | 111 s | 77% |
| Child, portrait, Chromium (second run) | 3 tens | 144 s | 73% |
| Child, landscape, Chromium | 3 tens | 140 s | 73% |
| Child, portrait, WebKit | 3 tens | 140 s | 73% |
| Child, portrait, Chromium | 5 green | 40 s | 80% |
| Efficient autopilot, portrait | 3 tens | 77 s | 73% |

Before this follow-up, the efficient autopilot finished 3 tens in 44 s with a 50–63% child share.

**Robots wait** (`nap.mjs`):
- Child resting for 12 s: the robots napped and the jar stayed at 0.
- Child paddling in circles without chasing bubbles for 15 s: 9 shows, jar still 0. The robots never fill the jar for the child (`nap.png`, `show.png`).

**Menu** (`overlap.mjs`): at 667×375, 568×320, 740×360, 812×375 and 640×360, no logo letter, duck, place or player chip sits under the column or off screen. Screenshots: `menu-667x375.png`, `menu-568x320.png`.

**Checks:**
- `menus.mjs`: every button is uncovered and at least 44 px at all seven sizes.
- `browser.mjs` passes in Chromium and WebKit with 0 errors.
- `original-quality.mjs` passes all 15 checks.
- `sync.mjs` passes.

## Left / open

- **Real multiplayer.** It only runs from bitgames.store. The protocol was exercised in Node, but two-device play is untested.
- **Pacing with a real child.** See the follow-up timings below. Family play should confirm that a 3-tens round feels like a few minutes and that the shown bubbles read as help, not teasing.
- **Catalogue text.** `game.json` `howToPlay` still describes points ("Bubbles are worth 1, stars 3"). The coordinator should update it (diff in the report).
- **Speech overlap.** Speech uses `speechSynthesis.cancel()` before each count, so fast pickups cut the previous number short. This is acceptable at calm pace.

## Simplify pass (2026-10-09)

- One shared voice (`js/speech.js`, rate 0.85). The mission stays quiet during Pond helpers play (now through `announce`), so real mute is no longer overloaded. A friend's device takes the host's mission with `adventure.select(i, { silent: true })`.
- Pond helpers: the mission reward is queued after the jar counts the bubble that earned it (no 1.2 s guess). Mode taps interrupt; other words queue.
- Removed the dead `@keyframes pulse`.
- Verified: chromium and webkit boot + play, and stubbed-speech solo rounds in both modes (calm: goal, 1, 2, 3, reward).
- Iteration 2: the `missionVoice` view and `missionReward` stash are replaced by an `announce` that stays quiet during Pond helpers play, and `event()`'s `'done'` return hands the reward to `jarDrop`. The `say` alias is gone. Progress is the shared row (`icon: '🫧'`); the `.goal-bubble` CSS became `#hud .adventure-steps` sizes. Home and the sound button now hush the voice themselves.

## Simplify pass, third pass (2026-10-09)

- The voice starts with `muted: audio.muted`; `setSound` calls `voice.setMuted` (also on the saved setting at load). The local `#hud .adventure-goal[hidden]` rule is gone.
- The setup message sends `adventure.selected`; `sayGoal` checks `adventure.option.goal` directly.
- Verified: `browser.mjs --run simp3` (Chromium, WebKit), `original-quality.mjs`, `node --test`, and a stubbed-speech check in Bumper race (mute hushes and silences, unmute speaks again, choice/goal show and hide, no console errors).

## Exit paths (2026-10-09)

- `clearTimers()` now hushes the voice. It is the shared cleanup for `enterLobbyScreen` (host 🏠, Escape, Change, the host's menu message), `abortToLobby`'s friend branch and `startRound` (Go, Again), so the 🏠 handler's own hush is gone.
- Escape now also works in the `ending` state (the 1.7–2.4 s wait before results).
- Verified: `browser.mjs --run exits` (Chromium, WebKit), `original-quality.mjs`, `node --test`, and a stubbed-speech check: Escape during `ending` hushes and returns to the lobby with no late results, Again hushes, 🏠 mid-play hushes and stays in the lobby, no console errors. The friend branch was checked in code only (needs two devices).

# Bumper Ducks: round 1 of the 8.5 pass, choosing is the game (2026-10-11)

Starting point: the 2026-10-10 re-audit (6.5). Pond helpers was calm but passive: in tens goals every bubble fit, a wrong colour popped harmlessly, robots showed the right bubble most of the time, every landing was counted aloud, and the ladder stopped at 3 tens.

## Design

- **Every catch is a decision.** Each space in the jar wants something: a colour, any single bubble, or a ten raft. A bubble the jar can't take no longer pops. It bobs sideways out of the duck's path and stays on the water, with a soft two-note "uh-uh" and a single glow on the open spaces. Once a round, a short line says what is still needed, for example "We have enough green. Now pink!" (at most two such lines a round). So careful paddling is quicker than wandering, and nothing is ever lost.
- **A ladder of six levels** (`makeGoal`). Each round makes fresh numbers:
  - 0: fill one ten (any colour, counted aloud to ten)
  - 1: find 3–6 of one colour
  - 2: a number bond inside one ten-frame, e.g. "make 9: 6 pink and 3 blue"
  - 3–5: place value with **ten rafts** (ten little bubbles on a floating ten-frame board) beside single bubbles: 12–17, 23–29, then 34–49
  Extra rafts after the tens are full, or extra singles after the ones are full, don't fit.
- **It adapts without gating.** After a round, two or fewer bubbles that didn't fit climb a level. From level 2 up, climbing also needs steady catching (under 7 s a bubble). Six or more step back one, and anything between stays at the level with new numbers. The menu's new ▶ button steps through every level, and the results' ▶ button shows the next goal's picture.
- **The robots stop answering.** They fetch only while they hold under a quarter of the jar. They show a bubble that fits only when a child seems stuck: two misses in a row, or 25 s without a catch. A show resets that, so they don't keep pointing.
- **A thinner voice.** Each round says:
  - the goal, said once (the GO line is skipped when the menu just said it)
  - numbers up to five, or to ten while filling the first ten
  - "6 pink!" when a bond part fills, and "two tens." as each raft lands
  - one summary ("2 tens and 7 ones make 27!")
  The results count-up lights 10, 20, 21… silently with soft notes. Measured: 7–13 lines a round, down from 45–66.
- **Bugs fixed:**
  - The goal no longer changes only by re-tapping "Together": there is a visible ▶.
  - The duplicate mission chip is hidden in Pond helpers; it remains for Race only.
  - "Ten!, 10!" is gone: the ending no longer re-counts aloud.
- **A calmer Race.** It keeps the 90 s clock, but medals, the 🏆 Bubble Champ award, the leader pill scale-up and the winner's quack are gone. Ducks are listed in player order with their awards.

## Changes (under `examples/bumper-ducks/public/`)

- `js/config.js:70,88-155`: `TEN`, `LEVELS`, `makeGoal`, `goalSlots`, `slotTakes`, `placeJar`, `goalTarget`, `goalValue` and a rebuilding `validGoal` replace `GOALS`. Adds `ITEMS.ten`.
- `js/sim.js`:
  - `:24-26`: `tokenOf` and the per-duck `bot` flag.
  - `:31-35,73-90`: `slots` and `open`, with `sorts`, `counts` and `fill`.
  - `:392-420`: pickups. A bubble that doesn't fit calls `nope`, and robots float through.
  - `:435-492`: `nope`. It pushes the bubble sideways and out of the path, and counts once per item per duck.
  - `:536-553` (and the 1.2 s refill in `spawning`): `calmSpawn` keeps a mix of wanted bubbles and distractors, fades the oldest unneeded one when the pond is full, and brings the next wanted bubble in 1.2 s when fewer than two are left.
  - `:580`: `bubbleColour` works from the open spaces.
  - `:702-714`: `nope` and `fade` are mirrored on friends' devices.
  - `syncJar` and `syncItems` rebuild `open` and move bobbed items.
- `js/bot.js:26,55-57,110-139`: `help`; `choose(sim, playOnly)`.
- `js/view.js:107-125,273-276,300-305`: the ten-raft model in runtime geometry, and `ItemView.follow`.
- `js/audio.js`: `nope()`, two soft sine notes.
- `js/main.js`:
  - `:198-224`: goal words, said once.
  - `:430-500`: goal pictures (rafts, ones and the number), `goalLabel`, and the ▶ next-goal button. The mission chip is enabled only for Race.
  - `:903-916`: the adaptive next level.
  - `:967-982,1116-1137`: `nopeWords`, `lookAtJar`, and the `nope` and `fade` events.
  - `:1253-1405`: the slot-based jar, `jarSpace` (`:1308`), raft flights and the thinner `countAloud`.
  - `:1483-1571`: per-kind team results with the next-goal ▶, and the medal-free Race list.
  - `:1635`: the robots' `help`.
- `style.css`:
  - Adds `.mode-wrap` and `.next-goal`, and the `.mini-raft`, `.mini-ones` and `.mini-num` pictures.
  - Adds `.jar-num` and the `.jar.look` glow (a one-off transition), `.ten.raft`, `.jar-fly.raft`, and labels on lit cells in the results.
  - Adds small-screen placement for ▶. Removes `.score.lead`.

## Evidence

Scripts and screenshots are in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/264c5237-472d-4187-be3f-45d364aa4d2a/scratchpad/polish/bumper-ducks/`. `play.mjs` drives the real input with three autopilots: careful, random and wander. Speech is stubbed.

- **Careful, starting at level 0** (portrait 834×1194):
  - one ten in 16 s → 6 pink in 13 s → bond 6+3 in 28 s (4 misses, so it stays at 2) → bond 2+4 in 16 s (1 miss) → place value. Spoken lines per round: 11, 7, 13, 9.
- **Careful, landscape 1194×834:**
  - 2 tens + 3 in 7 s (6 lines) → 3 tens + 8 in 29 s (11 lines).
  - Rafts float on the water. Each raft flies onto the shelf, and the ones fill their frame (`e-l4-r1-mid.png`).
- **Wander (paddling without choosing):**
  - a bond of 7 took 102 s, with 8 bounces and 7 robot shows, and stayed at level 2.
  - a bond of 8 took 66 s and stepped down a level.
  - Careful play of the same bonds took 16–28 s. Careful play now clearly differs from random play.
- **Node sync check** (`sync.mjs`):
  - host and friend sims through the real messages, with 20% of events dropped, for 3 goals at every level.
  - Jar and open spaces match. Every space is filled by the right token: tens equal rafts, and bond colours are exact.
  - 127 bounces were exercised. Lively still ends at 90 s with plain bubbles.
- **Menus** (`menus.mjs`):
  - at 834×1194, 1194×834, 375×667, 667×375, 568×320 and 320×568, every button is at least 44 px, on screen and uncovered.
  - The mission chip is hidden in Pond helpers and shown for Race. ▶ is hidden for Race. Screenshots: `menu-*.png`.
- **Race** was fast-forwarded through 90 s. The results card has no medals (`race-results-1194x834.png`).
- **Standard checks:**
  - `browser.mjs --ids bumper-ducks --run bumper-ducks-r1`: 0 errors.
  - `node --check` passes on every edited file.
  - The only console message is the expected solo "Multiplayer only works…" warning.

## Remaining ideas

- Give bonks and dashes a job: a bump frees a bubble stuck on a lily pad, or nudges a raft to a friend.
- The frog-order arena puzzle.
- Regrouping for 7–8 year olds: ten singles in the ones frame bundle into a raft.
- A count-on voice ("21, 22, 23") once the tens are in.
- `game.json` text (coordinator).
- Real two-device multiplayer is still untested outside Node.

# Bumper Ducks: round 2 of the 8.5 pass, trips, tens first and regrouping (2026-10-11)

Starting point: independent review 1 scored 7.3. The blockers were:
- The 6–8 tier (place value) asked for no thinking: greedy play got 0–1 bounces at levels 3–5.
- Rounds lasted 5–28 s, and bonks had no job.
- The counting voice skipped "6", restarted mid-count and interleaved tens and ones.
- The jar was small on iPad, ▶ overlapped the goal, and the jar sat over the faucet.

## Design

- **A round is a trip of related goals**, with the jar shown between them for 3 s (`makeTrip`, `Sim.setStage`). One dot per goal shows on the menu, in the jar and on the results.
  - Level 1: two colours.
  - Level 2: three ways to make one number ("6 + 3 = 4 + 5 = 7 + 2 = 9", shown as three mini frames on the results).
  - Levels 3–5: place value, carried in one jar: make 23 → "Now 10 more. Make 33!" (one raft) → a few more ones.
- **Tens first** (`fitsNow`). While a raft space is open, single bubbles bob away ("Tens first! Find a ten raft."). The ones frame rests dimmed until the tens are in. The count is then a clean count-on (10, 20, 21, 22). Every catch is a raft-or-single choice, both before and after the switch.
- **Regrouping** at levels 4–5 as the last step. For example, 37 → "Now 5 more. Make 42!":
  - Single bubbles fill the ones frame to ten: "38, 39, 40! Ten ones make one ten!"
  - The frame slides onto the shelf as a ten made of their own colours, and the rest start a new frame (41, 42).
  - A raft bounces with "A raft would make 47. Too many!"
- **Level 5 shows only the number** (`HIDE_LEVEL`). The goal is "Let's make 46! Tens first." The shelf shows only the rafts caught plus one empty place, and the ones frame shows all ten cells, so how many tens and ones is the child's to work out. Its nope line reasons aloud: "46 has 4 tens. Now single bubbles!"
- **The water always holds a real choice.** Place value keeps about 3 rafts and 4 singles afloat (pond of 7, refilled every 0.8 s when thin). The pond no longer runs empty.
- **Bonks have a job.** Each goal starts with one wanted bubble or raft stuck on Mama Duck's back, the frog's lily pad or a paper boat. A bump or dash into it knocks it into the water beside it. "One is stuck on a lily pad. Bump it free!" is said for the first three rounds only. Robots leave it to the children, and it floats free on its own after 40 s.
- **Adapts per catch, not by count.** Misses per child catch ≤ 0.2 (and steady from the bonds up) climbs a level. ≥ 0.5 with at least 4 misses steps back one. Brushing past a bubble on the way to another is a quiet nudge, not a miss: only a duck heading at it (within about 45°) chose it.
- **Voice:**
  - Bond parts of 5 or fewer are counted with their colour ("1 pink, 2 pink, 1 blue, 3 pink!"). Larger parts are named whole when full ("7 pink!"), so no skips and no numbers going backwards.
  - Colours count to five, then say the total ("6 blue!").
  - Landings are spaced at least 650 ms apart and counts queue, so fast catches are no longer cut to the last number.
  - Nope lines wait until the goal has been said.
  - "Each raft is ten bubbles." is saved as told only when said for a round that is played, not while ▶ steps through goals.
- **Layout:**
  - The jar is 1.4× (36 px cells) on tablets.
  - Empty spaces are solid tints of the colour they want.
  - The camera keeps the pond's rim below the jar (`measureHud`).
  - Flying bubbles rise into the jar from below, and a raft turns upright to fit its shelf place.
  - ▶ sits on Together's right edge, clear of the number, at every size.

## Changes (under `examples/bumper-ducks/public/`)

- `js/config.js`:
  - `:105` `HIDE_LEVEL`.
  - `:115` `makeTrip` (`makeGoal` returns its first goal).
  - `:157` `placeLayout` (raft, bundle and ones spaces).
  - `:176` `fitsNow` (tens first).
  - `:210` `validTrip`. `validGoal` takes `carry`/`regroup` and up to 6 tens.
- `js/sim.js`:
  - `:27` `STAGE_PAUSE`; `:86` `setStage`; `:99` `counts` uses `fitsNow`; `:167` `full`/`stage` events in `step`.
  - `:452,486` quiet nudges.
  - `:600` `calmSpawn` mix; `:622` `stick`; `:631` `free` (on `thud`).
  - `:838` `goTo`; `:846` `itemList` carries stuck state. Friends mirror `free`/`full`/`stage`.
- `js/bot.js:130`: robots skip stuck bubbles.
- `js/view.js:303`: `ItemView.follow(…, lift)` raises stuck bubbles.
- `js/main.js`:
  - `:106` `measureHud`; `:218-280` goal, stage and made words, `sayGoal`, `sayStuck`; `:512` `tripPicture`.
  - `:990` per-catch adaptation; `:1043` `nopeWords`; `:1213-1226` `free`/`full`/`stage` events; `:1249` `liftOf`.
  - `:1365` `showStage`; `:1381` `renderJar` (hidden scaffold, bundle); `:1472` paced `jarDrop`; `:1525` `countAloud`; `:1587` `slideFrame`.
  - `:1708` trip line on the results.
  - Setup and the network now send `trip` and `stage`.
- `style.css`:
  - `:282` ▶ beside Together; `:308` dimmed waiting frame; `:310-316` trip dots; tinted empty cells.
  - `:367` tablet jar; `:437` narrow-phone ▶ room.

## Evidence

Scripts are in the scratchpad under `polish/bumper-ducks/` (`rv2.mjs`, `sync2.mjs`, `stuck.mjs`, `menus2.mjs`); logs and screenshots are in `r2/`. Speech is stubbed, and the autopilots drive the real input (reviewer-style greedy: nearest of anything).

- **Careful climb, portrait 834×1194** (`climbP`): L0 → L1 → L2 → L3 → L3 → L4 → L5 → L5. Miss rates were 0–0.29.
  - Trips took 10–67 s of sim time; the three-bond trip was 67 s.
  - Spoken lines per trip: 12, 13, 26 (three bonds), 14–16 (L3) and 23–24 (L4–5, mostly the count-on numbers).
- **Greedy, from L5 landscape 1194×834** (`greedyL`): 12 misses and 85 s at L5, then 5 misses (54 s) and 9 misses (51 s). It stepped down L5 → L4 → L3 → L2 (rates 1.00, 0.50, 1.13).
- **Greedy, from L4 portrait** (`greedyP`): L4 → L3 → L2 → L1, with rates 0.64, 0.71, 0.79.
  - Round 1's level-5 greedy got 0–1 bounces in 14 s. The same play now gets 12 misses over 85 s.
- **Regrouping** heard in play: "37, Now 5 more. Make 42! … 39, 40! Ten ones make one ten! 41, 42". The results show the regrouped ten in its bubbles' colours beside the rafts (`careL-r2-results.png`).
- **Stuck bubbles** in all three arenas (`stuck-*.png`): on the frog's lily pad, in a paper boat, and raised on Mama Duck's back.
- **Node sync** (`sync2.mjs`): 36 trips across 3 arenas × 6 levels, with 20% of events dropped. Stage, jar, open spaces and stuck state match. Every catch is counted once. The jar is worth the number. 62 frees and 54 stage changes were exercised. Lively still ends at 90 s with plain bubbles.
- **Menus** (`menus2.mjs`) at 834×1194, 1194×834, 375×667, 667×375, 568×320 and 320×568: every button is at least 44 px, on screen and uncovered. ▶ is clear of the goal number.
- **Standard checks:**
  - `browser.mjs --ids bumper-ducks --run bumper-ducks-r2`: 0 errors.
  - `node --check` passes on every JS file.
  - The only console message is the expected solo-multiplayer warning.

## Remaining ideas

- Race is still points-only. Its results could show each duck's bubbles as tens and ones.
- The frog-order arena puzzle.
- `game.json` `howToPlay` should mention trips, tens first and bumping stuck bubbles (coordinator).
- Real two-device multiplayer is still untested outside Node.

# Bumper Ducks: round 3 of the 8.5 pass, the child's own choices (2026-10-11)

Starting point: independent review 1 scored 8. The blockers were:
- Adaptation used the duck's heading at contact, so a random paddle could still climb.
- Bonds named both parts, so the child never chose a split.
- 21–29 spoken lines per bond or place-value trip.
- Bonks had only a light job.
- The middle place-value step was always one forced raft.
- Race was still a points race.

## Design

- **Intent decides the level.** `Sim.aimAll` tracks which bubble each child is steering at: the one nearest the stick's line, kept while coasting and while closing in. A bubble counts as chosen only after 0.5 s of steering at it (`Sim.chose`).
  - A miss is a chosen bubble that didn't fit. A brush on the way to another bubble is a quiet nudge.
  - A careful catch is a chosen bubble that fit.
  - To climb: misses ≤ 0.2 per careful catch, at least 60 % of catches chosen, at least 3 chosen, and steady catching from the bonds up.
  - To step back: misses ≥ 0.5 per careful catch with at least 3, or (from L1) under 35 % of catches chosen. Random sweeping then holds at L0 and steps down above it.
- **Free bonds (L2).** The trip is one shown way ("make 8: 6 yellow and 2 blue"), then two ways the children choose. The voice says "Another way to make 8! You pick two colours." The jar opens 8 white spaces.
  - Any two colours fit, as long as the jar can still finish a new way (`freeBondFits`). 5 + 3 and 3 + 5 count as the same way.
  - A third colour bobs away ("Just two colours: green and blue."). So does a bubble that would leave only a way already made ("We made 6 and 2 already. Try a new way!").
  - The frame sorts itself by colour, so the two parts are always visible. The ways already made show beside the number in their own colours ("6+2").
  - The results show the child's own ways ("2 + 5 = 3 + 4 = 6 + 1 = 7"). Robots leave free bonds to the children unless they seem stuck.
- **A varied middle step (L3–5).** It is one of: 10 more (one raft), 20 more (two rafts), 11 more or 12 more (a raft, then singles). For example 16 → 36 → 38 and 25 → 36 → 41. Each stage needs a raft-or-single decision.
- **Bonks teach decomposition.** Once the tens are in and ones are wanted, a child's dash into a raft breaks it into ten single bubbles in a ring ("One ten is ten ones!").
  - The regroup step keeps singles scarce (2 instead of 3), so breaking a raft is the quicker way to fill the frame.
  - The first three regroup steps say "Need ones? Dash into a raft to break it into ten!".
  - Bubbles caught from your own broken raft count as chosen.
  - A raft touched without a dash still bobs away ("A raft would make 49. Too many!").
- **A thinner voice.**
  - Counting aloud happens only on the first trip at L1–L3, and L0 always counts to ten.
  - Later trips, and all of L4–5, say only the goal, the stage lines, "N tens and M ones make X", one regroup line ("40! Ten ones make one ten!") and the summary.
  - The jar shows "= 23" under the target for place value, so the picture carries the count.
  - Measured lines per trip: L0 12, L1 9–13, L2 9–14, L3 13 on the first trip and 5 after, L4–5 7–11.
- **The voice never runs ahead of the jar.** Nope lines wait until every flying bubble has landed (`whenLanded`). They are dropped if the bubble would fit by then. The next goal waits for the last landing, so the made line is never cut off.
- **Calmer Race.** Score pills and the Race results show each duck's tally as rafts and dots, with no number and no bump animation. Only one small "bonk!" label shows per 1.5 s.

## Changes (under `examples/bumper-ducks/public/`)

- `js/config.js`:
  - `:115` `makeTrip`: L2 is shown + free + free; `:139` the varied middle step.
  - `:187` `splitOf`, `:198` `wayKey`, `:204` `freeBondFits`.
  - `goalSlots`, `goalValue` and `validGoal` (`:225`) accept `{kind:'bond', n, free}`.
- `js/sim.js`:
  - `:34` `AIM_HOLD`; `:98` `used` ways; `:122` `seal` (a full free bond records its parts); `:133` `aimAll`; `:163` `chose`.
  - `:506` dash-split in `pickups`; `:609` `splits`/`split`.
  - `:701` scarcer singles at regroup; `:771` free-bond colours on the water; `:902` friends mirror `split`.
  - `newStats` adds `chosen` and `splits`.
- `js/main.js`:
  - `:232` free-bond words; `:274` `saySplit`; `:870` `countOn`; `:1012` the new adaptation.
  - `:1069` `nopeWords` (free bonds); `:1092` `whenLanded`.
  - Bonk label throttle; `:1258` `split` event; `:1336` `tally`.
  - `:1430` `byPart`, `:1433` `wayHtml`, `:1451` "= now" and the made ways in the jar; free-bond `jarSpace`.
  - `:1676` `slideFrame` guard (zero-size rects, not playing).
  - The results list every colour goal; the stage waits for landings; `:1908` robots leave free bonds.
- `style.css` (end): `.jar-now`, `.jar-ways`/`.way-sum`, `.float.small`, `.tally`.

## Evidence

Scripts are in the scratchpad under `polish/bumper-ducks/` (`rv3.mjs` adds `split` and `wander` autopilots and logs each catch's aim time). Logs and screenshots are in `r3/`. Speech is stubbed and the real input is driven.

- **Careful, portrait 834×1194, from L0** (`fcP.log`): L0 → L1 → L2 → L3 → L3 → L4 → L5.
  - The L3 stay was a short trip with 2 of 5 catches chosen.
  - Careful share 0.83–0.86 and miss rates 0–0.10. Trips took 11–56 s.
- **Random joystick (wander):**
  - L0 holds: three trips with careful share 0.29–0.43 (`wP.log`).
  - L2 steps down to L1 in 333 s (`w2.log`).
  - L3 steps down to L2 in 168 s, with 0 chosen catches (`fwL.log`).
  - L4 steps down to L3 in 153 s (`w4.log`).
- **Greedy (nearest of anything):**
  - L4 → L3 → L2 (`g4.log`).
  - L2 → L1, with 22 misses over 201 s (`fgP.log`).
- **Free bonds** heard in play: "Another way to make 9! You pick two colours. … 4 green and 5 pink make 9! … 2 green and 7 blue make 9! Three ways to make 9!". Results: `c2b-r0-results.png`, `w2-r0-results.png`. The jar shows "3+6" beside the 9 (`c2-r0-stage.png`).
- **Breaking rafts** (`s4b.log`, `phL2.log`): "Need ones? Dash into a raft…" → "One ten is ten ones!" → "60! Ten ones make one ten!". A ring of bubbles shows on the water (`s4b-r0-mid.png`). With breaking, an L4 trip took 12 s, against 32–34 s of careful play without it.
- **Order:** the nope line now always follows the landing it describes ("20 | 21 | We have all the tens…").
- **Race** (`race-r0-mid.png`, `race-r0-results.png`): tallies in the pills and on the results, and a single small bonk label.
- **Node sync** (`sync2.mjs`): 36 trips across 3 arenas × 6 levels, with 20% of events dropped. They include free bonds, whose parts match the jar on both devices.
- **Menus** (`menus2.mjs`): all 6 sizes, every button ≥ 44 px and uncovered. Phone play was checked at 375×667 and 667×375.
- **Standard checks:**
  - `browser.mjs --ids bumper-ducks --run bumper-ducks-r3`: 0 errors.
  - `node --check` passes on every edited file.
  - The only console message is the expected solo-multiplayer warning.

## Remaining ideas

- `game.json` `howToPlay` should mention free bonds, tens first and breaking a raft with a dash (coordinator).
- Race still has a 90 s clock and award titles. They could become team titles.
- A subtraction-style goal ("make 34 from 42") would give breaking rafts a second job.
- Real two-device multiplayer is still untested outside Node.

# Bumper Ducks: round 4 of the 8.5 pass, judgement in the place-value tier (2026-10-11)

Starting point: independent review 1 of round 3 scored 8.3. The reviewer found these problems:
- The HUD showed a false "35 = 30", and the ▶ button read "? = 36".
- Three instructions played back to back at a stage start.
- Grab-nearest play at L3 barely missed.
- L3–L5 trips were short (16–31 s).
- Breaking a raft was an optional trick.
- Free bonds gave no way to plan a new split.
- The L5 HUD was cluttered.
- Race had no learning in it.

## Design

- **Progress, never a false '='.** Below level 5, the jar shows how far it has come as a small filling bar with its number (`.jar-now`). There is no '=' and no second big number. At L5 the bar and the dashed next-raft place are gone, so the shelf and the ones frame are the only count. The ▶ picture is the target number, big, with no '?', '=' or trip dots.
- **One instruction at a time.**
  - After a goal or stage line the voice rests for 4 s (`hushFor`). Nope lines that fall in the rest are dropped.
  - The stuck-bubble line waits 7 s and retries only while the voice is quiet (`sayStuck`).
  - The regroup hint is no longer said at a stage start.
- **Grab-nearest bounces at every place-value level.** A raft or bubble the jar can't take now floats up near a child's duck, off to one side of where it is paddling (never in its path). A careful paddler glides past it, and a greedy one bumps it (`Sim.nearKid`).
- **Breaking a ten is needed.**
  - On crossing steps, only one or two new single bubbles float by. That is always fewer than the step needs. Extra singles fade at the step start; bubbles from a raft the child broke stay.
  - With no singles left, only three rafts float, with no churn (`Sim.scarce`, `onesLeft`, `dryOnes`).
  - The voice asks once, "Not enough ones. What can a ten become?". Only if the team is still stuck 14 s later does it say how: "Dash into a raft to break it into ten ones!".
  - Touching a raft without a dash now says "…Too many! Dash to break it into ones."
  - After 30 s with no singles, one more floats by every 6 s, so nobody is stuck for long. Waiting takes about 2.5× as long as breaking.
- **Longer trips for ages 6–8 (L4–5).** These trips now have a fourth step, a second crossing to the next ten or just past it: 25 → 37 → 41 → 50 ("Now 9 more. Make 50!").
  - After a crossing, the full bundle of ten singles becomes one raft token, so the next step starts from the regrouped jar (`setStage`).
  - Trips allow 4 steps and up to 9 tens.
- **Planning free bonds.** The frame shows a dashed line after the space where each way already made splits it: after the 6th and the 2nd for 6 + 2. A child can see where a new way must split.
- **Race reads tens and ones.** Each duck's results show "6 tens and 3 ones" beside its rafts-and-dots tally. The voice says once, "Your bubbles: 6 tens and 3 ones make 63!".

## Changes (under `examples/bumper-ducks/public/`)

- `js/config.js`:
  - `:117` `makeTrip`: `:152` the second crossing; the mid-step filter allows up to 8 tens.
  - `:235` `validGoal` takes up to 9 tens; `:242` `validTrip` takes 4 steps; `:250` a crossing may follow a crossing.
- `js/sim.js`:
  - `:103` bundle-to-raft compaction; `:114` `scarce`; `:130` `dryOnes`; `:140` `onesLeft`; `:253` `dryT`.
  - `:733` the dry pond holds rafts; `:749` the spawn mix; `:762` `nearKid`; `:791` a stuck single counts as scarce.
  - `setStage(s, authority)`: only the authority fades singles.
- `js/main.js`:
  - `:275` `hushFor`/`resting`; `:284` `scarceTalk`; `:302` `sayStuck` waits; `:264`, `:1452` stuck later.
  - `:1103` the dry raft nope; `:1279` nopes skip the rest.
  - `:1487` the progress bar (hidden at L5); `:1506` free-bond cuts; the L5 placeholder raft is removed.
  - `goalPicture` without '? ='; `:1882` and `:1885` Race tens words.
- `style.css` (end): `.jar-now` bar, `.cell.cut`, `.tens-words`, and the bigger `.next-pic` number without trip dots.

## Evidence

Scripts are in the scratchpad under `polish/bumper-ducks/`. `rv4.mjs` adds a `nobreak` autopilot, and the careful autopilot breaks a raft when the pond runs dry. `sync4.mjs` counts a regrouped bundle as one token. Logs and screenshots are in `r4/`. Speech is stubbed and the real input is driven.

- **Careful, portrait, from L0** (`cP.log`): L0 → L1 → L2 → L3 → L3 → L4 → L5 → L5.
  - Spoken lines per trip: 11, 12, 11, 10, 5, 9, 10.
  - L4–5 trips took 30–33 s of autopilot time, with 1–2 breaks each, against 14–31 s before. A child steers far slower than the autopilot.
- **Greedy (nearest of anything) at L3:**
  - 3 misses in 29 s, stepping back to L2 (`gL3.log`).
  - 15 misses in 97 s, stepping back to L2 (`gP3.log`).
  - Careful L3 trips had 0 misses in 14–16 s (`cP3b.log`). Round 3's greedy L3 had 1–2 misses and stayed.
- **Not breaking** (`nbL.log`, `nbP.log`):
  - "Not enough ones. What can a ten become?" played at 30.7 s, and the dash line followed at 42.1 s.
  - The second crossing took 84 s without breaking, against about 8 s with a break. The level stayed.
- **Voice at a stage start:** a single line, e.g. "Now 4 more. Make 41!", with nothing else queued. The stuck line came 3–7 s after the goal, e.g. "Tens first!…" at 12.9 s, then "One is stuck…" at 15.8 s.
- **Free bonds** (`c2L-r0-stage.png`, `c2P-r0-stage.png`): dashed cuts after 4 and 3 when 4 + 3 was already made. Careful runs made 3 new ways with 0 misses.
- **Screenshots:**
  - The HUD shows "38" over a "37" bar (`c4L-r0-stage.png`). At L5 it is the number, the rafts and the ones frame only (`cP-r6-mid.png`).
  - The ▶ button reads "▶ ▭• 45" (`cP-r5-results.png`). Race tens words show in `raceP-r0-results.png`.
  - Phones at 375×667 and 667×375 fit (`ph4-r0-stage.png`, `phL5-r0-stage.png`).
- **Node sync** (`sync4.mjs`): 36 trips across 3 arenas × 6 levels, with 20% of events dropped. Friends match after compaction and scarcity. There were 18 raft breaks. Lively ends at 90 s.
- **Standard checks:**
  - `menus2.mjs`: all 6 sizes pass.
  - `browser.mjs --ids bumper-ducks --run bumper-ducks-r4`: 0 errors.
  - `node --check` passes on every JS file.
  - The only console message is the expected solo-multiplayer warning.

## Remaining ideas

- A robot could demonstrate breaking a raft when a child stays stuck, instead of the timed trickle.
- A take-away step ("ten floated off: make 32 again") would give rafts a second job.
- `game.json` `howToPlay` should mention breaking a raft, the four-step trips and the planning lines (coordinator).
- Race is still timed and keeps its award titles.

# Bumper Ducks: round 1 of the 2026-10-11 checklist pass, frog order, a clock-free bumper play, and fairer levels (2026-10-11)

Starting point: the last independent review scored 8.6. Four audit items were still open:
- counting aloud past ten at L3;
- the frog-order arena;
- calming Race;
- Race's points economy and award titles.

The reviewer also found these problems:
- The stuck line fell between counted numbers.
- Careful children stalled at L3, and some were charged misses for distractors they never steered at.
- The ▶ L5 picture showed a '▭•' icon.
- The results said each count twice.
- Gift boxes appeared in Pond helpers.
- L0 had no real choice.

## Design

- **Frog order (the pond).** All three lily pads now have a frog, and each frog holds a number on a round sign. The wanted bubble rides on the pad of the frog with the biggest number. A child bumps the frogs from the smallest number to the biggest:
  - The right frog's sign turns soft green and plays a rising note.
  - The biggest frog, bumped last, lets the bubble go.
  - A frog bumped out of turn starts the line again, with a soft note. Once a round, if the voice is free, it says "Oops, back to the start. Smallest number first!"
  - Only a real bump counts: straight in faster than 4, or a dash. A brush on the way past does nothing. Robots never bump frogs into the line.
  - The numbers grow with the level. L0 uses 1–3, L1 up to 6 and L2 up to 10. Place value uses two-digit numbers with the same digits (14 / 41 / 42, 32 / 23 / 31), so the tens decide first.
  - The first three trips say once "The frogs are holding a bubble. Bump them in order, smallest number first!"
  - If nobody solves it, the frogs let go after 60 s. Bonks and dashes now carry an ordering decision.
- **Bumper play replaces Race. It has no clock, points, stars or titles.**
  - The round ends when the whole team has gathered five tens (50 bubbles). The HUD pill shows five rafts of two rows of five dots, filling in.
  - Each full ten is said once ("One ten!" … "Five tens make 50!").
  - Gone: the per-duck score pills, the 90 s timer, the last-15 s shower and banner, stars (3 points) and splash-out points (2).
  - The results show the team's rafts ("5 tens = 50"), then each duck's rafts and dots as tens words, in player order, with no award titles. The voice says once "Your bubbles: 1 ten and 7 ones make 17!"
  - Bubbles float in more slowly, so a round lasts about 50 s and each ten is heard about 11 s apart.
  - The menu button is "💥 Bumper play" with a raft picture. `data-mode="lively"` is unchanged.
- **L0 has a choice.** One ten is two rows of five, and each row wants its own colour ("Let's fill one ten: 5 blue and 5 pink!").
  - A bubble of another colour bobs away, and a row that is full takes no more.
  - The frame shows "5 and 5" as it fills. Counting aloud to ten stays, because counting is the lesson there.
  - The results say "5 blue and 5 pink make one ten!" and "5 + 5 = 10".
- **Counting aloud stays within ten.** Place value says a count only while it is 10 or less, so the first L3 trip says just "10".
- **No line between counted numbers.** `resting()` now also waits 2.2 s after a landing. While a count is said aloud (L0, or the first colour or bond trip), it waits 8 s. `sayStuck` retries up to 12 times.
- **Fairer levels.**
  - `AIM_HOLD` is now 0.3 s.
  - A trip with fewer than 8 careful catches is judged together with the trip before it at the same level.
  - One lone miss never blocks a climb: climbing needs a rate ≤ 0.2 or ≤ 1 miss, a rate < 0.34, ≥ 55 % chosen, ≥ 3 chosen, and steady catching.
  - A bubble that doesn't fit counts as a miss only if no fitting bubble lies further along the same line (`fitBeyond`).
  - `nearKid` never puts a distractor within about 35° of where the child is steering.
- **Smaller fixes.**
  - The ▶ L5 picture is the number alone.
  - Results rows say "Sailor helped … 21 🫧", with the count once and no highlighted row; the child's row is marked only by ⬅️.
  - Gift boxes spawn only in bumper play.
  - The pond's frogs hop for fun far less often, and never while holding a number.

## Changes (under `examples/bumper-ducks/`)

- `public/js/config.js`:
  - `:6` `PLAY_TENS`, which replaces `ROUND_TIME`/`PARTY_TIME`.
  - `:42` the third lily has a frog.
  - `:121` L0 `rows`; `:171` `goalSlots` rows; `validGoal` accepts rows.
  - `:269` `frogNumbers`.
- `public/js/sim.js`:
  - `:29` `FROG_FREE`; `:35` `AIM_HOLD` 0.3; `:82` `gathered`.
  - `:264` bumper play ends at five tens; `:497` a frog bump needs a real bump.
  - Splash-outs and stars score nothing; `:654` `fitBeyond`.
  - `:712` the slower spawn; `:728` gifts only in bumper play; `:788` `nearKid` avoids the steering line.
  - `stick` sets the frogs; `:834` `frogBump`; `free` and `applyEvent` handle the `frogs`/`frog` events; `:1068` `setFrogs`.
- `public/js/view.js`: `:382` `ObstacleView.sign` (canvas sprite) and rarer idle hops.
- `public/js/bot.js`: no party easing.
- `public/js/main.js`:
  - `:285` `countingAloud`/`resting`; `:312` `sayStuck` (the frog line).
  - `:565` the L5 ▶ picture; `:616` the bumper play voice.
  - `:1066` rolling adaptation; `:1332` frog events.
  - `:1420` `teamTally`, with the HUD tens said once.
  - `:1606` `renderRowsJar`, plus rows in `jarSpace`, `nopeWords`, `goalWords`, `madeWords`, `goalPicture` and the results.
  - `:1766` count ≤ 10.
  - `:1928` the bumper play results (`giveAwards`/`AWARDS` removed); the helper rows.
  - `:2047` frogs in `st` sync; `:2083` signs every frame.
- `public/style.css` (end): `.team-tally`/`.tr`, `#timer` as the team pill, `.team-sum`, and the compact menu picture.
- `game.json`: the tagline, `howToPlay` and `learning` now describe rows of five, frog order, breaking a raft and bumper play.

## Evidence

Scripts are in the scratchpad under `polish/bumper-ducks/`:
- `rv5.mjs` adds an arena argument, a frog-aware careful autopilot and logs frog bumps as `F1`/`F0`.
- `sync5.mjs` adds frog sync asserts and a bumper play end check.
- `menus5.mjs` checks the menus and bumper play.

Logs and screenshots are in `r5/`. Speech is stubbed, and real input is driven through `input.read`.

- **Careful, pond, portrait 834×1194** (`cP.log`): L0 → L1 → L2 → L3 → L4.
  - Every trip climbed after one trip: 0 misses, careful share 0.82–1.00.
  - L0 said "1 … 9, Ten!, 5 blue and 5 yellow make one ten!" with nothing in between.
  - The frog line came once in a quiet moment (after "Another way to make 6!"). A rerun after the 8 s rule (`cP2.log`) counted 1–10 and 1–6 with nothing in between. During those short counting trips the frog line waited, and the wrong-bump line says the rule instead.
  - Frog runs went F1 F1 F1, then the bubble was freed. The signs show 14 / 41 / 42 at L3 (`cP-r3-stage.png`) and 1 / 2 / 3 at L0 (`c0P-r0-mid.png`).
- **Careful, bath, landscape 1194×834, from L3** (`c3L.log`):
  - L3 → L4 after one 21 s trip; that trip said only "10" aloud (the old run said "10…16").
  - L4 → L5 with 3 misses against 18 chosen (rate 0.17), then L5 stays.
- **Greedy (nearest of anything), pond, from L3** (`g3P.log`): L3 → L2 → L1 → L0, with rates 2.25, 0.73 and 0.75. Careful and random play still part clearly.
- **Bumper play:**
  - Landscape puddle (`lvL.log`): 48 s. "One ten!" at 10.9 s, then 21.5, 33.8, 44.7, "Five tens make 50!" at 55.7, and "Your bubbles: 1 ten and 7 ones make 17!". HUD: `lvL-r0-mid.png`; results: `lvL-r0-results.png`, `race-results-834x1194.png`.
  - Portrait pond (`lvP.log`): 49 s.
- **Node sync** (`sync5.mjs`): 36 trips across 3 arenas × 6 levels, with 20 % of events dropped.
  - The friend matches jar, stage, stuck state and frogs (280 frog checks).
  - Bumper play ends when 50 are gathered, with no stars.
- **Menus** (`menus5.mjs`): all 6 sizes (834×1194, 1194×834, 375×667, 667×375, 568×320, 320×568). Every button is ≥ 44 px and uncovered, and nothing overflows the bumper play button.
- **Standard checks:**
  - `browser.mjs --ids bumper-ducks --run bumper-ducks-c1`: BOOT + PLAY, 0 errors.
  - `node --check` passes on every JS file.
  - The only console message is the expected solo-multiplayer warning. GL out-of-memory warnings appeared only when four Chromium instances ran at once; a solo rerun was clean.

## Checklist status

- Count aloud only within the first ten: **closed.** `main.js:1766`: place value counts only ≤ 10; colours stop at 5; L0 counts to ten as the lesson.
- Bonks and dashes free stuck bubbles, plus the frog-order arena: **closed.** The pond is the frog-order arena (`sim.js:834`, `config.js:269`).
- Calm Race: **closed by redesign.** Bumper play has no clock, no shower or banner, no points or titles, and one team goal shown as tens.
- Leftover score and medal economies: **closed.** Stars and splash-outs score nothing; awards are removed. What is left is a bubble count shown as tens and ones, the thing being taught.

## Remaining ideas

- A take-away step at L5 ("a ten floated off: make 62 again") would give rafts a second job.
- L1 could mix in "more pink than blue" comparisons.
- Real two-device multiplayer is still untested outside Node.

# Bumper Ducks: round 2 of the 2026-10-11 checklist pass, one goal in bumper play and a real choice in it (2026-10-11)

Review 1 scored 8.4. Bumper play still had the old counting-mission chip, which ran a second count beside the team tally. Its results compared each duck's total, and the robots usually won. A 3-2-1-GO count-in with beeps still opened every round. This pass removes all three. It gives bumper play one place-value decision, gives L1 a comparison step, and fixes the bond and frog-sign bugs.

## Design

- **Bumper play has one goal: make exactly 50.**
  - The mission chip and its count are gone. The team tally (five rafts of ten dots) is the only count on screen, and the per-duck HUD tallies are hidden.
  - **Ten rafts float by beside single bubbles.** A raft is ten at once, so a child who chooses rafts gets there faster.
  - **Past 40 a raft is too many.** At 43 a raft would make 53, so it bobs away, and only ones (or a raft broken into ten ones with a dash) finish. At exactly 40 a raft still fits.
  - Careful play and random play now differ. A careful child takes rafts early and ones late. A random paddler bumps rafts in the last ten: a greedy run logged 2–13 raft bounces at 44–49.
  - **The voice has one line per moment:**
    - At the start: "Each raft is ten bubbles!"
    - The first raft a child takes: "12 and one ten make 22!" This line covers the ten it crosses, so the tally stays quiet.
    - "One ten!" / "Three tens!", and nothing past 40.
    - Once, after 40 and a pause: "46! Will a raft still fit?"
    - On a raft bounce: once "A raft is ten. We need just 6 more!", then at least 10 s later "Dash into a raft to break it into ten ones!"
    - At the end: "Five tens make 50!"
  - **The robots never take rafts.** A robot that gets 4 ahead of the best child stops gathering and plays. In the last ten the robots leave the ones to the children. Both rules lift if no child has gathered a bubble for 20 s, so nobody is stuck.
  - **Results** show the team's five full rafts ("5 tens = 50"). Below them is one row per duck: "Sailor helped" for the robots, and "You: 3 tens and 2 ones" with its rafts and dots for the child. No robot totals are shown. The voice says the child's own sum once.
- **No count-in.** After the round syncs, there is one soft splash sound and a 💦, your own duck hops, and play begins. `audio.beep` is removed.
- **Bond line:** the landing that completes a fixed bond no longer says "6 pink!". The bond's whole sentence ("6 pink and 4 green make 10!") is said once, either mid-trip or on the results.
- **Frog signs** show only while playing (`game.state === 'play'`), so the results show only the answer's numbers.
- **L1 gains a comparison step.**
  - The trip is n of one colour, n of another, then "Now one more yellow than pink!". The number isn't said.
  - The jar shows the previous colour as a row of dots beside the new frame, so the child sees "5 and one more".
  - The results say "6 is one more than 5!".

## Changes (under `examples/bumper-ducks/`)

- `public/js/main.js`:
  - Removed: `createAdventure`, `MISSIONS`, `useMission`, the `mission` setup field, `adventure.enable`/`begin`/`event` and `window.__adventure`.
  - `:243`: the bumper play start line. `:586`: the menu line ("make 50 together: five tens, not one more").
  - `:937`: one splash instead of the count-in.
  - `:1173`: a raft caught in bumper play. `:1282`: raft bounces in bumper play.
  - `:1418-1437`: the tens lines and the near-50 question.
  - `:1558`: the L1 comparison row.
  - `:1751`: the bond's done-landing line is skipped.
  - `:1901`: the L1 results sentence.
  - `:1927`: the bumper play results.
  - `:2017`: the robot rules for bumper play.
  - `:2094`: frog signs only during play.
- `public/js/sim.js`:
  - `:92` `left`, `:96` `playFits`.
  - `:566`: in bumper play, a raft that doesn't fit bobs away or splits on a dash.
  - `:602`: a raft adds 10 (`e.from`). `:699`: splitting in bumper play. `:757`: the raft spawner (at most 1, or 2 in the last ten).
  - Robots never touch rafts, nor bubbles while leaving.
- `public/js/bot.js:33`: `leave` in bumper play. `:136`: robots skip rafts.
- `public/js/config.js:126-135`: the L1 trip with `more: 1`. `:241` `validGoal`; `:261` `validTrip` checks "one more than".
- `public/js/audio.js`: `beep` removed.
- `public/index.html`: the `adventure.css` link removed.
- `public/style.css` (end): `#scores` hidden, the results helper tally and `.jar-compare`.
- `game.json`: `howToPlay` and `learning` describe exactly-50 with rafts and "one more than".

## Evidence

Scripts are in the scratchpad under `polish/bumper-ducks/`: `rv6.mjs`, `sync6.mjs` and `menus6.mjs`. Logs and screenshots are in `r6/`. Speech is stubbed, and real input goes through `input.read`.

- **Bumper play, careful, portrait pond** (`lvP`): 28 s. The child had 32 and the robots 7, 7 and 4. The voice said "Each raft is ten bubbles! | One ten! | 12 and one ten make 22! | Three tens! | Four tens! | …" (since merged, see the next bullet). `gvP-r0-mid.png` shows 46 on the tally with two rafts floating. `lvP-r0-results.png` shows the results.
- **Bumper play, greedy, portrait pond** (`gvP`, 2 rounds), after the line-spacing fix: "41! Will a raft still fit?" came 1.2 s after "Four tens!" before the fix and 4.5 s after it in the later bath run. Raft bounces came at 44 and at 47–49. The two nope lines are now at least 10 s apart.
- **Greedy, landscape bath** (`gvL`): "Each raft is ten bubbles! | One ten! | 11 and one ten make 21! | Three tens! | 42! Will a raft still fit? | Five tens make 50! | Your bubbles: 3 tens and 3 ones make 33!". Results: `race-results-1194x834.png`.
- **Careful, landscape puddle** (`cvL`): 35 s, child 34.
- **L2 bond, pond portrait** (`c2P`): "… 2 yellow! | 4 pink | 5 pink and 2 yellow make 7!", with no "5 pink!" before the bond line.
- **L5, pond portrait** (`c5P-r0-results.png`): no frog signs over the results.
- **L1** (`c1L` landscape bath, `c1P` portrait pond): "Now one more blue than yellow! | 1 … 5 | 6 blue! | We found 6 pink, 5 yellow and 6 blue bubbles! 6 is one more than 5!". `c1P-r0-stage2.png` shows the comparison row.
- **Node sync** (`sync6.mjs`): 36 calm trips (3 arenas × 6 levels × 2) with a friend copy matching, and the L1 trips survive `validTrip`. Six bumper play runs with one child and two robots, careful and wandering: every run ended on exactly 50; only the child ever took a raft; every raft was taken at ≤ 40; and 0–33 raft bounces were logged.
- **Menus** (`menus6.mjs`): all 6 sizes. Every button is ≥ 44 px and uncovered, and no mission chip appears on the menu or in play.
- **Standard checks:**
  - `browser.mjs --ids bumper-ducks --run bumper-ducks-c2`: BOOT + PLAY, 0 errors.
  - `node --check` passes on every edited JS file.
  - The only console message is the expected solo-multiplayer warning.

## Checklist status

- Visible "next goal ▶" with the mission chip removed: **closed.** The ▶ stays, and the chip, `MISSIONS` and its duplicate count are gone from bumper play.
- Leftover score and medal economies: **closed.**
  - The bumper play results show only the team total and the child's own sum; robots get a "helped" note.
  - The per-duck HUD tallies are hidden.
  - No ⭐ or reward banner remains.
- Race-mode hooks: **closed.** The 3-2-1-GO count-in and its beeps are replaced by one soft splash.
- Bugs: the bond double line and the frog signs on results are **fixed**.
- Improvement 3 (a decision in bumper play): **done** with exactly-50, rafts and the last ten.
- Improvement 7 (L1): **done** with the "one more than" step.

## Remaining ideas

- The L5 take-away step ("a ten floated off: make 62 again") is still open. The jar only adds today (`validTrip` requires carried steps to add), so taking away needs a jar that can lose a raft on every device. It was left for a later pass rather than done halfway.
- Bumper play doesn't adapt yet. A 6–8 tier could make 70 or 100, or ask for "exactly 47".

# Bumper Ducks: round 3 of the 2026-10-11 checklist pass, a growing bumper play goal, fairer levels and a reliable stuck line (2026-10-11)

The reviews scored 8.6 and 8.2. The one open checklist item was the per-duck numbers in the Pond helpers results ("Rosie helped 27 🫧 / Cool helped 1 🫧"). The bugs were these: the stuck-bubble line was rarely said; bumper play lines piled up; a step change counted as a miss; random play climbed at place value; a hint fell between counted numbers; and L4–L5 trips ended alike. Both reviewers also asked for an adaptive bumper play.

## Design

- **The Pond helpers results show no per-duck numbers** (closes the checklist item). Each row says "You helped" or "Sailor helped" with a 🫧 (or "cheered the team on" 💛). The jar above is the only count.
- **The stuck-bubble and frog lines are now said reliably.**
  - The line follows the goal (or stage) line after 0.4 s, before any catch, so it never has to wait for a count.
  - Otherwise it retries every 1.5 s until the bubble is free. Only the newest goal's line keeps retrying (`stuckRun`).
  - Catches hold it back only while the jar counts aloud. Then it waits for a 5 s pause with no bubble landing, in flight, or about to be caught (`catchSoon`).
  - Root cause found: the stuck bubble was often a colour the jar didn't want (`bubbleColour` favoured "others" once two wanted ones floated). The voice then skipped it, and bumping it free was pointless. It is now always a wanted colour (`Sim.wantedColour`).
- **No line between counted numbers.** Nope hints now wait on `resting()` like other lines. `resting()` adds `catchSoon()`, so a child about to catch while the jar counts aloud holds the line back.
- **Bumper play speaks one line at a time** (`playSay`/`playVoice`), with 2 s between lines.
  - A newer tens line replaces one still waiting.
  - Lines that are functions are read when spoken, so a number is never stale.
  - "One ten is ten ones!" is dropped if the goal is already reached. The end line clears the queue, so it is heard alone.
  - The raft-bounce answer ("A raft is ten. We need just 6 more!") cancels the "Will a raft still fit?" question.
- **Bumper play adapts (the 6–8 tier).**
  - The goal is 50, then 70, then a number with ones (32–68, never a whole ten). For 47 that means four rafts, then seven single bubbles, because a fifth raft is too many.
  - It starts at 70 for a child at Together L4+. After each round, the host climbs when the child took ≥ 2 rafts and bounced at most one raft. It steps back after 3 or more different rafts bounced (`adaptPlay`).
  - The HUD and results tally end on a short dashed frame of just the ones.
  - The menu button shows the goal number. The voice says "make 47 together: 4 tens and 7 ones, not one more". Again shows "▶ 70", and a new goal is said at the start ("Let's make 70 together!").
  - The robots keep to about a third of the bubbles (`botHelps*2 > kidHelps+6`) and leave the last 11. Careful play now ends faster than wandering play, and a raft can't stop fitting because a robot took a bubble at 40.
- **Fairer place-value levels.**
  - A dash into a bubble that doesn't fit is a miss (`Sim.missed`).
  - Place value needs a 0.45 s aim (`AIM_HOLD_PLACE`).
  - A raft broken by a random dash gives no "chosen" catches (`meant`). This was the main hole: a random dasher's split bubbles all counted as careful.
  - For 1.5 s after a new step, or 4 s when the aim began before the step, a bubble that no longer fits is not a miss (`inGrace`).
- **Varied place-value trips.**
  - The first crossing goes 1–4 over the ten.
  - The last step is either the next ten (+6…+12) or a raft and then ones over another ten (+16…+22, e.g. 44 → 62). `validTrip` accepts a +2-tens crossing only after a crossing.
  - L3's last step is 3–5 more ("Now 3 more. Make 29!"), never 1.
- **Clearer HUD.**
  - Place value's goal reads "make" above a gold number, so it doesn't read like the white progress number on the bar.
  - On tablets the jar is drawn larger for L0–L2 (`body.young-jar`, `--cell` 46 px).
  - Frog signs are smaller (1.2) and frog green with a white number; a frog already in line turns pale.
- **Results read the three ways aloud:** "3 and 5. 4 and 4. 2 and 6. Three ways to make 8!"
- **Calmer bumper visuals.**
  - Your duck's ring no longer pulses.
  - The shield shrinks smoothly instead of blinking at 20 rad/s.
  - Speedy ducks no longer leave a sparkle trail.
- `game.json`: category `animals` (Race is gone); `howToPlay` and `learning` describe the growing goal and crossing a ten.

## Changes (under `examples/bumper-ducks/`)

- `public/js/config.js`:
  - `:5-19` `PLAY_GOAL`, `PLAY_TIERS`, `validPlayGoal`, `makePlayGoal`.
  - `:165-185` the L3 last step and the varied crossings.
  - `validTrip` allows a +2-tens crossing after a crossing.
- `public/js/sim.js`:
  - `:31-45` `AIM_HOLD_PLACE`, `STAGE_GRACE`.
  - `:49` `playGoal`; `:104` `left`; `:122` `stageAt`.
  - `:231-250` `chose` (`meant`), `inGrace`, `missed`.
  - `:702` `stats.bumps` (logged only).
  - `:741` deliberate splits.
  - `:897-900` and `:975-986` the stuck bubble is a wanted colour.
- `public/js/main.js`:
  - `:184` `newPlayGoal`.
  - `:249-290` `sayGoal`, `playSay`, `playVoice`.
  - `:299-318` `midCount`, `resting`, `catchSoon`.
  - `:341` `sayStuck`.
  - `:1122` the climb rule, with `lastJudge` for logs.
  - `:1142` the bumper play end.
  - `:1158` `adaptPlay`.
  - `:1414` the nope hint waits on `resting()`.
  - Raft, split and bounce lines go through `playSay`.
  - `updateHud`: tens lines and the near question; `teamTally(n, goal)`.
  - `:1673` the "make" label.
  - `:975` `young-jar`.
  - `:1996` the helper rows; `:2023` the ways read aloud.
  - `:2152` the robot share.
  - `renderModes` shows the goal, and the lobby re-renders it.
- `public/js/view.js`: `:236-246` steady ring and shield; speedy sparkles removed; `:383-412` frog sign.
- `public/style.css` (end): `.tr.ones`, `.goal-n`, `.jar-num.make`, `body.young-jar`.
- `game.json`: category, `howToPlay`, `learning`.

## Evidence

Scripts are in the scratchpad under `polish/bumper-ducks/`:
- `rv7.mjs` adds a `random` style (the reviewer's: random bursts with 30 % dashes), `FRESH` and `TIER` env vars, and judge logging.
- `sync7.mjs` and `menus7.mjs` are the Node and menu checks.

Logs and screenshots are in `r7/`. Speech is stubbed.

- **Careful, pond, portrait** (`cP`, 7 trips): L0 → L0 → L1 → L2 → L3 → L4 → L5 → L5, with 0 misses at every level.
  - The frog line came right after the goal at 7.0 s, and at trip 2 within 2 s of "Now 3 yellow!". The first L0 trip stayed at L0 because frog bumping left 3 of 7 chosen.
  - Results: "3 and 5. 4 and 4. 2 and 6. Three ways to make 8!" and "4 is one more than 3!".
- **Careful, bath, landscape, L0–L3** (`c0L2`): "One is stuck on Mama Duck. Bump it free!" came at 7.9 s, before "1". L0 → L1 → L2 → L3. `c0L2-r0-mid.png` shows the larger jar (about 270×128 px at 1194×834).
- **Careful, from L3 pond** (`c3P`): L3 → L4 → L5, 0 misses, endings 26 → 29 (+3) and 44 → 62 (+18).
- **Random (the reviewer's style):**
  - `x4P2`: L4 → L3 (rate 3.5, careful 0.10) → L2 (careful 0.00).
  - `x5L`: L5 → L4 (careful 0.35) → L3 (careful 0.14).
  - Before the `meant` fix, `x4P` r1 had climbed with 20 "chosen" catches, mostly from a random split.
- **Bumper play, careful, pond portrait** (`lvP`):
  - 50 → 70 → 33.
  - Lines came at least 2 s apart: "Each raft is ten bubbles! | One ten! | 10 and one ten make 20! | Three tens! | Four tens! | …".
  - Round 2: "Let's make 70 together! …"; the end line was "3 tens and 3 ones make 33!".
  - The robots gathered 15 of 50 and 17 of 70.
  - `lvP-r1-results.png` shows "70 together!" and "▶ 33".
- **Bumper play, greedy, bath landscape** (`gvL`): tier 2 (34) had 40 raft bounces and stepped back to 70; a lucky 70 round climbed again. Tier 2 careful puddle (`lvL`): goal 54, HUD `lvL-r0-mid.png` (five rafts and a 4-cell dashed frame).
- **Node** (`sync7.mjs`):
  - 6000 L3–L5 trips all pass `validTrip`. L3's last step is always 3–5 more. L4/L5 last steps spread over +6…+22 (14 sizes).
  - 36 calm trips with a friend copy still match (jar, stage, stuck state, frogs).
  - 9 bumper play rounds at 50, 70 and tier-2 goals end exactly on the goal, and only children take rafts, only while 10 or more are wanted.
- **Menus** (`menus7.mjs`): all 6 sizes. Every button is ≥ 44 px and uncovered, nothing overflows the bumper play button, and the fast-forwarded results show the goal (`r7/menuL-*.png`, `race-results-*.png`).
- **Standard checks:**
  - `browser.mjs --ids bumper-ducks --run bumper-ducks-c3`: BOOT + PLAY, 0 errors.
  - `node --check` passes on `main.js`, `sim.js`, `config.js`, `view.js` and `bot.js`.
  - The only console message is the expected solo-multiplayer warning.

## Checklist status

- Leftover score and medal economies: **closed.** No per-duck numbers remain in either mode's results; only the child's own sum (as tens and ones) in bumper play.
- Every earlier item stays closed (count aloud within ten, bonks and frog order, calm bumper play, no count-in, visible next goal).
- Review bugs: all **fixed**:
  - the stuck line
  - bumper line pile-ups
  - the step-change miss
  - the random climb
  - the hint between counts
  - repeated L4–L5 endings
  - the category
- Improvements done:
  - adaptive bumper play (both reviewers)
  - the voice gap
  - the grace window
  - the tablet jar
  - "make 28"
  - the ways read aloud
  - frog signs
  - calmer power visuals

## Remaining ideas

- The L5 take-away step is still open (the jar only adds).
- Bumper play's ▶ on the menu only shows the goal; a parent can't step tiers by hand yet.
- Real two-device multiplayer is still untested outside Node.

# Bumper Ducks: round 4 of the 2026-10-11 checklist pass, a real raft-or-single choice in bumper play, unbroken tens and a longer L3 (2026-10-11)

Review round 3 scored 8.4. No checklist items were open. This pass fixes the four bugs and seven of the eight ranked improvements. The eighth, removing the dead adventure files, needs the coordinator (see the last section).

## Design

- **Bumper play steps up on the choice it teaches.** The old rule (2 rafts, at most 1 bounce) let random dragging climb.
  - The host now reads three per-child counts from the sim:
    - `rafts`: rafts the child steered at while a ten still fitted.
    - `lastOnes`: single bubbles caught in the last stretch.
    - `wise`: last-stretch singles the child steered at while a raft floated within 7.5 units, plus ones from a raft they meant to break.
  - Step up: `rafts >= 2`, `wise >= 3`, `wise >= half of lastOnes` and at most 1 bounce.
  - Step back: 3 or more bounces, or 5 or more last ones with at most 20 % chosen.
  - Bumper play now runs `aimAll` too.
  - In the last stretch a raft floats up near the child, off to one side and never in their path, so the choice is always there. The first one arrives within about a second.
- **Fairer "chosen" for quick, sure catches.** A catch also counts as chosen when the duck pointed within about 11° of the bubble for 0.2 s (`aim.tight`). Bubbles from a raft the child broke by a random dash never count as chosen, so a random split's ring can't be swept up as careful catches.
- **Counting by tens never skips.** The tens line is a function read when it is said. It says every ten from the last one spoken to the newest: "Three tens, four tens!". The raft line ("23 and one ten make 33!") and the "Will a raft still fit?" question queue behind tens still waiting instead of deleting them.
- **The stuck line is said with its goal or not at all.** If it can't be said within 8 s of the goal line, it is dropped. The picture and the 40 s self-free cover it.
- **L3 trips have four steps.** After "Now 3 more. Make 29!" comes "Now 20 more. Make 49!" or "Now 21 more. Make 59!", which needs two rafts and maybe a single. The ones stay within 9, with no crossing. The careful autopilot now takes 21–27 s (was 15–18 s), so a real child takes about a minute.
- **Quieter labels.** "quack!", "whee!" and "ribbit!" are small and lower-case, like "bonk!".
- **Portrait framing.** Once the pond fits the width, the camera centres it in the space between the top bar (or the jar) and the bottom edge, so it no longer sits high above the empty floor.
- **No per-child tally.** The results line "You: 3 tens and 7 ones", its tally and the spoken "Your bubbles: … make 37!" are gone. Every duck gets the same "helped" note, and the team's tens and ones stay on top.

## Changes (under `examples/bumper-ducks/public/js/`)

- `sim.js`:
  - `:22` new stats `rafts`, `lastOnes`, `wise`.
  - `:39-48` `AIM_TIGHT`, `AIM_TIGHT_HOLD`, `RAFT_REACH`.
  - `:211-239` `aimAll` covers bumper play's bubbles and rafts and records `aim.tight`.
  - `:242-250` `chose`: tight-aim leniency, the surer 0.45 s hold in bumper play, and accidental splits never count.
  - `:315` `aimAll` runs in both modes.
  - `:640-660` the last-stretch single and raft choice counts.
  - `:825-836` last-stretch rafts float near the child, and the first comes soon.
- `main.js`:
  - `:101-118` portrait centring in `frameCamera`.
  - `:259`, `:362-372` `STUCK_SAY_WITHIN` and the deadline in `sayStuck`.
  - `:1184` `adaptPlay` on the choice counts (`game.lastPlay` logs them).
  - `:1310-1320` the raft line keeps the tens order.
  - `:1358-1377` small labels.
  - `:1557` `tensLine`; `:1601` tens queue; `:1606` near line no longer drops tens.
  - `renderResults`: equal helper notes, own tally and line removed.
  - `game.playRafts` removed.
- `config.js` `:166-175`: the L3 fourth step. `validTrip` already allows four steps, and 5000 generated L3 trips all pass with ones ≤ 9 (55 distinct trips).

## Evidence

Scripts are in the scratchpad under `polish/bumper-ducks/`. `rv8.mjs` also logs bumper play's `W` (wise) catches. Logs and screenshots are in `r8/`, with speech stubbed.

- **Bumper play, careful, landscape** (`lvL`):
  - 50 → 70 → 66 → 42.
  - Choice counts: rafts 2/2/2, wise 6/9, 5/9, 5/9, bounces 1/1/0.
  - Voice: "One ten! | 11 and one ten make 21! | Three tens! | Four tens! | 44! Will a raft still fit?" and, at 66, "One ten! | 10 and one ten make 20! | Three tens, four tens! | Five tens! | 57! …". No ten is skipped.
- **Bumper play, random drag with dashes, portrait** (`xvP`, `xvP2`): 8 rounds, never climbed.
  - Rafts chosen: 0–1. Wise: 0–2.
  - Two rounds stepped back (clamped at 50).
  - A random split's ring no longer counts (before that fix, one round had wise 6 of 9).
- **Pond helpers:**
  - Careful from L3 (`c3P`): L3 → L4 → L5, with L3 careful 0.70 and 0 misses. The trip was 14 → 26 → 29 → 49.
  - Careful from L2 (`c2L`): L2 → L3 → L4. The L3 trip was 16 → 26 → 29 → 49 with careful 1.00, 0 misses, 27 s.
  - Stuck line: "One is stuck on Mama Duck. Bump it free!" at 6.6 s, before the first count.
- **Random:**
  - From L3 (`x3L`): L3 → L2 (careful 0.13) → L1 (careful 0.26).
  - From L4 (`x4P`): stayed L4 (careful 0.50).
- **Screens:**
  - `xvP-r0-mid.png` and `c3P-r0-mid.png` (834×1194): the pond is centred, with only a thin strip of floor below.
  - `lvL-r1-results.png`: "70 together!", 7 tens = 70, and four equal "helped" rows.
- **Standard checks:**
  - `browser.mjs --ids bumper-ducks --run bumper-ducks-c4`: BOOT + PLAY, 0 errors.
  - `node --check` passes on `sim.js`, `main.js` and `config.js`.
  - The only console message in every run is the expected solo-multiplayer warning.

## Checklist status

- Audit checklist: nothing was open, and every earlier item stays closed.
- Review bugs, all **fixed**:
  - skipped tens
  - random climb in bumper play
  - noisy L3 judging
  - late stuck line
- Improvements 1–6 and 8 are **done**.
- Improvement 7 (the dead `adventure.js` and `adventure.css`) is **handed to the coordinator**. `package-originals.mjs` copies them into every game, so deleting them here would be undone by the next build.

## Remaining ideas

- The L5 take-away step is still open.
- A parent still can't step bumper play tiers by hand.
- Real two-device multiplayer is still untested outside Node.
