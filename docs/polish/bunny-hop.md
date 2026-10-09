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
