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
