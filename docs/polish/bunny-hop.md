# Bunny Hop: Phase 1 calm pass (2026-10-09)

Bunny Hop was already the calmest of the three: one tap, no failure, a journey through four places to Pip's burrow. This pass removes the remaining praise spam, the graded stars, best-score chasing and the continuous confetti. It also caps the speed ramp and fixes the missing way home.

## What changed and why

All paths are under `examples/bunny-hop/public/`.

**Bug: no way back to the menu**
- `index.html:36` adds a 🏠 button. It sits beside the sound button (`style.css:64`) and the HUD score moves to make room (`:57`). It shows in play, at the burrow and on results.
- `js/main.js:208,390` adds the button handler and an `Escape` shortcut, both routing to `toMenu()`.
- `toMenu()` (`js/main.js:211-226`) now also:
  - stops the music and clears the banner
  - resets the biome and weather, so there is no snow on the meadow menu
  - snaps the camera to Pip's close-up (`:223`). Without this the camera panned back across the whole 850-unit trip, and the menu briefly showed empty land with no Pip (seen in testing).
- The adventure helper already hushes mission speech on `#home` clicks.

**Bug: dark foreground flower on the menu**
- `js/world.js:181`: near-layer scenery is no longer placed within 5 units of the start. A flower right in front of the menu camera rendered as a big dark blur behind the mission chip and the Play button. The gap at the start of a trip is not noticeable in play.

**Pacing**
- `js/course.js:50`: `speedAt()` is a constant 6.6 instead of ramping from 6.2 to 9.4 by the snow. The trip takes about 2 minutes.

**Feedback**
- The streak counter above Pip stays: it counts a row of carrots 1, 2, 3 in one spot (`js/main.js:435`). It is a counting helper, now shown as a plain number without "+".
- Removed:
  - the "+5" golden popup
  - the random "Yum!/Crunch!" combo words
  - the 45%-chance "Nice hop!/Wheee!/Super!" praise and its sound on clearing a log (`:447`)
- The gentle "Boing!/Whoopsie!" on a bump stays, because it explains what happened.
- The munch note walks the scale with the row of carrots instead of climbing with a combo.

**Results** (`js/main.js:317`, `index.html:56-62`)
- The graded 1–3 stars, "🏆 New best!" pill and best line are gone, and the menu's best pill is removed. The best score is no longer stored.
- Results now say what Pip found: "Pip found N carrots and M golden ones on the way home." The golden carrots also appear as small icons. `game.golden` is counted at `:424`.

**Celebrations**
- At the burrow (`js/main.js:313`), the 90-piece confetti burst is now 16 soft petals. The confetti that kept bursting about 3 times a second on the results screen is removed.
- A finished mission (`js/main.js:142`) now shows what the child made ("↑ ↑ ↻ Pattern!" / "↑ ↑ ↑ ↑ Four hops!") with one `sound.chord()` and 10 soft petals. It used to be "⭐ … ⭐" and 35 confetti. `confettiBurst(…, soft)` is at `js/effects.js:132`.
- The bump shake drops from 0.35 to 0.15 (`js/main.js:440`). It is a real collision, so it keeps a small nudge.

**Audio** (`js/audio.js`)
- `fanfare()` (`:137`) for a new place is now a slow triangle arpeggio, with no square wave.
- `finish()` (`:142`) is shorter and softer.
- A new `chord()` (`:149`) plays for missions.
- The unused `nice()` was removed.
- The 116 bpm generative music was already gentle and is unchanged.

**CSS** (`style.css`)
- Removed the infinite logo bob, Play-button pulse, star pop and new-best pop.
- The tap-hint nudge is slower and smaller (2 s, 6 px) and stops once the hint fades.
- The loading hopper is slowed to 1.6 s. Banners and popups fade with no overshoot.
- Added a `prefers-reduced-motion` block (`:153`).

## Verification

- `browser.mjs --run calm` (Chromium, both orientations): 0 errors. The new 🏠 button passes the 44 px touch-target and centre-touch checks.
- `original-quality.mjs`: mission persistence passes. `node --test examples/_studio/tests/*.test.mjs` fails only on the stale `public/bitgames.json` manifest, which the coordinator rebuilds.
- Played full trips to the burrow with an auto-hopper (`?biome=3` in portrait and landscape, `?biome=1` in landscape). After each one:
  - pressed 🏠 on results and confirmed the state returned to `menu`, with Pip in a close-up and no stray snow
  - started a new trip and pressed 🏠 mid-trip, again landing on `menu`
- There were no console errors.
- Before screenshots: `…/scratchpad/audit/bunny-hop/`. After screenshots: `…/scratchpad/audit/after/bunny-hop-*.png`, under `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/183efacb-62c2-4cf6-9680-a97f4bb0fb5f/`.

## Remaining Phase 2 work (from AUDIT_2026-10-09)

- Carrot rows of a stated, spoken number.
- Rhythmic obstacle patterns to predict (log-log-rock), with a pattern stretch per biome.
- An optional 🐢 slower pace for 2–3 year olds.
- A per-biome collection to sort in the burrow "pantry", such as autumn leaves by colour or snowflakes by shape.

# Phase 2: counting and patterns in the course itself (2026-10-09)

## Design

The trip is no longer random patterns. `Course.plan()` lays out each of the four places as a small story: **a counted carrot row → an obstacle rhythm → a golden carrot to flip for → a second, equal-or-bigger row**. Everything is pictured at Pip's feet and spoken (speechSynthesis, respecting mute).

- **Counted rows.** As a row comes into view a tray appears at the bottom: the numeral and that many greyed carrot places, in rows of five like a ten-frame. The voice says "3 carrots!". Each carrot Pip munches fills a place, floats its number above Pip and is said aloud ("1", "2"), and the last one says "3 carrots!". Row carrots always fly to Pip, even mid-hop, so the count is always true. Sizes grow by place: meadow 2–3, grove 3–5, autumn 4–7, snow 6–10. Carrots are spaced 4.4 units apart (about 0.67 s at full pace) so there is time to say each number.
- **Obstacle rhythms.** All obstacles now come in a repeating pattern from that place's set: meadow log–rock; grove toadstool–toadstool–stump or toadstool–stump–stump; autumn pumpkin–log–stump or pumpkin–pumpkin–log; snow snowman–rock–rock or snowman–snowman–rock. Each unit is played three times, evenly spaced (8 units apart), so hopping makes a steady beat.
  - Each obstacle type has its own soft bell note (log C, pumpkin D, stump E, rock G, toadstool A, snowman high C). The note sounds as Pip passes the obstacle, whether cleared or bumped, so the pattern is heard as a tune.
  - Before the rhythm, its unit is played once and named aloud ("log, rock.").
  - A picture strip shows every obstacle of the rhythm, with a gap between repeats, and lights them up as Pip passes them. The pictures are rendered once at load from the real models in that place's colours, so they match the path.
- **What comes next?** In the third repeat one obstacle is hidden behind a floating "?" bubble on the path, and "?" in the strip. Pip slows to a stop a few steps before it and turns to the child. A sky panel asks "What comes next?" with a rising two-note question. It offers one big picture button for each kind in the pattern. Any answer is fine: the obstacle appears, its note rings, and Pip says "Yes! A rock comes next." or "Look, a rock! Log, rock." Then Pip carries on. There is no timer, and taps elsewhere don't skip it. Keyboard: 1–3, ←/→ and Space/Enter. Once per place, four per trip.
- **🐢 pace.** The menu has a pictured 🐇/🐢 switch beside the mission chip, remembered in `localStorage` (`bunny-hop:gentle`). The 🐢 pace is 0.6, the same pace the missions use. A mission's pace and the 🐢 pace never stack: the gentler one wins. The shared helper is unchanged. All spacing is by distance, so the slow pace gives more time for every cue, count and hop.
- **Burrow pantry.** The results show each row Pip brought home as its own crate of carrots (in fives), joined by "+", and "= 38 🥕". The voice says "2, 3, 3, 5, 6, 6, 6 and 7 make 38 carrots in the pantry!", then "And you hopped 4 patterns!". Below the pantry are small picture strips of the patterns hopped.
- **Missions** still work as before. "Hop, hop, flip" uses the same picture-step language as the rhythm strip. Hops are ignored only while the "What comes next?" panel is open. The "Gentle hop counting" mission's emoji changed from 🐢 to 🔢, so the 🐢 means only the pace.
- **Kept:** the four places, the 🏠 button and Escape, a constant gentle pace, soft bumps, golden carrots and the poke-able scenery.

## Changes (all under `examples/bunny-hop/public/`)

- `js/biomes.js:38,69,100,132`: per-place `rows` and `rhythms`. `:149-150` adds `OBSTACLE_NAMES` and `OBSTACLE_NOTES`.
- `js/course.js`:
  - `:52-56`: `ROW_STEP`, `BEAT`, gap and repeats.
  - `:58` onwards: the "?" marker sprite.
  - `plan()` (`:110`) builds the trip story. `generate()` (`:175`) spawns segments ahead, and `reveal()` (`:188`) shows the hidden obstacle.
  - Row carrots always reach Pip (`:256`). Events now carry `seg`, `index` and `name`.
  - Hidden obstacles can't be poked.
  - The old random `pattern()`/`arc()` code and the unused `possible` counter were removed.
- `js/learning.js` (new):
  - obstacle thumbnails from the real models (a second, short-lived WebGL renderer, with emoji fallback)
  - the mute-aware voice
  - the `Cue` tray, strip and ask panel
  - the pantry renderer and the pantry words
- `js/main.js`:
  - state (`rows`, `patterns`, `seg`, `asking`, `gentle`) at `:93-105`
  - the pace switch at `:183`
  - `updateLessons`, `beginSegment`, `askNext`, `answer`, `lessonCarrot` and `lessonObstacle` from `:382`
  - the pantry results at `:357`
  - the combined pace at `:669`
  - keyboard handling for the ask panel
  - the combo and streak code was removed
  - a golden carrot now counts as one carrot
  - `toMenu()` re-renders the mission chip (it used to fall back to plain text after a trip)
- `js/audio.js:157,163`: `step()` bell note and `wonder()` question notes.
- `index.html`: `#cue` and `#ask` in the HUD, the `#menu-options` row with the `#pace` switch, and `#pantry` in place of the tally.
- `style.css`: the pantry, pace switch, cue tray and strip, and ask panel. Short sideways phones put the cue and ask panel on the right, clear of Pip and the mission card. Reduced motion is covered.

## Evidence

Scratchpad: `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/183efacb-62c2-4cf6-9680-a97f4bb0fb5f/scratchpad/p2/bunny-hop/`. It holds `play.mjs` (an auto-hopper that answers by tapping) and the screenshots.

- **Full portrait trip** (834×1194, Chromium): 141 s, 8 rows (2, 3, 3, 5, 6, 6, 6, 7), 4 asks, pantry 38, 🏠 back to the menu, 0 errors.
- **Landscape** (1194×834, `?biome=2`, wrong answers): rows 4, 6, 7, 8 and two asks with 3 and 2 choices, 0 errors.
- **Short phone** (667×375, `?biome=3`): 0 errors.
- **WebKit, 🐢 pace, short phone** (667×375, `?biome=2`, wrong answers): rows 4 and 5, one ask ("Look, a …!" path), 0 errors. Headless WebKit renders slowly, so the run hit the script's 5-minute cap before reaching home.
- **`browser.mjs --run p2`**: Chromium and WebKit pass with 0 errors.
- **`original-quality.mjs`**: Bunny Hop's mission persistence passes.
- **`node --test`**: only the manifest-hash test fails, because of the new `js/learning.js`. A coordinator rebuild fixes it.

## Phase 2 follow-up (coordinator review, 2026-10-09)

- **🐢 rows capped at 5** (owner's delegate): `Course.reset(x, maxRow)` / `plan()` (`js/course.js`) caps each row; `start()` passes 5 on the 🐢 pace (`js/main.js`). Normal pace still grows to 6–10 in the snow. One "What comes next?" per place is kept.
- **Pantry no longer covers Pip in landscape:** on sideways tablets (`style.css`, "Tablets held sideways") and sideways phones ("sideways phones: the pantry…") the pantry stands to the left of the burrow; portrait keeps it below the burrow.
- **Mission and row speech no longer cut each other off** (`js/learning.js` `createVoice`): game words never cancel a mission utterance that is playing (they queue), and `voice.interject(fn)` wraps `adventure.event()` and `speakMission()` (`js/main.js`). If the mission really cancels the game's words, they are said again after it; if it says nothing, nothing repeats. Shared `adventure.js` is untouched. Checked with a fake `speechSynthesis` (`voice.mjs` in the scratchpad): the row intro waited for the mission words, and "3 carrots!", "1" came back after the mission's "2".
- **Re-test on final code:**
  - Chromium full portrait trip: 141 s; first row cue at x=14 (after the tap hint); 8 rows (2, 3, 3, 5, 4, 5, 8, 9); 4 asks with Pip stopping nearer the "?"; pantry and 4 pictured pattern strips; 🏠 to menu; 0 errors.
  - Landscape 1194×834 from the grove, with "Gentle hop counting" on and wrong answers: 6 rows up to 10, 3 asks, the mission card and row tray both visible, 0 errors.
  - Short phone 667×375 (snow, "Hop, hop, flip" on): 0 errors.
  - 🐢 full portrait trip: 227 s, rows 2, 3, 3, 4, 5, 5, 5, 5 (all ≤ 5), 4 asks, 0 errors.
  - The results layout was checked with 8 rows at 1194×834, 1024×768, 834×1194 and 667×375 (`results.mjs`): Pip and the burrow are clear in all four.
  - `browser.mjs --run p2` passes in Chromium and WebKit with 0 errors, and `original-quality.mjs` passes. In `node --test`, only the expected manifest-hash test fails (it needs a rebuild for `js/learning.js`).

## Left / open

- Family play: is one "What comes next?" per place the right amount? Are snow rows of up to 10 too long for 3-year-olds on the 🐢 pace?
- The per-biome collection to sort in the pantry (leaves by colour, snowflakes by shape) from the audit is not built. The pantry holds only the counted rows.
- Speech timing depends on the device's voice. On a slow voice the count can trail a carrot or two behind; it queues and never skips.

## Simplify pass (2026-10-09)

- One shared voice (`js/speech.js`, rate 0.82) for the game and its missions. The `interject` monkey-patch and `speakMission` are gone: everything queues, so a mission never swallows a count. Taps on the pace button and on an answer interrupt, as does the mission goal at start.
- The mission choice is drawn through `renderChoice`. `randInt` is `THREE.MathUtils.randInt` in `util.js`.
- The obstacle pictures are drawn when the browser is idle after the menu appears, and their second WebGL context is released with `forceContextLoss()`. If a cue is needed first, it shows the emoji fallback.
- Verified: chromium and webkit boot + play, and stubbed-speech trips with both missions (words in order, pictures drawn, no errors).
- Iteration 2: the hop-instead-of-flip special case is `option.hint` plus the `'rejected'` return (which still shows "👆 Tap again!"). Missions carry `caption`, `steps` and `pictures` (a `stepRow` of tiles); the `missionSteps` side table and the choice builder are gone (`.mission-next` became `#menu .adventure-next`). The progress tiles stay custom: their done/next states and changing caption are more than `icon` draws. Muting now hushes the voice (Home already did).

## Simplify pass, third pass (2026-10-09)

- The voice starts with `muted: sound.muted` (the saved setting); the mute toggle calls `voice.setMuted`. The local `#hud .adventure-goal[hidden]` rule is gone.
- The mission choice is placed with `place: (b) => $('menu-options').prepend(b)` instead of being moved after creation. Missions list their steps once through `missionSteps(steps)`; the unused `emoji` fields are gone.
- The progress caption reads `option.target` (`/ target`, `target - 1` for "Hop, then tap to flip!") instead of hard-coded 4, 2 and 3.
- `pantryWords` joins rows with a module `Intl.ListFormat('en-GB')` (same words). The "?" marker uses `canvasTexture`, now exported from `world.js` (it adds repeat wrapping and anisotropy, which do not change the sprite).
- Verified: `browser.mjs --run simp3` (Chromium, WebKit), `original-quality.mjs`, `node --test`, and a stubbed-speech check (mute hushes and silences, unmute speaks again, choice/goal show and hide, no console errors).

## Exit paths (2026-10-09)

- `toMenu()` (🏠, Escape) and `start()` (Play, Again, Enter on results) each hush the voice at the top; the 🏠 handler no longer hushes on its own, and `start()` says the goal with `say` after the hush.
- Verified: `browser.mjs --run exits` (Chromium, WebKit), `original-quality.mjs`, `node --test`, and a stubbed-speech check: Play and Again hush then say the goal, 🏠 and Escape mid-trip hush, the menu stays with no late banner, no console errors.

# Round 1 of the decision pass (2026-10-11)

From [AUDIT_2026-10-10.md](AUDIT_2026-10-10.md) (Bunny Hop scored 6). The audit found the play too passive: rows flew to Pip, the strip gave answers away, every carrot was counted aloud, and there was no harder tier.

## Design

- **Hopping counts.** Row carrots hang at hop height (`ROW_Y` 2.8). Pip catches one only by hopping as it comes. There is no pull or magnet any more; golden carrots also need Pip to reach them. A carrot left behind has *got away*: its tray place stays empty with a dashed outline, filled from the right, and the voice says "4 of 6. 2 got away." Carrots are 6.2 apart, so each gets its own hop with a breath on the ground between. Careful play catches whole rows; tapping every 0.4 s catches about 75%.
- **Basket tier (rows, for older or steadier children).** After two whole rows caught, the next row holds one or two carrots more than Pip needs. The tray becomes "🧺 4", and the voice says "Pip needs 4." once. The child counts and stops hopping when the basket is full; the voice does *not* count on this tier. Any carrot past a full basket sits outside the tray, floats "↩" and goes back to the field (it is not counted in the pantry or the 🥕 pill). The first time, the voice says "That's 5. Pip only needs 4." Exactly filling the basket gets "Just right, 4!". Two over-full rows step back down to catching whole rows.
- **Pattern ladder.** Each place now has three obstacle kinds (`biomes.js` `kinds`). The pattern is picked when it comes into view, from `game.tier.pattern`:
  - tier 0: AB or AAB
  - tier 1: ABC or ABB, with all three kinds as answers
  - tier 2: a growing pattern (AB, AAB, AAAB). The question sits after "a, a" in the last group, where a repeating guess (b) is wrong. The rule is said once: "pumpkin, log, then one more pumpkin each time."

  A right first answer steps up a tier, and a second miss steps down. Answer buttons are shuffled.
- **Wrong answers get a second go.** The tapped picture rests, faded and disabled. The strip lights the last two groups up to the "?", one at a time, with each obstacle's note, and the voice says "Listen. log, rock, log…". After a second miss the answer is shown with the pattern named. There is still no failure and no buzzer.
- **No give-away.** The obstacles after the "?" stay hidden on the path, and blank (dashed) in the strip, until the child answers. Before this, the strip showed "log rock | log rock | ? rock".
- **Thinner voice.** On tier 0, counting is aloud only up to 5 (`voice.count`); past that the munch note and the tray carry it, and the total is said once. The "Hop up to catch them!", basket and "What comes next?" lines are said once per trip (`sayOnce`, and `newRound` in `start()`). Row ends are said only when something differs: carrots got away, a basket was full or overfilled, or a row was over 5. The pantry says only the total; the crates show the sum. Spoken lines per trip went from 54 to 32 (careful play) and 31 (🐢).
- **Portrait framing.** The camera looks down more and the path sits about 4/5 down, so hills fill the frame instead of a bottom third of empty grass. On tall portrait screens the ask panel sits just above Pip and the "?" (`bottom: 36%`), not up under the trip bar.

## Changes (under `examples/bunny-hop/`)

- `public/js/course.js`:
  - `:11-13` `ROW_Y`, `AWAY`
  - `:60` `ROW_STEP` 6.2, `:63` `GAP` 18, `:65-67` `RHYTHM_MAX`, `EXTRA`
  - `plan()` keeps room for a row's spare carrots and for the longest rhythm
  - `shapeRow` `:192` and `shapeRhythm` `:203`, called from `generate(aheadX, tier)` `:229`
  - `obstacle(…, later)` `:173`
  - `reveal()` `:246` shows the rest of the pattern
  - `eat()` `:312`: no pull; emits `missed`
  - carrot events carry `index`
- `public/js/biomes.js`: `BIOME_LENGTH` 240 (`:10`), and per-place `kinds` (`:39,69,99,130`) replace the unused `obstacles` and the fixed `rhythms`. Snow rows are 5–9.
- `public/js/learning.js`:
  - `Cue.row(seg)` `:97` (basket)
  - `fill()` places the over-full carrot outside the tray; `miss()` `:132`
  - strip group gaps come from `seg.starts`, and later steps stay blank (`:150`)
  - `replay()` `:175`, `revealStep()` for all revealed steps, `rest()` `:226`
  - `choices` skips disabled buttons
  - `pantryWords` says only the total `:277`
  - pictures are rendered from `biome.kinds`
- `public/js/main.js`:
  - framing `:71-72`
  - `game.tier` `:103`
  - `voice.newRound()` `:264`
  - `beginSegment`/`growWords` `:396`
  - `answer()` `:442` (second try, ladder)
  - `lessonCarrot` `:476`, `lessonMiss` `:496`, `rowDone` `:504` (row adaptation)
  - `handleEvents` keeps over-full carrots out of the 🥕 count and handles `missed` `:646`
  - `generate` gets `game.tier`
- `public/style.css`: `.cue-step.later` `:151`, `.cue-carrot.away/.over`, `.cue-step.sing` `:153-157`, `.ask-choice:disabled` and the portrait ask position `:173-176`, and reduced motion.
- `game.json`: `howToPlay` describes hop-to-catch, the basket, second tries and the ladder.

## Evidence

All runs are in Chromium (`--use-angle=gl`) with stubbed speech that logs every line. Scripts and screenshots: `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/264c5237-472d-4187-be3f-45d364aa4d2a/scratchpad/polish/bunny-hop/` (`play.mjs <label> <w> <h> <bot> <biome> <gentle>`, `*.json`, `*.png`).

| Run | Viewport | Time | Rows | Patterns | Spoken lines | Errors |
| --- | --- | --- | --- | --- | --- | --- |
| careful | 834×1194 | 158 s | Whole rows, then baskets from the grove on, every basket exact | Ladder AB → ABC → growing → growing | 32 | 0 |
| random (taps every 0.4 s) | 1194×834 | – | About 75% caught; never reached the basket tier | Mostly wrong first, stayed at tiers 0–1 | 56 | 0 |
| greedy (doesn't stop at a full basket) | 834×1194, grove | – | Two over-full baskets, then back to whole rows | – | – | 0 |
| wrong-first | landscape and portrait | – | – | Every ask replayed "Listen. …", then the right second try; stayed at tier 0 | – | 0 |
| 🐢 | 834×1194 | 256 s | Every row ≤ 5, baskets ≤ 7 carrots | – | 31 | 0 |
| short phone | 667×375 | – | – | – | – | 0 |

- **careful:** rows 2, 3, 5, 5, 4, 6, 7, 7; pantry 39.
- **greedy:** "That's 5. Pip only needs 4." and "That's 6. Pip only needs 5.", then the row tier dropped to 0.
- **🐢:** the trip took 256 s; it was 227 s before the longer places.
- **Screenshots checked:** `careful-basket`, `greedy-basket`, `careful-ask-growing` (the 3 choices, with the blank steps after the "?"), `wrong-after-wrong` and `l-wrong-after-wrong` (the faded choice and the lit replay), `careful-results`, `short-row`, `short-ask-2`, `p3-ask` (the new portrait framing).
- `browser.mjs --ids bunny-hop --run bunny-hop-r1`: BOOT + PLAY ready, 0 errors. `node --check` passes on all edited JS.

## Remaining ideas

- A pantry goal ("20 for winter") with a running total in the HUD, so the missed carrots matter at home too.
- A gentle "got away" moment in 3D, such as the missed carrot drifting down to the grass. Today it just stays hanging behind.
- The 🐢 trip is now about 4 minutes; consider shorter places on 🐢.
- The tier is kept for the visit only (not stored). Consider remembering it per device.
- Per-biome collectables to sort in the pantry are still not built.

# Round 2 of the decision pass (2026-10-11)

Independent review 1 scored 7.6. Its blockers: random tapping got close to careful play (it reached the basket tier and heard "Just right"), the pantry sum was only heard, the top tier was shallow (the growing rule was spoken first and its answer was always the lead obstacle), and every trip had the same shape.

## Design

- **A basket you can't luck into.** Spare carrots now grow with the order (`spares(n) = max(2, ceil(n/2))`, so a 4-basket row has 6 carrots and a 9-basket row has 14). "Just right" needs a *clean* basket: every carrot caught up to full, then the spares let go (`seg.early` counts carrots missed before full). An exact count reached with early misses is neutral. Overfilling is a slip, and two slips step down a tier; missing is neutral. The full-basket bell is gone, and "Just right" is said twice a trip, then a soft bell.
- **A counting tier for 6–8.** After two clean baskets the row tier rises to 2. The tray shows only "🧺6", with no empty places: carrots drop in, no number floats above Pip, and the child keeps count. Overfilling twice drops back to the basket with places.
- **Harder to step up.** Whole rows count towards the basket tier only if they have 3 or more carrots (meadow rows of 2 don't). Tiers are remembered per device (`bunny-hop:tier`), so a returning 7-year-old starts where they left off. Because they step down easily, a younger sibling soon finds their own level.
- **Patterns.**
  - Tier 0 → 1 after one right first pick. Tier 1 → 2 (growing) after two in a row. A second miss steps down.
  - On tier 0 a first miss brings in the place's third obstacle as a new picture, so the second try is still a choice (`seg.spare`, `Cue.addChoice`).
  - Only a right first pick hears "Yes". A right second pick hears "A log.", and a second miss hears "Look, a log!" plus the rule.
  - Growing patterns no longer say their rule first. Pip names only the opening group ("pumpkin, log."), and the rule is a hint after a second miss. There are now three kinds: AB/AAB/AAA? (answer a), AB/AAB/AAA then ? (answer b), and AB/ABB/ABBB (answer b). The answer is no longer always the lead obstacle.
- **The pantry is something to do.**
  - At the start Pip says "Pip needs 30 carrots for winter." The goal is 80% of the trip's orders, rounded down to 5. The 🥕 pill shows the running total "12 /30" and turns green when it is met. Golden carrots are treats and are no longer counted.
  - At home each place has a shelf with its two crates. A carrot that got away leaves a faded place in its crate.
  - Pip asks one question about the last shelf. Little hoppers (row tier 0) get "Which crate has more?": they tap a crate, and Pip says "Yes! 5 is more than 3." or "Look: 5 is more than 3." Basket hoppers get "6 + 7 = ?" with 3 number buttons. After a miss Pip hints "Start at 7, and count on 4." and gives a second try.
  - Only then does the total show, beside a ❄️ goal chip. Pip says "35 carrots. Enough for winter, and 5 to spare!" or "13 carrots. Pip needs 15 for winter: 2 more next time."
- **Variety.** Each place's story order is picked per trip: row, rhythm, row; rhythm, row, row; or row, row, rhythm.
- **The music rests during a pattern.** The music bus fades out from the start of a rhythm until it is finished, including the "What comes next?" pause, so only the obstacle notes are heard. It fades back in after.
- **Thinner voice.** On tier 0, rows are counted aloud only in the meadow (and the grove on 🐢). There is no end-of-row line when the whole row is caught. The "And you hopped 4 patterns!" line is gone.
- **Scenery.** No scenery logs, pumpkins, stumps, rocks, toadstools or snowmen are placed in the near or side layers within a rhythm's stretch, from 10 before it to 6 after (`world.quiet`).
- **Visual.**
  - The pantry panel is opaque.
  - Crates are grouped into 4 shelves (2 columns in portrait, 1 column in landscape), so a "+" never wraps.
  - On landscape tablets the place banner sits higher (14%) and smaller, clear of Pip's hop.

## Changes (under `examples/bunny-hop/`)

- `public/js/course.js`:
  - `:70` `spares()`
  - `reset/plan(x, maxRow, baskets)` `:125` keeps room for full spares when the trip starts on a basket tier. Story order is picked at `:161`.
  - `shapeRow` `:204` (shrinks the order if the room is short; `seg.counting`)
  - `shapeRhythm` `:221` (growing variants, `seg.growing` = the kind that grows, `seg.spare`)
- `public/js/main.js`:
  - tier load/save `:105-121`
  - goal and `world.quiet` in `start()` `:288-296`
  - `showResults`/`pantryTotal`/`askPantry` `:370-480`
  - `beginSegment` (no rule, music hush) `:515`
  - `ruleWords` `:513`
  - `answer` `:566`
  - `lessonCarrot`/`lessonMiss`/`rowDone` `:606-663`
  - `choiceList()` `:727` (keyboard for both questions)
  - golden carrots kept out of the pill
- `public/js/learning.js`:
  - `Cue.row`/`fill` for the counting tray `:98-140`
  - `addChoice` `:223`
  - `renderPantry` (shelves, faded got-away places, crate buttons) `:259`
  - `showPantryTotal` `:316`
  - `pantryWords(total, goal, older)` `:329`
- `public/js/audio.js:212` `hushMusic()`. `public/js/world.js:127,191`: the quiet zone.
- `public/index.html`: `#score-goal`. `public/style.css`: pantry shelves, crate buttons and `.more`, `.pantry-number`, `.pantry-goal`, `.score-goal`/`.pill.met`, `.cue.counting`, landscape banner, reduced motion.
- `game.json`: `howToPlay` and `learning`.

## Evidence

Chromium (`--use-angle=gl`) with stubbed speech. The script and screenshots are in `…/264c5237-…/scratchpad/polish/bunny-hop/` (`play2.mjs <label> <w> <h> <bot> <biome> <gentle> [tierJSON]`, output in `r2/`). Random bots tap every 0.3–0.7 s and pick a random enabled answer.

| Run | Viewport | Rows (got/need) | Tiers reached | "Just right" | Pantry / goal | Lines | Errors |
| --- | --- | --- | --- | --- | --- | --- | --- |
| careful | 834×1194 | all whole, baskets from autumn, counting in snow | row 2, pattern 2 | 2 | 35 / 30, "6 + 7" | 31 | 0 |
| top (stored tier 2/2) | 1194×834 | every counting basket clean | 4 growing asks, 3 choices | 2 | 37 / 30, "9 + 4" | 24 | 0 |
| random | 834×1194 | 2/4, 2/4, 4/6, 5/6, 7/9 | stayed row 0 | 0 | 27 / 25, "more" | 32 | 0 |
| randL | 1194×834 | lucky 3/3 3/3 → baskets, 3 over-fills → back to 0 | pattern 0 | 0 | 36 / 30 | 34 | 0 |
| random2 | 834×1194 | lucky baskets, 2 over-fills → back to 0 | pattern 1 | 0 | 36 / 30 | 35 | 0 |
| shortRand (autumn) | 834×1194 | 1/4, 4/5, 3/6, 5/7 | – | 0 | 13 / 15 (short) | 19 | 0 |
| greedy (stored 1/1) | 834×1194 | 5 over-fills, cycles between tiers 1 and 0 | – | 0 | 38 / 30 | 28 | 0 |
| wrong-first | 1194×834 | – | pattern stays 0; spare picture added each time | – | 30 / 25, "4 + 4" | 37 | 0 |
| 🐢 | 834×1194 | all ≤ 5 | row 2, growing in snow | 2 | 29 / 25 | 39 (258 s) | 0 |
| short phone | 667×375 | – | – | – | "6 + 7" panel fits | – | 0 |

The random, randL and random2 runs were made before the goal moved from 75% to 80%.

- **Screenshots checked:**
  - `careful-results-ask`/`-results`: shelves, the asked shelf lit, then the total and ❄️ chip
  - `randL-results`: the "more" crate in green
  - `shortRand-results`: faded got-away places, goal not met
  - `top-ask-growing`: the "log stump | log log stump | log log log ?" strip with 3 choices
  - `top-counting` and `careful-counting`: the "🧺6" tray with no places
  - `wrong-after-wrong`: the rock faded and the stump added
  - `autL-banner-3`: the banner clear of Pip
  - `autP-ask-3`: no scenery pumpkin at the "?"
- `browser.mjs --ids bunny-hop --run bunny-hop-r2`: BOOT + PLAY ready, 0 errors. `node --check` passes on all JS.

## Remaining ideas

- Tier changes take effect one row late, because a row is shaped as it comes into view, about one row ahead.
- The 🐢 trip is about 4.3 minutes and still speaks about 39 lines (counting aloud in two places).
- A fork in the path ("which way has 4 carrots?") and per-place collectables to sort in the pantry are not built.
- The autumn bush is orange and can sit near a pattern. It is not a pattern obstacle, but a pumpkin-coloured bush is a mild look-alike.

# Round 3 of the decision pass (2026-10-11)

Independent review 2 scored 8.2 (fun/depth 7.3, voice 7.8). Its blockers: hopping at everything filled the pantry as well as careful play (tier-0 rows are pure timing), the pattern mattered for one tap per place, the voice spoke every 5–6 s, and a few loops never stopped. Bugs: overfill cost nothing at home, mashing was promoted and then demoted, tier changes landed a row late, the count-on hint was dropped past 5, "Hop again" could skip Pip's question, the hop-flip mission finished in 3 s and its card stayed, and the menu butterfly was cut off in portrait.

## Design

- **Carrots in the grass.** About two in five row carrots (never three in a row, and none in the trip's first row) grow upright from a little earth mound at ground level. Pip munches one only by *staying down* as it comes; a hop sails over it. So every carrot is a look-then-act choice: hop for the high ones, stay down for the low ones. A basket hopper lets a spare go by by not hopping for a high one, or by hopping over a low one. Hopping at everything now misses most low carrots.
- **Patterns are a rhythm of hops and rests.** Every tier-0/1 pattern has a carrot as one of its steps (`log, carrot`, `log, log, carrot`, `log, carrot, carrot`; `a, b, carrot`, `a, carrot, b`, `a, carrot, carrot`), with its own note (F). Growing patterns can grow carrots ("one more carrot each time"). The "?" now comes in the **second** repeat, and after the answer **the rest of the pattern waits under soft mist**. Each step shows only 1.3 units before Pip, after the moment to choose. So the child keeps the pattern going: hop for an obstacle, stay down for a carrot. A wrong prediction is a soft bump or a carrot left behind, faded in the strip. One "?" plus 2–5 predictions per place, instead of one tap.
- **Careful play changes the outcome.** Pattern carrots go to the pantry as a small 🎵 crate on each shelf. An over-full basket is too heavy: one carrot that was in it rolls out, the tray place empties, the 🥕 pill drops by one, and the pantry keeps n − 1 ("That's 5. Too heavy! One rolled out.", said twice a trip). The winter goal counts rows plus about 4 carrots per pattern, at 80% (85% when the trip starts on the basket tier). Results: careful 44–57 against a goal of 40, random 24/40 and 39/45, mashing 35/40, and mashing from a stored basket tier 31/40.
- **No promotion for mashing.** A tier-0 row counts towards baskets only if it was caught whole with at most count + 2 hops, has 3 or more carrots, and has carrots in the grass. Random tapping and mashing stayed on tier 0 all trip.
- **Tier changes show in the very next row.** `course.reshape` rebuilds a row or rhythm when it is cued if the tier changed since it was built. A row's carrots stay where they were (spares come and go at the far end), and a rhythm keeps its first obstacle, so nothing in view jumps.
- **Home.**
  - The count-on hint is always "Start at 8, and count on 6.". It comes with a line of carrots to tap, and each tap shows and says the next number (9, 10, 11…).
  - "Hop again" is hidden until Pip's question is answered.
  - The question ignores the 🎵 crates.
  - Shelves stack in one column. On small phones only the asked shelf shows during the question.
- **Missions are tied to the lessons.** "Three whole rows" counts whole rows or clean baskets. "Patterns with no bumps" counts patterns with no bump and no carrot left behind. Their pace override is gone, and the card steps aside 2.6 s after the banner.
- **Thinner voice** (23–25 lines on a careful trip, 19–26 for random and mashing, 20 from a stored top tier, 31 on 🐢):
  - "N carrots!" is said only where rows are counted aloud (the meadow; the grove too on 🐢).
  - "Pip needs N." is said for the first two baskets.
  - "4 of 6. 2 got away." is said twice a trip.
  - "Just right" is said once, then it is a soft bell.
  - Pattern names are spoken only on pattern tier 0. The tier 1–2 replay says just "Listen." over the notes; a second miss still names the rule.
  - One-off hints join the line they belong to ("2 carrots! Hop up to catch them!").
- **Calm.** The golden halo is still (no pulse or spin). The "?" bubble doesn't bob. Hanging carrots turn slower, and grass carrots are still. Bumps lose the dizzy stars and the "Boing!/Bonk!" words: a soft tumble, a puff of dust and the boing note remain.
- **Menu.** On the upright menu, butterflies flutter within about 2 units of Pip (`world.flutterAhead`), so none is cut off at the edge.

## Changes (under `examples/bunny-hop/`)

- `public/js/course.js`:
  - `GRASS_Y` `:17`; `mound()` `:114`; `mistMarker()` and `UNMIST` `:129-150`
  - per-row `low` heights `:204`
  - `shapeRhythm` with carrot steps, the second-repeat ask and fixed `seg.kinds` `:278`
  - `build` `:309`, `reshape` `:354`, `drop`
  - `reveal` puts the later steps under mist `:374`; `unveil` `:393`
  - the `unmist` event in `update` `:411`
  - static halo, no "?" bob, slower carrot turn
- `public/js/main.js`:
  - missions `:147-185`
  - `PATTERN_CARROTS` and the goal `:128,300`
  - row hop count `:350`
  - `countOn` `:499`
  - `fresh` once-per-trip hints `:565`
  - `beginSegment` reshape and voice `:576`
  - pantry n − 1 and the 🎵 crates `:609-613`
  - tier-0 replay words `:648` and the mist hint `:669`
  - `cue.spill` `:694`, `patternCarrot` `:705`
  - "Just right" once `:734`; the no-mash promotion rule `:751`
  - `unmist` and bump counting in `handleEvents` `:896-906`
  - `world.flutterAhead` `:1038`
  - "Hop again" hidden in `askPantry`, shown in `pantryTotal`
- `public/js/learning.js`: carrot thumbnails `:44`; `spill()` `:147`; `passed(i, away)` and `unveil()` `:180-200`; `revealStep` shows only the asked step `:211`; `renderPantry` 🎵 crates, placed last on each shelf `:290`.
- `public/js/biomes.js`: `carrot` in `OBSTACLE_NAMES`/`OBSTACLE_NOTES`. `public/js/world.js:129,346`: `flutterAhead`.
- `public/style.css`:
  - `.cue-step.away`
  - `.pantry-row.pattern`, `.pantry-tag`, `.count-on`, `.count-step`, `#again[hidden]`
  - one-column shelves, with portrait crates at 19 px
  - small-phone rules at the end of the file
- `game.json`: `howToPlay`.

## Evidence

Chromium (`--use-angle=gl`) with stubbed speech. The scripts are in `…/264c5237-…/scratchpad/polish/bunny-hop/`: `play3.mjs <label> <w> <h> <bot> <biome> <gentle> [tierJSON]` (env `MISSION=i`), `results3.mjs` and `menu3.mjs`. Output and screenshots are in `r3/`. The careful bot hops for obstacles and high carrots, stays down for grass carrots, and knows the pattern through the mist. The random bot taps every 0.3–0.9 s; the spam bot taps every 160 ms.

| Run | Viewport | Pantry / goal | Tiers at end | Lines | Errors |
| --- | --- | --- | --- | --- | --- |
| careful (careP) | 834×1194 | 57 / 40 | row 2, pattern 2 | 23 | 0 |
| careful (careL) | 1194×834 | 46 / 40 | 2 / 2 | 24 | 0 |
| random (randP) | 834×1194 | 39 / 45 | row 0 | 32 | 0 |
| random (randL) | 1194×834 | 24 / 40 | row 0 | 19 | 0 |
| spam (spamL) | 1194×834 | 35 / 40 | row 0 all trip | 26 | 0 |
| spam, stored 1/1 (spamT1) | 834×1194 | 31 / 40 (two spills, back to whole rows) | row 0 | 21 | 0 |
| wrong-first | 834×1194 | 53 / 40 | pattern 0 (spare picture each time) | 29 | 0 |
| top, stored 2/2, wrong-first | 1194×834 | 49 / 45 | 2 / 2 | 20 | 0 |
| 🐢 | 834×1194 | 46 / 35 (259 s) | 2 / 2 | 31 | 0 |
| mission "no bumps" | 834×1194 | 45 / 40; done at 67 s, then the card hid | 2 / 2 | 25 | 0 |
| short phone, snow | 667×375 | 32 / 25 | – | 12 | 0 |

The randP run predates the stricter promotion rule; it was lucky into baskets once, then dropped back after two spills.

- **Screenshots checked:**
  - `careL-rhythm`: a grass carrot on its mound
  - `careL-ask-2`: carrot/log choices
  - `careP-mist` and `short-mist`: mist banks; the strip blank after the "?"
  - `res-*-t1-counton` at 834×1194, 1194×834, 667×375 and 390×844: the count-on line, "Hop again" hidden
  - `res-*-total`: one-column shelves with 🎵 crates
  - `menu-834-*`: butterflies in view
- `browser.mjs --ids bunny-hop --run bunny-hop-r3`: BOOT + PLAY ready, 0 errors. `node --check` passes on every JS file.

## Remaining ideas

- Grass carrots are random per row. A row could carry its own height pattern ("high, low, high, low") for older children.
- The 🐢 trip is about 4.3 minutes and speaks 31 lines, because it counts aloud in two places.
- Per-place collectables to sort or arrange in the pantry (leaves by colour, crates into tens) are still not built.
- Mist reveals at 1.3 units. A quick adult can still react, but for young children it is a prediction.

# Round 4 of the decision pass (2026-10-11)

Independent review 3 scored 8.4 (fun/depth 7.7, visual 8.3, polish 8.1). Its blockers were these. The trip is a one-button runner where the child never collects, creates or chooses. The landscape pantry was clipped. The mist was faint. Asks could come after only one copy of the unit. Nothing tied a slip in the mist back to the rule. Bugs: the landscape shelves spilled out of the panel; on the short phone the 🎵 tag overlapped Pip and the pill touched the trip bar; in portrait the pantry covered Pip at the payoff; and a single lucky first tap promoted tier 0.

## Design

- **Wild flowers to pick, and a pattern of the child's own at home.** Two flowers of different colours grow in the grass after each place's pattern, either side of the golden carrot. The colours are blue, yellow and pink, each with its own note (a C major triad). Pip picks one only by staying down as it comes, and a hop sails over it. "Flowers! Stay down to pick them for Pip's door." is said once a trip. At home, after Pip's pantry question and the total, the shelves fold into one line of place totals ("🌼 7 + 🍄 12 + 🍂 17 + ❄️ 16"), so Pip stands clear. Then the **door garden** opens:
  - The child plants the picked flowers one tap at a time. The colour buttons show how many are left.
  - Each flower appears in the pantry bed and in 3D in a row along the burrow's lawn. The lawn's decor flowers make way.
  - Tapping the last flower planted takes it back.
  - When the row first repeats (two whole goes of a group of two or more colours), Pip sings the row back note by note and names the group once: "Blue, pink, again and again. A pattern!" Nothing is ever wrong.
  - Older pattern hoppers who have two of every colour are asked for "a pattern with three colours".

  This adds collecting, a creative choice and pattern *making*, the inverse of the trip's pattern reading. Careful play brings home more to plant: careful runs picked 8 flowers, random and mashing runs 1–4.
- **The ask always follows one full unit plus a step** (`seg.ask = unit.length + randInt(1, unit.length - 1)`), so "what comes next" can always be read from the first time round.
- **No coin-flip promotion.** Every pattern tier now needs two right first answers in a row.
- **Readable mist.** The mist is dense and blue-grey, 1.2× larger, with a soft, still "?" inside each bank. The strip's blank "later" slots are tinted to match.
- **Mist recap without words.** If a bump or a carrot left behind happened under the mist, the strip sings the misted steps note by note (0.32 s apart) as the pattern ends, and the cue holds a little longer.
- **Layout.**
  - Landscape pantry: the panel is `min(40vw, 480px)`, crates are 15 px (12 px on 1024-wide tablets), shelves can wrap and `.pantry` has `overflow: hidden`.
  - Short phones: the pantry folds as soon as the total shows. The 🎵 crate steps aside during the question. The garden bed sits in two rows of four. The trip bar moves to 62% and 42vw, clear of the 🥕 pill.

## Changes (under `examples/bunny-hop/`)

- `public/js/biomes.js:164`: `FLOWERS` (hex and note).
- `public/js/course.js`:
  - `mistMarker` `:129` (dense, with "?", scale 3.1×2.35, y 1.0 `:416`)
  - flower patches in `plan` `:222`
  - `flower()` `:258`
  - ask timing `:325`
  - spawning `:374`
  - pick and `flowerAhead` events in `update` `:447`
- `public/js/world.js`: `homeFlowers` `:251`; `plantRow(colors)` `:267`.
- `public/js/learning.js`: flower pictures rendered from the model, `Cue.flower` `:110`, the `to-pattern` plus `:324`, `foldPantry` `:373`, `repeatOf` `:389` and `renderGarden` `:402`.
- `public/js/main.js`:
  - fold timing in `pantryTotal` `:410`
  - `openGarden` `:425`
  - mist recap `:665`
  - two-right promotion `:714`
  - `mistSlips` `:763,965`
  - flower events `:967-975`
  - keyboard for the garden buttons `:893`
- `public/style.css`:
  - `.pantry` overflow `:54`, `.pantry-sums` and `.garden*` `:97-112`
  - mist-tinted `.cue-step.later` `:198`, `.popup.flower` `:239`
  - landscape pantry `:252,261`, short-phone trip bar `:305`
  - garden small-screen rules `:349-365`
- `game.json`: `howToPlay` and `learning`.

## Evidence

Chromium (`--use-angle=gl`) with stubbed speech. The script is `…/scratchpad/polish/bunny-hop/play4.mjs` (the round-3 bots plus a garden planter and flower and recap shots), and the output is in `r4/`.

| Run | Viewport | Asks (step after one unit + 1) | Pantry / goal | Flowers | Lines | Errors |
| --- | --- | --- | --- | --- | --- | --- |
| careful | 834×1194 | @5, @3, @5, @4 | 47 / 40 | 8, "Blue, pink, again and again" | 26 | 0 |
| wrongL | 1194×834 | @3, @5, @4, @4; pattern tier stays 0 | 49 / 40 | 8 | 33 | 0 |
| randL | 1194×834 | all @3 | 30 / 40 | 2 | 24 | 0 |
| spamP | 834×1194 | – | 32 / 40 | 4 | 23 | 0 |
| top (stored 2/2) | 1024×768 | growing @7/@8 | 43 / 40 | 8 | 15 | 0 |
| 🐢 | 834×1194 | – | 48 / 35 | 8 | 36 (270 s) | 0 |
| shortR / shortC | 667×375 | – | 30 / 40, 52 / 40 | 4, 8 | 23, 25 | 0 |
| mid | 1024×768 | – | 48 / 40 | 8 | 24 | 0 |

Screenshots checked:
- `wrongL-results` and `mid-results`: the landscape shelves sit inside the panel, nothing clipped
- `careful-garden`, `spamP-garden` and `port3-folded`: the folded pantry and garden, with Pip fully in view in portrait and the planted row in 3D
- `short3-garden`, `short4-results-ask`: Pip clear on the short phone
- `careful-mist`, `rand4-flower`: the "?" mist and a flower on the path
- `rand4-recap`: faded misted carrots during the recap

`browser.mjs --ids bunny-hop --run bunny-hop-r4`: BOOT + PLAY ready, 0 errors. `node --check` passes on all JS.

## Remaining ideas

- A row height pattern for the older tier ("high, low, high, low" stated as a rule) would join counting and patterns.
- The garden is not remembered between trips. A kept garland on the menu would give continuity.
- The 🐢 trip still speaks about 36 lines, mostly counting aloud in two places.

# Review-5 fixes (2026-10-11)

Independent review 4 scored 8.3 (fun/depth 7.9, learning 8.1). Its blockers were these. On tiers 0 and 1, "carrot" was the answer to "What comes next?" about 85% of the time. 22% of basket-tier trips lost the snow pattern. Pip hopped and flipped all through the home question and the garden. The flower hint could talk over the ask. Path flowers looked like the scenery flowers. The pattern ladder never stepped down for a child who was right only on the second go. One pantry question was thin for 6–8 year olds.

## Design

- **The answer has to be read.** A tier 0/1 ask can land on any step of the pattern:
  - steps 2..n of the second go, after one whole unit plus a step;
  - the first step of the third go, after two whole goes.

  Tier 1 adds ABB (`[a,b,b]`). Tier 2 drops nothing, but its `[a,b]` growing pattern answers with obstacles. The course remembers this trip's answers (`course.answers`), so no answer comes three times running. Simulated over 500 trips per tier: carrot answers are 46% at tier 0, 32% at tier 1 and 34% at tier 2, with 0 runs of three.
- **Every place keeps its pattern.** `plan()` budgets each place before laying it out: two rows, the rhythm and the gaps. When the rows don't fit, they give up spare carrots (down to two), then carrots, never the pattern. A row laid before the rhythm also leaves the rhythm's room. 1000 plans each for baskets, plain, 🐢 and a snow-only start: all have one pattern per place and every basket row keeps at least two spares.
- **Pip is calm at home.** He does three happy hops on arriving (no flips), then stays still: ears, blinks and a slow look at the child. While a question waits on the path he does the same, with no idle hops. He makes one small hop when an answer at home is given or a flower is planted. The 40 samples taken during the home question show him in the air 0 times, in every run.
- **One instruction at a time.** The flower hint waits while a pattern is unfinished and is said as it ends. In runs it came about 5 s after the answer, never beside "What comes next?".
- **Pickable flowers stand out.** A path flower stands on an earth mound, like a carrot in the grass, so the rule is "on a mound: stay down". No scenery flowers grow in the near/side grass within 10 units of a path flower.
- **The ladder follows first answers.** Two patterns in a row that needed a second go step down, the same as a second miss.
- **A second home question for 6–8.** For basket hoppers whose total is 1–10 from the winter goal, the shelves fold and Pip asks "How many carrots to spare?" or "How many more does Pip need?" (`🥕 46 − ❄️ 40 = ?`), with three numbers. A first miss brings the count-on line from the smaller number up to the bigger: the carrots tapped are the answer. "Hop again" waits until it is answered.
- **Compare quantities, not numerals.** In "Which has more?" the two crates' numbers are hidden until the answer.
- **Fewer counting lines.** The 🐢 pace counts aloud only in the meadow, like the normal pace; the 🐢 run now speaks 28 lines over 286 s, down from 36.
- **The count sits clear of the ears.** It floats higher in portrait.

## Changes (under `examples/bunny-hop/`)

- `public/js/course.js`:
  - `RHYTHM_LEN` `:72`
  - `this.answers` `:189`
  - per-place budget `rooms` and `trim` `:200`, row reserve `rhythmLaid` `:214`
  - flower mound `:277`
  - `shapeRhythm` options, weights and the no-three-running filter `:328-358`
- `public/js/bunny.js`: `celebrate` `:131`, `happyHop` `:137`, the 'still' mode with no idle hops `:156`; ear twitch and look are now also used outside the menu.
- `public/js/world.js`: `flowerQuiet` `:129`, `clash` `:196`.
- `public/js/main.js`:
  - `flowerHint` `:107,718,738,1055`
  - `tier.wrong` `:115,788-796`
  - `world.flowerQuiet` in `start`
  - `bunny.celebrate` `:373`
  - `pantryTotal`/`winter` `:414`, `gardenSoon` `:421`
  - hidden numbers `:506`
  - `numberChoices` `:544`, `askWinter` `:586`
  - meadow-only counting `:704,820`
  - `course.answers.push` `:779`
  - `overPip` `:810`
  - 'still' mode `:1155,1172`
- `public/style.css:68`: `.pantry-row.guess b`.
- `game.json`: `howToPlay` (the gap question) and `learning` ("finding the difference").

## Evidence

Chromium (`--use-angle=gl`) with stubbed speech. The scripts are `…/scratchpad/polish/bunny-hop/play5.mjs` and `sim5.mjs` (plan and answer simulation), and the output is in `r5/`.

| Run | Viewport | Asks → answer | Pantry / goal | Airborne at home | Lines | Errors |
| --- | --- | --- | --- | --- | --- | --- |
| careP | 834×1194 | carrot, toadstool, stump, log | 46 / 40, then "6 to spare" | 0/40 | 28 | 0 |
| wrongL | 1194×834 | carrot, toadstool, pumpkin, snowman (pattern tier stays 0) | 46 / 40, count-on 40→46 | 0/40 | 35 | 0 |
| randL | 1194×834 | log, toadstool, pumpkin, snowman | 29 / 40 | 0/40 | 27 | 0 |
| randP | 834×1194 | carrot, toadstool, pumpkin, log | 33 / 45, numbers hidden | 0/40 | 24 | 0 |
| topP (2/2) | 834×1194 | growing: stump, rock, carrot, snowman | 40 / 45, "5 more" | 0/40 | 17 | 0 |
| t1L / t1P (1/1) | 1194×834, 834×1194 | rock, stump, carrot, log / stump, rock, pumpkin, carrot | 45 / 45, 50 / 45 | 0/40 | 18, 18 | 0 |
| 🐢 gentleP | 834×1194 | log, toadstool, pumpkin, carrot | 43 / 40 | 0/40 | 28 (286 s) | 0 |
| shortL | 667×375 | growing | 54 / 45 | 0/40 | 18 | 0 |
| snowL (?biome=3, 2/2) | 1194×834 | snowman (snow pattern present) | 11 / 10 | 0/40 | 14 | 0 |

Screenshots checked:
- `careP-flower`: the flower on its mound, with no scenery flowers near
- `careP-row`: the "1" above the ears
- `t1P-home-q1` and `shortL-home-q1`: the folded gap question, with Pip clear
- `wrongL-home-counton1`: the count-on line from 40
- `randP-results-ask`: crate numbers hidden
- `t1P-garden`: the planted row

`browser.mjs --ids bunny-hop --run bunny-hop-c1`: BOOT + PLAY ready, 0 errors. `node --check` passes on all JS.

## Checklist

The audit checklist had no open items. All five review-4 blockers are handled above. For "every trip has the same shape", the gap question and hidden-number comparison add depth at home, but the path's structure is unchanged.

## Remaining ideas

- A structural variation on the path, such as a fork ("which path has 4 carrots?"). A height-pattern row was considered and dropped: row carrots are in view ahead, so a stated height rule adds nothing to look for.
- The garden is still not kept between trips.

# Review-6 fixes, round 2 (2026-10-11)

Independent review 1 of this round scored 8.4 (fun/depth 8.0), with no open checklist items. It had two blockers. First, greedy overfilling filled the pantry as well as careful counting, because an overfull basket lost only 1 carrot. Second, every tier 0 pattern was an obstacle plus carrots, and "X, carrot, carrot" came up at 3 of 4 places. It also listed five bugs: overfill cost, a menu butterfly cut off in portrait, butterflies at carrot height during play, "Pip needs 4." said twice, and the home sum usually being a double.

## Design

- **Every carrot past full rolls one out.** A basket keeps its number minus each extra carrot: 7 asked and 10 caught brings home 4. The tray greys one more kept slot for each extra. "That's 8. Too heavy! One rolled out." is said at the first over-full basket. "Too heavy again! Stop when the basket is full." is said at the second. Each line is said once. Stopping at full now clearly wins: careful runs ended 57/45, 49/45 and 45/40, and greedy runs (perfect timing, never stopping) ended 34/35, 36/45 and 41/40. The 41 was a run where two spills stepped the child back down to whole rows.
- **Tier 0 has eight pattern shapes.** There are five with a carrot (A🥕, 🥕A, AA🥕, A🥕🥕, A🥕A) and two made only of obstacles (AB, AAB), at most one of those per trip. The course remembers this trip's shapes (`course.shapes`), and a shape doesn't come again while others are left. Tier 1 now uses its four shapes once each, and growing patterns are told apart by which part grows. In 500 simulated trips per tier, no shape repeated within a trip, there were 0 runs of three same answers, and carrot answers were 37% at tier 0, 32% at tier 1 and 34% at tier 2. About 20% of tier 0 patterns are obstacle-only. When a rhythm is reshaped because the tier changed, its first step stays as it was (`seg.first`). On tier 0 the winter goal counts 3 carrots per pattern, not 4.
- **The home sum avoids doubles.** Basket hoppers get the last shelf whose two crates differ. Counting hoppers (row tier 2), and anyone whose shelves are all doubles, add the shelf's 🎵 crate as well: "5 + 8 + 3 = ?". The hint then becomes "5 and 8 make 13. Count on 3." with the count-on line starting at 13. In the runs, the sums were 5+8+3, 6+7+6, 6+7+3, 6+9 and 3+3+3 (the last from an all-doubles trip).
- **Butterflies stay clear of the carrots.** During play they rise to about y 5.5–6.6 and drift 3.5 units further back, so they sit above the hop band and the golden carrot. In every run, at least 99% of samples had them above a carrot hung at 3.6. Their wings beat about 1.4 times a second, down from 3.2.
- **Menu butterflies stay in view.** They spread out in fixed spots beside Pip: round his ears when the screen is upright, to his right when it is sideways. They are clamped in camera space to 75% of the half-width and kept below the title band. Portrait screen x was −0.62..0.66, and landscape 0.35..0.75.
- **No sparkle for a double hop.** The menu hint now reads "Tap to hop · tap again in the air to hop higher". The higher hop is how a golden carrot is reached.
- **Each line once.** "Pip needs N." is said once per number per trip. A new basket rule ("Count them in…") is still said, without the repeated number. The meadow's "N carrots!" is also said once per number.

## Changes (under `examples/bunny-hop/`)

- `public/js/main.js`:
  - `patternCarrots` `:134`
  - `world.camera` `:227`
  - no double-hop sparkle `:366`
  - `askPantry` (differing shelf, three crates) `:478-549`
  - once-per-number lines `:728-738`
  - `course.shapes.push` `:742`
  - row keeps `n − over` `:761`
  - spill for every extra `:863-869`
  - menu `flutterSpan`/`flutterHigh` `:1227`
- `public/js/course.js`: `this.shapes` `:190`, tier 0 units `:347`, shape keys `:357`, filters `:361`, `seg.first` `:371`.
- `public/js/world.js`: menu slots `:366,381`, play lift `:391`, camera-space clamp `:399-408`, slower wing beat `:415`.
- `public/js/learning.js:178`: `spill()` greys the last kept slot each time.
- `public/index.html:57`: the menu hint.
- `game.json`: `howToPlay` (higher hop, one out for every carrot past full).

## Evidence

Chromium (`--use-angle=gl`) with stubbed speech. The scripts are `…/scratchpad/polish/bunny-hop/play6.mjs`, `sim6.mjs` and `fly.mjs`, and the output is in `r6/`.

| Run | Viewport | Patterns | Home question | Pantry / goal | Lines | Errors |
| --- | --- | --- | --- | --- | --- | --- |
| careP (1/0) | 834×1194 | 🥕A, A🥕A, A🥕B, A🥕🥕 | 2+3+3 (before the fix: tier 2 now takes the last differing shelf) | 57 / 45 | 19 | 0 |
| careP2 (2/1) | 834×1194 | A🥕B, A🥕🥕, growing ×2 | 5+8+3 | 49 / 45 | 19 | 0 |
| greedyP (1/0) | 834×1194 | 🥕A, A🥕, ABB, AB🥕 | 6+7, then 35−34 | 34 / 35 | 22 | 0 |
| greedyP2 (1/0) | 834×1194 | 🥕A, AB, A🥕🥕, AB🥕 | 6+9 | 41 / 40 (stepped down to whole rows) | 22 | 0 |
| greedyL (2/1) | 1194×834 | AB🥕, A🥕B, growing ×2 | which has more (stepped down) | 36 / 45 | 20 | 0 |
| wrongL | 1194×834 | AB, AA🥕, 🥕A, A🥕🥕 (pattern tier stays 0) | 3+3+3 (all doubles), 45−40 | 45 / 40 | 35 | 0 |
| randL | 1194×834 | A🥕, AAB, … | which has more | 33 / 40 | 22 | 0 |
| t0P | 834×1194 | AAB, A🥕🥕, … | 6+7+3 | 48 / 40 | 29 | 0 |
| topL (2/2) | 1194×834 | growing ×4 | 6+7+6 | 43 / 40 | 19 | 0 |
| 🐢 gentleP | 834×1194 | A🥕🥕, A🥕, ABB, AB🥕 | 3+4+3 | 40 / 35 | 26 (284 s) | 0 |

No goal or hint line was said twice in any run. The only repeats were counting numbers and answer feedback such as "Yes, a log!".

Screenshots checked:
- `fly-menu-834`, `fly-menu-1194`: all three menu butterflies in view and apart
- `careP-counting`, `greedyP-basket`: butterflies high in the sky, clear of the hanging carrot
- `topL-ask-growing`: the ask card, with nothing moving at carrot height
- `careP-home-q0`: the three-crate shelf highlighted under "2 + 3 + 3 = ?"
- `wrongL-home-counton1`: the count-on line

`browser.mjs --ids bunny-hop --run bunny-hop-c2`: BOOT + PLAY ready, 0 errors. `node --check` passes on all edited JS.

## Checklist

No items were open. Both blockers and all five bugs are handled above. Improvements 1–7 are done. Number 8, a fork or a height row for tier 2, is still an idea.

## Remaining ideas

- A path fork ("which way has 4 carrots?") would give a second kind of decision for 6–8 year olds.
- The garden is still not kept between trips.

# Round 3 fixes (2026-10-11)

Review 1 scored 8.5 with no open checklist items. Review 2 scored 8.2. It had one open item: the harder tier for 6–8 could make the winter goal impossible. It also had two blockers. First, on the top tier the goal counted carrots that did not exist, so careful play fell short (37/40). Second, mashing met the goal in one run of three and was promoted to baskets.

## Design

- **The winter goal can always be met.** `Course.surest()` counts the carrots every row is sure to ask for, whatever tier the child reaches on the trip, after any shrinking for basket spares. It counts no pattern carrots, because some patterns are all obstacles. The goal is that number, rounded down to a five. Pattern carrots leave room for a slip or two.
- **Grass carrots need Pip's feet on the ground.** A low carrot (`it.low`) is only munched while `bunny.grounded` is true. A hop that skims it on take-off or landing goes over it, so mashing misses most grass carrots and pattern carrots.
- **Mission progress is never spoken as a bare number.** The game passes its own `announce` to `createAdventure`, which drops `'count'`. The tiles show progress, and the choice and the reward are still said. "1, 2, 3" is no longer followed by "2".
- **Tier 0 gives three pictures after the first pattern.** Only the trip's first pattern offers its own two pictures. Every later one adds the place's other obstacle or a carrot. Two lucky first answers in a row now have about a 1 in 9 chance, not 1 in 4. A first miss on a two-picture ask still brings in a third.
- **The fork: a second kind of choice for basket hoppers.** One trip on a basket tier has one fork. Tier 1 has it at the autumn wood's longer row, and tier 2 in the snow. Pip stops and the card asks "🧺7 · Which patch?". Each patch shows two little crates of carrots, with no numbers. One makes Pip's number. The other has one more or one less. Neither group is a lone carrot or more than five. The chosen patch becomes the row:
  - Too many: the child has to stop hopping at full.
  - Too few: the basket can't be filled ("6 of 7").
  - Right: "Yes! 4 and 3 make 7."
  - Wrong: "4 and 4 make 8. Stop at 7!"

  The decision is to add two groups and compare the sum to the order, and its consequence plays out in the row.
- **Larger gaps get the winter question.** The 'spare / more' question now runs for gaps of 1 to 20. Past ten, the count-on line starts with a `🥕×10` crate: 30 → 40 → 41 …, with the hint "Start at 30. Ten more, then count on to 45."
- **The garden wonders once.** The planted row may not repeat yet, with 3 or more flowers (4 for the three-colour ask). If the child then pauses for 4 s, Pip reads the row back once: "Blue, blue, yellow… what could come next?". A soft gold ring lights the group it could go on from.
- **"Pip needs N." waits after a spill.** It is not said within 8 s of "That's 6. Too heavy!", so two different numbers never come back to back. The fork says the number only if it hasn't been said this trip.
- **The golden-carrot tally is gone from the results.** A golden carrot is Pip's treat on the way and is not counted at home.
- **Menu (sideways tablets):**
  - The camera stands further back (`menuZ` 8, look 1.3), so Pip's ears clear the subtitle.
  - Butterflies keep below the title band (`world.flutterCeil` 0.12) and spread over x 1.6–4.8.
  - Sideways phones keep the old framing.
- **Bigger menu chips.** The mission and 🐢 chips are 62 px tall, with 36 px step tiles and 56×50 pace pictures. On short phones they are 52 px.
- **Pip stays in view while he asks (portrait).** While he asks, only the shelf he asks about shows, as short phones already did. Sideways tablets keep every shelf.
- **Softer butterflies.** A soft brown rim (`#a8755e`) and body replace the near-black, set at runtime through `copy` recolor. No GLB edit.
- Spoken pattern words start with a capital letter: "Look, a rock! Toadstool, rock, rock."

## Changes (under `examples/bunny-hop/public/`)

- `js/main.js`:
  - `menuZ` `:132`
  - mission `announce` `:177`
  - fork chosen in `start` `:309-316`
  - goal `:325`
  - winter gap ≤ 20 `:429`
  - garden wonder `:468-494`
  - tens-friendly `countOn` `:671`
  - `askFork` and `groupsOf` `:756,789-830`
  - spill/need spacing `:765,944`
  - `probe.grounded` `:1262`
  - `flutterCeil` and menu span `:1300-1308`
  - golden tally removed from `showResults`
- `js/course.js`:
  - `surest()` `:324`
  - tier-0 third picture `:393-399`
  - `layPatch` `:408`
  - fork branch in `build`
  - grounded-only grass carrots `:590`
- `js/learning.js`: `Cue.fork` `:272`, `groupOf` `:430`, garden `lead` `:508`.
- `js/world.js`: `BUTTERFLY_SOFT` `:72`, `flutterCeil` `:138,412`.
- `style.css`:
  - `.count-step.ten` `:82`
  - `.garden-place.lead` `:107`
  - chips `:122,163,284`
  - fork patches `:229-232,254,315`
  - folding to the asked shelf in portrait `:348`
- `index.html`: the `#golden` row is removed.
- `game.json`: `howToPlay` (fork, crate of ten, garden wonder).

## Evidence

Chromium (`--use-angle=gl`) with speech stubbed and logged. The scripts are `…/scratchpad/polish/bunny-hop/play7.mjs` and `play7b.mjs` (bots: careful, wrong, greedy, random, and spam, which taps every 160 ms), plus `forkpeek.mjs`, `gardenpeek.mjs` and `menu7.mjs`. Output is in `r7/` and `r7b/`. All runs had 0 console errors.

| Run | Viewport | Tier start | Fork | Pantry / goal |
| --- | --- | --- | --- | --- |
| careP | 834×1194 | 0/0 | — | 44 / 30 |
| t1P | 834×1194 | 1/1 | 7: 7 vs 8 → 7 | 50 / 35 |
| topL2 (whole rows mission) | 1194×834 | 2/2 | 6: 7 vs 6 → 6 | 48 / 35 |
| wrongP | 834×1194 | 2/2 | 6: 5 vs 6 → 5, then "5 of 6" | 45 / 30 |
| shortL | 667×375 | 1/1 | 7 → 7 | 52 / 35 |
| gentleP 🐢 | 834×1194 | 0/0 | — | 42 / 25 |
| spamP | 834×1194 | 1/0 | — | 23 / 35 |
| spam0L | 1194×834 | 0/0 | — | 28 / 35 |
| spamTopL | 1194×834 | 2/2 | — | 21 / 30, pattern tier → 0 |
| randP | 834×1194 | 0/0 | — | 24 / 35 |
| rand1P | 834×1194 | 1/1 | — | 30 / 35 |
| greedyP | 834×1194 | 1/0 | — | 37 / 35, stepped down to whole rows |

- **Goal:** every careful run met it, top tier included. No spam or random run did.
- **Spoken lines:**
  - With the whole-rows mission, the log has no bare mission numbers: "Three whole rows! Pip did not leave one behind." follows the rows directly.
  - The winter question with a crate of ten ran in wrongP: "How many carrots to spare?" → "Start at 30. Ten more, then count on to 45." → "45 is 15 more than 30."
  - The garden wonder fired once after a 4 s pause (`gw`: "Blue, blue, yellow… what could come next?", 3 places lit).

Screenshots checked:
- `r7/m-1194.png`, `m-1024.png`: ears clear of the subtitle, butterflies under the title, soft rims.
- `m-834.png`, `m-667.png`: menu chips 273×62 and 130×64.
- `r7/careP-home-q0.png` and `r7b/wrongP-home-counton3.png`: Pip and his door fully in view above the asked shelf.
- `r7b/peek-fork-834/1194/667/375.png`: the fork card. It fits every width, and the patches stack on 375.
- `r7b/gw-garden-wonder.png`.

`browser.mjs --ids bunny-hop --run bunny-hop-c3`: BOOT + PLAY ready, 0 errors. `node --check` passes on every JS file.

## Checklist

- **Harder tier (review 2):** closed. The winter goal is built from `surest()`, so perfect play on any tier meets it. The tier also gains the fork.
- **Both blockers:** closed (goal and mashing).
- **Bugs from both reviews:** all handled. That covers the mission numerals, the landscape menu overlap, the chip size, portrait results covering Pip, "Pip needs 6" after a spill, and dark butterflies.
- **Improvements:**
  - Done: review 1 numbers 1–7 and review 2 numbers 1–7.
  - The golden tally was dropped rather than folded in.
  - The fork is review 2's number 6.
  - The garden is still not kept between trips.

## Remaining ideas

- Keep the door garden between trips.
- A masher on the top tier is not stepped down on rows, because it misses carrots rather than overfilling. Its pattern tier does drop. Stepping down on two short baskets could be considered.

## 2026-10-11 — bug pass (feedback round 3, both reviews 8.5)

Every bug from both reviews, fixed under `examples/bunny-hop/public/`:

- **Sideways-phone sum showed a crate that was hidden** ("5 + 8 + 3 = ?" with only 5 and 8 on screen). The 🎵 crate now steps aside only when it is not in the sum: `askPantry` marks the asked shelf `with-tune` (`js/main.js:557`), and the rule is `.pantry-shelf.asked:not(.with-tune)` (`style.css:386`).
- **"Which has more?" kept the 🎵 crate on screen** (tablets and phones). The same rule now applies at every size, so only the two crates being compared show (`style.css:386`).
- **"Which has more?" could ask 1 against 0.** The little hoppers' question needs two crates that differ and each hold 2 or more (`js/main.js:549`). The adding question needs carrots in both crates (`js/main.js:541`). If no shelf qualifies, Pip goes straight to the total.
- **"4 of 5." said twice in one trip.** Both row-end lines now go through `voice.sayOnce`, still at most two a trip (`js/main.js:1019,1025`).
- **"Pip needs 4." then "Pip needs 5. Which patch has 5?"** A basket row followed directly by the fork no longer says its number (the 🧺 shows it). The fork's own question says the number (`js/main.js:793`).
- **The three-colour garden request had no follow-up.** The first two-colour pattern now hears, once: "Blue, pink, again and again. A pattern! Can you make one with three colours?" (`js/main.js:517`).
- **Portrait gap question read out of order.** The total now sits above the question panel in the pantry (`js/learning.js:399`). The panel reads: place sums, "= 42 🥕 ❄️30", then "🥕 42 − ❄️ 30 = ?" and its buttons.
- **Snow glints winked without end, and showed at home.** The glints are now still (no wink, no spin; `js/effects.js:341`). They show only while hopping, not at home or in the garden (`js/main.js:1342`).
- **Planted garden hidden (behind the landscape panel, and partly behind Pip and the mound).** The row now starts at Pip's right, in front of the burrow (`js/world.js:280`): x `HOME_X+0.8`, z 0.35, step 0.6 sideways and 0.48 upright. Measured flower centres: 1194×834 x 618–976 (panel ends at 472); 834×1194 x 435–753 (on screen).
- **The winter goal did not need the counting lesson.** The goal now adds the pattern carrots that perfect play is sure to munch (`surePatternCarrots`, `js/main.js:348`; goal `:325`). The count follows the right-answer ladder from the child's tier. On tiers 0–1, at most one pattern a trip has no carrots, and every other pattern has at least 3. A growing pattern may have none. That is 9 extra for a fresh 0/0 child, 0–3 for one on tier 1–2, then rounded down to a five. Perfect play still always meets the goal, so the goal cannot fully separate a greedy child: after two over-fills the child is stepped down to whole rows, and there hopping at every high carrot is the right play. The greedy margin is smaller, and some greedy runs now fall short.

Evidence: Chromium `--use-angle=gl` with speech stubbed and logged. The script is `…/scratchpad/polish3/bunny-hop/play.mjs` (same bots as `play7`), output in `r/`. All 14 runs had 0 console errors.

| Run | Viewport | Tier | Total / goal |
| --- | --- | --- | --- |
| careP | 834×1194 | 0/0 | 44/30 |
| t1P | 834×1194 | 1/1 | 45/35 |
| wrongP | 834×1194 | 2/2 | 42/30 |
| gentleP 🐢 | 834×1194 | 0/0 | 44/35 |
| shortL | 667×375 | 2/2 | 46/35 |
| topL | 1194×834 | 2/2 | 40/30 |
| greedyP | 834×1194 | 1/0 | 39/30 |
| greedy2P | 834×1194 | 1/1 | 38/35 |
| greedyL | 1194×834 | 2/0 | 36/45, short |
| randP | 834×1194 | 1/1 | 26/35 |
| spamL | 1194×834 | 0/0 | 21/40 |

What the runs show:

- **Pantry crates:** The asked-shelf DOM probe shows `with-tune` and the 🎵 crate `display:flex` on every three-number sum (`shortL-home-q0`: "2 + 3 + 3 = ?" with all three crates). The 🎵 crate is `none` on every "Which has more?" (`greedy2P-home-q0`: 2 vs 7, two crates).
- **Gap question order:** `wrongP-home-counton2` reads top to bottom.
- **Garden:** `gL-garden`, `gP-garden` and `shortL-garden` show all 8 flowers. `g3P`/`s3L` logged the three-colour nudge.
- **Voice:** no repeated row-end line in any run. The only repeats are counting 1–2 and the answer words "Yes, a carrot!" and "Listen.".

`browser.mjs --ids bunny-hop --run bunny-hop-f1`: BOOT + PLAY ready, 0 errors. `node --check` passes on every JS file.

Not changed:
- The 🐢 pace may still climb to the top tiers within a trip (review 1, improvement 7).
- A first-trip child reaches the growing pattern only on trip two (review 2, improvement 5).
- The garden is not kept between trips.
- On 667×375 the found-pattern strips overlap the planted flowers' stems. The flower heads stay visible.

## 2026-10-11 — round 2 bug pass (reviews 8.6 and 8.5)

Every bug from both reviews, fixed under `examples/bunny-hop/public/`:

- **The winter goal could be met without stopping at a full basket.** The goal had 10 to 14 carrots of slack: it was built from the lowest row asks on any tier, a cautious pattern count, and then rounded down to a five. It is now what careful play brings home, less two for a slip:
  - `course.careful(row, top)` (`js/course.js:325`) shapes each row as careful play will meet it: whole rows until two looking rows step up, then baskets.
  - Patterns count 3 carrots each except one (`js/main.js:332`). This holds because `shapeRhythm` now allows at most one carrot-free pattern a trip on every tier, growing ones included (`js/course.js:383-386`).
  - The goal is no longer rounded down to a five.
  - Every carrot past a full basket now tips **two** out, not one (`keptIn`, `js/main.js:995`; spill at `:980`). The first spill says "Two rolled out."
- **The 🐢 pace climbed to the top tiers in one trip.** `game.top` (`js/main.js:302`) caps row and pattern at tier 1 on the 🐢 pace, unless the stored tier was already higher. The caps apply to the row climb (`:1032`), the whole-row climb (`:1051`, which also no longer drops a tier-2 child to 1) and the pattern climb (`:936`). At home the 🐢 pace gets no three-number sum (`:531`) and no winter gap question (`:439`).
- **A careful child on a fresh device never met a growing pattern on the first trip.** The run of right first answers is no longer reset after a step up. Two right answers step up, and each one after that steps up again (`js/main.js:936`). careP now asks at tiers 0, 0→1, 1→2, and the snow pattern is a growing one.
- **Three sentences in a row at home.** When the winter gap is asked, the total line is gone (the number shows it). The question waits 1.8 s after the shelf answer (`js/main.js:439-445`). careP: "Yes! 5, 7 and 6 make 18." (177.2 s) → "How many carrots to spare?" (179.0 s).
- **"Pip needs 35 carrots" and "Pip needs 3" sounded alike.** The opening line is now "Pip wants 41 carrots in his pantry for winter." (`js/main.js:347`). The home line follows: "Pip wants 46 for winter." (`js/learning.js:529`).
- **Found-pattern strips covered the planted flowers on short sideways phones.** They are hidden while the garden is open (`style.css:390-392`). `r2/shortL-garden.png` shows all 8 flowers clear, with the 🌼 strip gone.
- **"Which has more?" drew the faded carrots that got away, with a "+" between the crates.** The asked crates drop their away carrots and are sized to what came home. The plus is hidden (`js/main.js:568`, `style.css:388`). `r2/randP-home-q0.png` shows 2 against 4, with the longer crate the bigger number.
- **Butterflies looked like dark olive silhouettes.** Their wings take 0.3 of their own colour as emissive, so the underside lit by the green ground light keeps its colour (`js/world.js:373-380`).
- **The fork never reached a child who climbed during the trip.** A trip starting on whole rows now keeps a fork for the autumn or the snow (`js/main.js:319`). If the child is still on whole rows when it is cued, it becomes an ordinary row (`:782`). The fresh careP and gentleP runs both met it.
- **Answer lines repeated** ("Yes, a carrot!" ×3, "Listen." ×4). "Yes, a carrot!" and "A rock." are each said once a trip. After that the rule is said ("Yes! Toadstool, rock, carrot."). On tiers 1–2, "Listen." is said once a trip (`js/main.js:921-944`).

Evidence: Chromium `--use-angle=gl` with speech stubbed and logged. The script is `…/scratchpad/polish3/bunny-hop/play2.mjs` (the same bots as before), run by `runall.sh`, with output in `r2/` and `r3/`. All 16 runs had 0 console errors.

| Run | Viewport | Start tier | Total / goal |
| --- | --- | --- | --- |
| careP | 834×1194 | 0/0 | 49/41 |
| care2P | 834×1194 | 0/0 | 44/39 |
| careL | 1194×834 | 0/0 | 47/42 |
| care1L | 1194×834 | 1/1 | 51/46 |
| shortL | 667×375 | 2/2 | 47/42 |
| wrongP | 834×1194 | 2/2 | 46/41 |
| gentleP 🐢 | 834×1194 | 0/0 | 38/36, ended 1/1 |
| gentle2P 🐢 | 834×1194 | 1/1 | 43/38, ended 1/1 |
| greedy0L | 1194×834 | 0/0 | 28/38 |
| greedyP | 834×1194 | 1/1 | 26/42 |
| greedy1P | 834×1194 | 1/1 | 29/46 |
| greedy1L | 1194×834 | 1/0 | 29/42 |
| greedy2L | 1194×834 | 2/2 | 26/40 |
| greedy2P | 834×1194 | 2/2 | 31/47 |
| randP | 834×1194 | 0/0 | 20/40 |

- Every careful run met the goal, by 2 to 8 carrots. Every greedy and random run fell short.
- No line repeats in any `r3` run, apart from counting numbers.

`browser.mjs --ids bunny-hop --run bunny-hop-f2`: BOOT + PLAY ready, 0 errors. `node --check` passes on every JS file.

Not changed:
- The door garden is still not kept between trips (review 1 #5, review 2 #6).
- Patterns on tier 2 are still all growing ones.
- The 🐢 goal margin is small (38/36), as the careful-play estimate is close to exact.
