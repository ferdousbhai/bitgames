# Penguin Bowling

## Small review fixes (2026-10-16, after 8.5)

- Title idle skips the backward head look when facing the viewer (`penguin.js:303`). Results puff away fallen pins and center the dancing penguin at least 1.3 units behind standing pins (`main.js:565`, optional reaction depth in `penguin.js:223`). Trophy hopper now matches the trophy font size (`style.css:158`).
- A real pointer swipe starting during `peek=1.6` already throws; no input change needed. With four stored swipes, the first aim now offers one reminder after eight idle seconds (`main.js:693`); later hints remain suppressed for experienced visitors.
- Focused browser check: **PASS**, renderer **ANGLE (Mesa, AGX G13/G14, OpenGL ES 3.2)**, zero page errors and zero speech calls. Checked title head yaw, hint hidden at 7 s and visible at 8.6 s, peek swipe entering roll, no remaining fallen pins, standing-pin clearance 1.597 units, and hopper/trophy both 48 px. Script and inspected JPEGs: `/dev/shm/bitgames-work/codex/penguin-bowling/{check.mjs,title.jpg,hint.jpg,results.jpg}`. Results setup uses the real final-roll transition with controlled pin/card state; this was a focused check, not a new balance review. JS syntax checks passed.

- Shared mash check with the required command and default real GPU GL: **PASS** — “30 s of mashing stays in play and saves no mute.” No builds, asset changes, shared-file edits, commits or publishing.

## Fun pass, round 6 (2026-10-16)

- **Swipe beats Go on fresh racks:** Go spread widened from ±0.04 to ±0.06 radians (`public/js/main.js`, `go`); second-slide spread and all swipe/spare assistance stay unchanged. Four five-frame games per mode, using the real physics accelerated through `__pb.frame(1/60)` and actual mouse swipes drifting −55 to +60 px over 300 px forward: Go **0/20** opening strikes, swipe **5/20**. Go still produced 6–9-pin openings regularly. Small stochastic sample, not a guaranteed rate.
- **Locked hats respond:** removed native `disabled`; wardrobe taps give a 450 ms wobble, quiet falling sine boop and 1.1 s sideways/upward penguin glance, without equipping or saving the locked hat (`main.js` wardrobe, `penguin.js` idle head pose, `style.css` hat-wobble). Browser confirmed null worn hat, active wobble and glance after a locked tap. Won hats retain their existing hop/spin/equip behavior.
- **Results leave the party visible:** compact card anchored at the bottom, smaller trophy/buttons, camera shifts the deck upward; results explicitly start the big penguin dance even after a missed final slide (`main.js` gameOver/updateCamera, `style.css` results overrides). Checked screenshots at 768×1024 and 844×390: the full 3D penguin is above the card. The title framing is unchanged.
- **Strike/spare variety:** strikes keep gold racks and ⭐; spares use purple racks and ✨, including the final frame based on its first two rolls. 🔊/🎵 now hide with the other HUD controls on results. No words added.
- **Evidence:** session scratchpad `codex/penguin-bowling/verify.mjs` (four games each), `visual.mjs` (extra swipe game), `results-portrait.jpg`, `results-landscape.jpg`. Both browser runs: **0 page errors, 0 speech calls**. Accelerated balance runs skip rendering during physics; visual runs render the resulting real scene. A resize capture initially cleared the canvas; waiting for resize before rendering fixed the capture.
- **Checks:** syntax checks for main.js/penguin.js passed. Standard GL launch on this machine failed WebGL context creation before title, so the shared mash check was rerun using its supported `EXAMPLES_CHROMIUM_ANGLE=swiftshader` setting; **PASS**: “30 s of mashing stays in play and saves no mute.” The first software-rendered mash run exposed short taps completing holds during long render stalls. Hold progress now accumulates at most 50 ms per animation frame instead of counting an entire stall; document-wide pointer cancellation and the ghost-click guard remain intact. Sound/music choices are session-only, ignoring old saved mutes and never saving new ones, as required by the brief. No build, shared-code edits, asset changes, commit or publishing.
- **Focused final safety check:** `holds.mjs` PASS: locked hat stays unworn, each HUD button rejects a 1.5 s resting palm, single-finger sound holds toggle both ways, home hold exits and its lift leaves the title alone, no saved mute, zero errors/speech. Rendering is suppressed after loading for this input-only check. Under software throttling, home needed a 2 s hold (a 1.1 s trial stayed safely in aim); normal frame-rate hold targets remain 0.6/0.7 s.
- **Handoff:** `docs/POLISH_HANDOFF.md` is absent in this checkout; followed the worker brief and this living history.

## Fun pass, round 5 (2026-10-16, after an 8.3 review, plus the shared hold rule)

- **The title penguin is in clear view**, facing us with the lane and pins behind it: under the card when upright, to its right when sideways (the camera turns to place it, `titleOff`; the card sits at the top or left). Picking a hat makes it spin, hop, squash and sparkle with a chime. Checked at 768×1024, 1024×768, 844×390, 375×667 and 740×360: the hat is visible in all five.
- **Locked hats** are dark silhouettes at 0.6 opacity. **The wardrobe shrinks** (34 px) instead of hiding on screens 380 px tall or less.
- **Swipes that start on a button work** (`pressable`): a finger that lands on 🐧💨 or ◀ ▶ and slides 22 px or more becomes a swipe from where it landed. A tap still slides or steps. Checked: swipes from #go and #left both threw as swipes.
- **Swiping beats Go in landscape too.** Go's full-rack spread is now ±0.04 rad, with power 0.58–0.90. Four games each at 1024×768: swipe `[[7,3],[8,2],[9,1],[10],[10,9,1]]`, `[[10],[10],[9,1],[7,3],[7,3,6]]`, `[[10],[9,1],[8,1],[8,2],[9,1,9]]`, `[[10],[8,1],[10],[9,1],[8,2,10]]`; Go `[[8,1],[8,1],[4,5],[3,6],[5,4]]`, `[[7,3],[6,2],[9,1],[3,7],[3,7,9]]`, `[[7,3],[6,2],[3,7],[6,4],[9,1,10]]`, `[[7,3],[7,2],[9,0],[5,3],[8,2,7]]`.
- **Lane surprises come up more:** a lane's own event has three times the weight in both the spare party and the 45% after other slides, and Night stars now come after 4+ pins.
- **The aim dots start well ahead of the penguin** (the first at 1.9 units), never across its back.
- `touchmove` `preventDefault` is guarded by `e.cancelable`.
- **Hold rule** (`holdButton`):
  - A document-level set of pointers is kept. A hold starts only when exactly one finger is on the screen; any other finger anywhere cancels it, and nothing restarts until all fingers lift.
  - Only the starting finger ends the hold early.
  - Enter or Space on a focused button is instant; Escape only leaves from the results card.
  - The results card's 🏠 is a hold too (a light fills the pill).
  - **Ghost clicks:** when a hold fires with the finger still down, the click that follows its lift (within 500 ms) is swallowed.
- **Evidence:**
  - The shared `examples/_studio/tests/mash.mjs` PASSes (run three times).
  - Own CDP tests: three-finger mashes on 🏠/🎵/🔊 (at once and rolling) fire nothing; a single held finger still mutes and exits.
  - Holding 🏠 (in play) and the results 🏠 until they fire, staying down 300 ms and lifting in place, changed nothing on the title in four sizes. A click forced onto ▶ while the finger was still down was swallowed.
  - 0 errors and 0 speech calls.

## Fun pass, round 4 (2026-10-16, after an 8.0 review)

- **Second-slide swipes are a good shot, not a given.** With fewer than 10 pins standing, the aim assist is 0.38 (0.13 for a sideways swipe) and drift counts at 0.26. A full rack keeps 0.5 / 0.2 and 0.22. Six swipe-only games with drifting child swipes made 17 of 26 spares (65%), with some comic 9-0 and 8-0 misses: `[[9,1],[8,2],[5,4],[8,1],[10,10,7]]`, `[[9,0],[8,2],[10],[8,2],[8,0]]`, `[[7,3],[10],[6,3],[9,1],[9,1,8]]`, `[[8,2],[8,2],[9,1],[7,3],[6,4,9]]`, `[[10],[8,1],[5,3],[9,1],[9,1,6]]`, `[[9,1],[8,2],[9,0],[8,2],[9,0]]`.
- **Spare parties take turns.** The baby slider comes at most every third spare (`game.babyAt`, separate from `game.event`). Other spares pick a fresh one from the pins' conga round the deck (new `Pins.conga`, with a hop-hop beat), the crowd wave (new `Crowd.wave`, babies jump one after another with chirps), the shower, the Fishy Bay fish leap and the Night shooting stars. After a non-strike slide, a 40% chance of shower, wave, baby (not straight after one), leap or stars. `game.event` is no longer cleared when nothing fires.
- **The drawn swipe follows the penguin:** each frame it starts from the penguin's on-screen x (`placeHint`).
- **Reasons to come back.**
  - **A hat wardrobe on the title card** (👑 🎉 🎩 🐟). Hats won with strikes glow and can be tapped to wear (tap again to take off); the rest wait as pale shadows. Won hats are stored (`penguin-bowling-hats`). Strikes now win the next hat not yet won.
  - **A rare cheeky pin:** about one rack in eight from frame 2, the head pin somersaults over the penguin as it arrives and lands back on its spot with a thump (`Pins.dodge`/`updateDodge`).
- **Escape** only leaves from the results card; during play it does nothing (🏠 is held instead).
- **The top-bar 🏠** is hidden on the results screen, which has its own.
- **Multi-touch-safe holds** (`holdButton`): it tracks every finger on the button, a second finger cancels the hold and nothing restarts until all fingers are up, the hold keeps its starting `pointerId`, any pending rAF is cleared before a new hold, and the tick bails out once cancelled. Tested with CDP `Input.dispatchTouchEvent` on 🏠, 🎵 and 🔊: six rounds each of three fingers (at once, or rolling on 30 ms apart) lifted after 80–300 ms, plus a palm leaving one finger down for 1.2 s. Nothing fired (still aiming, sound and music on); a single-finger hold still mutes and exits.
- **Evidence:** at 768×1024 with touch, 0 errors and 0 `speechSynthesis.speak` calls. The screenshots show the wardrobe (two won, two shadows), the hint on the penguin moved right, the head pin mid-somersault over the sliding penguin (still standing afterwards), the conga ring, the crowd wave and the results with mixed racks. Escape during aim kept play; on results it went to the title.

## Fun pass, round 3 (2026-10-16, after an 8.2 review)

- **Swiping beats Go.**
  - Swipe aim gain dropped from 0.4 to 0.22, and a mostly-forward swipe gets an aim assist: half of the way to the line from the penguin to the head pin, or to the group of pins it lined up with (`aimAt`).
  - Go's spread is ±0.025 rad on a full rack and ±0.055 on a second slide.
  - Results, three games each in portrait with drifting child-like swipes (±60 px): swipe `[[10],[5,5],[6,3],[9,1],[7,3,8]]`, `[[10],[8,2],[9,1],[10],[7,3,8]]`, `[[9,1],[10],[5,5],[9,1],[3,7,10]]`; Go `[[10],[10],[9,1],[2,8],[10,10,10]]`, `[[9,1],[8,0],[9,1],[2,7],[7,3,1]]`, `[[9,1],[7,3],[8,2],[7,2],[8,1]]`.
- **The golden pin is really gold.** It uses a solid gold material without vertex colours, with a warm additive halo sprite and a twinkle about three times as frequent, so it reads even in the back row.
- **The results 🐧** hops along the frames, then jumps up beside the 🏆 for its dance instead of sitting on medal 5.
- **`game.event`** is cleared in `start()`, and a leaping fish in flight is cleared on start and title.
- **Lane surprises:** in Fishy Bay a fish leaps out of one gutter, flips over the pins and splashes into the other (`updateLeap`). On the Night lane, shooting stars streak across the sky after a big knock (6+), and on every strike there (`effects.shootingStar`). The surprise is picked from the lane's options at 45% odds after a non-strike slide; a spare still brings the baby.
- **Hats:** a fourth one, a top hat with a red band; strikes now cycle crown → party hat → top hat → fish. The party hat sits tilted on the side of the beanie, clear of the pom, and the crown sits lower.
- **🎵 and 🔊** are press-and-hold like 🏠 (`holdButton`, 0.6 s with the filling ring), so mashing can't mute. Checked: a short tap leaves the sound on and a hold mutes it.
- **Evidence:** Playwright with real CDP touch at 768×1024 and 844×390 (see the round-2 sizes too). 0 errors and 0 `speechSynthesis.speak` calls. The screenshots show the gold pin glowing in the back row, the fish leap, the shooting stars, all four hats and the results penguin beside the trophy.

## Fun pass, round 2 (2026-10-16, after a 7.6 review)

- **Surprises.**
  - **Special racks:** from frame 2 on, about half of fresh racks are special (`specialPin`, `Pins.setSpecial`). A rack holds either a giant snowman at the front (1.6× size and physics, lands with a "whumpf") or one golden pin that twinkles and, when knocked, gives a gold chime and gold confetti. The camera takes a 1.6 s peek at the pins first, and any touch skips it.
  - **After a slide** (`surprise`): sometimes a baby penguin from the bank dives into a gutter with a "wheee" and belly-slides down to join the party (`Crowd.slider`). Every spare gets one; never twice running. Or a snow shower drenches the deck and jiggles the pins; in Fishy Bay the whale spouts it.
  - **Strike hats:** every strike gives the penguin the next hat (crown → party hat → a fish on its head), built from runtime geometry. The hat is remembered between visits.
- **Go is no longer automatic or useless.**
  - The Go button now has a random push-off (power 0.62–0.92) and line (±0.025 rad), and the wobble on every slide is 0.014.
  - For a second slide the penguin lines up with the biggest group of pins left.
  - Four Go-only games: `[[10],[10],[9,1],[4,4],[10,7,2]]`, `[[8,1],[5,4],[10],[8,2],[5,5,7]]`, `[[10],[9,1],[10],[9,1],[8,2,9]]`, `[[10],[9,1],[1,8],[10],[10,9,1]]`.
- **Curve button removed**; a curvy swipe curves, and the aim dots bend with the finger.
- **Aim dots** are yellow while waiting and pink while a swipe is drawn. A soft wave runs down them, and they swell with swipe power (`Lane.showAim`).
- **Results are an event.** A little 🐧 hops along the frames; each rack pops in as it lands with a rising note; star frames bounce. Bigger dots, kept on one row down to 375 px wide. Confetti and a crowd cheer at the end.
- **Music** plays A A B A with rests (new B melodies and bass). Off-beat plinks join from frame 2, a soft shaker from frame 4, and a twinkly echo plays for a while after a strike or spare.
- **The swipe hint** stops for good after three swipe slides (stored) and shows at most five times a visit.
- **Night lane:** the curtain behind the pins becomes a glowing starry sky with an aurora ribbon and a moon (`nightCushionTexture`), so night reads while aiming.
- **🏠 during play is press-and-hold** (0.7 s, an amber ring fills; letting go early does nothing). Esc still exits. On the results card 🏠 is a single tap.
- **Evidence:** Playwright with real CDP touch at 768×1024, 1024×768, 844×390 and 375×667. Each run had 0 errors and 0 `speechSynthesis.speak` calls. A short 🏠 tap stays in play and a hold exits. The screenshots show the night curtain, the bent pink swipe dots, the baby sliding and arriving, the shower, the crown and party hat, the giant and golden pins, and the results hop.

## Fun pass (2026-10-16)

The owner's direction: the learning layers had made the game boring, so strip forced education, text and the voice, and make it fun and wordless for ages 3–8. The slide, the crash and the reactions are now the game.

### Removed

- **Every counting and planning layer**: the fallen + standing = 10 bond card, tap-to-count, "how many?" number choices and the 1–10 strip, the snow-cloud "missing part" questions, "where are the pins?" and "which side has more?", plans ("a few or a lot", "knock down 8", "leave 2"), footprints, adaptive tiers, the ages chip, the bumpers-down offer, the ways-to-make-10 results staircase and the 💭 pin prediction.
- **The voice**: `js/speech.js` is no longer imported, so nothing is spoken (checked: 0 `speechSynthesis.speak` calls over full games).
- **Text**: the "Strike!/Spare!/Wheee!" banners, "Frame 2/Last frame!" pills, "Polishing the ice… 1/3", the lane labels (Igloos/Night/Fishy), the Bumpers/Ages/Frames chips and the number scorecard. The only letters left are the PENGUIN BOWLING logo.
- **The 5/10-frame choice**: games are always five frames.
- **Files**: `js/count.js` (deleted), along with the `#labels`/floating-label code in `effects.js`. `js/speech.js`, `js/prediction.js` and `prediction.css` stay on disk as the coordinator's shared copies, but nothing loads them.

### Added (the fun)

- **A note for every pin that falls** (`main.js` `watchFalls`, `audio.topple`): each pin that tips says "bwoop", a note higher than the one before, with a puff and sparkles in its own colour. A strike plays a tumbling run up the scale.
- **Slow motion on the crash**: when the penguin hits a full rack hard, about half a second runs at 40% speed and then eases back.
- **Squash and stretch** (`penguin.js`): a stretchy dive, a squash and spring-back on every pin or bumper hit, and a little squash when it lands on the start line.
- **Bumpers go boing**: a springy sound, a squash and a puff of snow.
- **Jiggly pins** (`lane.js` `squish`): snowmen and fish wobble when they are hit, and also when a child taps one while aiming (with a squeak and sparkles).
- **The penguin pops up behind the pins** (`Penguin.react`): it pops out of the pit with a "pop!" while the pins are still falling. It hops and flaps after a good knock, does bigger hops with spins after a strike, and wobbles dizzily with a "whoops" if nothing fell.
- **Strike and spare party**: a single burst of paper confetti (new `effects.confetti` pool), the crowd cheer and the fanfare. On a strike, the pins dance. Nothing flashes, and nothing shows a score.
- **A drawn swipe affordance**: a finger sliding up a dotted yellow trail with an arrowhead. It appears only when the lane sits untouched (after 2.5 s for the first three slides, after 9 s later on) and goes away at the first touch.
- **Wordless HUD**: one pip per frame. The current pip breathes, finished pips fill blue, and strikes or spares turn gold with a ⭐. The rack map stays as the visual tally.
- **Wordless results**: a bouncing 🏆 and one tiny rack per frame showing the pins it knocked, with a gold card and ⭐ for strikes and spares, then 🔁 and 🏠.
- **Title**: the lane buttons are pictures only, the 🛟 bumper toggle shows a red slash when off, and a big ▶ gives a gentle nudge every few seconds. The logo letters bob in a wave. The whale spouts with a squeak, and it no longer goes quiet while the child aims.
- **Closer camera after the slide**, so the falling pins and the penguin's reaction fill the screen.

### Files

`examples/penguin-bowling/`: `game.json` (tagline, howToPlay, learning), `public/index.html`, `public/style.css` (rewritten; dead bond/plan/where/banner CSS gone), `public/js/main.js` (rewritten, about 1,900 lines down to about 800), `public/js/penguin.js`, `public/js/lane.js`, `public/js/effects.js`, `public/js/audio.js`, `public/js/score.js` (always five frames), `public/js/count.js` (deleted). No GLB or Blender changes.

### Evidence

All checks ran in headless Playwright on Chromium (`--use-angle=gl`) against `http://localhost:4213/penguin-bowling/?debug`, using CDP touch swipes. Scripts are in the session scratchpad (`play.mjs`, `extra.mjs`).

- Full five-frame games in portrait 768×1024, landscape 1024×768 and a sideways phone at 844×390: real swipe-up slides, curvy swipes and Go taps, then game over, 🔁 again and 🏠 home. Each run had 0 page or console errors and 0 `speechSynthesis.speak` calls.
- Visible text: title `P E N G U I N B O W L I N G 🏠 🌌 🐟 🛟 ▶`; play `🏠 🎵 🔊 ◀ ▶ ⬆️ 🐧💨` plus the 👆 hint; results `🏆 🔁 🏠`.
- Screenshots: the crash shows the puffs, sparkles and penguin-coloured pins tumbling. The penguin pops up behind the deck in joy, wow and dizzy moods. A landscape strike shows the confetti and the pin dance. The Fishy lane has fish pins. With bumpers off, a gutter slide gives 0 pins and the dizzy penguin. Tapping a pin while aiming sets its squish.

### For the coordinator

- `examples/_studio/package-originals.mjs` still copies `js/speech.js` (for every original) and `js/prediction.js` + `prediction.css` (the `penguin-bowling` entry) into this game. All three are unused now; the entry can be dropped.
- `examples/_studio/tests/original-quality.mjs` lines ~154–178 test `#predict-pins` and `#pin-discovery`, which no longer exist, so that block needs removing or replacing. `window.__pb` still exposes `game`, `pins`, `penguin`, `card`, `throwPenguin`, `camera` and `frame`.

### Doubts

- The tenth-frame bonus rules still apply to frame five (a strike or spare there earns extra slides). They are not explained, but they read naturally as "more slides".
- On the second slide the penguin starts in the middle again. Hitting the pins left standing is up to the child's ◀ ▶ or swipe angle; there are no footprints any more.

## History (condensed)

- **2026-10-04/05: first release and polish.** A belly-sliding penguin, snowman and fish pins, three lanes, bumpers, swipe and curve. A run of layout fixes made the pins bigger on phones and tablets and kept the penguin, pins and buttons clear of each other on small portrait and landscape screens. Added a night lane and a remembered music choice.
- **2026-10-09: calm pass.** Replaced the fireworks, star grades and praise words with soft celebrations. Shake now comes only from the impact. Added a reduced-motion block. Fixed confetti lingering into the next aim.
- **2026-10-09 to 10-11: learning rounds 1–8.** Counting, number bonds, predictions, plans, "where are the pins" and adaptive tiers, reviewed up to 8.5 as an educational game. The fun pass removed all of it; it can be recovered from git history if needed (e.g. `git show dd70d35:examples/penguin-bowling/public/js/main.js`). Kept from those rounds: pins pushed off the deck puff away, leaning pins straighten before the next slide, the frame card has no running score, the tablet camera framing, and the remembered sound and music.
