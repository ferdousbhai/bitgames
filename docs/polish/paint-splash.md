# Paint Splash: polish log

## Hold-rule check (2026-10-16)

- **Ghost clicks fixed.** When a hold fires, the click from lifting that finger is swallowed once (`swallowNextClick`, a capture-phase one-shot that waits up to 1.5 s). The new screen under the finger never gets pressed.
- **Hold buttons follow the shared rule.** A document-level set of pointers means a hold starts only when it is the only pointer down. Any other pointerdown on the page, even one that lifts again, spoils a running hold (`pressCount`).
- **Checks:**
  - `ghost.mjs`: 🏠, ✅ and 🗺️ were each held 1.1 s and lifted on the spot, at 768×1024, 1194×834 and 390×844. Each one fired, and the new screen's animal, place, mode, ▶ and gallery were untouched.
  - `rest.mjs`: one finger on 🏠, 🔊 or 🎵 plus two fingers on the canvas for 1.5 s did nothing.
  - The reviewer's `iso.mjs`: all four cases stayed in play.
  - Shared `examples/_studio/tests/mash.mjs`: PASS.

## Fun pass, round 8 (2026-10-16)

Reviewer score 8.4. Fixes:

- **No more mud.**
  - A splat or a stamp now covers what is under it in its own colour (a wash at `t - 1`, then the paint at `t`, so the result is still order-independent). Only rolled stripes mix with wet paint.
  - Thrown and dropped splats carry their radius in the event (`e[8]`, cm). They shrink as coverage rises past a third, down to half size (`splatSize`).
  - After 60 s on autopilot: brown 0 %, mixes 9–11 % of the ground, the rest bright single colours.
- **Bolder, iconic outlines.** There are four shapes (heart, star, sun with pointed rays, fish). Each is 90 % of the depth of the playground, with a 26 px line. At the reveal it shows as solid white dots over the paint, and its emoji pops up big over the picture (`#outline-pop`).
- **Results differ each round.** They show the outline's emoji (big) plus the surprises this child met (stamp ❤️/⭐/🐾, 🪣 giant, 🌈, 💧, ⛲, 🐄, 🏐) as bouncing chips, and no longer the same three mix blobs.
- **A quick tap on a hold button** makes it wobble and shows its ring part-filled, so the child learns to hold.
- **Landscape fills the screen.** The wide camera is `[17.5, 11]` (was `[20, 14]`) and goes only 2 m past the near edge (upright screens go 5 m, to clear their taller pot tray).
- **Cleanups.** `preventDefault` only when `e.cancelable` (`input.js`). The star marker is smaller (0.95) and higher (4.1 m). The unused `foundOf` is removed.

Evidence (`r8/` in the scratchpad):
- `r8.mjs` in portrait, landscape and phone sizes: taps land where tapped, 0 speech, 0 errors.
- `pop.mjs`: the star pops over the painting, and the results show ⭐ 🪣 ⛲.
- The reviewer's `iso.mjs` and `mash2.mjs` give 0 exits.
- `r8duo.mjs`: the hashes match (`-2063902819`).
- `share8.mjs`: the coverage and mix fractions above.
- `browser.mjs --run paint-splash-fun8`: 0 errors.

## Fun pass, round 7 (2026-10-16)

Reviewer score 7.8. A multi-finger bug held it back. Fixes:

- **Hold buttons are palm-proof** (`holdToPress`).
  - Each button tracks the one pointer holding it, and every pointerdown clears any pending timer.
  - A second finger on the button, or any finger on the ground (joystick), spoils the hold until every finger is up.
  - Only the holder's own up, leave or cancel ends the hold, and the action fires only if that pointer is still the only one down.
- **🖼️ (finished) ignores taps that come within 1 s of any other tap** (`FINISH_QUIET_MS`), so a mash never opens the question.
- **The results share bar is gone** (along with `PaintMap.bySeat` and `rows[].share`), so the results never read as "who won".
- **No pinwheel noise.** Splats and throws from the rainbow pot each take the next single colour round the wheel. Pinwheels are left to the giant bucket and a rainbow bucket splash.

Evidence (`r7/` in the scratchpad):
- The reviewer's `iso.mjs` scenarios all stay in play: two fingers on 🏠, staggered fingers, a ground finger plus a tap on 🏠, and rapid taps.
- The reviewer's `mash.mjs` (60 s single taps at 768×1024, and palm mashes at 768×1024 and 1180×820) has 0 exits. With logging added, sound and music stay on and the finish question never opens.
- A single-finger hold on 🏠 still goes home, and a held ✅ still finishes.
- `r7duo.mjs`: the hashes match (`111566312`).
- `rainbow-mash.png` shows single-colour rainbow splats.
- `browser.mjs --run paint-splash-fun7`: 0 errors.

## Fun pass, round 6 (2026-10-16)

Reviewer score 7.5 (polish 6, because mashing ended or left rounds). Fixes:

- **Mash-proof controls.**
  - ✅ (finish) needs a 0.5 s hold.
  - 🗺️ on the results needs a 0.5 s hold.
  - ▶ on the results ignores taps for 1.2 s after the results appear.
  - 🏠, 🎵 and 🔊 need a 0.65 s hold while painting.
  - A yellow ring fills round any button being held (`.holdable`, `holdToPress(btn, action, { always, ms })`).
  - Escape is ignored while painting.
- **Sound and music are never saved:** every visit starts with both on.
- **Less mud.**
  - Once 40 % of the ground is painted (`ROBOT_FULL`), robots stop painting stripes, and past 55 % they stop their own splats. They still roll about and play.
  - Robots lift their roller inside the round's outline and never choose goals inside it, so the shape is left for the child.
  - At the reveal the outline comes back on top as white chalk dots (`outlineShow`), so the picture reads as the child's shape.
  - In a 60 s autopiloted quick round, the child's share is about 46 % (was 12.6 %).
- **Crisper paint.** The grid is now 6 cm (`CELL` was 8 cm), the shader blur is tighter and the edge smoothstep is narrower. Edges stay round without the fuzz.
- **Endings vary.** At the results the animals parade over the picture, in a style that changes each round: a ring round the picture, a conga along a figure of eight, or a row at the front bouncing.

Evidence (`r6/` in the scratchpad):
- `mash.mjs`: 60 s of random taps over the whole screen, at about 6 taps a second. Play was never left, and sound and music stayed on, in both portrait and landscape.
- `share.mjs`: coverage and shares over 60 s in both modes, plus the outline-reveal results.
- `r6duo.mjs`: the quick round with four painters, finished with a held ✅. The hashes match (`1365224010`).
- `r6.mjs` on a phone: taps land where tapped, 0 speech, 0 errors.
- `browser.mjs --run paint-splash-fun6`: 0 errors.

Test note: to finish a picture, ✅ now has to be held (`click({ delay: 750 })` in Playwright).

## Fun pass, round 5 (2026-10-16)

Reviewer score 8.2. Fixes:

- **Your animal stays above the pot tray.** Near the bottom edge the follow camera goes past the edge (the `tz` limit is now `HALF_D + 5 - nearRay`, at most `HALF_D - 1.5`).
- **"Finished" has its own look.** It is a gold-framed live thumbnail of the painting, redrawn from `paint.rgba` every second, hanging from a 🎀. 🖼️ now only means My pictures.
- **The outline sits under the paint.** It is drawn in the ground shader (`outlineMap`), so rolling over it covers it. It is lilac, larger and more legible.
- **Calmer robots in calm rounds:** a stripe at 80 % of the robot width, throw-backs at most every 4 s (30 % chance), and their own splats or pot swaps every 8–16 s.
- **No stacked sounds.** The animal noise plays at most once a second per painter, and the throw whee at most every 0.6 s.
- **A surprise for each place**, starting about 15 s in and repeating every 26–38 s (host-driven, synced, `public/js/visitors.js`):
  - The town square's fountain sprays rings of colour three times.
  - A cow ambles across the farmyard leaving hoofprints in the colour it last stepped in (`hoof` stamp).
  - A striped beach ball rolls across the toy room leaving a rainbow stripe.
  - A visitor's paint counts toward nobody's share.
- **Marker:** a gold star tilted toward the camera, which wobbles gently, plus the coloured ground ring.
- **⏳ on:** ▶ stays bright yellow and gets a small ⏳ badge.

Evidence (`r5/` in the scratchpad):
- `vis.mjs`: the cow with hoofprints, the beach ball's rainbow stripe, and the fountain round.
- `r5.mjs`: portrait at the near edge (the animal sits above the tray), the ⏳ badge, taps landing where tapped, and robots painting at the start. 0 speech, 0 errors.
- `r5duo.mjs` on the farm: the cow appears on both devices, and the hashes match (`-1249309752`). Iframe errors are now captured too, and there were none.
- `browser.mjs --run paint-splash-fun5`: 0 errors.

## Fun pass, round 4 (2026-10-16)

Reviewer score 8.0. Fixes:

- **Robots show the way at the start.** They always paint for the first 7 s (`ROBOT_SHOW_MS`, timed from `roundStart`); only after that do they wait for a child who has been idle for 5 s. About 5 % of the ground is painted 4 s in.
- **The child's paint stays the child's.** Robots roll slower (0.5 with no clock, 0.55 in the quick round), paint a narrower stripe (0.62 m, stroke flag 2) and lift their roller within 3.2 m of a child.
- **Smoother paint edges.** The ground shader takes a 9-tap ring blur of the colour texture, and the wet shine is now worked out for four neighbouring cells and blended, so the gloss no longer shows cell steps.
- **Each round has a signature.**
  - A big dotted chalk outline (heart, star, flower, sun or fish, never the same twice in a row) lies on the ground (`public/js/outline.js`, `setup.outline`). It is decoration only.
  - The round's first surprise appears after about 4 s and the second after about 11 s.
- **The giant bucket** now respawns every 14–22 s when picked (was 20–30), and it arrives early when it is a round's first surprise.
- **Robot trail-following** stays 4.5–7 m behind and a little to one side, and robots keep more room around a child.
- **Portrait:** the ✅ / 🖌️ question sits low in the middle, with bigger buttons.
- **Start spots** are nearer the middle (±7.5, ±4.5), so the robots start on screen in landscape.

Evidence (`r4/` in the scratchpad): `r4.mjs` was run in portrait, landscape and on a phone:

- The robots paint at the start, and the first surprise is out within 4 s.
- Taps land where tapped.
- Idling paints only about 2–3 %.
- 0 speech, 0 errors.

`r4duo.mjs` covers the quick round with four painters: the hashes match (`1070247481`). `browser.mjs --run paint-splash-fun4` has 0 errors.

## Fun pass, round 3 (2026-10-16)

Reviewer score 7.8 (fun 7.5, variety 6.5). Fixes:

- **Tap to throw.** `input.js` emits `tap` with the finger's position. `tapSplat(at)` raycasts it onto the ground, the animal turns and hops, and a paint ball flies in a squashy arc (0.28–0.6 s) and splats there (splat flag 2). Every device flies the ball from its own view of the painter and paints the event's `t` on landing, so the hashes still match. The blob button still drops a splat under the roller (flag 1). Taps are spaced 0.38 s apart.
- **Surprises vary by round.** The host picks two of `EXTRAS` = stamp, giant, rainbow and water for each round (`setup.extras`); buckets are always there.
  - **Stamp tokens** (⭐ ❤️ 🐾 drawn on a spinning coin): for 8 s the roller prints upright stars, hearts or paws every 2.3 m instead of a stripe (event `[3, seat, t, x, z, shape, bits]`, `PaintMap.stamp`).
  - **The giant bucket** rocks as if about to tip. Rolling into it pours a wave of four rainbow pinwheels (flag 4).
  - **Rolling into a fountain, hay bale or toy block** (every place) makes it hop and throws a ring of your paint round it, synced (flag 3). The fountain also sprays.
- **Robots play with the child.** With no clock they roll slower (0.58), and they stop and hop while the child is idle for 5 s or more: 25 s of idling now paints 0 %. The ways they play along:
  - About 35 % of their goals follow the child's trail.
  - One may copy the child's new pot, with a hop and sparkles.
  - The host's robots sometimes throw a ball next to a child's splat, at most every 2.5 s.
- **The hint** no longer returns after a tap: touches and taps update `lastMoveAt`.
- **Seat colours** are red, yellow, blue and purple (the fourth seat starts on the rainbow pot).
- **Portrait camera:** steeper and nearer (h 26, back 11, stepping back on very tall phones), so the wall is mostly gone and the animals are bigger. The child has a coloured ground ring and a bigger, bobbing marker.
- **Menu:** the players pill hides when you play alone, and the animals and places sit on separate soft trays.
- **New colour moments** count only real mixes (one paint over another), not the rainbow's ready-made stripes.

Evidence (`r3/` in the scratchpad):
- `r3.mjs` at 768×1024, 1194×834, 390×844 and 844×390: six scattered taps each painted the spot under the finger (`landed` all painted; one landscape tap was off the ground). No hint after a tap, no players pill, and every surprise seen. 0 speech and 0 errors.
- `stamp.mjs`: heart and paw stamp trails, the giant wave, and a ring round a hay bale.
- `idle.mjs`: robots paint 0 % while the child stays idle.
- `r3duo.mjs`: a guest's throw, a stamp and the giant bucket on two devices. The hashes match (`-988771344`), with 0 errors.
- `browser.mjs --run paint-splash-fun3`: 0 errors.

## Fun pass, round 2 (2026-10-16)

Reviewer score 7.5 (polish 6.5). Fixes:

- **Wider camera** (`followTarget`): it sits higher and further back (h 20·k, back 14·k, was 15/11.5), leans toward the middle (x·0.7, z·0.6), clamps to the playground's visible width, and rises up to 12 % more as coverage reaches 50 %. Portrait now shows most of the square, robots included.
- **White pot replaced by a 🌈 rainbow pot** (`RAINBOW_POT = 16`, `POTS`). The roller paints colour-wheel stripes, and splats become six-slice pinwheels. The rainbow roller syncs through the existing rainbow flag. Key 4 picks it. White and tints are gone from the palette.
- **No mud.** Paint is wet for 7 s (was 12 s). Only two paints ever mix: a third wet paint pushes the oldest out, decided from the stored times, so the result is still order-independent and the hashes match. Brown can no longer appear, and the mixes are orange, green and purple.
- **Results without a lesson.** The found colours are 1–3 big blobs that pop in and bounce three times. The cards show only the animal with ⭐ or 🤖. One shared bar under them is split in each painter's colour by how much they painted (`PaintMap.bySeat`, sent as `rows[].share`). Nothing is ranked and no numbers are shown.
- **Mid-play new colour** is a blob between two ✨, with no equation.
- **HUD**: 📷 removed (`#gallery-save` is gone, and `pictures.js` no longer takes a save button), leaving 🏠 🎵 🔊 and 🖼️.
- **🏠 while painting is press-and-hold** (650 ms, a yellow ring fills). A tap does nothing. On other screens and with Escape it still works at once.

Evidence (`r2/` in the scratchpad):
- `r2play.mjs` (portrait, landscape, phone): a single 🏠 tap stays in `play` and a hold goes to `menu`. Bright pictures, 0 speech and 0 errors.
- `r2duo.mjs`: the guest on the rainbow pot syncs, and the hashes match (`1488250379`).
- `browser.mjs --run paint-splash-fun2`: 0 errors.

For the coordinator: `examples/_studio/tests/original-quality.mjs` taps `#gallery-save`, which no longer exists. The picture wall still has `#art-gallery`, `#gallery-pictures img`, `#gallery-close` and `__paint.gallery.count`/`keep()`, so the check can open 🖼️ (`#gallery-open` on the menu, `#results-save` on the results) or call `__paint.gallery.keep()`.

## Fun pass (2026-10-16)

Owner direction: the learning layer had made the game boring. This pass removes forced education, all instruction text and the spoken voice, and makes splatting paint the whole game. Colours still mix where wet paints cross, but only as something nice to look at, never as a task.

### Removed

- **Paint requests (jobs) and everything around them.** That covers chalk shapes, the request card, the off-screen arrow, tiers and skill kept between visits, rule and ratio puzzles, rescue rings, ghost hints, page turning, inked and locked shapes, and the softening of dry paint toward grey. `public/js/jobs.js` is deleted, and about 900 lines are gone from `main.js`.
- **The colour studio** (the "Mix my colours" button and its 🎯 goals).
- **The TTS voice.** `speech.js` is no longer imported, so there are no spoken pot names, questions, discoveries or results lines.
- **Text in the UI.** Gone are the loading and waiting sentences, the "Let's paint!", "Quick" and "Finished!" labels, place names, the results title and "🤝 We painted it together!", the "Next time, roll…" hint and the gallery's words.
- **Robots minding only the frame and leaving the bucket alone.** Robots now paint anywhere (away from a child) and grab pickups too.
- **Paint ratios and the per-cell `lean`, `locked` and `soft` state** in `paint.js`. The paint colours are now a fixed 16-entry table, so `paint.js` no longer imports `colour-studio.js`, `colour-model.js` or `speech.js`.

### Added

- **Splat.** A quick tap on the ground, the big paint-blob button (bottom right, always the roller's colour) or Space drops a splat of the roller's paint. The animal does a squash-and-stretch hop, there is a squelchy SPLAT and its animal noise, and the blob button wobbles. Taps are spaced at least 0.7 s apart. A small splat is the existing splat event plus a flag (`[1, seat, t, x, z, seed, bits, 1]`), so every device paints the same splat and sees the hop.
- **Squash and stretch** on the painters (`Painter.hop`, a damped spring on the body node). The painters hop on a splat, a pot dip, a bucket, a puddle, a bump into a friend, the round start and the reveal.
- **Robot friends join in.** Every 5–12 s a robot either splats (with a hop, without the animal noise so it stays quiet) or dips into another pot, so the colours keep changing.
- **All pickups in both modes**: buckets (which now bob and turn gently), water puddles and rainbow puddles. The first bucket arrives after about 2 s.
- **Four pots always**: red, yellow, blue and white. A pot dip gives a plop, a hop and a little splash of the new colour.
- **A new colour is a little moment.** The first time this child's roller makes a mix in a round, you hear a twinkle, sparkles and a splash burst where it happened, and the recipe springs in at the top as pictures only (● + ● = ●) for 2.6 s. Results show the mixes found, as pictures.
- **Menu**: animal and place tiles (emoji only), a big drawn ▶, 🖼️ my pictures on the left and ⏳ quick round on the right. The quick round lights up and tilts, and ▶ turns sandy.
- **A picture wall with no words** (`public/js/pictures.js`, the game's own copy, replacing the shared `gallery.js`). It shows the last three paintings in tilted coloured frames, with empty dashed frames holding a 🖌️. Close it with 🎨 or by tapping the backdrop. It keeps the old storage key and the ids the studio test uses (`#art-gallery`, `#gallery-pictures img`, `#gallery-close`, `gallery.count`).
- **The drag hint (👆)** appears 2.5 s into a round if the child hasn't rolled, and again after 20 s idle.

Kept from before: the 3D places, rollers and wet mixing (wet paint shines for 12 s), sound and music toggles, 🏠, 📷 (keep now), 🖼️ with ✅ / 🖌️ to finish, the shared reveal and painter cards with no ranking, the auto-kept picture, the 75 s quick round with its sand timer, and multiplayer for up to 4 with host migration.

### Files

`game.json`, `public/index.html`, `public/style.css`, and these in `public/js/`: `main.js`, `paint.js`, `painter.js`, `bot.js`, `audio.js` (now `drip`, `keep`, `splat` and `discover` instead of `studio(kind)`), `items.js`, `input.js` (emits `tap`), the new `pictures.js`, and `jobs.js` (deleted).

### Now unused in this game (coordinator)

- `public/js/speech.js`, `public/js/gallery.js`, `public/gallery.css`, `public/js/studio-dialog.js`, `public/studio-dialog.css`, `public/js/colour-studio.js`, `public/js/colour-model.js` and `public/colour-studio.css` are no longer imported or linked. `examples/_studio/package-originals.mjs` still copies them in (`helpers['paint-splash']`), so that entry can become `[]` and the files can be deleted.
- `public/models/colour-kit.glb` and `public/models/tablecloth.jpg` were only for the colour studio. `examples/_studio/assets.mjs` still lists `colour_kit.py` and `tablecloth.py` for this game, so the builders were left in place.
- `examples/_studio/tests/workshop-fallback.mjs` tests the colour studio, which is gone. It will fail and should be retired. `original-quality.mjs`'s gallery check still applies, and a replica of it passes.

### Evidence (2026-10-16)

Scripts and screenshots are in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/15b3f60d-f934-46df-bd6d-46889fd68ba3/scratchpad/paint-splash/`. `speechSynthesis.speak` was stubbed and counted: 0 calls in every run.

- `play.mjs` at 768×1024 portrait touch, 1194×834 landscape and 844×390 phone. Real taps and CDP touch drags covered the menu, ▶, rolling, pots, the splat button, white, 🖼️ → ✅, the results, the picture wall and ▶ again. The only visible text on the menu, HUD, results and wall is the logo and emoji. The child found five mixes in a few seconds (orange, green, pink, pale yellow and peach). There were no page errors, and the only console message was the SDK's "playing alone" warning.
- `tap.mjs`: a tap on the ground painted about 3000 cells. The quick round ended by itself after 80 s of simulated time.
- `duo.mjs` puts two iframes behind a fake BitGames bridge that relays `hello`, `open`/`ready`, `peers` and `signal`, so it is real WebRTC. The guest joined the host's lobby and the guest changed pot, which synced. Both splatted, the guest tapped 🖼️ → ✅ and the host ended the round for both. The picture hashes matched (`-358327941`), and both devices showed the same mixes found. 0 errors.
- `gal.mjs` repeats the paint-splash part of `original-quality.mjs`: 4 keeps leave 3 pictures, and Escape closes the wall without moving the painter.
- `EXAMPLES_ORIGIN=http://localhost:4213 node examples/_studio/tests/browser.mjs --ids paint-splash --run paint-splash-fun`: BOOT + PLAY ready, 0 errors.
- `public/bitgames.json` is stale until the coordinator rebuilds.

### Doubts

- The logo letters "PAINT SPLASH" are kept as a decorative title. Remove them if even that counts as text.
- White in a mix makes paler colours, which can look washed out when overused. It is fun to discover, but it could be left out if reviewers find the pictures muddy.
- With no clock a child alone never sees an end unless they tap 🖼️. That is intended, with no nagging.

## Earlier history (short)

- **2026-10-04 to 10-07:** the original 4-animal painting party, a colour workshop for non-readers, menus that fit sideways phones, and the picture kept from the reveal.
- **2026-10-09, calm passes:** no hurry state, a soft start, no banners, calmer pickups, a shared result with no ranking, no flash, steady music, reduced motion, untimed mixing with a ✅ / 🖌️ finish question, a quick round, and order-independent paint events (`PaintMap` stores max times, so picture hashes match across devices).
- **2026-10-10 to 10-12:** paint requests and tiers (shapes, rules, white, ratios), a framed page, robots on the frame, and inked shapes. All of this is removed in the fun pass above.
