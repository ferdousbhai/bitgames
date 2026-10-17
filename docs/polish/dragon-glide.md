# Dragon Glide polish

## Sound holds on every screen (2026-10-17)

- 🔊 and 🎵 now use the same 700 ms single-pointer hold guard as 🏠, with a filling gold ring. Short taps, palms, resting fingers and focused Enter/Space cannot toggle either control. M and Escape no longer mute or leave the end card; forward play/restart keys are kept. Audio remains session-only.
- Updated the shared mash policy: forward transitions and deliberate results ▶/🔁/🗺 taps are allowed; unintended menu/title transitions and sound changes fail. Results navigation controls are excluded from the hold set. Hidden sound-control state is checked too.
- Dragon Glide passed menu/play/results in the twelve-game sequential Chromium run on the real AGX GPU. `sound-hold-positive.mjs` additionally passed deliberate holds in both directions and reload restoring sound/music, with zero page errors or speech calls. Evidence: `/dev/shm/bitgames-work/codex/dragon-glide/sound-hold-positive.{mjs,jpg}`; consolidated report: `/dev/shm/bitgames-work/codex/mash-policy-report.json` (full run, corrected map checks, focused failure reruns and final Dragon Glide pass recorded alongside it).
- No other game changes, build, commit or publish.

## Keyboard focus safety (2026-10-16)

- Both 🏠 hold buttons ignore Enter/Space (including repeats and keyup) and swallow native pointerless clicks. Any keydown or window blur cancels a pointer hold; the owning pointer's document-level up/cancel and lost capture clear its timer. Short taps leave no pending hold.
- Sound/music changes are blocked during flight and nests. Their settings are session-only: saved mute/music values are neither read nor written.
- Verification: shared `mash.mjs` PASS, including quick and held focused Enter/Space. `/dev/shm/bitgames-work/codex/dragon-glide/keyboard-safety.mjs` PASS: short tap + 850 ms stays in play, pointerless click ignored, key cancels pointer hold, deliberate one-finger 850 ms 🏠 hold returns to title without ghost restart, reload restores audio. Zero page errors and speech calls; screenshot alongside the script (`keyboard-safety.jpg`). No build, commit or publish.

## Fun pass (2026-10-16)

The owner's direction: the learning layer had made the games boring, so strip the forced lessons, the text and the voice, and make flying itself the fun. Kids are about 3 to 8. A child who can't read should get it within seconds.

### What the game is now

You touch or drag anywhere to fly Ember through four sky worlds (🌼 🍭 🏰 🌙). Nothing has to be done in order and nothing can be failed:

- **Cloud rings** come in short curved runs. Each one gives a whoosh, a burst of colour and an arpeggio a step higher than the last ring in its run. The third ring earns a barrel roll.
- **Treasure arcs.** Each world has its own sparkly treasures: stars, pink hearts and mint stars; pink and blue hearts; gold hearts, blue hearts and stars; stars and moons. They float in smiles, hills and slants to swoop through, and each one caught sings a step up the scale. A fourth in a row earns a roll. Every catch flies into the **bag**, a row of pictures at the bottom left.
- **Gems** in lines, waves and corkscrews. Catching them in a quick run climbs the pentatonic scale, so a trail plays a tune.
- **Bubbles** hold a treasure or a big gem. Fly into one or puff fire at it to pop it. **Sleepy lanterns** wake up and float away when Ember touches them or puffs fire at them. Tap anywhere (or the 🔥 button, or Space) to puff fire, in every world. Fire homes in generously.
- **The rainbow star** (restored from before the learning pass) hides twice per world. It gives seven seconds of a rainbow trail, gems flying to Ember, no bumps, a little more speed, a slightly wider view, a twirl and a sparkle run.
- **Swoops.** A fast climb or dive makes a rising or falling whoosh and wisps off the wing tips.
- **Bumps** with rocks, windmills, towers and lollipops end in a dizzy spin, birdie tweets and a floating 💫. They are never a failure.
- **The nest.** The family cheers and roars, and confetti falls. Then the bag pours out: each treasure flies toward Ember with a note, and they land in a row on the island with a sparkle. The family keeps them until the next trip. After about 3 s a big ▶ appears, showing the next world's picture, and a tap anywhere flies on.
- **End card:** each world's picture with the treasures found there, up to nine pictures a row, and 🔁 / 🏠. There is no score or grade.

### Removed

- All goals and lessons: numbered rings in order, decoy numbers, gathering by colour and shape, "more pink than blue" rules, oops corners, the nest sorting and number puzzles (`nest.js`), the "how shall we count next" picker, adaptive tiers and the `dragon-glide-level` save. Also gone: the hold before the nest, spare rings, "help" drifting, the cloud veil and the goal chip or banner.
- The voice: `createVoice` / `speech.js` is no longer imported, so nothing calls `speechSynthesis`.
- The shared counting mission (`adventure.js` and its menu of Free / Gentle / Count 4 rings). `adventure.css` is no longer linked.
- All text in the UI: the subtitle, "Let's fly!", "Drag to fly · tap for 🔥", world names in banners, "Home to the nest!", "Home sweet nest!", "Fly again", the "Next time" line and "Bonk!". The title is now the logo, the world picture buttons and one big round ▶. A world arrives as its emoji, popping in big.
- Text tips are replaced by a **drawn hand**. 👆 slides across the sky only when the child hasn't steered for 4 s. A hand taps above 🔥 once a world, only if the child steers but has never puffed fire and a lantern or bubble is coming.

### Files

- `public/js/main.js` rewritten around free flight, the bag, the hand, the rainbow star, swoops and the nest keepsakes. The camera and nest framing are kept.
- `public/js/course.js`: goal code removed. Added `treasures()` arcs, `power()`, the gem magnet, ring and treasure runs (`run.n` drives the rising notes), and bubbles with treasures in every world. Passed small things shrink away faster, so nothing hangs huge in front of the camera.
- `public/js/treasures.js` (new, from what was left of `goals.js`): treasure kinds, outlines, 3D meshes and SVG pictures. `goals.js` and `nest.js` are deleted.
- `public/js/worlds.js`: each world's `treasures` replaces its `goal`.
- `public/js/audio.js`: `power`, `powerDown`, `swoosh`, a climbing `hoop(n)` / `treasure(n)`. Removed `number`, `nope` and `counted`.
- `public/js/world.js`: keepsakes are capped at a dozen, shared between kinds, so the row fits on the island.
- `public/js/effects.js`: `Popups` simplified (no banner avoidance).
- `public/index.html` and `public/style.css` rewritten for the textless UI (bag, hand, emoji banner, round ▶). `adventure.css` is unlinked.
- `game.json`: tagline, howToPlay and learning updated.
- No Blender work: the `powerstar` model was already in `world.glb`.

### Hold rule (shared mash check)

- **Hold buttons follow the shared rule.** A document-level set counts every finger on the screen. A hold on either 🏠 starts only when that finger is the only one down. Any other finger anywhere cancels the hold and spoils new ones until every finger lifts, and only the holding finger's lift ends a hold.
- **Keys.** M and Esc no longer mute or leave during flight or at a nest. They still work on the menus, and Esc still leaves the end card.
- **Checks.**
  - Self-tests (`holdtest.mjs`) on both 🏠 buttons: 3-finger palms do nothing; 1 finger on the button with 2 resting on the canvas for 1.5 s does nothing, in either order; one finger alone held still goes home.
  - `examples/_studio/tests/mash.mjs` PASSes.
- **Ghost click.** Holding either 🏠 until it fires and then lifting on the same spot leaves the game on the title, at 768×1024, 390×844 and 1024×768 (`ghost.mjs`). Pointer capture already kept the click on 🏠. As a safeguard, the next click after a hold fires is also swallowed (`swallowNextClick`, forgotten 0.5 s after the lift).

### End-card consistency (after passing at 8.6)

- **The end card's 🏠 is press-and-hold, like the one in a trip:** hold for 0.7 s while a gold pill fills behind it. A shorter tap only wiggles it. One shared `holdButton()` now runs both 🏠 buttons.
- **🔁 stays a tap**, but it works only once the card has been up for 2 s (`END_PAUSE`; Space and Enter wait too). Fingers that were already down when the card appeared are ignored until they lift (`stale` pointer ids).
- **Checks** (`endmash.mjs`, at 390×844 and 1024×768):
  - A finger held down from ▶ and released on 🔁 2.3 s later was ignored.
  - 10 s of mashing (39 quick taps and 3-finger palms, half of them on 🏠) left the card up.
  - A deliberate tap on 🔁 afterwards restarted, and a 1 s hold on 🏠 went to the title.
  - 0 errors.

### Round 6 hardening (round 5 passed at 8.5/10)

- **The end card can't be skipped by mashing.** For 1.2 s after `finishTrip()`, 🔁, 🏠, Space and Enter are ignored (`endReady()`). A tap on 🔁 and on 🏠 straight after the end card appeared both left it showing.
- **Narrow upright screens fit the whole nest.** On portrait screens the nest camera steps back until a half-width of 4.8 fits across (`NEST_HALF_WIDTH`), so the parents' wing tips and the keepsake row show at 390×844. The 768×1024 framing is unchanged.
- **Candy Clouds has a third treasure:** a purple wrapped sweet (`sweet`, a new `candy` outline in `treasures.js`).
- **The trip-bar 🐉 sits higher** (`top: -34px`), so it no longer covers the stop it is at.
- The optional idea of shrinking lollipops as they pass was skipped: scaling the lollipop would move its collision shape.

### Round 5 (after an 8.1/10 review)

- **Treasures are guaranteed.** Every world now lays out treasure arcs at 10%, 40%, 66% and 88% along (`TREASURE_AT` in `course.js`), and more still come by chance. Mashing runs caught 14–24 treasures per world, against as few as none before.
- **🎵 and 🔊 show only on the title and the end card.** A mashing hand in flight or at a nest can no longer mute the game. M still toggles sound.
- **Candy Clouds rings are mint** (`#8ef0c8`, with a teal glow), so they stand out on the pink sky.
- **The night is softer.** The rings of light use normal blending everywhere (`Rings.setGlow` is removed). At night, glowing spark bursts are half as many and 25% smaller (`burst()` in `main.js`), and the rings are 55% the size and quicker (`ring()`). No white flare over Ember.
- **The candy nest has gumdrops instead of lollipops**, so nothing stands over the family's heads.
- **Smaller fixes.** The bag shows catches in the order they were caught (`game.caught`). On short sideways phones (height ≤ 480) Ember's lane tops out at 7.2 instead of 8.4, so she stays clear of the trip bar.
- **Checks.** Full trips and mashing runs (`r4.mjs`, `play.mjs`) at 768×1024 and 667×375 had 0 errors. Screenshots show mint rings on pink and calmer night catches.

### Round 4 (after an 8.4/10 review)

- **Portrait framing.** The camera keeps its 1.6 lift but now tilts down: the look point is `y·0.75 + 0.2`, where it used to be lifted by 4.3. The far end of the stream now sits about a third of the way down, and Ember sits a little below the middle, so neither the top nor the bottom is empty sky.
- **Birds have faces.** Each bird's head is now a group that turns back toward Ember and the camera, with bigger eyes, pink cheeks and a beak, and it tilts curiously. In portrait the birds stay within `lane.x − 0.3`, so none is cut off.
- **Near-miss treasures.** Treasures within about 3.2 units drift into Ember; the rainbow star still pulls from 9 units. In a mashing test (70 random taps per world) Ember caught 2–7 treasures per world.
- **Ambient touches per world** (`critter` in `worlds.js`, plus castle flags and night shooting stars):
  - 🌼 butterflies flutter beside a stretch and scatter upward with a papery flutter and a sparkle note when Ember brushes them.
  - 🍭 floating gumdrops squeak, squash and bounce away tumbling.
  - 🏰 every castle tower flies a pennant that flaps hard, with a flutter, as Ember swooshes by.
  - 🌙 shooting stars streak across the far sky every 5–11 s with a soft glide note.
- **Nothing blocks the middle.** Lanterns and bubbles about to slip past beside Ember shrink to 45%. Lit lanterns shrink away within 2 units, where they used to take 6.
- **🏠 is press-and-hold** during a trip: a gold ring fills round it over 0.7 s. A stray tap does nothing. Enter or Space on the focused button and Esc still go home at once. The end card's 🏠 is still a single tap.
- **The phone trip bar** starts right of 🏠 (`left: 72px`), so the 🐉 no longer collides with it.
- **Checks.**
  - Full trips at all four sizes had 0 errors and 0 speech calls.
  - A tap on 🏠 kept the game in play; a 0.95 s hold went to the title (`r4.mjs`).
  - Screenshots show the bird faces, gumdrops bouncing, the tower pennant and the new portrait framing (`birds.mjs`, `amb.mjs`, `flag.mjs`).

### Round 3 (after an 8.0/10 review)

- **Portrait framing.** The portrait FOV is now 66 (was 74) and the look lift 1.3 (was 2.6), so the stream of rings and treasures fills the screen instead of leaving the top half as empty sky. Ember still sits below the middle.
- **Every surprise is guaranteed three times a world**, at 16%, 50% and 80% along (`SURPRISE_AT` in `course.js`). They are no longer left to chance.
- **Friends** (`public/js/friends.js`, new, runtime geometry): every 26 s or so, starting a few seconds into each world, a little flock of 2-3 round birds in the world's colours flies up beside Ember with a tweet. The birds keep her company for about 11 s, bobbing and now and then waving a wing (with a soft tweet). They do a happy flip, one after another, whenever she catches a treasure, the rainbow star or a whole constellation. Then they flutter off, and they leave at every nest.
- **The rainbow trail** is now two thin streams from the wing tips, low and to the sides (size 0.2, one dot per tip per frame), so it no longer covers the view ahead.
- **The world banner** waits until Ember is 36 steps into the new world, when the sky blend (50 steps) is mostly done. It no longer shows over the old world's sky.
- **No first-time stutter.** `prewarm()` builds one of everything (bubble, treasures, rainbow star, lanterns, lollipop, rockets, constellation and line, rainbow rings, birds, a nest) at load and runs `renderer.compile`. A measured nest change (`addNest` about 1 ms, `keepsakes` under 1 ms) showed no long tasks, so the hitch was most likely a shader compiling the first time something appeared.
- **Cleanups.** Removed `game.puffs`, the `fingerAim` wrapper, the `title` key-hint tooltips in `index.html`, and the world buttons' name tooltips (aria-labels are kept).

### Round 2 (after a 7.4/10 review)

- **Touch to steer.** A touch anywhere sends Ember toward it, and dragging keeps her following. The whole sky maps onto her lane, because the camera follows her and her lane only fills a small part of the screen. A quick tap also puffs fire. A mashing run now moves her all over: 30 random taps, 0 drag hand. The mouse aims the same way. (`main.js` `aimAt`, pointer handlers)
- **Holding 🔥 or Space keeps puffing**, every 0.28 s (4 puffs a second in the test).
- **Portrait view.** The camera rides higher and looks further up, so Ember sits low on the screen with the path ahead above her. She is also 15% smaller while flying upright. (`flightCamera`)
- **Nothing fills the screen after a pass.** Rings shrink away within 1.8 units of being passed, with no grow-flash. Passed gems, treasures and other small things shrink within 1.2 units, and obstacles fade from 1 unit before Ember to 1 unit after.
- **Each world has its own surprise** (`worlds.js` `surprise`, `course.js`), about one in eight stretches:
  - 🌼 a swoopy tunnel of six rainbow rings that plays a scale;
  - 🍭 bouncy lollipops: every lollipop now *boings* Ember off with a jelly squash, sprinkles and a springy sound, never a dizzy bump;
  - 🏰 rockets to touch or puff at, which whizz up and open into soft fireworks (a thump and sprinkle notes, no bang or flash);
  - 🌙 dim stars in a heart, star or kite shape, which light one by one with rising notes; light them all and lines join them into a glowing picture, with a chord and a roll.
- **Shorter worlds** (`WORLD_LENGTH` 560, was 760) and **two rainbow stars per world**.
- **Catch feedback.** Ember grins and squashes on every treasure catch and lollipop boop (`dragon.js` `yum`). The bag bounces as each treasure lands, and the treasure itself pops bigger.
- **Small items.** The rainbow trail is drawn as solid coloured dots, so it stays rainbow instead of adding up to white. The trip-bar 🐉 is bigger. `game.json` has a fun-first `learning` and an updated `howToPlay`.
- **Checks.**
  - Full trips at 768×1024, 1024×768, 375×667 and 667×375 had 0 console errors and 0 speech calls.
  - In forced runs every surprise played: the rainbow rings, a boing, a firework launched and burst, and a constellation lit and joined (`surprise.mjs`, `night.mjs`).
  - The mashing and hold-fire checks are in `mash.mjs`.

### Evidence (first round)

Scripts and screenshots are in the session scratchpad `dragon-glide/` (`play.mjs` runs an autopilot full trip with real taps on ▶ / 🔁 / 🏠; `live.mjs` is real-time touch drags and taps; `rainbow.mjs` covers the rainbow star). Results:

- Full trips in 768×1024 portrait, 1024×768 landscape, a 375×667 phone and a 667×375 phone, all in Chromium headless (`--use-angle=gl`). Each had 0 console errors and 0 `speechSynthesis.speak` calls (stubbed and counted). No visible element has words of three or more letters on the title, in play, at the nests or on the end card (only the logo letters).
- The drag hand showed after 4 idle seconds and went away on the first drag. The fire hand showed in real-time play when fire hadn't been used.
- Nests: the treasures poured from the bag onto the island and the family stayed in view above ▶, in every orientation. The end card fits on every size (portrait phones use smaller pictures so the rows clear the sound buttons).

### For the coordinator

- `js/speech.js`, `js/adventure.js` and `adventure.css` in this game are no longer used. `package-originals.mjs` still lists dragon-glide under `adventure`.
- `examples/_studio/tests/original-quality.mjs` checks dragon-glide's mission choice, which no longer exists, so that test needs updating.
- `public/bitgames.json` (the hash manifest) needs a rebuild.

## Earlier history (summary)

- **2026-10-05:** learning missions added (shared counting mission).
- **2026-10-09 calm pass:** one calm speed (12), no score economy or graded stars, a nest that waits for a tap, softer particles and audio, no pulsing UI. The rainbow star lost its speed boost, and was later removed. This pass brings it back.
- **2026-10-09 Phase 2 and 2026-10-11 rounds 1 to 9:** one learning goal per world (numbered rings in order, gathering by colour or shape), adaptive tiers, nest puzzles, a spoken voice, help while waiting, a chosen counting challenge, and many layout fixes for the nest camera, banners and end card. The fun pass removed all of this. The camera framing work (faces under the top, the nest above ▶, the end card on the left of sideways phones) and the bug fixes are kept: passed obstacles fade, lit lanterns shrink before the camera, and the nest's garden fades on leaving. Details are in git history before 2026-10-16.
