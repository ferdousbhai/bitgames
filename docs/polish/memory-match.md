# Memory Match: polish log


## Round 12 (cosmetic) (2026-10-16)

- Night panels are saturated lilac (`#7950b5`), autumn panels warm brick (`#a9472d`); explicit panels skip the cream lerp. Only those two themes define panels; all other theme colours are unchanged (`public/js/main.js:46`, `:49`, `:868`). No mechanics, timing, board grid/progression, audio or input changes.
- Phone found-pair circles are 28 px with 17 px emoji and a 2 px gap (`public/style.css:195`). Eight fit one row at 390 px: x=76–314, y=76. Removed the duplicate coarse-pointer button rule from `style.css`; the identical rule remains once in `public/ipad.css`. Added the empty data favicon (`public/index.html:7`).
- Evidence: `/dev/shm/bitgames-work/codex/memory-match/r12.mjs`; `r12-{before,after}-{night,autumn}-{portrait,phone}.jpg` (768×1024 / 390×844) and `r12-{before,after}-win-phone.jpg` (eight-pair win, 390×844), all visually inspected. Real GPU: `ANGLE (Mesa, AGX G13/G14, OpenGL ES 3.2)`. Visual checks PASS: eight circles on one line, win card fits, 0 page errors, 0 speech calls. Each browser closes in `finally`; runs are sequential.
- Shared `mash.mjs` PASS for memory-match, including keyboard, three-finger palms and resting-hand checks: “30 s of mashing stays in play and saves no mute.” `git diff --check` passed. No outstanding cosmetic doubts; no build, commit or publish performed.



## Round 11 (2026-10-16)

- **Home before controls** (`public/js/main.js:2026`): removed the 4.2-second deadline. Every finale now shows the win card 1.25 seconds after its own returned end time, after homecoming and the final jump's explicit landing/reset. Conga and ring keep their full dances. Hold-control code is unchanged.
- **Reveal stays on its card** (`main.js:1039`): multi-row boards use a 1.12 target with an explicit **1.2 maximum including easing overshoot**, and only 0.16 forward reach instead of 0.4. The first test caught a 1.255 easing peak; the explicit cap fixed it and the rerun measured 1.2.
- **Three real calls** (`public/js/audio.js:8`, `sounds/build.sh`, `sounds/LICENSES.md`): added local CC0 dog/cow recordings by Joseph SARDIN (BigSoundBank) and a pig field recording by JarredGibb (Freesound). Mono 64 kbps trims total **27,922 bytes**. Notes include source URLs, licences, input/output SHA-256 and complete reproducible adaptation steps. Built only those three calls, using checksummed downloaded inputs. Existing synth fallbacks remain.
- **Contrast and faces** (`main.js:48`, `:1739`): savanna backs are deeper `#c2541a` with white stars; matched twins turn at most ±0.8 radians (~46°).
- **Idle hand** (`main.js:1420–1443`): repeats once after another 20 idle seconds. Animation-end cleanup plus a 2.7-second fallback now removes its visible state, including with reduced motion, so the second appearance can actually run. No third hint.
- **Phone landscape** (`main.js:1360`, `public/style.css:154`): slightly tighter framing by reducing short-screen reserved jump margin from 1.1 to 0.8; win card retains its found animals as small balanced rows above the vertical controls.
- **Evidence:** `/dev/shm/bitgames-work/codex/memory-match/r11.mjs` forced all five finales at 844×390, asserted every animal was home when the card appeared, checked eight visible in-viewport win bubbles, measured the reveal peak, and checked first/second/no-third menu hints. **0 page errors, 0 speech calls**, native **ANGLE (Mesa, AGX G13/G14, OpenGL ES 3.2)**. Inspected `r11-reveal.jpg` and `r11-party-1.jpg`; all cards/animals and all eight win bubbles fit.
- **Normal-play/audio check:** `r11-extra.mjs` cleared an actual two-pair board through `tapCard` and confirmed the new files fetched and decoded as AudioBuffers (dog 0.893 s, cow 1.75 s, pig 0.65 s), with 0 errors/speech. Inspected `r11-meeting.jpg` for landscape faces. Its first attempt timed out waiting for the breathing ▶ to become stationary; the corrected test clicks its current position.
- **Shared mash: PASS**, including keyboard taps, palms, resting hands and no persisted mute. Ran the required command with only `--loader /dev/shm/bitgames-work/codex/memory-match/out-loader.mjs` to redirect artifacts; no harness changes. Report: `chromium-mash/report.json`. Syntax (`main.js`, `audio.js`, shell builder) and scoped whitespace checks pass. One browser at a time, closed after each run. No shared edits, game build, commit or publishing. Physical devices and sound by ear remain unverified.

## Round 10 (2026-10-16)

- **Fair pairs** (`public/js/main.js:887`, `:1517`): removed rose materials and the tint costume entirely. Home animals lead each board; distinct visitor animals fill every remaining slot. All eight pairs on the biggest board are different animals. Pair IDs remain the matching authority. The win card now builds bubbles by pair ID (`:2022`), so it also remains one bubble per pair if repeats return later.
- **Gentler ▶** (`main.js:1987`): the largest board always returns to 2–4 pairs; during the climb, boards of 4+ pairs have a 30% chance of a 2–3-pair breather. Explicit menu size choices remain available.
- **Five parties** (`main.js:1804`, `:1951`, `:1962`, `:2000`): random selection excludes the previous finale. Added a two-wave hop fountain and a returning domino giggle. Conga and ring radii are inset 0.45 from the outer card centres, keeping the moving animals away from props. No hold-control code changed.
- **Night and phone** (`main.js:46`, `:847`; `public/style.css:195`): pale lavender panels, stronger soft face lighting and exposure, with the warm lantern preserved. At ≤420 px, all eight found bubbles share one centered line below the corner controls.
- **Evidence** in `/dev/shm/bitgames-work/codex/memory-match/`: `r10.mjs` sampled 100 large boards (eight distinct animals each), observed all five finales without consecutive repeats, and forced all five parties through their finished win cards (eight bubbles each). `r10-layout.mjs` independently sampled 100 largest-board wins and asserted the saved next size was always 2–4 pairs; checked single-line, in-viewport eight-bubble rows at 320/390/420 px; and actually cleared a two-pair board through `tapCard`. Both runs: **0 page errors, 0 speech calls**, native **ANGLE (Mesa, AGX G13/G14, OpenGL ES 3.2)**. Inspected `r10-party-0.jpg`, `r10-party-2.jpg`, `r10-night-320.jpg`, `r10-night-390.jpg`; `r10-baby.mjs` additionally revealed night babies (0 errors/speech); inspected `r10-night-baby.jpg`, where the pale-blue bonnets remain visible. Remaining party/night screenshots share the `r10-` prefix. Forced parties use test-only source injection; shipped code has no test hooks added.
- **Shared mash: PASS** (native GL, full default viewport/device scale). Required command used only `--loader /dev/shm/bitgames-work/codex/memory-match/out-loader.mjs` to redirect artifacts; assertions unchanged. Report: `chromium-mash/report.json`; screenshot: `chromium-mash/memory-match-mashed.png`. Mashing, palms, resting hands, saved sound and page-error checks passed. Syntax and scoped whitespace checks pass. No assets, shared code, builds, commits or publishing. Physical devices and sound by ear remain unverified.

## Round 9 (2026-10-16)

- **Unpredictable surprises** (`public/js/main.js:1025`, `:1540`): the pool now includes sleepy twins (a slow yawn, then a spring awake) and confetti sneezers (a wind-up and a small sneeze burst), alongside babies, hats and the existing golden cadence. The optional second surprise appears on 60% of boards with 4+ pairs and draws independently from the other non-gold kinds. Consecutive primary kinds still differ.
- **Home animals on big boards** (`main.js:915`, `:1528`, `:1646`): at most two off-theme pairs; remaining slots repeat local animals as rose-coloured variants with matching rose spots. Rose materials are cached. Each twin pair has its own ID, so a plain and rose fish cannot accidentally match. Variant pairs keep their identity when random specials are assigned.
- **Finale and framing** (`main.js:1354`, `:1369`, `:1999`): win relayout keeps physical card positions and dancing yaws intact (shuffle-dance can change array order). Conga/ring therefore return to the correct physical homes. After the final jump, every animal explicitly settles onto its own spot, babies retain their parent offset, and roll/rock/spin/tilt reset. Win framing reserves less jump headroom to avoid shrinking the animals excessively.
- **Snow** (`main.js:1707`): babies skip the skating tween, so it cannot overwrite the offset set by their arriving parent. Snowman prop creation is unchanged.
- **Colours and rows** (`main.js:43–49`, `:868`, `:2031`): mint garden mat; warm lighter inner panels for night/autumn; grid emoji rows from six animals upward and on every narrow viewport, preventing phone 5+1 wrapping.
- **Browser evidence** in `/dev/shm/bitgames-work/codex/memory-match/`: `r9.mjs` completed three actual 16-card boards with pair-ID matching, exercising ring/conga/roll-call at 390×844 and 1024×768; every final animal position/roll assertion passed. `r9-backs.mjs` checked the final rose implementation over 60 sea boards: no more than two visitor pairs, no visually identical distinct pairs, all surprise kinds observed; inspected mint/night/autumn backs, rose sea twins and an 844×390 snow finale. `r9-snow.mjs` directly reproduced overlapping place reaction/parent arrival and confirmed the baby's x stayed −0.12. All completed runs: **0 speech calls, 0 page errors**, native renderer **`ANGLE (Mesa, AGX G13/G14, OpenGL ES 3.2)`**. An initial supplementary run caught an accidental snowman-branch reference; it was corrected and both supplementary runs passed afterward.
- **Inspected screenshots:** `r9-2-390.jpg`, `r9-3-1024.jpg`, `r9-6-390.jpg` (full-board finales); `r9-backs-0.jpg`, `r9-backs-3.jpg`, `r9-backs-6.jpg`; `r9-sea-variants.jpg`; `r9-landscape-phone.jpg`.
- **Shared mash: PASS**, native GL at the harness's full 768×1024 viewport and device scale 1. Ran the required `TMPDIR=/dev/shm EXAMPLES_IDS=memory-match EXAMPLES_ORIGIN=http://localhost:4213 EXAMPLES_CHROMIUM_EXECUTABLE=/usr/bin/chromium node examples/_studio/tests/mash.mjs` with only `--loader ./out-loader.mjs` added to redirect artifacts into this workspace; no assertion or rendering changes. Report: `chromium-mash/report.json`; screenshot: `chromium-mash/memory-match-mashed.png`. Mashing, palms, resting hands, saved sound and page-error checks all passed. Syntax and scoped `git diff --check` pass.
- **Scope:** only this game's main source and this log changed in round 9. No assets, shared code, builds, commits, publishing or store writes. Physical-device play and sound by ear remain unverified.

## Round 8 (2026-10-16)

- **Places react to a found pair** (`main.js`, `placeSurprise`): garden petals spiral round the twins; farm hay hops; sea bubble rings circle and float; night fireflies gather close; snow twins skate a little figure-eight on their cards; the savanna palm bows; the autumn pumpkin wobbles with swirling leaves. These add no instructions, gates or timers. Geometry/materials are shared and the short-lived groups are removed after their animation.
- **A small surprise on every board.** One special pair is guaranteed; boards with 4+ pairs get a second, different special. Gold retains its existing rarity/cadence. Peekaboo now appears on 80% of boards, starting after one turn, including the smallest board.
- **Long-hold ghost clicks.** Suppression tracks the hold's initiating pointer ID with no deadline while it remains down. Its own pointerup/cancel releases suppression after the compatibility-click event turn. Other fingers' clicks cannot consume it. The document-wide palm/mash rules remain intact.
- **Portrait headroom.** Camera framing explicitly includes enlarged back-row animals, 0.5 units of hat height (also enlarged), and the 1.1-unit maximum trick/party jump.
- **Comments.** Moved the lighting/theme/flip documentation onto their actual functions and removed stacked comments above tinting and peekaboo.
- **Browser evidence.** `places.mjs` passed seven forced places (one real pair found in each), two distinct special pairs on every 8-card board, and seven 1.8-second single-finger home holds followed by lift: every lift stayed on the menu. `speechSynthesis.speak` calls: **0**; page errors: **0**. `place-0.jpg` through `place-6.jpg` were inspected, including hat headroom, bubble rings, fireflies, snow and each place's toy. An earlier `r8.mjs` run also completed one full 8-card board and held the win card's home button for 1.8 seconds, returning safely to the menu after lift; that longer seven-board run was interrupted to focus coverage on all places.
- **Shared mash: PASS.** Ran `examples/_studio/tests/mash.mjs` unchanged with `TMPDIR=/dev/shm`, `EXAMPLES_IDS=memory-match`, origin 4213, `/usr/bin/chromium`, and `EXAMPLES_CHROMIUM_ANGLE=swiftshader`. `trace-loader.mjs` redirects harness artifacts here, sets device pixel ratio to 0.5 at the same 768×1024 CSS viewport, and adds read-only pointer/state tracing. All assertions passed, including zero page errors. Trace showed the game staying won through prolonged multi-finger presses and the final ~2-second resting hand on win-home. Report: `chromium-mash/report.json`; screenshot: `chromium-mash/memory-match-mashed.png`. Syntax and scoped `git diff --check` pass.
- **Rendering limitation.** The machine's Chromium GL backend produced shader errors/blank 3D output. Two default-GL shared mash runs passed their safety assertions but failed overall on an initial WebGL-context page error. A full-resolution SwiftShader run ended on the menu and failed the shared check; its cause is unconfirmed. The reduced-pixel-density traced run above passed. A native-renderer rerun on a healthy GL host remains desirable before release. Visual checks therefore used Chromium SwiftShader, touch enabled, at 390×844 (0.5 device scale). The GL attempt is not visual evidence. No assets were changed.
- **Verification workspace:** `/dev/shm/bitgames-work/codex/memory-match/`. The shared handoff is deleted in the coordinator's working tree; it was not recreated. No build, commit, deployment, generated asset or shared-code edits.

## Fun pass (2026-10-16)

The owner's direction: the learning layers made the game boring. They are gone. What is left is a fun matching game a non-reader understands in seconds. There is no on-screen text and no voice.

### Removed

- **The TTS voice.** `js/talk.js` is deleted. `main.js` no longer imports `js/speech.js`; the file is still in `public/js/`, unused, and the coordinator owns it. Gone with it: spoken names, round goals, match phrases, the win recap and the clue words.
- **Modes and drills.** The Sounds (speaker cards), Babies (baskets, sleeping cradles) and Homes (group sorting) modes are gone, along with bow/hat look-alike twins and the 📖 animal book. Pairs are now always animal twins.
- **The 👀 peek.** It was a lesson-style helper and an extra button.
- **Adaptive next-board logic.** No more slips, recall counting or "careful" steps. ▶ on the win card simply moves up one board.
- **All visible text:** the logo, menu hint, "Level N" pill, banners, win title and lines, loading text and error sentence. Only `aria-label`s remain, for screen readers.

### Added

- **Menu.** A big breathing yellow ▶ (it goes straight to the next board), plus six board-size buttons drawn as little grids of face-down cards (2×2 up to 4×4). A finished board gets a 🐾. 🔊 is in the corner. The menu animals pop in with a pop sound; tap them to make them dance and call.
- **Flips.** The card leaps, stretches thin as it turns edge-on, then lands with a squash, a puff of dust and a pop. The animal pops out, calls its own synthesized sound (it bobs its head and body in time, see `chatter`), then does a random flourish: a twirl, a wiggle or a look around.
- **Match.** The second animal stays quiet on the way up. Then the two turn to face each other, hop, call together, and burst into heart-coloured stars. Each gets a gold ring, and the animal pops into its circle in the top row. Then both dance.
- **Miss.** Both animals shake their heads to a soft rising "uh-oh?". The cards turn back after 1–1.3 s, or at once when another card is tapped.
- **Toys.** Tapping a face-up animal makes it hop and call. Three quick taps give a big spinning jump with a boing. The tappable toys are unchanged.
- **Finale.** A bouncy little tune and confetti, then a roll call where each pair hops and calls. Next, a musical wave of hops runs left to right, one xylophone note up the scale per column. Last, everyone does one big spinning jump under a confetti shower. The win card (found animals, ▶ 🔁 🏠) appears after that. Tapping an emoji makes that pair hop and call.
- **Drawn hand.** An SVG glove taps twice and then fades. It only appears after a quiet while: on the menu after 7 s (pointing at ▶), on a board after 5 s if the child has never flipped a card, otherwise after 14 s. At most 2 times per board, and it hides on any touch.
- **Loading.** Hopping paws and a filling bar. A load failure shows a 🔁 reload button.
- **Saves.** The save is now `memory-match:v3` (no migration from v2).

### Round 2 (reviewer scored 7.5)

- **Bigger reveal.** The animal bursts out at 1.4× size, leaning 0.4 towards the camera, then settles with a squash (`Card.showAnimal`). `ANIMAL_SIZE` goes from 0.8 to 0.88, and back-row animals get up to +28% (`relayout`) to make up for perspective.
- **Variety.**
  - Each new board brings the next of six themes (`THEMES`, `applyTheme`): the mat blanket is re-dyed at runtime from `mat_felt.jpg` (canvas `color` blend), and the card back, panel and star change colour. No GLB was edited; `card_back`, `card_panel` and `card_star` are kept unbaked so they can be tinted.
  - **Golden pair.** A random 30% of boards (never the first) hide one golden pair. It has a gold spot, glowing animals and a fat ring, and it glitters with a twinkle sound when turned up. When found it plays a music-box chime, then does a forward flip followed by its own trick, and it keeps glittering. Its circle and its win-card emoji glow gold.
  - **Per-animal tricks** (`TRICKS`) on every match and on three quick taps: chase (dog, cat, fox spin after their tails), leap (frog, bunny), stomp (lion, cow, pig, elephant rock and stomp), flap (chick), flip (fish, penguin, panda).
  - The animals found on a board follow the child back to the menu parade (`game.friends`).
- **Distinct spot colours.** The 13 spot colours are now spread round the colour wheel.
- **Gentler difficulty.** `LEVELS` is now `[2, 3, 4, 5, 6, 8]`, so the biggest board is 16 cards. The menu pictures were updated to match.
- **Taps while busy.** The tapped card gives a tiny wiggle and a tick (`Card.wiggle`).
- **Idle life.** About every 8 s while no card is open, a random face-down card lifts a corner to peek (`Card.peekCorner`).
- **Smaller fixes.**
  - Toys must now be 97% on screen. Behind-the-mat toys may step forward as well as back, which fixes the cut-off beach ball.
  - The v2 save migration is removed.
  - 🏠 during play must be held for 0.7 s while a gold ring fills; a single tap stays in the game. A keyboard press still goes home, and the win card's 🏠 stays a single tap.
  - `game.json` `learning` is now fun-first.
- **Round 2 evidence.** Full boards were played at 768×1024, 1024×768, 390×844, 1194×834 and 844×390. In every run: 0 `speak` calls, 0 page errors, no visible text. A single 🏠 tap stayed in play, and holding 🏠 went home. A golden board was found, played and screenshotted (gold reveal and gold trick). The 1194×834 menu shows the ball fully on screen.

### Round 3 (reviewer scored 7.8)

- **Variety between boards.**
  - Seven looks now cycle from a random starting point (`game.boards` starts at a random index). Four of them are places that bring their own animals first, about 75% of the pairs:
    - the farm: green mat, red cards;
    - the sea: blue mat, rising bubbles;
    - the snow: icy mat, falling snowflakes (`Effects.weather`);
    - the savanna: sand mat.
  - Each board has at most one special pair:
    - golden: always within 3 boards (`GOLDEN_EVERY`), otherwise a 30% chance;
    - otherwise a 35% chance of babies (small and round with big heads, calling higher via `Sound.pitched`) or party hats.
  - Babies and party hats are fair, because both cards of the pair are the same.
- **Golden pair looks gold.** A shader blends every colour into gold by its brightness, so dark eyes stay dark and the pig reads gold too. Both animals wear a gold crown with ruby points.
- **Mute stays safe.** In play, 🔊 is now hold-to-toggle with the same filling ring as 🏠 (`holdButton`), so mashing it no longer mutes. The menu 🔊 stays a single tap.
- **Recorded calls.**
  - Elephant, lion, cat, chick and frog now play real recordings: CC0 or public domain from Wikimedia Commons, 8–15 KB MP3s each in `public/sounds/`. Sources, licences, checksums and trims are in `examples/memory-match/sounds/LICENSES.md`. `sounds/build.sh` rebuilds them byte-identically.
  - Dog, cow, pig, penguin, fox, panda and lion's fallback are re-synthesized with a new formant voice (`Sound.voiced`): a sawtooth through mouth-like band-pass resonances. Examples: the cow's moo opens from a hum, the pig oinks with a nasal flutter, the penguin brays.
  - Until a recording loads, its synthesized voice stands in.
- **Board sizes.** After the 16-card board, ▶ steps back to a random middle size (8–12 cards) and climbs again.
- **Layout.**
  - Back-row headroom is now framed (`ANIMAL_H * (1 + boost) + 0.55`), so jumps stay clear of the HUD.
  - Toys must clear the pair circles.
  - On landscape phones (height ≤ 500 px) the win card is a slim column of ▶ 🔁 🏠 at the side.
- **Mismatch.** The cards stay open for 1.3 s on every board size.
- **Round 3 evidence.**
  - Full boards at five viewports, each with: 0 `speak` calls, 0 page errors, no visible text, single-tap 🏠 stays in play, triple-tapping 🔊 leaves it unmuted, and ▶ after the top board went down to 8 cards.
  - The sound files are served with status 200.
  - Forced boards showed a gold bunny with crowns (snow), a baby fox (farm) and party-hat fish (sea).
  - Synth voices were rendered offline to check their spectra and levels.

### Round 4 (reviewer scored 8.0)

- **Every look is a place.** The three plain recolours are now:
  - the garden: drifting petals; bunny, frog, chick, cat;
  - the night: moonlit lighting (`setNight`) with fireflies; fox, cat, frog, panda;
  - the autumn wood: falling leaves; fox, bunny, dog, pig, panda.
  The weather is drawn by `Effects.weather` (petals, leaves, fireflies, snow, bubbles).
- **Specials.**
  - Gold is rarer: `GOLDEN_EVERY = 5`, `GOLDEN_CHANCE = 0.1`. In a 25-board sample it showed on 2 boards; party hats showed on 7 and babies on 2.
  - Party hats are 1.6× bigger and burst with confetti and a party-blower toot when revealed (`Effects.burst`, `Sound.toot`).
  - Matched babies get their grown-up, who pops up behind them and nuzzles (`Card.callParent`).
- **Gameplay surprises, with no timers.**
  - Peekaboo: on about 35% of boards after the first, once, 2–5 turns in, a hidden card lifts like a lid on a hinge. Its animal peeps out, waves and giggles, then hides again. Tapping that card flips it normally.
  - Shuffle-dance: on about 30% of boards with 3+ pairs, the face-down cards hop in a wave before play, then two pairs swap places in big arcs.
- **Finales take turns** (`FINALES`):
  - the roll call and musical wave;
  - a conga round the mat to a drum, with a golden pair leading in crowns;
  - a ring dance in the middle, stepping up a scale.
  All three end in the big jump and confetti.
- **Front-row faces.** Face-up animals lean back towards the camera (`lean`): more in portrait and on the front rows.
- **Win card.** More than 6 animals sit in two even rows, so 8 is 4 + 4.
- **Back-row pop-out.** It bursts to 1.25× on the back row instead of 1.4×, and stays clear of the HUD.
- **Round 4 evidence.**
  - The full five-viewport run passed with 0 `speak` calls, 0 errors, no visible text, 🏠 and 🔊 holds working, and the rotation after the top board.
  - Forced boards showed:
    - a conga on the night board with fireflies;
    - a ring dance on the garden board with a baby pair whose parents had appeared;
    - party hats in the autumn wood with a 4 + 4 win row;
    - a big-hat reveal, and a baby fox with its parent.
  - A 16-card portrait mismatch stays clear of the HUD.

### Round 5 (reviewer scored 8.2)

- **Bug fixed: one ▶ press started several boards.** `renderLevels` matched the win card's `#next` through `[data-level]`, which added a listener on every menu visit. The query is now scoped to `#levels`, and ▶ keeps its next board in `game.nextBoard`. Regression check: `next-regression.mjs`, adapted from the reviewer's repro, now reports "PASS: one press, one board".
- **Mute.**
  - 🔊 in the menu and in play mutes only on a hold; a single tap unmutes.
  - Mute is never saved: the save now holds only `done` and `next`.
  - Multi-touch safety in `holdButton`:
    - a second finger cancels the hold;
    - no new hold starts until every finger is off the button;
    - only the starting `pointerId` can end the hold;
    - stale rAF loops are cleared;
    - the tick bails out once the hold is cancelled.
  - Test: `palm.mjs` sends CDP `Input.dispatchTouchEvent` with 3 fingers lifted after 80–300 ms, on menu 🔊, in-play 🏠 and in-play 🔊, repeated 6–8 times, plus a 2 s three-finger press. The game stayed in play with sound on. A one-finger hold still mutes and a tap unmutes.
- **Specials.**
  - The same special never comes back to back (`game.lastSpecial`).
  - Measured over 60 boards: gold 11, hats 10, babies 10, plain 29, and no repeats.
  - Babies are smaller (0.6×), with short round bodies and bigger heads, and wear a pale-blue bonnet with a bow (centred on the head via `headBox`), so they read as babies before the match too.
- **Finales.**
  - The conga now dances in three stretches. At each stop everyone turns to the child and hops, and while moving they turn at most about 63°, so their backs don't show.
  - The ring dance is a wide oval spread evenly over the board, with everyone facing the child and swaying.
- **Places.**
  - Each place has its own runtime toy (`makeThemeProp`), 1.25× the other toys and tappable with a wobble and a bell: garden flower pot, farm hay bale, sea starfish and shell, night glowing lantern, snowman, savanna palm, autumn pumpkin.
  - The place's toy is placed first, behind the mat. Other toys now also avoid overlapping it.
  - Boards of up to 4 pairs use only the place's own animals.
- **Small fixes.**
  - The menu is reset to its own teal and purple look, with no place toy.
  - Ten cards in portrait now lie 2+3+3+2: short rows go to the ends, first and last in turn.
- **Round 5 evidence.**
  - Five-viewport full run passed: 0 `speak` calls, 0 errors, no visible text, holds working.
  - Plus `next-regression.mjs`, `mute2.mjs` (hold mutes, tap unmutes, a reload starts with sound on) and `palm.mjs`, all passing.
  - Screenshots checked: baby with bonnet next to its parent, conga stops, the wide ring, snowman, hay bale and palm, and the 2+3+3+2 layout.
  - Note: `/tmp` was full because of other projects, so the final browser runs used `TMPDIR=/dev/shm` for Chromium's temporary profile and skipped screenshots.

### Round 6 (reviewer scored 8.0)

- **Win card is mash-proof.**
  - Its 🏠 is now a hold, like the one in play.
  - ▶ and 🔁 wake up 0.6 s after the card appears (`armedButton`; they visibly brighten as they wake). A finger that was already down by then doesn't count.
  - Test (`r6.mjs`): three-finger taps hammered on 🏠's spot from the start of the party, for 7 s. The game stayed on the win screen, and a later ▶ tap moved to the next board.
- **Quick taps are kept.** A face-down card tapped while a pair is still turning wiggles, then turns over as soon as the board is free (`game.queued`). Tested: the third card ended up face up.
- **Shorter wait for the buttons.** The win card shows at about 4.2 s (measured 4.3 s); the party carries on behind it.
- **Night reads as night.** The wooden table turns dusky blue, and the lantern glows: a warm flickering point light plus an additive halo sprite. The light is always in the scene, so no shaders rebuild.
- **Autumn card backs** are now deep red-brown, which stands out on the orange mat.
- **Portrait boards with 3+ rows:** front-row animals are up to 14% smaller, so they don't stand over the cards behind them.
- **Round 6 evidence.**
  - Five-viewport full run: 0 `speak` calls, 0 errors, no visible text.
  - `palm.mjs` passes.
  - `next-regression.mjs` passes, updated to leave by Esc because the win card's 🏠 is now a hold.
  - Screenshots checked: night board with dark wood, and the win card.

### Hold rule (shared mash check, after round 6)

- **Fingers are tracked across the whole page.** `holdButton` keeps a set of every finger down anywhere on the document.
- **A hold starts only with one finger on screen.** Any other finger landing anywhere, on the board or on a button, cancels a running hold. Only the finger that started a hold can end it.
- **Applies everywhere.** This covers 🏠 in play, 🔊 in the menu and in play, and the win card's 🏠.
- **No key ends a board.** Esc no longer leaves; Enter on the menu still starts a board.
- **Checks.**
  - The shared `examples/_studio/tests/mash.mjs` passes: "30 s of mashing stays in play and saves no mute".
  - `palm.mjs` passes. It now also tests a resting hand: one finger on 🏠 or 🔊 and two on the board for 1.5 s.

### Round 7 (reviewer scored 8.0)

- **Ghost click fixed.** After a hold acts, the lifting finger's click is dropped once (`swallowNextClick`: a window capture listener with a 600 ms limit). The menu's ▶ and board buttons also count only a press that started after the menu appeared (`game.menuShownAt`). The reviewer's `ghost.mjs` repro stays on the menu after holding 🏠 on the win card.
- **After the top board,** ▶ now picks any smaller board, from a 4-card breather up to 12 cards. On a phone it went to 4 cards.
- **Each place's own toy always shows.** If its spot doesn't fit, it tries the other toys' spots (stepping back or forward a little), then smaller sizes (0.8×, 0.62×). It now appeared on every place, on 4- and 6-card boards, in both portrait and landscape (28 of 28). The lantern glows on the 3-pair portrait night board (screenshot checked).
- **Tinted tables.** Each place tints the wooden table (`tintTable`): green garden, golden farm, blue-grey sea, dusky night, icy snow, sandy savanna, russet autumn.
- **Parents.** A baby's parent now stands 0.8× size, behind the baby and to the side, staying on its own card.
- **Round 7 evidence.**
  - `examples/_studio/tests/mash.mjs` passes.
  - `palm.mjs` passes, as do `next-regression.mjs` (now leaves by holding 🏠) and the five-viewport full run: 0 `speak` calls, 0 errors, no visible text.
  - Each test ran in the foreground, one browser at a time, with `TMPDIR=/dev/shm`.

### Files

- `examples/memory-match/public/js/main.js`: rewritten around the twins loop (2141 lines before the fun pass).
- `public/js/audio.js`: baby pitch removed; `boing`, `note` and a bouncy `fanfare` added; softer `miss`.
- `public/index.html`, `public/style.css`, `game.json`.
- `public/js/talk.js` deleted.
- `public/js/effects.js`: `weather()` (round 3); petals, leaves, fireflies and `burst()` (round 4).
- `public/sounds/*.mp3`, `sounds/build.sh`, `sounds/LICENSES.md` (round 3).

### Evidence

Playwright with Chromium `--use-angle=gl`, touch, `speechSynthesis.speak` stubbed to count calls. Scripts are in the session scratchpad (`memory-match/play.mjs`, `extra.mjs`, `hand.mjs`).

- Viewports 768×1024 (board 1), 1024×768 (board 4, 12 cards) and 390×844 (board 6, 20 cards). Each run made one deliberate mismatch, then cleared the full board, reached the win, tapped ▶ (moved up one board), then 🏠.
- `speak` calls: 0. Page errors: 0. The only console error is the dev server's `/favicon.ico` 404.
- Visible text nodes containing letters or digits, on the menu, during play and on the win card: none.
- The drawn hand showed on the menu and on the board.
- Extra checks, all with 0 errors: triple-tap big jump, toy and parade taps, mute toggles, quick taps while cards close, resizing mid-board, and 🏠 mid-board.

### Notes for the coordinator

- `examples/_studio/tests/original-quality.mjs` still taps `#peek`, so that check needs removing or updating.
- `public/bitgames.json` is stale until the rebuild: it still lists `talk.js` and `speech.js`.
- `js/speech.js` is now unused by this game.

## History (short)

- **2026-10-04:** a 3D toy-room game: Blender animals, cards and props, six boards (2–10 pairs), tappable toys and synthesized animal voices.
- **2026-10-09 calm pass:** removed the idle card knocking, the praise banners and the confetti cannons. The win became one call at a time, with paws instead of stars.
- **2026-10-09 to 10-11 learning phases:** added spoken names, the Sounds, Babies and Homes modes, look-alike twins, sleeping cradles, the animal book and adaptive next boards. All of it was removed in the fun pass above. The 2026-10-09 audit is in `AUDIT_2026-10-09.md`.
