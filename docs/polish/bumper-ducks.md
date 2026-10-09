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
