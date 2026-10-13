# Crash Racers polish

## Phase 1 calm pass (2026-10-09)

Audit scores before this pass: Calm 2, Focus 3, Educational 2, Engagement 7, Visual 8, Audio 4, UX 5, Technical 7 (see [the audit](AUDIT_2026-10-09.md)). Racing, the cities, the cars, physical bumps and dents, jumps, Smash mode, multiplayer and the delivery mission all stay. The pass takes out the hype layer around the crashes and adds the missing sound control.

### What changed and why

| Change | Where |
| --- | --- |
| **Mute (bug fix).** `audio.muted` and `audio.setMuted()` now exist: the master gain fades to 0 and back. A 🔊/🔇 button sits in the menu options (`#menu-sound`) and in the race HUD column (`#sound-btn`), and M toggles it. The choice is stored in `localStorage` (`crash-racers-sound`). `speakDelivery` and the shared mission speech (`isMuted`) both respect it, and muting cancels speech already playing. | `public/js/audio.js:9-18`, `js/main.js:195-196`, `main.js:397-418`, `main.js:1147`, `public/index.html:43,74` |
| **Music.** A soft music-box loop (sine melody, triangle drone, 0.42 s steps, gain about 0.035) plays on the menu, lobby and podium only. On the road the engine is the music. It follows the mute switch. | `audio.js:200-221`, `main.js:1815-1816` |
| **No crash hype.** Crash slow motion (`slowmo(1400)`) is gone, along with the random "💥 CRASH! / 😱 WHOA! / 💥 KABOOM! / 🤯 WOW!" banners. Sparks, dents and a small physical shake stay (capped at 0.45, was up to 1). | `main.js:945-953` |
| Shake is capped at 0.6 overall (was 1.2) and switched off under `prefers-reduced-motion`. A jump landing shakes at most 0.5 (was 1). | `js/effects.js:221-225`, `main.js:917` |
| Praise banners are softened. "MEGA AIR! / BIG AIR! 🔥 Turbo ready!" and the cheer jingle become a factual "🔥 Turbo ready" or "🌀 Flip · 🔥 ready". The boost-pad "⚡ BOOST!" banner is removed (the whoosh stays). Mystery-box banners say what was found, without capitals or a jingle. | `main.js:863-869`, `main.js:924-929`, `main.js` (`openBox`) |
| The **"Crash King" award** is removed. Speed Champ, Sky Star, Flip Wizard, Star Catcher, Cone Crusher, Lucky Dip and the kind awards remain. | `main.js` (`AWARDS`) |
| **Finale:** the last-five-seconds countdown ticks are removed, and the finale pill no longer pulses. "⏱️ TIME!" becomes "🏁 Everyone stops here" or "🏁 Time to park". | `main.js` (`updateHud`, `endRace`, `endSmash`), `style.css:290-292` |
| **Results:** 12 slow paper petals (5–7 s fall), played once, replace 46 paper confetti and 60 rainbow 3D sparks. Nothing is shown under reduced motion. | `main.js:1338-1356` |
| **Easy mode cruises noticeably slower:** target `clamp(19 - bend*35, 10, 19)` m/s (was `clamp(30 - bend*55, 15, 30)`), braking above target+3 (was +5). Measured top speed in Ubud fell from about 87–108 km/h to 75 km/h. Holding 🚀 still means full speed. | `main.js:1444-1446` |
| **Audio:** crash gains are about halved (the thump 0.6→0.32, noise 0.7→0.32, high ring 0.25→0.08). Landing thump, glass and the honk wave are lower too. The horn, countdown beeps, clunk, mystery box and star coin use triangle or sine (were square). The star coin walks round a five-note scale (it used to climb with every star), and `cheer()` is one gentle sine chord. | `js/audio.js` |
| **CSS:** the infinite logo bob, selected-car hop, podium hop, countdown pulse and finale pulse are off. The battered-car 🔧 stays highlighted but no longer wobbles. GO's idle nudge became one soft glow after 30 s (was a repeating wiggle after 9 s). | `public/style.css:290-302`, `main.js` (nudge interval) |

**Not changed (deliberately):**
- **Jump slow motion** (`slowmo(900)` at the top of big jumps) stays, because it is a stunt moment, not a crash replay.
- **Racing core:** position, laps, minimap, turbo and the five HUD actions all stay, since they are part of the racing children love.
- **Stunt Park jumbotron:** its scenery messages ("WOW!", "CRASH!") are city art, left for Phase 2.

### Verification

- Chromium: `node examples/_studio/tests/browser.mjs --browser chromium --ids crash-racers --run calm` gives BOOT + PLAY ready, 0 errors.
- WebKit: the same command with `--browser webkit` gives BOOT + PLAY ready, 0 errors.
- `original-quality.mjs`: mission persistence and the four ordered deliveries pass.
- Scripted checks:
  - Tapping 🔇 in the menu stores `0`, and the setting survives a reload.
  - The HUD 🔊 toggles it back.
  - Easy-mode top speed is 20.9 m/s (75 km/h).
  - There were 0 console errors.
- I played a 1-lap race with the delivery mission and a forced crash in portrait and landscape. Before screenshots are in `audit/crash-racers/`, after screenshots in `audit/crash-racers/after/`, including `portrait-8-hud-sound.png`.

### Remaining (Phase 2, from the audit)

- A separate, slow **Delivery Town** mode: no bots, laps or position, with stops out of lap order or on side spurs so the minimap must be read, and picture parcels (parcels and houses are Phase 3 art). The current delivery mission is satisfied just by driving the lap, because `delivery.js` places stops at curve fractions (i+1)/5.
- In that mode, hide position, crashes, speed, turbo, horn and camera, and end with a route recap instead of a podium.
- The results row can overflow on the right when a long award sits beside "still racing" (portrait). This predates the pass.
- A bot can sit just in front of the camera in portrait and cover a quarter of the screen.

## Phase 2: Delivery Town (2026-10-09)

### Design

**📦 Deliver** is now the first mode button and the default (`game.mode = 'town'`). **🏁 Race** and **💥 Smash!** are unchanged, pictured choices beside it. The racing mission chip (shared `adventure.js`) moved to after the mode buttons and shows only for Race. Laps show only for Race.

- **No race.** There are no bots, laps, position, countdown, finale clock or podium. The car is ready as soon as the city is built.
  - Top speed is a gentle 13 m/s (about 47 km/h), even when holding 🚀.
  - Easy mode cruises at up to 13 m/s, slower round bends, and at 8 m/s near a house that is still waiting, so its sign can be read.
  - There are no stars, mystery boxes, boost pads, jump slow motion or turbo.
  - Bumps are a soft wobble with a rubbery "boing" and a puff of dust. There are no dents, no flying parts, no sparks and no shake.
- **A real map-reading task.**
  - Four of six picture houses (🍎 fruit shop, 🐶 dog's house, 🌸 florist, 📚 library, 🎂 birthday house, 🧸 toy shop) are placed round the loop, on alternating sides of the road and clear of jumps. They are built from runtime geometry and sprites:
    - a coloured doorstep
    - a tall post with a big picture sign
    - an emoji resident who waves
  - Placement is seeded, so friends in the same town see the same houses.
  - The parcel tray at the top left lists the parcels in picture order. That order is never the order of the houses along the road (`town.js` forces this), so the child has to read the map.
- **Choosing a parcel.** The child taps one; there are no arrows or numbers. Then:
  - the parcel rides on the car's roof with its picture
  - its house gets a gold ring on the big paper map
  - the voice says "The flower parcel goes to the florist. Can you find it on the map?"
- **The map.** It is about 300 px on a tablet and 170–200 px on a phone, and shows every house as its picture. The car is an arrow pointing the way it is driving, and delivered houses get a green tick.
- **Turning round.** The **↩️ Turn round** button (U) lets the child take the shorter way. Easy mode's steering helper, back-out and "back on the road" all follow the direction the car is facing. A jump or kicker approached backwards (its steep back is a wall) is hopped over gently.
- **Arriving at a house.**
  - **The right house:** the car comes to rest for 2.4 s. The parcel hops from the roof to the doorstep, a doorbell plays ("ding-dong"), the resident waves 👋, and the voice thanks the child ("Flowers for the florist. Thank you!"). Afterwards the voice asks, "Which parcel next?".
  - **The wrong house:** the voice says kindly whose house it is: "This is the dog's house. The flower parcel goes to the florist." A picture banner (🏠 🐶 · 📦 🌸) shows the same thing.
  - **No parcel chosen yet:** the car rests, the voice asks "This is the florist. Which parcel goes here?", and tapping the matching parcel there delivers it.
- **Natural ending.** When all four are delivered, the results screen shows "📦 All delivered!" with a route recap. It draws the path the child actually drove (a dashed line from the 🚚 start), numbers each house in the order the child chose, and shows a row of numbered pictures. The voice says "You delivered 4 parcels! You read the map to find every house." The ending's one soft moment is the existing dozen slow petals. The buttons are 🔁 Deliver again and 🗺️ New city.
- **Decluttered HUD in town.** Position, lap, crashes, stars, timer, speed, turbo, fix, horn and camera are hidden. 🔄 Back on the road, ↩️ Turn round and the Phase 1 🔊 mute stay.
- **Multiplayer.** In town, every child drives their own car with no bots, using the same seeded houses. When a child finishes, a `done` message is sent. That child sees their recap with "🚚 Friends are still delivering…", and there is no finale countdown. The sync protocol is unchanged: town uses the existing `setup.mode` field and `done` message. In town, cars do not send `hit` dents.

### Changes

| What | Where |
| --- | --- |
| New game-local module: kinds, seeded house layout, roof parcel, arrival detection, handover flight, resident wave, route recording, and the paper-map drawing shared by the HUD and the recap | `public/js/town.js` (new) |
| Town mode: constants, default mode, mode chip and laps visibility | `js/main.js:31-35`, `main.js:149`, `main.js:220-230` |
| Parcel tray, choosing, arriving, handover, backwards ramp hop, finish, recap | `main.js:245-375` |
| No bots in town; mode parsing; town setup (map size, HUD class, no pickups) | `main.js:799`, `main.js:~843-876` |
| Gentle cars and no countdown in town | `main.js:924`, `main.js:989-999` |
| No boost pads, slow motion or landing banners in town; soft bumps | `main.js` (`stunts`, `onLanding`), `main.js:1103` |
| Direction-aware respawn; a child resting on purpose is not "stuck" | `main.js:1216-1223`, `main.js:1251` |
| Turn-round action and the town action whitelist | `main.js:1319-1342` |
| No finale clock in town; results screen switches to the recap | `main.js:1411`, `main.js:1485-1491` |
| Speed governor, `travelDir`, town cruise | `main.js:1596-1615`, `main.js:1670-1677` |
| Arrival check in `tick`; town branch of the minimap | `main.js:1766-1773`, `main.js:1956` |
| `clearOfRamps(dist, margin, dir)`: a backwards car is cleared *before* the ramp | `js/track.js:268-272` |
| `car.gentle`: a bump wobbles the car without denting it | `js/car.js:554-561` |
| `bump()` and `doorbell()` sounds (sine) | `js/audio.js:195-207` |
| 📦 Deliver mode button, `#parcels` tray, ↩️ `#turn-btn`, `#recap` with `#recap-map` and `#recap-stops`, and `#results-title` | `public/index.html` |
| Town HUD, parcel tiles, paper map, calm banner, recap, and phone and tablet layouts | `public/style.css:304-352` |

`delivery.js` (shared) is untouched. The racing "Follow the delivery map" mission still works in Race.

### Evidence

Screenshots and scripts are in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/183efacb-62c2-4cf6-9680-a97f4bb0fb5f/scratchpad/p2/crash-racers/` (`play.mjs`, `drive.mjs`).

- **Real drive (Montreal, portrait 834×1194, `drive.mjs`).** I drove with easy gas and steering help only, choosing parcels by tapping:
  1. Chose the furthest house and tapped ↩️. It was delivered 17 s later, driving backwards.
  2. Passed the wrong house and heard its line.
  3. Hopped the jump backwards.
  4. Delivered the other three.
  5. The recap showed a continuous route with no breaks.
- **Teleported deliveries (`play.mjs`).** Ran in Ubud portrait, Helsinki landscape 1194×834, Dino Valley phone landscape 667×375, Stunt Park phone portrait 375×667, and Ubud on WebKit.
  - The wrong house does not deliver.
  - The order the child chose is kept.
  - The measured top speed is 13.0 m/s (12.7 on WebKit).
  - There were 0 page or console errors.
- `browser.mjs --run p2`: Chromium and WebKit both report BOOT + PLAY ready with 0 errors.
- `node --test examples/_studio/tests/*.test.mjs`: 10 of 11 pass. Only the manifest-hash test fails, which is expected until the coordinator rebuilds.
- `original-quality.mjs`:
  - **Without the test change:** it will fail for crash-racers, because the racing mission chip is hidden while the default mode is Deliver.
  - **With the one-line-per-step change** (pick Race before using the chip or GO; see the coordinator report): every section passes, including "four ordered deliveries" in Race.
- **Not testable locally:** two pages on localhost did not join one room, so town multiplayer was checked by reading the code only.

### Remaining

- **Phase 3 art.** The houses currently reuse each city's own roadside buildings, with a picture post and doorstep in front. A small Blender parcel and a generic "front door with awning" kit piece would make the stop read as a house up close. The parcel is runtime boxes for now.
- **True side spurs.** Houses sit beside the main loop rather than down side roads. A spur needs new road geometry and clearance through each city's scenery, which is a larger change.
- **Turning round is an instant on-the-spot turn.** A short animated U-turn would be gentler.
- **Wording to check with the owner:** the voice lines, and whether to read the recap stops aloud in order.

### Simplify pass (2026-10-09)

- One shared voice (`speech.js`, rate 0.82, pitch 1) replaces `speakDelivery` and the inline cancel. It is also passed to the adventure. Feedback on what the child did interrupts (`tellNow`): parcel tap, arriving at a house, the thanks and a wrong stop. Directions queue: the start line, "Which parcel next?", the town finish, and "Now drive to stop N", which now follows the mission count in the queue instead of after a 650 ms timer.
- The mission chip label comes from `renderChoice`. `renderDeliveryChoice` and its click listener are gone; Race-only hiding stays in `renderModeChoice`.
- Delivery Town's map caches its static layer (road, houses, ticks) in an offscreen canvas. The cache is keyed on track, houses, size, chosen parcel and delivered count. Each frame only blits it and draws the van arrow (`town.js` `townMapLayout` and `drawMapCar`; `drawTownMap` still draws the recap). The `filter: drop-shadow` became `box-shadow` with an 8% radius that matches the paper map's corners.
- One cached reduced-motion `MediaQueryList` (`util.js` `reducedMotion`) now serves effects, town and the soft finish. The music box tune and bass are module constants.
- Skipped: the town-mode strategy refactor, which was out of scope.
- Checks: Chromium and WebKit `browser.mjs` passed with 0 errors. A Playwright Delivery Town run in both engines (choose, wrong house, deliver ×4, results) spoke every line in order, and the map was drawn. A Race delivery mission (stops 1–4) gave the count, then "Now drive to stop N", then the reward. One WebKit Race run logged a GLTFLoader blob-texture console error once; it did not reproduce on a rerun, and car loading was not touched. Tests: 11/11.
- Iteration 2: `tellNow` became `voice.sayNow`, and `isMuted` is no longer passed to the adventure. The delivery chip's label is now option fields (`pictures: '🎁'`, `caption: '1 → 2 → 3 → 4'`) drawn by the shared button; `renderChoice` is gone, and the map `renderProgress` stays. `drawTownMap` lost its dead `player`/`heading` options and its `drawMapCar` call; `drawMapCar` now always takes a heading. The calm-pass overrides were folded into their sources: the logo `bob`, car-pick and podium `hop`, 🔧 `wobble`, waiting-countdown and finale `pulse`, and GO's `nudge` (now the one soft `glow` directly) are gone, with their keyframes.
- Iteration 2 checks: Chromium and WebKit `browser.mjs` 0 errors; `original-quality.mjs` passed; tests 11/11. A Playwright Race delivery run with stubbed speech showed the 🎁 chip, the numbered stops filling to done, the speech order (stop 1, count, "Now drive to stop N", reward), mute cancelling speech, and 0 console errors in both engines.
- Third pass: the adventure is created with `place` to append the chip to `.modes`, and `anchor` is gone. The voice starts with `muted: audio.muted`; `setMuted` and the saved-setting load call `voice.setMuted`. The delivery option drops its unused `emoji`. "Now drive to stop N" checks `delivery.next < adventure.option.target`. The 4 was the stop count, which is shared `delivery.js` `STOPS` and not exported; it equals the mission target. The `#adventure-goal[hidden]` rule is gone.
- Third pass skipped: the `.hidden` toggle on `#adventure-choice` in `renderModeChoice` stays. `enable(false)` sets `hidden`, but shared `.adventure-choice { display: flex }` overrides it, and the button showed (`display: flex`) in Deliver and Smash without the class. Dropping the toggle needs a shared `.adventure-choice[hidden] { display: none !important }`.
- Third pass checks: Chromium and WebKit `browser.mjs` 0 errors; `original-quality.mjs` passed; tests 11/11. A Playwright run with stubbed speech in both engines showed mute and unmute working and a saved mute staying silent. The chip was last in `.modes`, showed only in Race, and the goal was hidden outside Race. There were 0 console errors.
- Exit paths (iteration 9): new city, Race again, the host's 'menu' message and every new race pass through `clearTimers()` (via `enterLobbyScreen` and `startRace`), which now also calls `voice.hush()`, so the results words stop with the race's timers.
- Exit-path checks: Chromium and WebKit `browser.mjs --run exits` 0 errors; `original-quality.mjs` passed; tests 11/11. A Playwright run with stubbed speech: the town results words were cancelled by Race again (the new drive still said its own line) and by new city; from race results, Race again hushed and began a fresh countdown, and new city hushed, cleared every timer and showed a clean menu with no late words 3 s later. 0 console errors in both engines.

## Round 1 of the 2026-10-10 re-audit (2026-10-11)

The audit scored the game 6. Its problems were that the houses sit on one loop so the map was never needed, the parcels showed the house's own picture, the wrong-house line repeated, the ending always said "You read the map", and Race had medals, a position pill and an overflowing results row.

### Design

- **Parcels show what is inside, not the house sign.** The tray, the roof parcel and the voice show 🦴, 🍌, 🌷, 📖, 🎈 and 🪁, while the houses keep 🐶, 🍎, 🌸, 📚, 🎂 and 🧸. The child has to work out the match ("A bone. Who would like a bone?"). The map no longer rings the chosen house in gold.
- **Mistakes matter, gently.** Driving past someone else's house shows its picture banner and says its name once per drive (`This is the library.`). *Stopping* there with a parcel (speed < 2.5 m/s), or tapping a non-matching parcel while parked at a door, counts as a try: "A bone for the library? Hmm. Who would like a bone?" Each try is said once. After the first try in tier 1, or the second in tier 2, that parcel's house glows gold on the map. There are no buzzers and no failure states. Careful play gives a shorter drive and the honest ending; random tapping gives detours and the hint ring.
- **The map matters on a loop: the short way.** Choosing a parcel starts a trip, which records the shortest way round from that point and the metres actually driven. A delivery counts as "short" if it had no wrong tries and was at most 1.2 × the shortest distance + 15 m. Tier 1 helps once per drive: after 60 m the long way round, ↩️ lights steadily (no pulse) and the voice says "Look at the map. Is the other way shorter?"
- **Honest ending (bug).** All short with no wrong tries: "…You read the map and went the short way every time!" Some short: "You found the short way once/twice/N times." None: "Next time, look at the map: which way is shorter?" On the recap, short stops get a green ring and every stop shows its parcel beside its house.
- **Harder tier for 6–8, adaptive rather than a gate (stored per device in `crash-racers-town-tier`).** A careful drive (no wrong tries, and the short way on at least half the planned trips) brings tier 2 next time:
  - all six houses;
  - harder matches: 🍐 pear → fruit shop, 🎾 → dog, 🌱 → florist, 📕 → library, 🕯️ candles → birthday house, 🪀 → toy shop;
  - no turn-round hint.

  Three or more wrong tries go back to tier 1.
- **Thinner voice.** A real tier-1 drive spoke 12 lines and a tier-2 drive 14, plus one per house driven past for the first time. Before, every pass repeated the wrong-house line. The start line and the per-parcel question are said once (`voice.newRound`/`sayOnce`), "Which parcel next?" is said once per drive, and the old long instruction is gone.
- **Calm Race (bug).** These are removed:
  - the position pill (`#position`, `MEDAL` and `ORDINAL`);
  - the results medals, finish times and the ⭐ tally, which caused the "still racing ⭐14" overflow (finished cars now show 🏁, cars still driving show 🏎️);
  - the 🏆 Speed Champ award;
  - the finale's ticking seconds, on both the pill and the results line.

  The kind and stat awards stay.
- The birthday house colour changed from gold to lavender, so it is never confused with the gold hint ring.

### Changes

| What | Where |
| --- | --- |
| `KINDS` with two `gifts` per house (emoji, name, thanks), `TIERS`, `configure(track, seed, tier)` with 4 or 6 evenly spread houses, parcel labels show the gift | `public/js/town.js:13-33`, `town.js:90`, `town.js:146-160` |
| `townRun` state, `townTier`, `newTownRun`, `whoWants`, `mapHint`, `townWay`, `missed` | `public/js/main.js:246-285` |
| Gift tray tiles (a delivered tile shows the house it went to) and `chooseParcel` with the wrong match at a door | `main.js:287-336` |
| `watchTheWay` (trip metres, tier-1 turn hint, stopped-at-wrong-door), `wrongStop`, `townArrive` (drive-by says the name once), `deliverTo` (records short) | `main.js:338-405` |
| `townEnding`, `adaptTier`, recap stops with the gift and a short ring | `main.js:447-480` |
| Start line and `voice.newRound()` | `main.js:1105-1106` |
| Podium with no medal, time or star tally; no Speed Champ | `main.js:~1600-1612` |
| HUD with no position update and no finale seconds | `main.js:2020-2048` |
| Map ring only as a hint | `main.js:2065` |
| `#position` removed and the finale shows just 🏁 | `public/index.html` |
| `#turn-btn.suggest`, the parcel's house badge, recap gift badge and `.stop.short`, medal rules removed | `public/style.css:306-316` |

`delivery.js` (shared) and the Blender assets are untouched.

### Evidence

Scripts and screenshots are in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/264c5237-472d-4187-be3f-45d364aa4d2a/scratchpad/polish/crash-racers/`. Speech was stubbed throughout.

- **`drive.mjs`, a real Easy-mode drive.** Ubud, tier 1, 834×1194:
  - The first house chosen was just behind the start. The hint fired after the long way round (`drive-port-hint.png`: ↩️ lit, 🦴 on the roof, no gold ring) and the car turned.
  - The rest went the short way.
  - The ending said "short way 3 times", with 3 of 4 stops ringed green (`drive-port-recap.png`).
  - The tier moved to 2.
- **Montreal, tier 2, 1194×834.** Six houses with the harder gifts.
  - The first parcel went the long way past five houses. Each house name was said once, none counted as a try, and the tier stayed at 2 (`drive-land-recap.png`).
  - 14 spoken lines.
- **`play.mjs`, teleport tries.** The wrong-stop line was said once per pair. After the first try, the gold hint ring showed on the right house (`port-r1-hintmap.png`). Two tries kept the next drive at tier 1.
- **`t2.mjs`.** The six-parcel tray fits at 834 px and 375 px (`t2-834.png`, `t2-375.png`).
- **`race.mjs`.** The 1-lap race HUD has no position pill (`land-race-hud.png`). The results show no medals or times and no overflow at 834 px (`port-race-final.png`).
- 0 page or console errors in every run.
- `node --check` passes on `main.js` and `town.js`.
- `browser.mjs --ids crash-racers --run crash-racers-r1` gives BOOT + PLAY ready with 0 errors.

### Remaining ideas

- **True spurs and junctions.** Placing houses down side streets needs new road and scenery clearance per city. The short way on the loop is the map decision for now.
- **A cooperative shared tray for friends.** This needs a protocol message, and two-device play can't be tested locally.
- **Tier with friends.** The tier is per device, so friends on different tiers see different house counts in the same town.
- A short animated U-turn instead of the instant turn.

## Round 2 of the 2026-10-10 re-audit (2026-10-11)

Independent review 1 scored 6.6. The blockers were that the match was automatic on drive-by, the loop made the map choice shallow, the harder tier was reached by luck and only added houses, and Race and Smash still had counters, a clock and a smash ranking.

### Design

- **Every handover is the child's tap.** Nothing is delivered on drive-by any more. At any house still waiting, the car rests for 5 s at the door.
  - The parcel tray turns into an offer row: the house's picture first, then the parcels, then ➡️ to drive on (🚀 also drives on).
  - The right parcel gets the doorbell, the wave and the thanks.
  - Another parcel gets a gentle "Bananas for the florist? Hmm. What does a florist sell?" with a 🐰 🤔 🍌 banner and 3 s more to think. Each house has its own question (`KINDS.ask`). There is no buzzer.
  - Help grows slowly. In tier 1, a wrong offer makes that parcel's house glow on the map. Two wrong offers at one door make the right tile glow.
  - Wrong tries now come only from taps. The old "car slowed below 2.5 m/s" rule, which counted cruise slowdowns, is gone.
- **Careless play is gentle but slower.** If a trip goes over 1.2 × the loop, or the child swaps parcels 4 times, the house glows and the voice says once per drive: "Look at the map: the house for your parcel is glowing." Back at the right door after that help, the tile glows: "Tap the glowing parcel to hand it over." A zero-input player delivers nothing.
- **↩️ is a slow U-turn.** The car swings round on the spot over 1.1 s with eased motion (instant under reduced motion). Taps during the turn or within 0.5 s after it are ignored.
- **Tier 2 adds road works, a new kind of thinking.** One gap between houses (never the start's gap) is closed by cones, a bar and a 🚧 sign, and the paper map shows the same.
  - The loop becomes a line with two ends. `townWay` treats the closed way as infinite. At the cones the car stops, the voice says once "Road works! This road is closed, so we turn round.", and it U-turns.
  - The start line adds "One road is closed today. Find the cones on the map, and plan your way."
  - The ending judges the whole plan as well as each trip. `bestRoute` works out the shortest route (nearer end first, then sweep). It says "You planned the whole way round the road works!" only when the drive was within 1.2 × that + 40 m. Otherwise it says "which end should you visit first?"
- **Houses spread round the whole loop.** Each house sits at `(i + 0.5 ± 0.15) / count` of the loop and is nudged so it is at least 16% of the town's span from the others (pins never overlap), 20 m from the start and 22 m from the cones.
- **Promotion only on evidence (`adaptTier`).** A careful drive needs at least 2 planned parcels, every one taken the short way, no wrong offers and no help of any kind (`townRun.help` counts the map glow, the door glow and the turn-round hint). Two careful drives in a row give tier 2 (`crash-racers-town-careful` streak). Tier 2 goes back to tier 1 after:
  - 2+ wrong offers;
  - planned driving over 2.5 × the shortest ways + 60 m;
  - no planned trips at all;
  - abandoning a tier-2 drive after 2+ helps.
- **Thinner voice.** The house name is said only at a door with no parcel, or in the wrong-offer question. Measured lines per drive: tier 1 careful 11, tier 2 careful 16, tier 1 passive 10 over 200 s.
- **Calm Race and Smash.**
  - The ⭐ and 💥 pills, the km/h readout and the Smash clock are gone (`index.html`).
  - In Easy mode, racing is capped at 20 m/s even holding 🚀. There is no 🔥 button, boost pads don't boost the child, the box's turbo becomes a honk wave, and the landing banner no longer says "🔥 ready".
  - Smash is untimed: 🅿️ (host or solo) parks everyone. Smash Champ and the 💥 scores on results are gone.
  - Results list the child first, then everyone in grid order (no finish order).
  - The mystery box no longer gives "⭐ 5 stars".
  - The Stunt Park jumbotron is a slow 5 s slideshow of park pictures. It no longer blinks, and "WOW!" and "CRASH!" are gone.

### Changes

| What | Where |
| --- | --- |
| `KINDS.ask`; `TIERS[2].roadworks`; spread and separated houses; road-works cones, bar and sign; `closed` getter; map draws the closure | `public/js/town.js:14-34`, `town.js:114-135`, `town.js:177-241`, `town.js:360-381` |
| `townRun` (help, planned, door, doorTries, total, best); `stored`/`store` | `public/js/main.js:241-296` |
| `townWay` with the closure | `main.js:306` |
| Door offer row; `tapParcel`, `offer`, `atDoor`, `driveOn`, `findHelp` | `main.js:337-450` |
| `watchTheWay` (no speed-based wrong stops), `roadworksAhead`, `uTurn`, `turnStep` | `main.js:456-520` |
| `deliverTo` records planned metres | `main.js:529` |
| `bestRoute`, `townEnding`, evidence-based `adaptTier` | `main.js:600-650` |
| Demote after an abandoned struggling tier-2 drive | `main.js:1149` |
| 🚀 drives on at a door; `turnStep` in `tick` | `humanController`, `tick` |
| Easy race cap `EASY_RACE_TOP`; no pads, turbo or "🔥 ready" in Easy | `main.js:35`, `main.js:1350`, `govern` `main.js:1894`, `turbo`, `onLanding` |
| Untimed Smash with 🅿️; no Smash Champ; no ranking | `main.js:1617`, `main.js:1790`, `standings`, `giveAwards` |
| No star prize | `public/js/pickups.js:14`, `openBox` |
| Calm jumbotron | `public/js/cities.js:1159` |
| HUD pills, speed, and 🅿️ | `public/index.html` |
| Door row styles, hint tile, park and easy rules | `public/style.css:289-316` |

`delivery.js` and the Blender assets are untouched.

### Evidence

Scripts and screenshots are in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/264c5237-472d-4187-be3f-45d364aa4d2a/scratchpad/polish/crash-racers/` (`r2.mjs`, `door.mjs`, `works.mjs`, `rs.mjs`). Speech was stubbed throughout, and every run had 0 console or page errors.

- **`r2.mjs careful`** (Easy cruise; picks the shortest way; ↩️ when the house is behind; taps the right parcel at the door; ➡️ elsewhere):
  - Ubud portrait: 4/4 in 70 s.
  - Montreal landscape: three drives. Drives 1 and 2 were tier 1 (4/4 in 74 s each, 11 lines). The streak moved the tier to 2 after drive 2. Drive 3 was tier 2 (6/6 in 90 s, 16 lines).
  - Helsinki and Montreal at tier 2: 6/6 in 99–129 s, with the "planned the whole way" ending (`c2-recap0.png` shows the turn-back route round the 🚧).
  - Dino Valley tier 2 on a phone (375×667): 6/6 in 121 s.
- **`r2.mjs passive`** (one random parcel tap, then nothing), Ubud tier 1, 200 s: 0 delivered. The car rested at each door and drove on. The voice gave the turn hint, then the glow line at 127 s, then "Tap the glowing parcel" at the right door at 193 s. The tier stayed at 1.
- **`r2.mjs random`** (a random parcel 15% and ↩️ 20% of 0.5 s ticks), Montreal, 300 s: 2/4 delivered, 2 wrong offers, help 5, no promotion. Before the fix the glow line repeated for each swapped parcel; it is now once per drive.
- **`door.mjs`**:
  - Ubud portrait: arriving at the florist with 🍌 showed the offer row (`d1-door-wrong0.png`).
  - 🍌 and 📖 got the florist's question.
  - The 🌷 tile then glowed (`d1-door-hint.png`) and 🌷 was delivered while 🍌 stayed on the roof.
  - The phone tier-2 row of 8 fits on one line (`d2-door-wrong0.png`).
- **`works.mjs`**, Helsinki tier 2: the car cruised to the cones, stopped about 13 m before them, did the slow U-turn (`w1-works5.png`, `w1-works7.png`) and drove back. Ten fast ↩️ taps did not stall the car.
- **`rs.mjs`**, Stunt Park, holding 🚀 for 12 s:
  - Race: 1 of 24 samples was over 22 m/s, a single 25 m/s spike from a bump (pads are now off for an Easy child, and the governor brakes harder above the cap). Before the pad change it peaked at 26.7 m/s.
  - Smash: up to 26 m/s, mostly airborne or pushed by a bot.
  - No turbo button. 🅿️ shows only in Smash and parks to results.
  - Results show the child first, no 💥 scores and no Smash Champ (`rs-race-results.png`, `rs-smash-hud.png`).
- `node --check` passes on every `public/js/*.js`. `browser.mjs --ids crash-racers --run crash-racers-r2` gives BOOT + PLAY ready with 0 errors.

### Remaining ideas

- True side spurs and junctions (new road geometry per city).
- In Smash, the bots still hunt the nearest car. A cones-only bumping sandbox would be calmer.
- The ⭐ road coins and their chime remain in Race (there is no counter). They could become city pictures to spot.
- The tier is still per device, so friends can see different towns.
- The road works have no colliders; the car is stopped by logic. A respawn just past them puts the car on the far side.

## Round 3 of the 2026-10-10 re-audit (2026-10-11)

Independent review 1 scored 7.1. The blockers were that the map was optional (the car rested at every house, so matching at each door beat planning), a wrong offer cost only 3 s, the harder tier only added houses and auto-U-turned at the cones, and Race and Smash still had tallies and a crash-hunting Smash.

### Design

- **The child decides where to stop.** The car no longer rests at every house. As a house that is still waiting comes up (34 m ahead, or beside it), a big round button above the pedals shows that house's picture with a ✋. It appears for every waiting house in turn, so it gives nothing away. A tap asks the car to stop: it eases to 4 m/s and halts at the door. Holding 🐢 to a stop beside a waiting house does the same. Driving past the right house means going round again or turning back. The button shows only once a parcel is packed.
- **At the door only the packed parcels are offered** (house picture, the packed parcel or parcels, ➡️). The matcher strategy is gone: the child must already have decided "this is the house".
- **A wrong offer costs a trip.** The resident's 🤔 banner and the house's question ("Bananas for the florist? Hmm. What does a florist sell?") play, the door closes for that visit, and after 2.6 s the car rolls on. In tier 1 that parcel's house glows on the map. The tier-1 glowing-tile help and the "Tap the glowing parcel" line are gone.
- **Tier 2 is now sorting plus planning.** Every house wants both of its gifts (🦴 and 🎾 for the dog, 🎈 and 🕯️ for the birthday). The eight parcels come mixed up, never with a pair side by side. The van carries two, so the child packs two that belong together. A split pair costs an extra trip, because the second parcel is turned away at the first house. Road works stay. The car now stops at the cones and waits, with ↩️ lit, for the child to turn round.
  - The ending judges the sort first ("You packed 2 pairs together. Next time, which two parcels go to the same house?"), then the plan round the cones.
  - The tier drops back to 1 after 2+ wrong offers, trips over 2.5 × the shortest, or fewer than half the pairs packed together.
- **Thinner voice.**
  - "Who would like…?" is said for the first two parcels of a drive only.
  - Each wrong-offer question is said once per parcel and door, four per drive at most.
  - The second parcel of a pair handed over on the same visit gets the doorbell and the wave but no second thanks.
  - "Is this the house? Tap it to stop." and "Tap your parcel to hand it over." are each said once per drive.
- **Calm Race and Bumpers.**
  - Smash is now **🎪 Bumpers**. In Easy mode the bots potter round at about 13 m/s instead of hunting the nearest car.
  - The results are titled 🅿️ Parked, with 🅿️ on each row.
  - Road stars are silent scenery: no chime, no sparkle, no Star Catcher.
  - Awards are names only, with no counts, and Cone Crusher is gone.
  - The Race mission chip is the same size as the mode buttons and has its own row. Its ↻ sits in a visible round badge.
- **Fixes.** `clearTimers()` removes the results petals, so they no longer fall over the next drive. The recap shows each stop as the house and, below it, a 28 px pill of what was handed over there.

### Changes

| What | Where |
| --- | --- |
| Parcels separate from houses (`parcels`, `wants`, `load`, `carry`, `pack`, `complete`, `finished`); tier 2 pairs and shuffled tray; two-parcel roof; pair on the doorstep | `public/js/town.js:28-37`, `town.js:140-212`, `town.js:276-330` |
| `townRun` (trips per parcel, visit, ahead, stopFor, turnedAway, asked, questions) | `public/js/main.js:244-300` |
| Row of parcels and stop button (`renderParcels`, `renderStop`), packing (`tapParcel`), `askToStop`, `offer` (turned away, rolls on), `atDoor` | `main.js:365-500` |
| `houseAhead`, `watchTheWay` (stop button, 🐢 stop, per-parcel trips), `roadworksAhead` (stop and wait) | `main.js:519-590` |
| `townArrive` stops only when asked; `deliverTo` (pairs, one thanks per visit) | `main.js:620-660` |
| `pairsTogether`, `townEnding`, `adaptTier`, `renderRecap` | `main.js:715-790` |
| Petals cleared in `clearTimers` | `main.js:791` |
| Silent stars; awards without tallies; 🅿️ Parked | `main.js:1559`, `main.js:1865-1900` |
| Cars wait at the cones; eases to 4 m/s when asked to stop or near the cones; Easy Bumpers bots | `main.js:2003`, `main.js:2091`, `main.js:2109` |
| `#stop-here` button; 🎪 Bumpers | `public/index.html:35`, `index.html:63` |
| Stop button, tier-2 row of eight, recap gift pills, mission chip, narrow-phone modes | `public/style.css:146-150`, `style.css:206-210`, `style.css:262`, `style.css:323-345` |

`delivery.js`, shared helpers and the Blender assets are untouched.

### Evidence

Scripts and screenshots are in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/264c5237-472d-4187-be3f-45d364aa4d2a/scratchpad/polish/crash-racers/r3/`: `play.mjs` (careful, matcher, random, passive), `rs.mjs` and `menu.mjs`. Speech was stubbed, and every run had 0 page or console errors.

- **Careful** (Easy cruise; packs the nearest house's parcels; ↩️ when it is behind; taps the stop button only at the right house):
  - Ubud portrait: tier 1, 4/4 in 74 s and 79 s with 10 lines each. The streak moved the tier to 2 after the second drive.
  - Montreal portrait: three drives, 77 s, 77 s, then tier 2 with 8/8 in 118 s. The greedy order got the honest "which end should you visit first?" line (`pc-recap2.png`).
  - Montreal landscape, tier 2: 8/8 in 81 s with 16 lines and "packed every pair and planned the whole way" (`l2-recap0.png`, `l2-door2.png` shows two parcels offered at 🎂).
  - Dino Valley on a phone (375×667), tier 2: 8/8 in 109 s with 12 lines (`p2-stop.png`).
- **Matcher** (packs a random parcel and stops at every house):
  - Ubud tier 1: 4/4 in 203 s, against about 77 s careful. 3 wrong offers, help 4, no promotion.
  - Helsinki tier 2: 3/8 in 240 s. It hit the cones and waited for ↩️ (`m2-works.png`) and spoke 14 lines.
- **Random tapping** (Helsinki and Ubud tier 1): 1/4 in 240–300 s.
- **`rs.mjs`**:
  - Bumpers in Easy: the top speed was 20.0 m/s, and the results are "🅿️ Parked" with awards that have no counts.
  - Petals: 1 `.party` on the results, 0 after 🔁 Deliver again.
- **`menu.mjs`**: the menu at 834×1194, 1194×834, 375×667 and 667×375 has no horizontal scroll. The mission chip sits on its own row at mode-button size (`menu-834x1194.png`).
- `node --check` passes on every `public/js/*.js`. `browser.mjs --ids crash-racers --run crash-racers-r3` gives BOOT + PLAY ready with 0 errors.

### Remaining ideas

- A tier 3: two closures, or a one-way street, so the order must be planned before setting off.
- True side spurs and junctions (new road geometry per city).
- On a 375 px phone, the tier-2 tray tiles are about 38 px. Two rows would need the map moved.
- On a narrow phone in Race mode, the Laps row wraps close to GO (an older issue).
- The tier is still per device, so friends can see different towns.

## Round 4 of the 2026-10-10 re-audit (2026-10-11)

Independent review 1 scored 7.7. Deliver mode now passed, but the review listed these blockers:

- Race and Bumpers were still toys with no decision.
- The recap looked the same for a careless drive and a careful one.
- There was no tier 3, and greedy nearest-first planning earned the "planned" praise.
- Two UI bugs: the stop button stayed live after a turn-away, and the tier-2 tray overlapped the map in portrait.

### Design

- **Present gates in Race and Bumpers** (`public/js/gates.js`, new):
  - Twice per loop, a white gantry spans the road. A house sits on top (🐶) and a present hangs over each lane (🦴 over one, 📖 over the other).
  - In Easy mode, the house and its two presents appear as big buttons between the pedals (◀ present, house, present ▶). A tap steers the car into that lane. Without Easy, the child steers.
  - The right lane gives the doorbell and a 👋 wave.
  - The other lane has a soft puddle: a splash, about 1.4 s at 10 m/s, a 🤔 banner and the house's question. The question is said once per house, two per race at most.
  - Driving under the middle chooses nothing, so nothing happens.
  - After each pass the gate takes a new house. Once Deliver has reached tier 2, the gates use each house's harder present (🍐, 🕯️).
  - The results show each gate as the house and the present chosen, with a gold ring on the right ones, and one honest closing line.
  - The "🎁 📯" box banner shows once per race.
- **Tier 3: a one-way street** (`town.js` TIERS and `oneWayStreet`):
  - The road has white arrows painted on it, a blue ⬆️ sign at the entry and a ⛔ facing the wrong end. The map shows the stretch in blue, with arrows and a ⛔.
  - The arrows point against the way the plain shortest plan would take (`plainPlanCrossing`), so a child must read the arrows, not just the distances.
  - The car stops at the ⛔ and waits for ↩️. A U-turn half way along the street is refused gently, with the line "Follow the arrows to the end".
  - Two careful tier-2 drives bring tier 3. Struggling drops one tier.
- **The best plan is computed for every tier**:
  - `bestRoute` tries every house order, with each leg taking the open way round (`legLength` respects the cones and the arrows).
  - Distance is measured along the road, the same way for the child's drive and the plan.
  - "Planned the whole way" now needs a drive within 1.12 × the best plan + 30 m. Greedy nearest-first now sometimes misses it.
  - The tier 2/3 ending tells the two reasons apart. If the car hit the cones or the ⛔, it points at the signs. Otherwise it says: "Look at the gold road on your map: it visits the houses in a shorter order."
- **The recap shows what careful play changed**:
  - The best plan is drawn as a soft gold band under the pink route.
  - Two ribbons sit under the map, with no numbers: 🚚 the child's drive and ⭐ the short way.
  - Short-way stops get a gold ring and a ✓. They used to be green, the same as the toy shop's tint.
- **Bug fixes**:
  - After a turn-away the stop button is cleared (`townRun.ahead = -1`). `askToStop` ignores the refusing house and any house that is already complete.
  - The second parcel's "Who would like…?" is queued with `voice.say`, so it no longer cuts off the first.
  - The tier-1 turn-round hint never fires while a stop button shows, the car is at a door, or a stop has been asked for.
  - The Easy speed cap is trimmed after every physics step, so it also holds in the air and after landings.
  - Wording: "🔔 Last lap", "Lap 2" and "🏁 Home". The Bumpers results button now reads 🔁 Again.
  - In portrait, the tier-2 tray wraps into two rows of four at full tile size, and the buttons (and on phones the map) move below it.

### Changes

| What | Where |
| --- | --- |
| Turn-away clears the stop button; guarded `askToStop`; queued pack question; hint timing | `public/js/main.js:434-500`, `main.js:556-600` |
| `legLength`, `townWay` (cones and arrows), `blockAhead` and `roadworksAhead` (⛔ too), no U-turn on the one-way | `main.js:330-360`, `main.js:601-635`, `main.js:1952` |
| `bestRoute` (every order), `plannedWell`, `townEnding`, `adaptTier` (three tiers) | `main.js:753-830` |
| `renderRecap` with the plan band, `renderWays` ribbons | `main.js:834-878` |
| Present gates: `watchGates`, `passGate`, `renderGatePick`, `renderGateRecap`, `gateEnding`; puddle in `govern`; lane aim in `steeringHelper` | `main.js:880-975`, `main.js:2234`, `main.js:2399`; `public/js/gates.js` |
| Easy cap after physics (`holdEasyCap`) | `main.js:2244`, `main.js:2385` |
| Tier 3 (`TIERS`, `facingSign`, `oneWayStreet`, `plainPlanCrossing`); map: one-way and plan band | `public/js/town.js:41`, `town.js:160-230`, `town.js:377`, `town.js:514-565` |
| Gate picker, gate recap, recap ribbons | `public/index.html:64`, `index.html:99-108` |
| Two-row tray in portrait; gold short ring; ribbons; gate styles | `public/style.css:334-341`, `style.css:355-366`, `style.css:395-408` |

`delivery.js`, the shared helpers and the Blender assets are untouched.

### Evidence

Scripts and screenshots are in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/264c5237-472d-4187-be3f-45d364aa4d2a/scratchpad/polish/crash-racers/r4/`: `play.mjs` (careful, matcher, random, naive), `race.mjs`, `view.mjs` and `bypass.mjs`. Speech was stubbed, and every run had 0 page or console errors.

- **Deliver, careful** (greedy nearest house; ↩️ when the open way behind is shorter):
  - Tier 1, Ubud portrait: 4/4 in 70–76 s with 10 lines.
  - Tier 2, Montreal portrait: 8/8 in 116 s with 12 lines, a drive of 927 m against a best plan of 826 m (praised). The two-row tray sits clear of the map (`c2-stop.png`).
  - Tier 3 (landscape):
    - Montreal: 605 m against 625 m, praised.
    - Helsinki: 897 m against 718 m, and Ubud: 829 m against 685 m. Neither was praised; both got "look at the gold road": greedy is no longer enough.
- **Deliver, naive** (reads only the distances, not the signs), tier 3:
  - Montreal hit the ⛔ ("No entry!…"), drove 1047 m against a best of 640 m, and got the arrows line.
- **Deliver, matcher** (random parcel, stops at every house):
  - Ubud tier 1: 4/4 in 194 s with 3 wrong offers and a drive of 1690 m against 684 m. The recap ribbons show it at a glance (`m1-recap0.png`).
  - Helsinki tier 2: 2/8 in 300 s.
  - Dino tier 3: 5/8 in 250 s with 5 wrong offers.
- **`bypass.mjs`** (the reviewer's repro, tier 2): after a wrong offer the stop button is hidden and `ahead` is -1. `askToStop` on the same house leaves `door` at -1.
- **`race.mjs`**, Race in Easy mode:
  - Careful taps: 4/4 gates ✓ (Stunt Park portrait, `rc-gate1.png`, `rc-results.png`).
  - Random taps: 2/4, with puddles and two house questions (Helsinki landscape).
  - Bumpers random: 2/4. The results read "🅿️ Parked" and "🔁 Again".
  - With no taps, the result is a coin toss (7/12 over three cities). Driving down the middle now counts as no answer.
  - Spoken lines per race: 2–4.
  - The top horizontal speed holding 🚀 in Stunt Park is 21.0 m/s, down from 24–26.
- **Phone (375×667)**: the tier-2 tray sits in two rows above the map (`ph2-stop.png`). The gate picker sits above the pedals (`phr-gate1.png`).
- `node --check` passes on every `public/js/*.js`. `browser.mjs --ids crash-racers --run crash-racers-r4` gives BOOT + PLAY ready with 0 errors.

### Remaining ideas

- Bumpers is still free play with gates. A sorting sandbox (bump coloured cones into matching pens) would give it a lesson of its own.
- True side spurs and junctions (new road geometry per city).
- The tier is still per device.
- The gate signs are sprites. A Blender gantry would match the cities' style.

## Round 5 of the 2026-10-10 re-audit (2026-10-11)

The last review scored 8.4. Two audit items were still open: side streets and junctions, and a shared tray for friends. The review also found five bugs: a gate tap that counted for nothing, bot turbo flames in Easy mode, the confetti when a mystery box opens, an old Stunt Park blurb, and award badges on the results. Its blockers were that Race had no step up, the greedy route still earned the planning praise, older children could not choose the harder town, and friends could get different towns.

### Design

- **Side streets (closes the "spurs and junctions" item).**
  - **The streets.** In Delivery Town each city now has two short dead-end streets off the loop, 🌈 Rainbow Street and 🌙 Moon Street.
    - Each is a 7 m lane laid in the city's own road surface, with a round turning place at its end.
    - A house stands at the end of each street. Its picture sign sits on a post at the corner.
  - **Where they go.**
    - The city plans the streets before it builds any scenery: on straight road, on open ground, away from the start and from each other. The planned streets join the road's spatial hash, so terraces, buildings and trees keep clear of them the same way they keep clear of the road.
    - Once the city is built, anything still in a street's way is cleared, such as a shrine or a crate.
    - A street that would run into the sea, a river or a jump's landing is dropped and a spare takes its place.
    - Every city got two streets in each of 30 seeded builds (`spurs.mjs`).
  - **Choosing a street.**
    - As a street's corner comes up, the stop button shows the street's picture with ↪️. In tier 1 the button shows the house with the street as its badge.
    - Tapping it means "turn in here". The van turns in by itself, rolls gently to the door, waits for the handover, swings round the turning place and comes back out, carrying on the way it was going.
    - A wrong street costs the trip down it and back.
  - **The map.** Each street is drawn as a road off the loop, 1.8 times longer than it really is, so it reads as a street. The street's picture sits at its corner and the house is pinned at its end.
  - **The plan.** The best plan, the "nearest first" check, the trip lengths and the recap all count the way down and back up a street. A careful drive that took a street measures within a few metres of the plan (for example 807 m against 806 m).
- **A shared tray with friends (closes the "cooperative tray" item).**
  - In Delivery Town with friends, everyone drives the host's town, with the same houses and tier (`setup.tier`). Everyone shares one tray.
  - Two new messages keep the tray in step:
    - `pack` sends the parcels in a child's van. They show that child's animal in everyone else's tray and cannot be packed there.
    - `given` sends a parcel that was handed over. It is ticked off for everyone, drops onto that doorstep, and a 👋 banner shows who delivered it.
  - The drive ends for everyone when the tray is empty, with the line "All 8 parcels delivered together! You took N." Each child's recap shows their friends' handovers with the friend's animal on them.
  - Friends' vans show on the map.
  - A shared drive does not change the tier.
- **The order has to be planned in tiers 2 and 3.**
  - `tourGreedy` works out the "drive to the nearest house next" route and `tourBest` the best one. If nearest-first comes within the praise margin, `configureTown` lays the town out again from another seed (up to 24 tries).
  - House spots are picked at random among the well-spread ones, so the tries really differ.
  - In 20 seeded towns, nearest-first now misses the praise in 18 at tier 2 and in 19 at tier 3 (`tours.mjs`).
- **A visible harder town.** When 📦 Deliver is selected, three small chips sit in the mode row: 📦, 📦📦🚧 and 📦📦⛔. A grown-up or an older child can start at tier 2 or 3, and later drives still move the tier up or down.
- **Race and Bumpers.**
  - **Gate taps (bug).** A tapped present is now always the answer. In Easy mode the car aims at the middle of the picked lane (±0.3 of the road width), looking closer in once the gate is within 45 m. Measured lanes at the gate were ±1.5 to 3.6 m, against −0.7 m before.
  - **More gates that adapt.** Three gates per loop instead of two, and no house comes straight back on the next gate. Three right in a row bring each house's harder present (🍐, 🕯️); two misses in a row bring the easy presents back. The closing line notices the harder presents.
  - **Calmer in Easy mode.**
    - No bot ever fires a turbo, and boost pads boost no one, so there are no flames.
    - A bot's box simply opens.
    - Opening a box makes a soft sound and shows a small note at the top of the screen (🎁 📯). There is no colour burst and no big banner over the gate buttons.
    - The honk ring is pale dust, without the purple and teal sparks.
    - The boxes turn slowly.
    - There are no road stars.
  - **Results.** The gates (house and present, with a gold ring for each match) now lead the results at a larger size. The per-car "kind" badges are gone; each car shows only 🏁, 🏎️, 🅿️ or 👋.
  - **Stunt Park blurb.** It now reads "Big jumps, cactus desert and hot-air balloons".

### Changes

| What | Where |
| --- | --- |
| `SPUR` sizes; `Track.plan`; `planSpurs`, `spurClear`, `makeSpur`, `nearSpur`; jumps avoid junctions; town builds skip boost pads under a moved jump | `public/js/track.js:11`, `track.js:87-91`, `track.js:330`, `track.js:444`, `track.js:511-571` |
| `carveSpurs` (clear the way, drop blocked streets, keep two), `buildSpur` (lane over the pavement, turning place); an emptied merge bucket is skipped | `track.js:580-712`, `track.js:718` |
| `STREETS`, `streetSign`, side-street house slots, spread house spots, road works and one-way kept off junctions, a friend's parcel drops from above | `public/js/town.js:49`, `town.js:188`, `town.js:344-410`, `town.js:456` |
| Map: streets drawn long (`MAP_STRETCH`, `layout.at`), lane, turning place, street picture | `town.js:52`, `town.js:513-545`, `town.js:575-610` |
| `townWay` and `streetLength`; shared tray (`friendHas`, `shareLoad`, `friendDelivered`, `pack` and `given`) | `public/js/main.js:351-367`, `main.js:386-420`, `main.js:1673-1681` |
| Street button (`renderStop`); van in a side street (`startGlide`, `glideStep`, `endGlide`) | `main.js:471`, `main.js:737-846` |
| `tourBest`, `tourGreedy`, `bestRoute` with streets, `configureTown`; shared ending and tier | `main.js:941-1030`, `main.js:1041`, `main.js:1074` |
| Adaptive gates; gate taps always count; lane aim | `main.js:1141`, `main.js:1173`, `main.js:1241`, `main.js:2700`; `public/js/gates.js:39`, `gates.js:75`, `gates.js:106` |
| Tier chips; host tier in `setup`; side streets planned before the city is built; shared run | `main.js:1401-1440`, `main.js:1714`, `main.js:1772`, `main.js:1784` |
| Calm Easy race: no stars, calm bots, box note, side streets count as road in `recover` | `main.js:1808`, `main.js:1863`, `main.js:2096-2160`, `main.js:2206`; `public/js/bot.js:50,61`; `public/js/pickups.js:70,203`; `public/js/effects.js:198` |
| Results without badges, gates first | `main.js:2417`, `public/index.html:104` |
| Tier chips, `#note` | `index.html:36`, `index.html:76` |
| Styles for the new pieces | `public/style.css:410` onward |
| Stunt Park blurb | `public/js/cities.js:22` |
| How to play and learning text | `game.json` |

`delivery.js`, the shared helpers and the Blender assets are untouched.

### Evidence

Scripts and screenshots are in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/264c5237-472d-4187-be3f-45d364aa4d2a/scratchpad/polish/crash-racers/r5/`. Speech was stubbed in every run, and every run had 0 page or console errors.

- **`spurs.mjs`.**
  - Five cities with 6 to 7 seeds each: two side streets in every build, and each build took 50 to 300 ms.
  - Views of the street and its turning place in each city: `spur-*.png`.
- **`play.mjs` with real Easy drives.**
  - **Tier 1.** Ubud portrait: 4/4 in 93 to 98 s with 13 lines. Stunt Park landscape: two drives (115 s and 82 s) both took the side streets the short way, and the tier moved to 2.
  - **Pictures.**
    - `c1-stop.png`: the street button, showing 🧸 with 🌙.
    - `c1-glide.png`: the van turning in.
    - `m1-door1.png`: a wrong parcel at a door on a side street.
    - `c2-recap0.png`: the streets on the recap.
    - `g3-stop.png`: the tier-3 street button, showing 🌙 with ↪️.
  - **Nearest-first against planned.**
    - Helsinki tier 3: nearest-first drove 996 m against a best of 818 m and got "Look at the gold road…". The `planner` style drove 807 m against 806 m and got "planned the whole way along the arrows!".
    - Montreal tier 2: the planner drove 825 m against 805 m and was praised.
  - **Matcher.** Dino tier 1: 1314 m against 834 m, with 1 wrong offer and no promotion.
  - **Phone (375×667), tier 2.** 8/8 (`ph-glide.png`).
- **`coop.mjs`: two iframes and a stand-in BitGames bridge, with real WebRTC between them.**
  - Both cars drove the same tier-2 town, with the same houses and the same tray.
  - After the host packed 📕, the guest's tile showed 🦊 and could not be packed (`coop-packed.png`).
  - After the host delivered it, the guest's tray ticked it off.
  - The guest delivered the other seven. Both screens moved to the results with "All 8 parcels delivered together! You took one." on the host and "…You took 7." on the guest. The recap shows the friend's animal on their handovers (`coop-results.png`).
  - The tier stayed at 2.
- **`race.mjs`.**
  - **Ubud portrait, careful taps.** 6/6 gates, measured at lanes −1.5, −3.6, 2.9, 2.9, −3.5 and −1.5 m. Gates 4 to 6 were run in the harder tier, but gates 4 and 5 had already been set out with the easy presents (🐶 🦴 shows twice in `ru-results.png`), so only gate 6 (🍎 🍐) truly used a harder present. Before the fix in `gates.js`, `passed[].hard` was read from the live tier, so the log marked all three with H. The gate now keeps its own hardness. The closing line was "You matched every present, even the harder ones!" The results show the gate row first (`ru-results.png`).
  - **Helsinki landscape, random taps.** 2/6 right, with two house questions.
  - **Bumpers, Montreal landscape.** 4/4 right, and the tier stepped up after 3.
- **`calm.mjs`, Easy mode.**
  - Race in Stunt Park (90 s) and Bumpers in Montreal (60 s): 0 samples of a bot turbo and 0 road stars. 4 and 5 boxes were opened, each showing the small top note (`calm-smash-1194x834-note.png`).
  - That screenshot was taken before the honk ring lost its sparks, so it still shows the old purple and teal streaks.
- **`menu.mjs`.** At 834×1194, 1194×834, 375×667 and 667×375 there is no horizontal scroll, the tier chips are at least 44 px, the choice is saved, and the chips are hidden for Race.
- **Checks.** `node --check` passes on every `public/js/*.js`. `browser.mjs --ids crash-racers --run crash-racers-c1` gives BOOT + PLAY ready with 0 errors. `original-quality.mjs` passed, crash-racers included.

### Checklist

- **Add side streets and junctions so the map matters: done.** There are two dead-end side streets per city. A street's corner is a real decision, and in tiers 2 and 3 only the map says which house is down which street. A wrong street costs a trip, and the streets count in every plan.
- **Shared tray for friends: done.** It uses the `pack` and `given` messages and the host's tier, and was tested over real WebRTC between two pages.
- **Review bugs: fixed.** The gate tap, the Easy turbo flames, the box burst, the Stunt Park blurb and the award badges.
- **Review blockers: addressed.**
  - Race now steps up to the harder presents, with three gates per loop.
  - Nearest-first misses the praise in 18 of 20 tier-2 towns and 19 of 20 tier-3 towns.
  - Older children can pick the harder town in the menu.
  - Friends share the host's tier.

### Remaining

- The name "Crash Racers" still clashes with the calm default. The title belongs to the catalogue and was not changed.
- The side streets have no colliders. A child steering by hand can still drive in and out of a street, and the street counts as road for rescue.
- The van drives a side street by itself, so there is no steering there, even outside Easy mode.
- `passed[].lateral` (where the car was under a gate) is recorded for the test scripts only.

## 2026-10-11 — Round 6: a true map, one start sentence, a nudge for a quiet child

### Design

- **The map is drawn true.** Side streets are still drawn 1.8× long, but only the street itself (its lane, turning place and house) is stretched. Before this fix, any point on the same line as a side street, anywhere across the town, was pushed outward. That moved stretches of the loop, loop houses, the car arrow, the recap route and the gold plan off the road, in every city. Now the loop and every loop house sit exactly where `px`/`pz` put them.
- **One sentence to start.** The child hears a single opening line in every tier, and with friends that line carries the sharing. The road-works or one-way line is now said once, when the van is full (the moment to plan the way) and after the parcels' questions. The side-street line was dropped from the start, because the corner already says it ("A side street! Is your house down there? Look at the map.").
- **A child who has not packed yet.** After 25 s with nothing packed and nothing handed over, the child hears "Tap a parcel to put it in the van." once. The tray tiles glow softly once (a single 2.4 s ease, a still ring under reduced motion), and the glow never repeats.
- **"The short way" is honest.** A stop counts toward the short way only if the parcel had a way to choose: a shortest trip of at least 12 m that the van really drove (at least 0.6 × the shortest). A parcel packed at its own door, or a teleported trip, now counts neither way. The co-op line "You went the short way every time" also needs at least two such trips.
- **Fluent tier 1 gets a decision behind the start.** After one careful tier-1 drive (careful streak ≥ 1), the host's setup carries `behind`. One loop house then stands 44–96 m behind the start, unless a side street is already there. That house is about 42 m away with ↩️ and about 780 m away driving round, so turning round becomes a real choice. Friends get the same town because the flag travels in `setup`.
- **Results fit the screen.**
  - On a narrow portrait phone, the recap uses a smaller map (`min(72vw, 38vh, 300px)`) and one row of compact stops, so 🔁 and 🗺️ stay on screen.
  - On a sideways phone, the stops sit two by two and both buttons share one row. Before this, at 667×375 the 🗺️ button sat 76 px below the fold.
  - On a landscape tablet or laptop, the map gives a little height back.

### Changes

| What | Where |
| --- | --- |
| Stretch bounded to the street (`end`) | `public/js/town.js:529-536` |
| `configure(..., { behind })`: a house behind the start for a fluent tier 1 | `town.js:329`, `town.js:362-374` |
| `townRun.idle`/`nudged`, `IDLE_NUDGE_SECONDS`, `nudgeTray`, idle check in `watchTheWay` | `public/js/main.js:306`, `main.js:618-637` |
| Plan line when the van is full | `main.js:525-529` |
| `routed` trips in `deliverTo`; honest shared ending | `main.js:884-887`, `main.js:1069-1073` |
| `configureTown(seed, tier, behind)`; `setup.behind` | `main.js:1037-1042`, `main.js:1740`, `main.js:1815` |
| One-sentence start | `main.js:1960-1966` |
| Tray glow, portrait-phone recap, sideways-phone recap, landscape-tablet recap | `public/style.css:433-471` |

`delivery.js`, the shared helpers and the Blender assets are untouched.

### Evidence

Scripts and screenshots are in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/264c5237-472d-4187-be3f-45d364aa4d2a/scratchpad/polish/crash-racers/r6/`. Speech was stubbed and logged in every run, and every run had 0 page or console errors.

- **`mapprobe.mjs` (the unit check the review asked for).**
  - It covers 5 cities × 60 seeds × tiers 1–3, 900 layouts in all. For every track sample and every loop house, `at(x, z)` equals `[px(x), pz(z)]` exactly (worst error 0 px), and no house falls off the 300 px map.
  - With the bound removed, the same probe fails all 180 Montreal layouts, with a worst error of 105 px.
- **`mapshot.mjs`.** On the Helsinki HUD map (`map-helsinki-1.png`), each street house sits at the end of its own lane.
- **`play.mjs` drives.**
  - Montreal tier 2 (`c2`, `m2`), phone tier 2 (`ph`) and Dino tier 3 planner (`g3`): all 8/8 delivered with 13 lines each. Each opened with one sentence, and the closure or one-way line came after the parcels' questions.
  - The recaps (`c2-recap0.png`, `ph-recap0.png`) show the route and gold band on the road. The 🎂 street is drawn as a short lane, not a long diagonal.
  - `c2-t45.png`: the car arrow is on the road.
- **Nudge.** In the Helsinki passive run (`p1`), "Tap a parcel to put it in the van." came at 26 s and nothing else followed. `nudge.mjs` shows one soft glow that is removed after 2.6 s (`nudge.png`).
- **`behind.mjs`.**
  - With `behind`, all 40 of 40 seeds put a house within 100 m behind the start in every city. Without it, Helsinki managed 3 of 40 and Montreal 2 of 40. Ubud, Dino and Stunt already have a side street there.
  - Live Montreal: 📚 is 44 m behind the start (42 m back against 689 m round).
  - A fluent Helsinki careful drive (`f1`) turned round for it, got "went the short way every time", and moved up to tier 2.
- **`recap.mjs`.** Results across sizes, with the bottom of the buttons against the viewport height:

  | Size | Buttons end at | Viewport |
  | --- | --- | --- |
  | 375×667 | 607 | 667 |
  | 360×640 | 589 | 640 |
  | 667×375 | 357 | 375 (was 451) |
  | 1194×834 | 812 | 834 |
  | 834×1194 | 1000 | 1194 |

  None of these sizes scrolls horizontally.
- **Checks.** `node --check` passes on `main.js` and `town.js`. `browser.mjs --ids crash-racers --run crash-racers-c2` gives BOOT + PLAY ready with 0 errors.

### Checklist

- **Open checklist items:** none.
- **Map distortion (the blocker): fixed** and probed.
- **Car arrow off the map, and recap route or plan leaving the canvas: fixed** (same cause).
- **Phone results below the fold: fixed** in portrait, and in sideways phones too.
- **Co-op "short way every time" after 0 m trips: fixed** (`routed`).
- **Improvements done:**
  - 1: the bound plus the unit probe.
  - 2: one start sentence, with the plan line given when the van is full.
  - 3: the idle nudge with a one-time glow.
  - 5: the recap fits the screen.
  - 6: honest "short".
  - 7: a house behind the start for a fluent tier 1.
- **Not done: improvement 4** (race gates as route choices, or the matched present riding to a finish house). This is a Race-mode redesign and was left for a later round. A miss still costs only a short puddle.

## 2026-10-11 — Round 7: a calm Easy race, a gate answer that survives a rescue, a floor for the youngest

### Design

- **Easy Race and Bumpers are calm (blocker 1, improvement 1).** `calmRoad()` (Delivery Town or Easy mode) now decides how bumps look and feel.
  - Every car this device drives is `gentle` in Easy mode: a bump is a soft wobble with a little dust. There are no dents, no sparks, no camera shake, and nothing falls off.
  - A friend's crash shown on an Easy device is dust and a soft bump, not a spark burst.
  - Grinding sparks and the scrape sound are gone. A landing gives a soft thump with no shake.
  - Police lights glow steadily in every mode. They used to flash red and blue five times a second.
  - The dead Bumpers score path (`addScore`, the `score` message, `game.scores`) is removed.
- **Bots keep out of the child's view (bug 4).**
  - *Manners.* In Easy mode a bot within 24 m behind or alongside the child holds below the child's speed. A bot just in front speeds up to make room. A child stopped for more than 6 s is passed slowly (9 m/s) along the far edge. While a bot waits it does not count as stuck or as making no headway, so a rescue never drops it next to the child.
  - *Veil.* Any car that is not the child's thins to an even 4×4 dither within 3 to 6.5 m of the camera. It uses the same screen as the see-through trees and is never transparent-sorted.
- **The gate answer lives on the gate (bug 1, improvement 2).** `g.tapped` is set by the tap and cleared when the gate is dressed again. It no longer resets when the shown gate changes. A pass counts across ±40 m (`GATE_PASS`), so a rescue that carries the car past the gate still scores the tapped present.
- **The step up shows at once (improvement 8).** After three right in a row, or two misses, every gate that is not on show is dressed again with the new tier.
- **Kind ending at 5/6 (improvement 4).** The child now hears "You matched five presents. One house wanted something else."
- **The countdown stands alone (bug 2).** "You drive …" shows for 1.5 s, then 3-2-1 starts at 1.8 s. The race banner font is smaller and padded, so long car names fit at 834 px wide.
- **Door banners (bug 3).**
  - The "🏠 house" banner at a door is gone, because the tray already leads with the house's picture.
  - Town banners (the handover 👋, the turned-away 🤔, 🚧, ⛔ and 📦 × n) are now a paper card low on the road, above the pedals, clear of the 3D sign and resident.
- **A floor for the youngest (blocker 2, improvement 3).**
  - After 90 s with nothing handed over in tier 1 (60 s once it has helped), still gold rings show the way: the parcel for the house coming up, then its stop button once that parcel is packed, then that parcel at the door.
  - The help ends at the handover and counts as help, so it never leads to promotion. There is no extra voice line.
- **A thinner start (improvement 5).**
  - Tiers 2 and 3 ask one question, once, when the first pair is packed ("A ball and a bone. Who would like them?").
  - The road-works or one-way line follows 7 s later.
  - In tier 1 the parcel question now uses `sayOnce`, so the same parcel packed twice is not asked about twice. The random run had heard "Bananas. Who would like bananas?" twice.
- **The map matters for a fluent tier 1 (improvement 7).** With a careful streak of 1 or more (`setup.behind`), a side street's stop button shows only the street picture and ↪️, as in tiers 2 and 3.

### Changes

| What | Where |
| --- | --- |
| `calmRoad()` | `public/js/main.js:245` |
| Fluent stop picture (`mapOnly`) | `main.js:488` |
| Floor ring on the stop button | `main.js:495` |
| One pair question; delayed plan line | `main.js:528-548` |
| No door banner | `main.js:592` |
| `FLOOR_SECONDS`, `floorWatch` | `main.js:636-655` |
| Floor ends at the handover | `deliverTo` |
| `tappedFor`, `GATE_PASS`, `watchGates`, `passGate` | `main.js:1210-1275` |
| Immediate step redress | `main.js:1260` |
| 5/6 ending | `main.js:1322` |
| `townRun.fluent` | `main.js:1863` |
| `car.gentle = calmRoad()`; veil for every other car | `main.js:1932`, `main.js:1945` |
| Countdown after the car banner | `main.js:2023` |
| Calm `showHit` and landing; score path removed | `main.js:2145` |
| Waiting bots are not stuck | `main.js:2290`, `main.js:2300` |
| Polite bots wired in | `main.js:2734` |
| `nearCamera` update | `main.js:2937` |
| Grinding sparks only off calm roads | `scrapeAndSkid` |
| `Bot.politeness`, `car.waiting` | `public/js/bot.js:39-47`, `bot.js:114-131`, `bot.js:138` |
| `nearCamera`, `withNearFade`, `Car.veilNearCamera` | `public/js/car.js:59-90`, `car.js:770` |
| Steady police lights | `car.js:290` |
| `g.tapped` | `public/js/gates.js:46` |
| Banner padding and size | `public/style.css:92` |
| Town paper-card banner, `.floor` ring | `style.css:345-351` |
| `howToPlay` text | `game.json` |
| Debug hook (`gates`, `camera`, `respawn` on `__town`) | `main.js`, near the end |

`delivery.js`, the shared helpers and the Blender assets are untouched.

### Evidence

Scripts and screenshots are in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/264c5237-472d-4187-be3f-45d364aa4d2a/scratchpad/polish/crash-racers/r7/`. Speech was stubbed and logged, and every run had 0 page or console errors.

- **`calmrace.mjs`, Easy mode.** The script counts `sparkBurst` calls, the peak camera shake, the player's damage, and the samples where a bot in view is under 7 m from the camera.

  | Run | Gates | Sparks | Shake | Damage | Bot under 7 m |
  | --- | --- | --- | --- | --- | --- |
  | Stunt portrait race (`rp`) | 5/5, harder from gate 4 (`🍎🍐✓H 🎂🕯️✓H`) | 0 | 0 | 0 | 3 of 390 samples (11 before the manners) |
  | Ubud landscape race holding 🚀 (`rl`) | 6/6 | 0 | 0 | 0 | 19 of 389, all veiled (`rl-close.png`) |
  | Montreal Bumpers (`bs`) | 4/4 | 0 | 0 | 0 | — |
  | Helsinki random (`rr`) | 4/6 | — | — | — | — |
  | Phone 375×667 race (`rph`) | — | — | — | — | 0 |

  - In the Helsinki random run, two house questions were asked and the ending was the general "look at the house" line.
  - `rp-count2.png`: the "2" stands alone. `rp-intro.png`: the car banner shows before the countdown, and `bannerOnCount` was false in every run.
- **`rescue.mjs` (bug 1).**
  - (A) Tap the right present, rescue 200 m back so the gate leaves the window, then put the car back 12 m before the gate on the wrong side: scored right.
  - (B) Tap, then a rescue carries the car from 8 m before the gate to 25 m past it, on the wrong side (lateral −3.5): scored right (🦴 ✓).
- **`play.mjs` town drives.**
  - Helsinki tier 1 careful (`c1`): 4/4 in 100 s with 12 lines. `c1-give2.png` shows the paper card "🐻 👋 🍌" low on the road, apart from the sign and the resident.
  - Montreal tier 2 (`m2`): 8/8. The voice said the opening at 1 s, the pair question at 2 s and the road works at 6 s; that run was made with the earlier 4 s delay, now 7 s.
  - Dino tier 3 (`g3`): the voice said the opening at 0 s, the question at 2 s, the side street at 8 s and the one-way line at 9 s.
  - Fluent Ubud tier 1 (`f1`): the street stop shows `🌈↪️`, against `🧸🌈` for the non-fluent `n1`. 4/4, and the tier moved to 2.
  - Phone tier 2 (`ph-give2.png`): the card fits beside the pedals.
- **Floor (`fo`, a child who taps whatever wears the gold ring and otherwise taps at random).**
  - Ubud tier 1: the ring showed at 106 s (`fo-floor.png`, the 🦴 tile ringed as the 🐶 house comes up). First handover at 109 s, second at 229 s: 2 of 4 in 300 s, against 0 of 4 for the plain random tapper.
  - `help` was 6 and the tier stayed at 1.
  - Re-arming after 60 s was added after this run.
- **Checks.**
  - `node --check` passes on every `public/js/*.js`.
  - `browser.mjs --ids crash-racers --run crash-racers-c3` gives BOOT + PLAY ready with 0 errors.

### Checklist

- **Open checklist items:** none.
- **Bugs:**
  - Gate answer lost after a rescue: fixed and probed.
  - Banner over the countdown: fixed.
  - Door banners floating in the scene: fixed.
  - Bot filling the camera and spark shower in Easy: fixed (manners, veil, no sparks).
- **Blockers:**
  - Easy Race and Bumpers are now as calm as Delivery Town: no sparks, dents or shake, polite bots, steady lights. The name and tagline "Crash Racers… Crashes welcome!" belong to the catalogue and are raised as a shared request.
  - The youngest have a floor.
- **Improvements:** 1–8 done.

## 2026-10-11 — Round 4: gates only count real answers

Review 1 scored 8.4, with no open checklist items. This pass fixes its three bugs and makes ranked improvements 1, 2, 3, 5, 6 and 7.

### Design

- **An Easy gate counts only when the child answered it (bug 1, improvement 1).** In Easy mode a gate scores only when the child tapped a present, or when their own ◀ or ▶ took the car into that lane in the last 4 s. The steering helper's drift of a metre or so is no longer read as a choice. A child who only holds 🚀 now gets no ticks, no puddles, no house questions and no closing line. Steering still counts as an answer, so a child who prefers ◀ ▶ to tapping is not ignored.
- **A fair distractor (bug 2, improvement 3).** `gates.js` uses a seeded Fisher–Yates shuffle and remembers the last two houses that lent the wrong present (`recentWrong`), so each gate brings a new distractor.
- **The results teach the match (improvement 2).** Next to each missed gate, the present that house wanted shows small and faint, after a dashed divider. The title and aria-label say "they wanted …".
- **A thinner Easy HUD (bug 3, improvement 5).** Easy cars are never dented, so 🔧 is hidden under `#hud.easy`, along with the 🎥 camera switch. 📯 stays as a harmless toy.
- **Leaving a struggling drive (improvement 6).** A tier 2 or 3 drive left unfinished after two or more wrong offers now steps the tier down, as two or more helps already did. The careful streak is reset.
- **No petals (improvement 7).** The 12 paper petals on every result are gone (`softFinish`, `.party` CSS, `RAINBOW`). The recap map, ribbons and gate chips stand alone.
- **Not done: improvement 4 (a route fork in Race, or presents riding to a finish house).** It needs new track topology or a new finish ritual in every city, which is too much for a final round. With Easy gates now honest, each of the 3 gates per lap is a real decision. Recorded as the next depth step.

### Changes

| What | Where |
| --- | --- |
| `steeredAt` and `steeredSide` on the gate run; `STEERED_SECONDS` | `public/js/main.js:1210-1212` |
| Easy untapped and unsteered gate gives no answer; `want` recorded | `main.js:1253-1261` |
| Child's own steering remembered | `main.js:2599-2604` (`humanController`) |
| Recap shows the wanted present | `main.js:1315-1318` |
| Tier steps down on leaving with 2+ wrong offers | `main.js:1857-1863` |
| Petals removed | `main.js` (`renderResults`, `clearTimers`), `style.css` |
| Fisher–Yates `shuffled()`, `recentWrong` | `public/js/gates.js:31-53`, reset in `configure` |
| `#hud.easy #fix-btn`, camera hidden | `style.css:292-293` |
| `.gate-recap .gate u` | `style.css:413` |
| `howToPlay` text | `game.json` |

### Evidence

Scripts, logs and screenshots are in `scratchpad/polish/crash-racers/r8/`. Speech was stubbed, and every run had 0 page or console errors.

- **`none`: Montreal Easy Race, no taps, portrait.** 0 gates scored, no puddles, no house questions and no closing line. The only line spoken was the gate intro.
- **`st`: Montreal, landscape, steering with ◀ ▶ only.** 2 gates scored, both right (🌸🌷✓ 🍎🍌✓). Steered answers still count.
- **`rr` and `rr2`: Helsinki random tapper.**
  - Distractors in `rr2` were 🌷 🎈 🪁 🦴 🍌 🌷, with none repeated within 2 gates.
  - `rr2-results.png` shows the missed chips with the wanted present, faint (🧸🎈 ┆ 🪁, 🐶🪁 ┆ 🦴).
  - The voice asked 2 house questions and gave one closing line.
- **`bl`: Montreal Bumpers, careful tapper, landscape.** 4/4, with the harder tier from gate 4 (📚📕✓H). `bl-gate1.png` shows the HUD without 🔧 or 🎥. Sparks, shake and damage were all 0, and `.party` was absent.
- **`sim.mjs`.** 24 dressings of the new shuffle: no distractor repeats within 2 gates.
- **`leave.mjs`.** Tier 2 town with 2 wrong offers, then left for a race: the stored tier went 2 → 1.
- **Checks.**
  - `node --check` passes on `main.js` and `gates.js`.
  - `browser.mjs --ids crash-racers --run crash-racers-c4` gives BOOT + PLAY ready with 0 errors.

### Checklist

- **Open items:** none.
- **Bugs 1–3:** fixed and probed.
- **Improvements:**
  - 1, 2, 3, 5, 6 and 7: done.
  - 4: deferred, with the reason above.

## 2026-10-11 — Round 5: one town for friends, a still camera, gates on the map

Review 1 scored 8.3. This pass fixes its six bugs and makes ranked improvements 1, 2, 3, 4, 6 and 7. For the Race and Bumpers blocker, it gives the gates a map step.

### Bugs and fixes

| Bug | Fix | Where |
| --- | --- | --- |
| Co-op layout desync (about 1 in 11 starts) | The host's `go` now carries its finished town (`town.layout`: the kinds, distances, sides and streets, the road works, the one-way street and the tray). A friend's device builds that town as it is, so it no longer relies on its own `configureTown` search. If `go` arrives while the friend is still loading, the layout waits on `pendingSetup`. The layout is validated (`validLayout`). Also, `configureTown`'s fallback now keeps `behind`. | `public/js/town.js:251` (`validLayout`), `town.js:346` (`layout` getter), `town.js:355-478` (`configure({ layout })`); `public/js/main.js:1722-1724`, `main.js:1889`, `main.js:1950-1962` (`useHostTown`), `main.js:1098` |
| Camera inside the scenery after a rescue, with the car out of view | `respawn` sets `game.snapCamera`, so the next frame puts the chase camera straight behind the car. The ghost car no longer blinks at 8 Hz. That blink was why the car was missing from the screenshots, and it was also a flash. | `main.js:2299`, `main.js:2951`, `main.js:2369` (`ghostTick`), `setGhost` |
| Big yellow "Back on the road!" banner over the gate buttons in Race | `rescued()` shows the small top `note` in Race and Bumpers and the paper card in town. It does not show again within 8 s, so three quick rescues give one word. | `main.js:2303-2311` |
| Roof parcels hide the house sign and the resident (tiers 2 and 3) | The roof parcels are smaller (0.55), with small low pictures, and sit at the back of the roof. | `town.js:303` (`dressRoof`) |
| "Tap your parcel to hand it over." cut off by the thanks | The hint waits 1.8 s, and plays only if the child is still at that door and has handed nothing over. | `main.js:594-601` |
| Selected city card overlaps its neighbour in the portrait menu | The `scale(1.06)` is removed from `.city.selected`. The ring and the border still show the choice. | `public/style.css:43` |

### Improvements

- **Softer engine (2).** The engine is now triangle and sine through a lower lowpass. On calm roads (town and Easy) it is a quiet purr with no gear-change saw. `public/js/audio.js:60-95`, called with `calmRoad()` at `main.js:3189`.
- **Gates on the map (5, the blocker).** The gates now have a third adaptive step.
  - The steps run: easy presents → harder presents after 3 right → **map gates** after 6 right. Town tier 3 starts on map gates.
  - On a map gate the gantry and the gate buttons show 🗺️ in place of the house. Each gate's house is a pin on a larger, squarer minimap, set just outside the road. The child's dot now has a nose.
  - The child has to find which pin is the next one ahead, then pick that house's present: map reading inside every gate, for 6–8.
  - Two misses step back to houses on the gantry.
  - The voice says once: "Whose gate is this? Find it on the map, then choose their present." A clean run ends with "You found every house on the map and matched its present!"
  - Code: `public/js/gates.js:15-18`, `gates.js:36`, `gates.js:66-69`, `gates.js:95`, `gates.js:132-137`; `main.js:1247`, `main.js:1270-1281`, `main.js:1299-1311`, `main.js:1342`, `main.js:1895`, `main.js:3089-3105` (pins), `main.js:3140` (nose); `style.css:341`; `howToPlay` in `game.json`.
- **Not done: a real route fork in Race.** It needs new track topology. Map gates give Race and Bumpers map use without one.

### Evidence

Everything is in `scratchpad/polish3/crash-racers/`. Speech was stubbed, and every run had 0 errors.

- **`coop3.mjs`, two devices.**
  - Montreal tier 2: the natural start gave the same layout on both devices. Then the friend's town was forced to a different seed (`🌸 📚 🧸 🍎`). The host's `go` restored the same houses and tray: `🍎🌙 🧸 🎂🌈 📚 | 🪁📕🍌📖🎈🪀🍐🕯️` on both.
  - Helsinki tier 3: the same result. A malformed layout was ignored.
  - `coopdiag.log`: 8 natural Montreal tier 2 starts all matched.
- **`race.mjs`, Race and Bumpers.**
  - `mp`: Stunt, tier 3, portrait. 6/6 `HM`. `mp-gate1.png` shows 🗺️ on the gantry and the buttons, with pins on the map. Only two lines were spoken.
  - `hp`: Helsinki, portrait. `hp-rescue0.png` shows the small top note and the car in view behind the gate buttons. The pins sit beside the road.
  - `ml`: Ubud tier 1, landscape. 6/6, harder from gate 4, and the camera was snapped after the rescue (`ml-rescue0.png`).
  - `mb`: Montreal Bumpers, landscape. 4/4 `HM`.
  - `sp`: Stunt. `sp-gate1.png` shows the square map with the next pin (🧸) ahead of the nose.
- **`play.mjs`, town drives.**
  - `d3`: Dino tier 3, landscape. `d3-stop.png` and `d3-glide.png`: the 📚 sign and the 🦉 resident are clear above the small roof parcels. 8/8.
  - `h1`: Helsinki tier 1, careful, portrait. 4/4. The door hint never cut into a thanks.
  - `u1`: Ubud tier 1, landscape, a child who waits 2.6 s at each door. The hint plays once, then the thanks follows.
- **`menu.mjs`.** At 834×1194 the Ubud card no longer overlaps Helsinki. There is no horizontal scroll at any of the three sizes.
- **Checks.** `node --check` passes on `main.js`, `town.js`, `gates.js` and `audio.js`. `browser.mjs --ids crash-racers --run crash-racers-f1` gives BOOT + PLAY ready with 0 errors.

## 2026-10-11 — Polish round 2 (two reviews at 8.4): three-lane gates, a gate step that carries over, map gates that need the map

Both reviewers scored 8.4. Their shared blocker was that Race and Bumpers stayed a two-way match: a child who only races never reached the map step, and most map gates could be answered without reading the map. This pass fixes every listed bug and makes the gates a deeper, adaptive decision.

### Bugs and fixes

| Bug | Fix | Where |
| --- | --- | --- |
| Map step earned on the last gate and never shown; "Race again" reset the gates to the town tier | The gate step (0 easy, 1 harder, 2 map) is saved in `crash-racers-gate-step` whenever it changes, and the next race starts from it (a new child starts from the town tier). The map step now comes after 5 right in a row, not 6. The run of right answers also carries into the next race, so even 1-lap races lead on. | `public/js/main.js:1226-1235` (`GATE_MAP_STEP`, `gateStep`), `main.js:1300-1309`, `main.js:1930-1931` |
| A race that earned a step on its last gate never said so | The ending adds "Next race, the houses hide on the map!" or "Next race, the gates have three presents!" A race with only some map gates says "…and found the houses on the map too!" instead of claiming every house. A child who mostly misses map gates hears "Next time, find the next pin on the map first: whose gate is it?" | `main.js:1366-1381` (`gateEnding`) |
| Ranked standings: a yellow bar for the child's car at the top, and 🏁 against 🏎️ | The cars are now one row of small chips in line-up order. The child's own car has a soft white ring, not a yellow bar, and no finish flags are shown (only 👋 for a friend who left). The gate recap still leads. | `main.js:2590-2600`; `public/style.css:493-497` |
| Translucent race minimap, so scenery shows through | Every race map is an opaque cream card with a shadow, like town. The road is stroked straight onto the map each frame instead of through a cached offscreen canvas. Once, under heavy load, that cached copy came back blank on a phone-landscape run; it was not seen again. | `style.css:491`; `main.js:3101-3120` |
| Landscape: the Easy gate buttons covered the car's tail and the splash | When held sideways, the gate row sits at the top, under the gantry. | `style.css:486-489` |
| Road-plan line (tiers 2 and 3) cut off by the thanks, and never repeated | Key lines go through `sayKey`, which says them once and protects them for as long as they take to say. While a key line is playing, feedback (a thanks, a door's question) uses `sayFeedback`, which waits its turn instead of hushing it. | `main.js:209-220`, `main.js:559-560`, `main.js:595`, `main.js:968` |
| "Is this the house? Tap it to stop." cut off by a thanks | It uses the same `sayKey`. | `main.js:725` |
| Map gates answerable without the map (only about 33% had a distractor on a pin) | On the map step, a gate's wrong presents are taken from the houses of the other two gates. All three presents then belong to the three pins, and only the child who works out which pin comes next can answer. A gate already dressed is checked again (`freshen`) when another gate takes a new house and when it comes into view. | `public/js/gates.js:67-77`, `gates.js:106-110`, `gates.js:160-163`, `gates.js` `redress`; `main.js:1267` |
| Rival dots drawn over the house pins | The pins are drawn after the other cars and before the child's own dot (`drawGatePins`). | `main.js:3141`, `main.js:3182` |
| Found in play: "Race again" did nothing while the robots were still finishing (solo, the first 20 s of the results) | Playing alone, Race again starts the next race at once. The "Everyone else is finishing…" line is hidden whenever the child can restart. | `main.js:1829-1831`, `main.js:2608` |

### Depth (both reviewers' blocker)

- **Three lanes on the harder step.** After 3 right in a row, the gate has three presents: the left, middle and right lanes, using each house's harder present. A random tapper then gets about 33% and stays on the easy step, while a careful child moves on.
  - On the map step, those three presents are exactly the three pins, so it is sequencing on the map.
  - Easy mode shows a ▲ middle button, with the house picture above it, as on the gantry.
  - When steering, the middle third of the road is the middle lane. An Easy-mode child has to tap the middle present, because the steering helper never chooses it by chance.
  - Code: `gates.js:67-101`; `main.js:1277-1288` (lane), `main.js:1325-1345` (`renderGatePick`), `main.js:2835-2839` (steering helper); `index.html:72`; `style.css:483-485`.
- The voice line on the map step now says "Find the next pin on the map". `howToPlay` in `game.json` describes the three steps and the carry-over.
- **Not done:** review 2's improvement 6, an auto-pack scaffold for a random tapper in town. Town already has the help ring and voice hints, and auto-packing would hand over the core decision. It is left for the owner to decide.

### Evidence

Everything is in `scratchpad/polish3/crash-racers/r6/`. Speech was stubbed, and every run had 0 page or console errors.

- **`race.mjs`, the gates.** It plays N races in a row, and the stub logs cancels.
  - `cp`: Montreal, portrait, careful, 3 races.
    - Race 1: easy → H from gate 4 → HM at gate 6, with stored step 2.
    - Races 2 and 3 started `HM3 HM3 HM3` and went 6/6.
    - All 13 map gates had every present on a pin.
  - `one1`: Montreal, 1 lap, careful. 3/3 easy, then "You matched every present at the gates! Next race, the gates have three presents!" Race 2 started `H3 H3 H3`.
  - `lb`: Stunt Bumpers, landscape, step 2. 8/8 map gates had all presents on pins. `lb-r1-gate1.png` shows the gate row at the top, clear of the car, three presents (🕯️ 🪀 🎾) for the pins 🎂 🧸 🐶 on an opaque cream map, with the nose pointing at 🎂.
  - `lr`: Helsinki, landscape, random, 2 races. Mostly easy at 50%, and the stored step stayed low. `lr-r1-gate2.png` shows the two-lane row at the top.
  - `fb`: Helsinki Bumpers, landscape, random, from step 2. 0/2 on map gates stepped back to houses on the gantry, then "Next time, find the next pin on the map first…". `fb-r1-results.png` shows the gate chips first, then a calm row of car chips.
  - `ph2` and `pp`: phone landscape 844×390 and phone portrait 375×667. The three-lane row fits, and `ph-maps.png` shows the map outline and the pins.
  - `fp`: the final portrait run, 2 races, 0 errors. Race again starts at once (`after tap countdown` while `raceOn` was still true).
- **`play.mjs`, town.** The stub was changed so speech takes real time (80 ms a letter) and a cut line is logged as `CUT`.
  - `m3`: Montreal tier 3. "Is this the house?" at 13 s, then the one-way line at 15 s, then the thanks at 21 s.
  - `u2`: Ubud tier 2. The closed-road line at 16 s, then the thanks at 22 s.
  - There were no `CUT` lines in either run. Both delivered 8/8.
- **Checks.** `node --check` passes on `main.js` and `gates.js`. `browser.mjs --ids crash-racers --run crash-racers-f2` gives BOOT + PLAY ready with 0 errors.

## 2026-10-12 — Real race first

### The owner's direction

The owner's son did not enjoy the game. To him it "seemed like a solo driving game instead of competition with the AI driven cars". The calm passes had taken the contest out:

- the menu opened on 📦 Deliver (no bots);
- Race showed no place while driving and no winner or finishing order at the end, only gate chips;
- in Easy mode the bots kept "a polite distance" and in practice never passed the child.

The owner chose **"Real race first"**:

1. Race is the default mode and the first button. Deliver and Bumpers stay.
2. The robot cars really race. The child's place shows during the race. The finish has a winner and a podium in finishing order, with one gentle celebration.
3. A careful 4–7 year old can win some races and lose others closely. Easy bots race without hanging back, with a gentle rubber band. Normal-mode bots are faster.
4. Learning helps you win. The right present at a gate gives a short, visible speed boost. A wrong present gives no boost and no penalty.
5. Turbo and bumping stay as they were (bumps soft in Easy). The multiplayer protocol is unchanged.

### Changes

| What | Where |
| --- | --- |
| **Race is the default.** `game.mode` starts as `'race'`. 🏁 Race is the first mode button and is selected on load. The code never stored a mode choice, so none is remembered. | `public/js/main.js:158`, `public/index.html:33` |
| **Place pill.** "2nd of 4" sits beside the lap pill, with every car's portrait in race order and the child's own car ringed. It is hidden in Deliver and Bumpers. A new order shows only after it has held for 0.9 s (`PLACE_SETTLE`), so cars side by side never make it flicker. There is no animation. | `index.html:65`; `main.js:3177-3214` (`renderPlace`); `style.css:498-506` |
| **Finish and podium.** The banner names the place ("🏁 🏆 1st", "🏁 2nd"). The results title is "🏆 You won!" or "🏁 You came 2nd!". The podium is a column in finishing order: 🥇🥈🥉/4th, car portrait, emoji and name, then 🏆, 🏁 or 🏎️ (still racing). The winner's row is larger with a soft gold wash, and the child's row has a white ring. Rows arrive once (0.25 s apart, not on re-render, none under reduced motion). The gate recap still leads above it, and Bumpers keeps the line-up chips. Recovered from the pre-calm podium (`git show 7447313:…/main.js`, `renderResults`/`standings`, ~1226-1300), without times, awards or confetti spam. | `main.js:44-45` (`ORDINAL`, `MEDAL`), `main.js:2546`, `main.js:2610-2650`; `style.css:507-520` |
| **One celebration.** A soft chord (the existing `cheer`) when the child crosses the line, and once on the results a dozen slow paper petals (5–7 s, gold for a win). There are none under reduced motion. The voice says one line: "You won the race!", "Second place! So close." or "You came third. Well raced!". A child who missed most gates hears "…Right presents at the gates give you a speed boost!". The existing gate line follows. | `main.js:2667` (`celebrate`); `style.css:521-523` |
| **Easy bots really race.** Each bot gets a calm pace (`EASY_BOT_PACE` 20.8 / 20.2 / 19.6 m/s, assigned per race from the seed). The child cruises at 19 m/s and holding 🚀 is capped at 20. Bots slow for bends (`pace − bend·60`). The old manners (hold below the child's speed within 24 m, speed up just in front, wait 6 s behind a stopped child) are gone. Only a child who has **stopped** is passed slowly (9 m/s) along the far edge, and `dodge()` steers round cars alongside. The veil (bots thinning near the camera) stays. Normal-mode bots keep the old faster skill speeds and rubber band. | `main.js:41`, `main.js:2033`; `bot.js:75-90` (pace), `bot.js:138` (`politeness`) |
| **Gentle rubber band (Easy).** Small gaps are left to the driving and the gates. A bot more than 30 m ahead of the last child eases off by up to 12%. A bot more than 40 m behind is at most 5% quicker, so a lead earned at the gates is kept. | `bot.js:4`, `bot.js:83-86` |
| **The right present is a speed gift.** For 4 s (`GIFT_SECONDS`) the car may go up to 7 m/s over its usual top speed, gathering pace at 5 m/s². This is about 1 s gained per right gate. The gift is scaled down into bends (`giftExtra`), so it never throws the car off the road. A soft trail of puffs in the house's colour follows the car, with a whoosh and "👋 🎁 💨" on the banner. Afterwards the speed eases back (no braking). Racing only, not Bumpers. **A wrong present no longer slows the car:** the puddle slowdown and splash are gone, and only the 🤔 banner and the house's question remain. The gate voice line now ends "…for a speed boost." | `main.js:1226-1236`, `main.js:1282`, `main.js:1320-1340`, `main.js:2762-2835` (`govern`, `giftExtra`, `giftPush`, gradual `holdEasyCap`), `main.js:2915`, `main.js:2969`; `gates.js:10-14` (doc) |
| **Easy steering only takes the tapped lane over the last 50 m before a gate** (`GATE_LANE_AHEAD`). In sims, holding the lane all the way from 120 m out cost a careful child 10–20 s in Ubud: it hugged the kerb into bends. The tap is still the answer wherever the car ends up. | `main.js:2975`, `steeringHelper` |
| **Jumps are cleared in Easy.** At the calm cruise (16–19 m/s at take-off) the child's car and the bots dropped into the jump gaps and sat stuck among the props for 1–6 s, sometimes several times a race. Lined up with a ramp, the run-up and flight now go at `JUMP_SPEED` 24 m/s (`runUp`), for the child and for the bots. | `main.js:39`, `main.js:2776`; `bot.js:80` |
| **Bots stall less.** In Easy they look closer ahead (8 + 0.6·v, like the child's helper) instead of cutting corners into the kerb. They keep 2 m from the edge and drive past a ramp they missed instead of turning into its side. They back out firmly after 1 s stuck, and are put back on the road after 3 s stuck or 5 s without headway (was 3.5 s and 8 s). The `car.waiting` exemption is removed. | `bot.js:40-60`, `bot.js:126`, `bot.js:150-160`; `main.js:2376`, `main.js:2397` |
| **Text.** `howToPlay` describes the race first, then Deliver and Bumpers. The tagline is "Race the robot cars… The right present gives you a boost!". | `game.json` |

**Multiplayer.** There are no new message types and no new `setup` fields. The place pill and podium use the existing `standings()`, which runs on progress for every car (remote ones included) and on the finish times from `done` messages. Bots are driven by the host as before; their Easy pace follows the host's Easy switch. This could not be tested across two devices locally, because rooms need the store's iframe bridge.

### Evidence

Scripts and screenshots are in `scratchpad/cr-race/` (`sim.mjs`, `solo2.mjs`, `play.mjs`, `playphone.mjs`, `shots/`). Speech was stubbed and logged, and every run had 0 page or console errors.

- **Sims, Easy, 2 laps, five cities × 3 races** (`sim.mjs`, final tuning). The sim child is a flawless auto-cruiser, better than a real child.
  - Careful (every gate right): places `1 1 1 1 2 1 4 1 4 3 3 4 2 1 1`. That is 8 wins of 15, average 2.0.
  - No answers: `1 2 2 1 2 3 4 1 1 2 4 4 2 2 1`. That is 5 wins of 15, average 2.13.
  - Most losses were by 0.3–2 s. Stunt Park is the hardest city: a careful child came 3rd–4th there.
  - Before the pass (HEAD), the Easy child won every race by 10–20 s while the bots trailed 100–300 m behind.
  - Two dead ends along the way:
    - A gift with no regard for bends (27 m/s into corners) made careful children *lose*.
    - Lane-holding from 120 m out cost 10–20 s.
- **Solo time with the bots parked** (`solo2.mjs`), careful against the same taps with the gift removed: Dino 114.9 / 125.1 s, Helsinki 101.3 / 104.8 s, Montreal 87.4 / 90.5 s, Stunt 110.9 / 125.4 s, Ubud 98.4 / 106.5 s (measured before the jump run-up). The gift is worth 3–14 s a race.
- **Real-time play** (`play.mjs`, real taps on the gate buttons):

  | Run | Gates | Result | Notes |
  | --- | --- | --- | --- |
  | Ubud, portrait 834×1194, careful, 2 laps | 6/6 | 🏆 1st by 10 s | |
  | Dino, portrait, careful, race 1 | ✓✓✓ | 2nd by 0.5 s | 1st→2nd at 6 s |
  | Dino, portrait, careful, race 2 | ✓✓✓ | 🏆 1st | 2nd→1st at 16 s |
  | Helsinki, landscape 1194×834, careless, race 1 | ✗✗✗ | 3rd by 0.9 s | places 1→2→3→2→3 |
  | Helsinki, landscape, careless, race 2 | ✗✗✓ | 3rd by 1.8 s | |
  | Montreal, phone 375×667, careful | | 🏆 1st | |
  | Stunt Park, phone landscape 844×390, careless | | 2nd | |

  - Earlier careful runs, before the final tuning, came 2nd (by 0.4 s), 3rd and 2nd.
  - Screenshots:
    - `cp-menu.png`: Race first and selected.
    - `cp-r1-gift.png`: the pill "1st of 4" with four portraits, the pink trail and "🐰 👋 🌷 💨".
    - `cl-r1-gate.png`: the landscape pill beside the three-lane row.
    - `cd-r2-results.png`: "🏆 You won!", gold petals, podium.
    - `cl-r2-podium.png`: "You came 3rd!", gate recap above, podium.
    - `ph-r1-gate.png`, `pl-r1-podium.png`: phone sizes fit.
- **Tests.**
  - `browser.mjs --ids crash-racers --run cr-race`: BOOT + PLAY ready, 0 errors.
  - `original-quality.mjs`: every check passes, including the crash-racers mission choice (it still taps `[data-mode="race"]`, now already selected) and the four ordered delivery markers.

### Left open

- `public/bitgames.json` (the file checksums) is regenerated by the coordinator's build.
- Two-device standings are untested live (see Multiplayer).
- Normal-mode (Easy off) balance was not re-tuned. Bots keep their old speeds there, and the child has turbo and full gas.

## 2026-10-12 — Deliver removed, and the review's race fixes

### The owner's direction

The owner removed 📦 Deliver (Delivery Town) completely: it was a solo drive, and he found it pointless. Crash Racers is now 🏁 Race (the default) and 🎪 Bumpers. The present gates are the game's learning. This replaces the "Deliver and Bumpers stay" part of the section above, and the Phase 2 and town rounds earlier in this file are history.

An independent review of the first race pass scored it 7.5. Its findings were:

- Easy races broke up: bots stalled 3–16 s at ramps and ended 100–380 m behind.
- The child got caught in ramp pile-ups.
- The boost only closed gaps and never passed a car.
- Careful and careless play won equally often (2 of 4 each).
- In Bumpers the voice promised a speed boost.
- The rescue note covered the lap pill.
- With Easy off, bots stalled for 20–34 s.

### Removing Delivery Town

| What | Where |
| --- | --- |
| The menu has only 🏁 Race and 🎪 Bumpers. Gone: the 📦 button, the town tiers, the parcel tray, the stop button, ↩️ Turn round and the route recap. | `public/index.html:33-34` |
| `town.js` (837 lines) is deleted. The gate houses (`KINDS`, `pictureTexture`) moved to `houses.js` without the town thank-you lines. Nothing else used `town.js`. | `public/js/houses.js`, `gates.js:2` |
| `main.js` loses every town path, about 1,000 lines. Gone: the Delivery Town block, its share-a-tray messages (`pack`, `given`, the `go` layout), the town branches in setup, the HUD, the controls, the results and the minimap, the U-turn, and `travelDir` (racing always goes forwards). What stays: `stored`/`store` for the gate step, `loopMod`, and `calmRoad = input.easyGas`. The debug hook is now `window.__race`. | `main.js:238-256`, `main.js:2404` |
| `track.js` loses the town's side streets: `SPUR`, `Track.plan`, the plan, carve and build functions, and the `planned` boost-pad escape (about 230 lines). | `track.js` |
| Town CSS removed (about 190 lines). No Blender asset was town-only, because the town was all runtime geometry. | `style.css` |
| **Gate steps start sensibly without the town tier.** A new child starts on the easy step (two presents). Three right in a row bring three lanes, and two more bring the map step, as before. The step is still kept per device. | `main.js:278` |
| **The Race delivery mission stays** ("Follow the delivery map 1 → 2 → 3 → 4", `delivery.js`). It is a Race map-reading mission, independent of Delivery Town. `original-quality.mjs` and `package-originals.mjs` need no change. | — |
| `game.json`: the tagline, `howToPlay` and `learning` now describe Race (place pill, gates and boost, podium, the mission chip, Easy) and Bumpers only. | `game.json` |

### Review fixes

| Finding | Fix | Where |
| --- | --- | --- |
| Ramp pile-ups (Easy and Easy off) | Racing, every car passes through the others within 40 m of a ramp or jump, using the existing respawn ghost; it ends once the car is clear. | `main.js:1348` (`rampGhost`), called from `tick` |
| Bots stalled | Bots are put back on the road after 2 s stuck or 3.5 s without headway. In Easy the child is put back after 3 s or 6 s. All racing bots look closer in (8 + 0.6·v), so they follow bends instead of cutting into the kerb; this fixed Easy off too. Easy bots corner like the child (`pace − bend·42`). | `main.js:1309-1310`; `bot.js:60`, `bot.js:78` |
| The child clipped jump and kicker edges | `rampLane`: within 90 m of a ramp the Easy helper lines up near the jump's middle (±0.6 m), with a sideways pull. A small kicker with room beside it is passed beside it. This comes before the gate lean. | `main.js:1874`, `steeringHelper` `main.js:1919` |
| The gate lane put the car on the kerb | The tapped gate is now a gentle lean (≤1.2 m) over the last 35 m, with the normal look-ahead. The tap is the answer wherever the car is. | `main.js:1914-1935` |
| The boost and jumps | A jump run-up is always 24 m/s, never boosted. The gift pushes only up to the road's usual speed (slower into bends) plus the gift. | `main.js:1674`, `main.js:1707` (`giftTop`), `giftPush` |
| Keep the pack | A bot more than 40 m behind the last child gains up to 12% (by 135 m back). | `bot.js:86` |
| Let the boost overtake | During a gift, a car within 12 m ahead in the same line is passed: the helper aims 2.5 m to its open side (`passLane`). The gift is now +8 m/s for 4.5 s. | `main.js:1895`, `main.js:265-266` |
| Bumpers voice | "…for a speed boost" is said only in Race. | `main.js:315` |
| Rescue note over the lap pill | "🔄 Back on the road!" now uses the banner slot. The small mystery-box note sits below the pills when upright and right of centre when sideways. | `main.js:1298`; `style.css:374-376` |
| No icon for a car that didn't finish | Every unfinished car shows 🏎️. | `main.js:1544` |

### Evidence

Scripts and screenshots are in `scratchpad/cr-race/`. Speech was stubbed, and every run had 0 page or console errors.

- **Sims, Easy, 2 laps, five cities × 3** (`sim.mjs`). The child is a flawless auto-cruiser. "Careless" picks the right present 40% of the time.

  | Play | Places | Wins of 15 | Average place |
  | --- | --- | --- | --- |
  | Careful | 1 1 1 1 2 3 1 1 1 2 1 1 1 4 1 | 11 | 1.47 |
  | Careless | 1 2 1 3 2 2 4 2 1 1 2 1 3 2 4 | 5 | 2.07 |

  - At least 3 of the 4 cars were within 190 m (about 10 s) of each other in 99–100% of samples.
  - Bots spent 1–13 s a race under 2 m/s, against 15–30 s before.
  - The child's place changed 0–9 times a race.
  - In every loss, the car ahead won by 0.2–8 s.
- **Easy off** (the child's car on the bot autopilot, 2 races per city):
  - Before the fixes, bots stalled 15–46 s, and 1–3 bots did not finish in Helsinki, Montreal, Ubud and Dino.
  - After the fixes, every bot finished in every city. Stalls were 1–16 s, and the pack was 97–100% in all but one Ubud race (53%).
- **Real-time play, 2 laps**, tapping the gate buttons:
  - Careful, portrait 834×1194:
    - Dino: 🏆, by 5 s.
    - Stunt: 🏆.
    - Ubud: 🏆.
    - Helsinki: 2nd by 0.6 s.
    - Montreal (landscape): 2nd by 0.3 s.
  - Careless, landscape 1194×834:
    - Dino: 3rd.
    - Helsinki: 2nd by 1.1 s.
    - Ubud: 2nd by 0.6 s.
    - Stunt: 🏆.
  - 1-lap races, which have only 3 gates, are closer to a coin toss.
- **Screenshots:**
  - `rc-dino-menu.png`: only Race and Bumpers.
  - `rl-ubud-r1-podium.png`: the landscape podium.
  - `rc-helsinki-r1-gift.png`: the pill reading "3rd of 4" and the gift trail.
  - `bp-race-note.png`, `bl-race-note.png`: the note clear of the pills.
- **Bumpers** (`bump.mjs`): the gate line was "A gate! Who lives there? Tap the present they would like." with no boost, and the place pill was hidden.
- **Tests:**
  - `browser.mjs --ids crash-racers --run cr-race2`: BOOT + PLAY ready, 0 errors.
  - `original-quality.mjs`: every check passes, including the crash-racers mission and the four ordered deliveries.

### Left open

- A gate's present sprite can briefly fill the camera as the car drives under it (`rc-helsinki-r1-gift.png`). This is from before this pass.
- Two-device play is untested, because rooms need the store bridge. Removing the town took away only the town's own messages.
- `public/bitgames.json` is stale.

## 2026-10-12 — Second review (7.5): sprites, a race the gates decide, no solo mission

A second independent review (15 races) scored 7.5. The race works: there are overtakes, the place pill is clear, the podiums are right and Bumpers has not regressed. The review asked for these fixes.

### Changes

| Finding | Fix | Where |
| --- | --- | --- |
| Present and house sprites filled up to a third of the screen at a gantry | Every gate sprite fades from 16 m to 8 m from the camera and is gone closer in. | `public/js/gates.js:35`, `gates.js:154` (`update`); called each frame at `main.js:2270` |
| Easy off: the choice was hard to read at 30 m/s | A coloured strip, 30 m long, runs on the road into each lane (blue / yellow / pink). The lane's present is painted at the start of its strip. Only shown with Easy off. | `gates.js:25`, `gates.js:164` (`setStrips`), dressed in `dressPresents`; `main.js:878` |
| Ignoring the gates did as well as matching them (the rubber band pulled a trailing child back up) | A bot ahead now eases off only once it is 80 m clear, by up to 8% (it was 30 m and 12%). A child who skips the gates trails. Close races are decided by the gifts. | `bot.js:4`, `bot.js:96-102` |
| A careful race was decided at the first gate | Bots are a little faster: `EASY_BOT_PACE` is 21.5 / 20.9 / 20.3 m/s, against the child's 19 cruise and 20 holding 🚀. A bot 25–60 m behind pushes 5% harder. Closer than that, its own pace does the chasing, so a lead must be kept with gifts at later gates. | `main.js:35`; `bot.js:101` |
| **Root cause of most of the randomness:** cars "ghosted" through each other (ramp zones, rescues) still stood on each other, because cannon's wheel rays hit every body. The child flew off a bot's roof and stalled for 4–8 s, which decided many races. | Wheel rays are now cast as a car: a ghost's wheels ignore other cars, and nobody's wheels land on a ghost. | `car.js:339` (`ghostWheels`) |
| Cars pinned together (a bot shoving the child into a wall) | A bot pressed against another car for 0.7 s passes through it until clear. | `main.js:1310` (`unpin`) |
| Kickers (small ramps) threw cars into walls | Neither the child nor the bots take a small kicker at jump speed. Bots now drive round kickers on the side with more road, with a sideways pull, as the child does. Easy-off bots take real jumps at 28 m/s (was 40, which overshot the landing). | `main.js:1666`; `bot.js:48-56`, `bot.js:74`, `bot.js:107` |
| Bots couldn't pass a slower car on narrow roads (Ubud), so a child who skipped the gates "won" by blocking | Bots may move out to 1.3 m from the kerb to pass (was 2 m). | `bot.js:145` |
| Delivery mission (owner: no solo-style goals) | Removed completely: the "🏎️ Free driving / 🎁 Follow the delivery map" chip, the HUD stop chip, the numbered map stops, the voice lines, the imports, `adventure.css` and the `.delivery-steps`/`#adventure-goal` CSS. `public/js/adventure.js`, `public/js/delivery.js` and `public/adventure.css` are deleted. The page references none of them, and `game.json` no longer mentions the mission. | `main.js`, `index.html`, `style.css`, `ipad.css` |

### Measured

The scripts are in `scratchpad/cr-race/` (`sim.mjs`, `agg.py`, `play.mjs`, `playnormal.mjs`).

- **Easy sims, 2 laps, five cities × 4 per policy** (final code). The child is a flawless auto-cruiser.

  | Policy | Wins | Average place | Median loss |
  | --- | --- | --- | --- |
  | Careful | 11/20 (55%) | 1.8 | 1.5 s (6 of 9 losses within 3 s) |
  | Careless (40% right) | 4/20 (20%) | 2.1 | 2.5 s (11 of 16 within 3 s) |
  | Tapping nothing | 3/20 (15%) | 2.3 | 4.2 s |

  - At least 3 of 4 cars were within about 10 s (190 m) in 100% of samples.
  - The child's place changed about 4 times a race.
  - Bot time under 2 m/s averaged under 3 s a race, at most 7 s.
- **Easy off** (the child is the bot autopilot), 15 sims:
  - Every bot finished.
  - Montreal stalls were at most 7 s per bot, against about 25 s in the review.
  - Ubud is the worst city, still up to 20 s for one bot in one race (many short rescues on its narrow terraced road).
  - Pack: 97%.
- **Real-time play, 2 laps, tapping the gate buttons:**

  | Run | Results |
  | --- | --- |
  | Careful, portrait 834×1194 | Ubud 🏆; Stunt 🏆; Dino 2nd by 0.5 s; Montreal 4th by 3.4 s; Helsinki 3rd by 3.9 s |
  | Tapping nothing, landscape 1194×834 | Dino 2nd (4.2 s); Montreal 2nd (2.9 s); Stunt 3rd (1.0 s); Ubud 3rd (5.5 s) |
  | Careless, landscape | Dino 3rd |
  | Easy off, autopilot | Montreal landscape 4th; Ubud portrait 🏆 |

  Every run had 0 console errors.
- **Screenshots:**
  - `fc-r1-gift.png`: the gift moment with no sprite over the HUD.
  - `np-under0.png`: Easy-off lane strips under the gantry.
  - `np-strip0.png`, `nl-strip0.png`: the approach.
- **Tests:**
  - `browser.mjs --ids crash-racers --run cr-race3`: BOOT + PLAY ready, 0 errors.
  - `original-quality.mjs`: the crash-racers mission checks now time out, as expected, because the mission is gone; the coordinator updates the test. With the crash-racers parts removed (a scratch copy), every other check passes.

### Left open

- Ubud with Easy off still has more short bot rescues than other cities.
- Two-device play is untested (store bridge).
- `public/bitgames.json` still lists the deleted files and needs the build.

## 2026-10-12 — Third review (7.3): measured in real time, and the child starts at the back

The third review played 31 real-time races at 60 fps. In Easy, ignoring the gates won 4 of 5 races, careful play 3 of 5 and careless play 2 of 5: the sims had been flattering. The main reason was that the child started on pole (entry 0 → grid slot 0) and was 1st within 2 s. Every number below is from **real-time** Playwright races (Chromium `--use-angle=gl`, 2 laps, two browsers at once, 60 fps measured in every race), not sims.

### Changes

| Finding | Fix | Where |
| --- | --- | --- |
| The child started on pole | The robots line up in front and children start at the back. Every race begins in 3rd or 4th, so a win needs overtakes. | `public/js/main.js:893` |
| Easy bots slowed more for bends than the child | They use the child's bend factor (`pace − bend·35`). `EASY_BOT_PACE` is 21.0 / 20.4 / 19.8 m/s. | `bot.js:91`; `main.js:35` |
| The gift wasn't decisive | `GIFT_SECONDS` 5, `GIFT_EXTRA` 9, `GIFT_PUSH` 8 (was 4.5 / 8 / 5). It is still limited in bends, and never on a jump run-up. | `main.js:223-225` |
| The lean into the tapped lane ran into cars already in that lane | `passLane` now always looks for a car up to 20 m ahead in the child's line (26 m during a gift) and aims 2.5 m to its open side. Passing comes before the gate lean, so a right answer never costs the place, and the child can overtake from the back. | `main.js:1877`, `steeringHelper` |
| Bots formed a train and rarely passed | A bot 8–60 m behind the child pushes 5% harder. Bots look 20 m ahead (was 12) for a car to pass, and aim 2.6 m beside that car instead of a fixed shift from their own lane. | `bot.js:101`, `bot.js:138-142` |
| Repeat crash spots (Montreal ~156–200 m, Ubud's kerbs) | Every racing bot gets a gentle sideways pull back to its line, so it no longer drifts wide in bends. Montreal's sidewalk maples stand 2.4 m back from the kerb (was 1.4 m, where wide cars hit the trunks). Stall episodes in the same sample runs fell from 49 to 20. | `bot.js:75`; `cities.js:863` |
| Ghost rings over the top HUD as the car passes under | Gate sprites fade from 22 m to 12 m from the camera (was 16 to 8). | `gates.js:35-36` |
| Landscape Easy showed the house twice (buttons over the gantry, plus the 3D sprite) | While the buttons sit over the gantry, that gate's 3D house is hidden. | `main.js:2279`, `gates.js:158` |
| The map step came within one Easy race | In Easy it can only be reached by a race that began on the harder step, so it is earned across two races. | `main.js:306`, `startStep` at `main.js:881` |

### Real-time results (2 laps; the child always started at the back)

| Policy | Races | Wins | Results |
| --- | --- | --- | --- |
| Careful (all gates right), portrait | 5 | 4 | Dino 🏆 +6.1 s; Helsinki 🏆 +4.2 s; Montreal 🏆 +3.5 s; Stunt 🏆 +1.6 s; Ubud 2nd −0.3 s |
| Careful, landscape | 5 | 2 | Montreal 🏆 +5.9 s; Ubud 🏆 +2.5 s; Dino 2nd −0.4 s; Helsinki 2nd −0.3 s; Stunt 2nd −0.4 s |
| Careless (a coin toss at each gate), portrait | 5 | 0 | 3rd −2.2 s; 2nd −1.0 s; 3rd −5.0 s; 4th −3.5 s; 3rd −1.1 s |
| Ignoring the gates, landscape | 5 | 0 | 3rd −4.4 s; 2nd −2.4 s; 4th −4.4 s; 4th −7.1 s; 2nd −2.6 s |

- **Careful play wins 6 of 10 (60%).** All four careful losses were 2nd by 0.3–0.4 s.
- **Ignoring the gates wins 0 of 5**, careless play 0 of 5.
- **Closeness:** 11 of the 20 races finished within 3 s of the winner (the child's gap to the winner, or a careful win's margin). All four careful losses were within 0.4 s.
- **No wire-to-wire wins.** Every win came from behind: the place pill shows the child passing cars at 12–75 s.
- **Tuning runs** (not counted above):
  - With gift +10, careful won 8 of 10, but by 2–6 s, careless won 1 of 5 and ignoring won 0 of 5.
  - With gift +8 and bot paces 0.5 m/s faster, careful won only 1 of 5.
- **Easy off** (bot autopilot driving the child's car, real time): Montreal 4th, Ubud 3rd, Helsinki 3rd, 0 errors. In sims (2 per city), every bot finished; per-race bot stalls were at most 6 s in Montreal and Ubud and at most 12 s in Stunt Park, against the review's 20–40 s.
- **Screenshots** (`scratchpad/cr-race/shots/`):
  - `L-montreal-r1-gate.png`: landscape Easy with no 3D house behind the buttons.
  - `L-helsinki-r1-gift.png`: a gift moment with no ring over the HUD.
- **Tests:**
  - `browser.mjs --ids crash-racers --run cr-race4`: BOOT + PLAY ready, 0 errors.
  - `original-quality.mjs` without its crash-racers mission parts: all 11 other checks pass.

### Left open

- Careful losses are photo finishes (0.3 s). That is by design, but a careful child still loses about 4 races in 10.
- Easy off was measured with the bot autopilot, not a child's own steering.
- Two-device play is untested (store bridge).

## 2026-10-12 — Fourth review (7.0): 🚀 is no shortcut, a clean start, a hint for skipped gates

The fourth review played 23 real-time races. The race feel was good: the start from the back, live place changes and correct podiums. Five issues remained.

### Changes

| Finding | Fix | Where |
| --- | --- | --- |
| Holding 🚀 the whole race beat the lesson (a flat 20 m/s cap, with no slowing for bends) | One bend-aware Easy speed, `easyTop` = `clamp(19 − bend·35, 10, 19)`, now applies to the cruise, to holding 🚀 and to the gift's push. Only the presents' gifts go faster. The bot-pace comment is corrected, and `EASY_BOT_PACE` is retuned to 20.6 / 20.0 / 19.4 m/s, since bots no longer lose time crashing at the start. | `public/js/main.js:1665-1670`, `govern`, `cruise`, `giftTop`; `main.js:35`, `main.js:954-957` |
| Pile-ups at the first bend | In Easy, the robots pass through each other (and everyone) for the first 14 s after GO (`START_GHOST`; the wheels follow the ghost too). Bots look 24 m ahead for a car to pass and pass 2.9 m beside it. Mystery-box rows now sit on the straightest road between the gates (0.38 / 0.61 / 0.84 of the loop, never before 240 m), not on the first bend. | `main.js:1337`, `rampGhost`; `bot.js:138-142`; `pickups.js:98-102` |
| No hint for a child who ignores the gates | A gate driven under with no choice counts as skipped (`run.skipped`). When right answers are fewer than half of all gates (including skipped ones), the place line adds "Right presents at the gates give you a speed boost!". Heard in real play: "You came fourth. Right presents at the gates give you a speed boost!" | `main.js:299`, `main.js:1583-1584`, `newGateRun` |
| Easy off counted drift as answers | Without a tap, the car's lane is an answer only when it is on that present's coloured strip. With two lanes that means beyond 0.14 × the road width from the middle; with three, the middle third's strip or beyond 0.19 × the width. Between strips is no answer. Easy keeps its rule that the child must have steered. | `main.js:293-301` |
| The map pin under the player marker | A gate pin within 28 px of the child's marker is moved out beside it. | `main.js:2245-2256` (`drawGatePins`) |

The gift is now +10 m/s (`GIFT_EXTRA`, `main.js:224`) for 5 s, pushed at 8 m/s².

### Real-time results

Real-time Playwright races, 2 laps, 60 fps measured in every race, with the child starting at the back.

| Style (Easy) | Races | Wins | Results | Target |
| --- | --- | --- | --- | --- |
| Careful | 5 | **3** | Helsinki 🏆 +2.8 s; Stunt 🏆 +2.3 s; Ubud 🏆 +3.9 s; Montreal 2nd −0.3 s; Dino 2nd −0.5 s | ≥ 3 ✓ |
| Careless (a coin toss at each gate) | 5 | **1** | Stunt 🏆 +1.4 s (3 right); Dino 3rd −4.2 s; Helsinki 4th −5.8 s; Montreal 2nd −3.0 s; Ubud 4th −3.6 s | ≤ 1 ✓ |
| Ignoring the gates | 5 | **0** | Helsinki 4th −5.4 s; Montreal 4th −6.3 s; Ubud 4th −6.2 s; Stunt 3rd −4.9 s; Dino 3rd −6.8 s | ≤ 1 ✓ |
| Ignoring the gates, holding 🚀 | 5 | **0** | Dino 3rd −7.4 s; Helsinki 4th −4.4 s; Montreal 2nd −7.2 s; Stunt 3rd −7.2 s; Ubud 4th −6.8 s | ≤ 1 ✓ |
| Careful, holding 🚀 | 3 | **2** | Helsinki 🏆 +2.9 s; Ubud 🏆 +1.8 s; Montreal 3rd −1.5 s | still wins ✓ |

- **Closeness:** both careful losses were 0.3–0.5 s, and careful wins were by 1.8–3.9 s. Children who ignore the gates trail by 4–7 s.
- **Tuning runs** (not counted): with bot paces 21.0 / 20.4 / 19.8, careful won 2 of 5 at gift +9 and 2 of 5 at +10, and ignoring with 🚀 won 0 of 5.
- **Bot stalls over 2 s at the first bend** (lap 1, about 150–180 m; about 512 m in Stunt):
  - Easy, 23 races: two, both in Helsinki (2.5 s each, ended by the rescue).
  - Easy off, 3 races: none.
  - All other stalls were single 2–3 s rescues elsewhere.
- **Easy off** (the bot autopilot drives the child's car, real time):
  - Montreal: 3rd.
  - Helsinki: 4th.
  - Ubud: 4th.
  - Stalls were 2.2–2.5 s each.
  - In sims, a drifting car now has 2–3 of 6 gates counted, against 4–6 before.
- **Tests:** `browser.mjs --ids crash-racers --run cr-race5` gives BOOT + PLAY ready with 0 errors. Every real-time run had 0 page or console errors.

## 2026-10-12 — Fifth review (7.5): every race finishes, and the gates decide more of them

The fifth review played 33 real-time races and found the race feel good: overtakes, a tight pack, a correct podium and holding 🚀 no shortcut. It also found one severe bug, a race that never ended if a child held ◀ or ▶, plus five smaller issues.

### Changes

| Finding | Fix | Where |
| --- | --- | --- |
| **SEVERE: holding ◀ or ▶ circled the car for ever, so no podium** | Three fixes: **(a)** In Easy the helper takes the wheel when the car has turned more than about 70° from the road ahead, or is at the edge and still steering off it. **(b)** Headway is net progress over the no-headway window: a car making under 1.5 m/s along the road over the whole window is put back on the road (circling used to reset the old "4 m" check). **(c)** Once every robot is home, the race ends 30 s later wherever everyone is. The podium comes, the title gives the child's place ("🏁 You came 4th!") and the voice says it. | (a) `steeringHelper`, `main.js:1979-1986`; (b) `recover`, `main.js:1300-1320`, `HEADWAY_SPEED` `main.js:1280`; (c) `onCarFinished`, `main.js:1508-1514`, `BOTS_HOME_SECONDS` `main.js:26`, `main.js:1568`, `celebrate` |
| Mashing 🔄 stopped the car dead | In Easy racing, 🔄 does nothing while the car is on the road, upright and moving above 4 m/s. It still rescues a stuck, overturned or off-road car. | `ACTIONS.reset`, `main.js:1412-1417` |
| The learning didn't decide enough races (bots reeled the child back) | `GIFT_SECONDS` is 6 (was 5). A bot 15–60 m behind the child now pushes 3% harder (was 5% from 8 m). Far behind, up to 12% as before. | `main.js:225`; `bot.js:96-102` |
| The start ghost let robots drive through the child | Robots at the Easy start are in their own collision group (`GROUP_BOT`). They pass through each other only, and still meet the child's car and steer round it. Wheel rays follow the same filter. A robot still overlapping another when the 14 s end becomes an ordinary ghost until clear. In real play, the closest robot to the child in the first 12 s was 10.9 m (Stunt) and 12.5 m (Helsinki). | `util.js:85`; `startGhost` `main.js:1356`; `car.js:343-346`; masks in `damage.js`, `track.js` |
| 🤖 tags covered the gate presents | A robot's tag is hidden for the last 25 m before a gate (and 4 m after). | `fadeTags`, `main.js:1015-1018` |
| Solo: "New city" came only after the robots finished | Playing alone, 🗺️ New city shows at once, like Race again. | `main.js:560`, `main.js:1602` |
| The pill read "3rd of 4" at GO | Children start on a row of their own behind the robots, so it reads "4th of 4". | `main.js:900-905` |

### Real-time results

Real-time Playwright races, 2 laps, 60 fps in every race. Every race reached the podium.

| Style (Easy) | Races | Wins | Results |
| --- | --- | --- | --- |
| Careful | 10 | **7 (70%)** | Portrait: Helsinki 🏆 +3.3 s, Stunt 🏆 +6.2 s, Ubud 🏆 +2.1 s, Dino 2nd −0.3 s, Montreal 2nd −0.2 s. Landscape: Helsinki 🏆 +3.5 s, Montreal 🏆 +6.6 s, Stunt 🏆 +3.2 s, Ubud 🏆 +2.3 s, Dino 2nd −0.3 s |
| Careless (a coin toss at each gate) | 5 | **1 (20%)** | Ubud 🏆 +2.5 s (4 right); Dino 2nd −1.6 s; Helsinki 2nd −3.9 s; Montreal 3rd −4.5 s; Stunt 2nd −3.0 s |
| Ignoring the gates | 5 | **0** (average place 3.2) | Dino 4th −6.3 s; Helsinki 3rd −7.1 s; Montreal 4th −6.2 s; Stunt 2nd −6.0 s; Ubud 3rd −6.8 s |
| Holding ◀ the whole race (Ubud) | 1 | 0 | The robots finished by 99.3 s; 30 s later the race ended and the podium showed "🏁 You came 4th!" |
| Holding ▶ the whole race (Helsinki) | 1 | 0 | Finished 4th at 94.7 s, 4.2 s behind the winner |
| Mashing 🔄 every 1.2 s, careful (Montreal) | 1 | 0 | 2nd, 0.3 s behind, finished at 74.9 s (the review saw 164–177 s) |
| Mashing 🔄, ignoring the gates (Stunt) | 1 | 0 | 4th at 104.8 s, 6 s behind |

- All three careful losses were photo finishes (0.2–0.3 s).
- **Tests:** `browser.mjs --ids crash-racers --run cr-race6` gives BOOT + PLAY ready with 0 errors. Every real-time run had 0 page or console errors.

## 2026-10-13 — Sixth review (7.8): pass, don't push

The sixth review played 29 real-time Easy races. There were no endless races, no overlaps at the start, no console errors, and the podium was right every time. But careful play won only 6 of 13: five losses were 2nd by 0.2–0.3 s. The probes showed the cause: a boosted child closed to about 4 m behind the leader, slightly off its line, and *pushed* it along at 26–31 m/s (its pace is 20.6) for 6–12 s instead of passing.

### Changes

| Finding | Fix | Where |
| --- | --- | --- |
| A boosted child pushed the leader instead of passing it | **passLane:** boosted, it looks 30 m ahead and passes 3.2 m beside (2.5 m otherwise). While right behind a car (within 7 m and not yet out beside it), the child is `blocked`: the gift waits (its clock pauses up to 2 s, no push). **The helper's grip while passing:** gain 2.2 plus a sideways pull, and a cap of 1.0 (was 0.8). **unpin:** a car within 5 m nose to tail in the same line now counts as pressing, as well as side by side. **dodge:** a robot moves 2.9 m aside for a quicker car close behind it. **Robots never gain speed from a push:** each robot's speed is trimmed back to its target + 1.5 m/s after the physics step (on the ground, not during turbo). | `main.js:1980-2003`, `main.js:2030-2040` (`steeringHelper`), `main.js:1762-1768` (`giftExtra`), `giftPush`; `main.js:1350-1360` (`unpin`); `bot.js:141-147`; `bot.js:121`, `capSpeed` `main.js:1811`, `main.js:1948` |
| The jump replay camera swung to a side view mid-race | The slow-motion replay is off in races; the chase camera stays. | `main.js:1099` |
| A child who ignores the gates gets one prompt and sits 4th | After a gate driven through with no choice, the next gate says "Tap a present for a speed boost!" (at most twice a race). The "Right presents at the gates give you a speed boost!" hint now also follows 2nd place. | `main.js:272-276`; `celebrate` `main.js:1640-1648` |
| A robot rode 3.8 m from the camera for about 4 s | A robot that has spent 0.8 s just behind the moving child (2–11 m, where the camera rides) decides, and sticks to it: it passes wide (floor at the child's speed + 3) until it is ahead, or drops back (cap at the child's speed − 3) until 15 m behind. | `Bot.politeness`, `bot.js:176-192` |
| 🤖 tags came back 4 m past a gate | Hidden from 25 m before to 12 m past. | `main.js:1025` |
| Bumpers: one mashed 🅿️ ended at 3.4 s | 🅿️ works only after 15 s (`PARK_AFTER`). Tested: five taps at 3–4 s are ignored, and one tap at 16 s parks. | `main.js:1288`, `ACTIONS.park` |
| "Second place! So close." with a large gap | "So close" only when within 1.5 s of the winner; otherwise "Second place!". | `main.js:1642-1646` |

`GIFT_SECONDS` is 5.5 (was 6). Once the gift passed instead of pushing, 6 s won by 4–8 s (8 of 10), and 5 s won 6 of 10.

### Real-time results (2 laps, 60 fps)

| Style (Easy) | Races | Wins | Results |
| --- | --- | --- | --- |
| Careful | 10 | **7 (70%)** | Portrait: Dino 🏆 +3.4 s, Montreal 🏆 +0.7 s, Stunt 🏆 +3.1 s, Ubud 🏆 +3.1 s, Helsinki 3rd −1.9 s. Landscape: Dino 🏆 +6.3 s, Montreal 🏆 +3.9 s, Ubud 🏆 +3.5 s, Helsinki 3rd −3.0 s, Stunt 2nd −0.4 s |
| Careless | 5 | **0** | Dino 2nd −6.0 s; Helsinki 4th −6.4 s; Montreal 2nd −4.1 s; Stunt 3rd −5.1 s; Ubud 4th −6.8 s |
| Ignoring the gates | 5 | **0** (average 3.6th) | Dino 4th; Helsinki 3rd; Montreal 3rd; Stunt 4th; Ubud 4th. Each heard "Tap a present for a speed boost!" twice, then the place with the hint. |

- **Pushing is gone:** in the careful races, the child spent 0–7.8 s a race "blocked" behind a car (waiting to get out beside it), and no leader was pushed along.
- **Robots near the camera:**
  - Total time a robot spent within 5 m of the camera fell from up to 24.5 s a race (before the robot change) to 0–14 s.
  - In six follow-up races in Stunt and Dino, the longest single spell was at most 2.8 s.
  - One earlier careless Stunt race logged a 14.9 s spell, which I could not reproduce.
- **Jump cities:** Dino and Stunt in every batch. No replay swing; the chase camera stayed.
- **Tests:** `browser.mjs --ids crash-racers --run cr-race7` gives BOOT + PLAY ready with 0 errors. Every real-time run had 0 errors.
