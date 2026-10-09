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
