# Balloon Pop

## Keyboard focus safety (2026-10-16)

- Hold buttons now ignore Enter/Space, including auto-repeat, and prevent native pointerless clicks from bypassing the pointer hold. Pointer release/cancel/lost capture clears the owning hold; blur or a hidden page also cancels its animation callback. Sound mute remains unsaved.
- Verified: shared `mash.mjs` PASS for balloon-pop (all 12 focused-button keyboard sequences, random taps, palms and resting hands). A separate CDP test confirms a 60 ms tap leaves no stale hold, a lone 1.1 s 🏠 hold returns home, and lifting stays on the title. 0 page errors, 0 speech calls; real GPU: ANGLE Mesa AGX G13/G14.
- Evidence: `/dev/shm/bitgames-work/codex/balloon-pop/focus-safety.mjs` and `home-hold.jpg`. JavaScript syntax check passed. No build, commit or publish.

## Palm fix (2026-10-16, after passing at 8.6)

- Resting-hand rule: a document-level set of active fingers. A hold starts only when its finger is the only one on the page. Any other finger landing anywhere cancels every running hold and spoils holding until all fingers lift. Self-tests pass: palms, one finger on a button with two resting on the sky for 1.5 s (both landing orders, all three buttons), and a lone finger still acting. The shared check passes: `examples/_studio/tests/mash.mjs` (EXAMPLES_IDS=balloon-pop).

- `holdButton`: a second finger on a button cancels the hold. Only the starting `pointerId` can finish it, and only that finger's up, cancel or lost capture ends it. Before this, each extra finger started its own loop, and an orphaned loop could still exit or mute.
- Sound is no longer saved: every visit starts with sound on. Escape no longer exits during play.
- CDP test: 36 three-finger palms on 🏠/🔊/🎵, each finger down 80–300 ms, plus two 1.2 s two-finger palms. The game stayed in play with sound on and music off. A single deliberate finger still mutes and goes home. 0 errors.

## Fun pass, round 5 (2026-10-16, after an 8.4/10 review)

- **Meadow layout** (`critters.js`):
  - Two depth rows: front lower and 6 % bigger, back higher and 12 % smaller.
  - Room scales with width: 5 in portrait, 8 in landscape. A narrowing screen sends the longest-staying friends skipping off.
  - Each spot is the nearest clear place to an even spread. It stays 88 px clear of the landscape's own sheep at that row's height (measured by bounding-box centre), 88 px from its row's other spots and 53 px from the other row's, so nobody hides behind anybody.
- **Today's friend.** While a themed sky lasts, its friend's icon in the strip bounces softly with a warm glow (`.today`). It comes back after a pop's hop.
- **Faster meadow.** There is a new carried **piglet** (spheres, cone ears, torus tail, an oink). Every party past the last friend carries someone down. A popped sinker drops a friend 60 % of the time. Surprises now draw from nine kinds.
- **Giants stay on screen.** They ease back inside `w − 1.35 × targetScale` as they swell, and pop shoves skip them. A giant poked at the edge ended at 728 of 768 px.
- **Crowding.** Regular spawns wait while balloons plus pending shower balloons reach 14 (`CROWD`). Showers (4–10) and babies (3–6) shrink when the sky is busy. A minute of late-game popping in portrait peaked at 16, the landscape party at 14.
- **Landing sound.** A thrown friend now lands with a soft low thump and a grass rustle (`thud`). The rising `boop` read as a boing, the bunny's own sound.
- **Verified:** meadow screenshots in both orientations (no overlaps with landscape sheep), giant edge, today glow, the crowd test, and the full three-viewport playthrough with round-4 checks: 0 errors, 0 speak calls. Screenshots: `…/scratchpad/balloon-pop/r5/`.

## Fun pass, round 4 (2026-10-16, after an 8.3/10 review)

- **Visible themed skies.** `world.js` now has `MOODS` and `setMood()`. The sky gradient repaints, the clouds tint and the stars fade in, all easing over a few seconds:
  - day (the seven friends);
  - warm gold (golden sky);
  - lilac (bunny parade);
  - pink with pink clouds (hearts);
  - minty (giants);
  - a dusk with 14 twinkling stars and lilac clouds (stars and rainbows).
  The mood is set on each level change and on ▶.
- **Eight surprises in a shuffled bag** (Fisher–Yates; every kind comes once before any repeats, and never twice in a row). Three are new:
  - a balloon carrying a **duck** down to the meadow;
  - a balloon carrying a **bunny** down to the meadow;
  - a big **sinking balloon** that wobbles like jelly on the way down and bursts into babies when popped.
  A carried friend steps off gently onto the grass and its balloon floats home; popping the balloon on the way drops the friend with a bounce. The duck and bunny are built at runtime from spheres in `critters.js`, turned three-quarters to the viewer so their faces show.
- **A meadow that keeps growing.** It now holds 8 friends (sheep, ducks, bunnies), each on its own spot across the grass with no overlaps. When it is full, the friend who has been there longest skips away. Bunnies hop now and then, ducks waddle, sheep sway. A tap makes them jump and baa, quack (new) or boing (new).
- **Rescued sheep at meadow size.** `world.sheepSizeAt(z)` matches the landscape sheep's on-screen size (world scale 0.71 at the meadow's depth, instead of 1.1 / carrier scale).
- **Title row** now includes the puffed-up giant. The title bob uses `translate`/`rotate`, so the giant keeps its scale.
- **Party cap** counts baby balloons and is 11 on short screens. The landscape party peaked at 14 (was 18).
- **Not done:** fading balloons in the top 70 px. The skins are shared materials, so this would need per-balloon material clones; I left it.
- **Verified** with Playwright:
  - all five moods, the shuffled order, duck and bunny carried down, sheep popped down, the sinker;
  - the meadow ended with 4 friends on distinct spots;
  - the full three-viewport playthrough: 0 errors, 0 speak calls.
  - Screenshots: `…/scratchpad/balloon-pop/r4/`.

## Fun pass, round 3 (2026-10-16, after an 8.0/10 review)

- **Longer arc.** Friend goals are now 6 / 9 / 12 / 14 / 16 / 18 / 20 pops, so it takes about 95 pops to meet all seven. After the last friend, `level()` rotates themed skies of 18 pops each:
  - a golden sky;
  - a bunny parade;
  - a sky of hearts;
  - a day of giants;
  - stars and rainbows.
- **More surprises.** The rotation is now sheep, bird, train, shower, sheep, hot-air balloon, bird. Two are new (`js/critters.js`, runtime geometry, no GLB changes):
  - **Bird:** a round blue bird made of spheres and cones flutters across with flapping wings and pops any balloon it bumps into. Tapping it gives a tweet and a loop-the-loop.
  - **Flock:** a sheep dropped from its balloon bunch now tumbles, bounces on the meadow with a boing and stays there grazing. Tapping it makes it hop and baa. The flock grows through a visit (up to four; the oldest skips away over the hill), so the meadow changes on return.
- **Hold-to-blow works anywhere.** A still finger starts a breath after whatever its first touch did: a pop, a poke on the scenery, or empty sky. Holding on the centre pine, or on a balloon you just popped, now blows a new balloon. A giant under the finger is poked instead.
- **Fuller sky.** The cap is 11 on tall screens (9 elsewhere), and while fewer than 5 balloons are up a new one comes every 0.4 to 0.65 s. Portrait counts over 8 s: 5, 5, 6, 6, 6, 7, 7, 8, 8, 8, 9, 9, 9, 9, 10, 9.
- **Idle hint.** It counts once per idle stretch (at most 3 stretches a visit). One 9 s stretch counted as 1.
- **Live friends strip.** Each pop makes its friend in the strip hop (`cheer()`, using `translate`/`rotate` so the giant keeps its puffed-up scale).
- **Phone landscape.** The `.intro` picture is 76px under `max-height: 420px`.
- **Verified** with Playwright:
  - blow on the pine and after a pop; carrier pop, then the sheep lands and stands;
  - the bird popped a row of 7; the bunny sky's mix is mostly bunnies;
  - the full three-viewport playthrough: 0 errors, 0 speak calls.
  - Screenshots: `…/scratchpad/balloon-pop/r3/`.

## Fun pass, round 2 (2026-10-16, after a 7.8/10 review)

- **Mash-proof buttons**: 🏠 (0.8 s) and 🔊/🎵 (0.5 s) act only on press-and-hold while a gold ring fills around them. A quick tap just wiggles the button; a keyboard press still acts at once. In a test, 207 random taps over 15 s left the game playing with sound on.
- **Progress lasts the visit**: `start()` no longer resets `level` or the friends strip, so going home and back carries on.
- **Surprises past the last friend** (in turn, with the 🎉 party still every third), replacing the chime with nothing behind it:
  - a sheep carried up by a three-balloon bunch (pop the middle balloon and it drops, baa-ing);
  - a rainbow colour train drifting across;
  - a cloud showering ten baby balloons;
  - the hot-air balloon dropping babies (falls back to a cloud when it is off screen).
- **Hold the sky to blow up a balloon**: after 0.28 s still on empty sky, a balloon (round, smiley, heart, later bunny) grows under the finger with breathy puffs. Let go and it floats off with a whistle; at 1.9× its size it bursts with confetti.
- **Giant picture**: a puffed-up 🎈 with a 💥 badge (`.giant-pic`), in the strip and the intro.
- **Fuller sky**: about 30 % of balloons bloom part-way up, four are already up at start, and tall screens rise up to 1.35× faster. The friends strip moved to the top centre.
- **Phone landscape**: the buttons stay in a row at the top-right. The idle 👆 now shows at most three times a visit.
- `howToPlay` shortened. `?debug` also exposes `surprise(kind)`.
- Verified with Playwright: each surprise, carrier pop and sheep drop, blow / release / overblow, hold-home and hold-sound, level kept after home → ▶ (8 → 8, 7 friends), and the hint backoff (3 of 4). The full three-viewport playthrough was rerun: 0 errors, 0 speak calls. Screenshots are in `…/scratchpad/balloon-pop/r2/`.

## Fun pass (2026-10-16)

The owner's direction: the education passes made the games boring. Strip forced learning, text and the TTS voice, and make the toy itself fun and self-evident for ages 3–8.

### Removed
- The whole counting sky (`js/sky.js`, deleted): spoken requests, picture slots, the 🧺 Give basket, tiers (🌱 🌿 🌳), ten-frames, one more / one less, colour mixing, dots, the picnic and treats, Start easy, the remembered tier.
- The adventure menu (Counting sky, Three/Hearts/Red for friends, Free popping) and free popping's wishes.
- The voice: `main.js` no longer imports `js/speech.js` or `js/adventure.js`; `index.html` no longer links `adventure.css`. Those shared copies are unused by this game now.
- All on-screen text except the logo: the tagline, the loading counter, "You helped N friends", the intro card titles and subtitles, the Give label. The ▶ button has no word.
- The two-tap home guard (nothing can be lost now), the counting-only audio (`count`, `boop`, `release`, `chord`), point values in `KINDS`, the sun's card-dodging layout.

### Added
- **Swipe to pop**: dragging a finger across the sky pops every balloon it touches (multi-touch works). A giant takes only one poke per stroke.
- **Giant balloon** (the fourth friend): a big, slow balloon that swells and jelly-wobbles with a rising squeak on each tap. The third tap bursts it with a boom, confetti and six baby balloons.
- **Pop shove**: each pop's puff of air pushes nearby balloons, and they wobble (squash and stretch, `balloons.js`).
- **Musical runs**: quick pops climb the pentatonic scale, so a swipe plays a little tune. A star's chain-pop also climbs, and gold balloons shimmer softly as they rise.
- **Every tap answers**: empty sky gives a twinkle and two tiny notes. The countryside surprises (sun, sheep, houses, trees, windmill, hot-air balloon) are unchanged.
- **New friends by popping** (6 to 12 pops each, not a clock): heart → crown → giant → bunny → star → rainbow. Each one is announced by its picture alone, which pops up big, wobbles and floats off, and then joins the 🎈 friends strip with a hop. A short balloon party (🎉, up to 14 balloons) comes after every third friend.
- **Wordless title**: logo, bobbing friend emojis and a big round ▶ with a breathing halo. The halo is a pseudo-element, so the button itself stays still for automated taps. Balloons float behind the title and can be popped there too.
- **Idle hint only**: after 5 s without a pop, a drawn 👆 taps on a balloon. It disappears on the next pop.
- `?debug` exposes `window.__balloonPop = { game, balloons, camera, world, spawn }`.

### Verified (Playwright, `/usr/bin/chromium --use-angle=gl`, touch)
- Portrait 768×1024, landscape 1024×768 and phone landscape 740×360. In each, about 70 real taps over 75 s met all seven friends (party included), followed by a swipe, a 6.5 s idle wait (the hint appears) and 🏠 back to the title.
- 0 console or page errors, and 0 `speechSynthesis.speak` calls. The only visible text is the logo letters; everything else is emoji.
- Giant: three taps swell it (scale 1.2 → 1.42 → 1.68), then it bursts into six minis. A swipe across a row of six balloons popped all six.
- Screenshots: `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/15b3f60d-f934-46df-bd6d-46889fd68ba3/scratchpad/balloon-pop/`.

### For the coordinator
- `examples/_studio/tests/original-quality.mjs` still tests the old basket and Give flow through `window.__adventure`; that check needs removing or rewriting.
- `package-originals.mjs` maps `balloon-pop` to the adventure helpers. This game no longer uses `adventure.js`, `adventure.css` or `speech.js`.

## Earlier history (short)
- 2026-10-04: Blender balloons and countryside, levels, power balloons (star chain-pop, rainbow babies), crowned gold, tappable scenery.
- 2026-10-09 calm pass: removed the speed ramp, combo banners, per-pop confetti, best score and camera shake; softened the audio. Those removals still stand.
- 2026-10-09 to 10-11: counting sky, tiers, picnic, missions and voice. All removed by the fun pass above.
