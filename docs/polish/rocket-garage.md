# Rocket Garage

## Keyboard focus safety (2026-10-16)

Fixed the hold ownership order: cancel the previous hold before assigning the new pointer ID. Pointer release/cancel is caught on the document; leaving the button, losing capture, another pointer, any keydown or window blur clears the timer. The timer also checks that its starting finger is still down alone before acting. Focused 🏠/🔊/🎵 ignore Enter/Space and native `detail === 0` clicks; Ctrl/Cmd+M is ignored during play. Sound settings remain memory-only and visits start unmuted.

Checks: the requested `EXAMPLES_IDS=rocket-garage` shared mash check PASS (all 12 focused-button keyboard sequences plus touch mashing/palms). `node --check` PASS. Focused real-GPU Chromium check PASS: repeated short sound taps followed by held Enter, native zero-detail clicks, Ctrl+M during play, and a one-finger 850 ms 🏠 hold including its lift; 0 page errors and 0 speech calls. Script and inspected screenshot: `/dev/shm/bitgames-work/codex/rocket-garage/keyboard-focus.mjs`, `home-hold.jpg`. No build, commit or publish.

## Escape safety (2026-10-16)

Escape is ignored throughout garage building and flight (including countdown and landing); leaving play uses the existing 🏠 hold. Title/loading retain Escape. Ctrl/Cmd+M still toggles sound only in memory: `toggleSound()` and `Audio.setMuted()` write no localStorage, and each visit starts unmuted. The shared mash check now adds quick Escape, m/M, Backspace and 40 random keyboard taps after touch mashing.

Checks: updated mash passed serially for all twelve originals (including the currently served Cake Stack). A focused Chromium check preserved the garage rocket after Escape, stayed in flight after five Escape taps, confirmed Ctrl/Cmd+M changes no storage and reload restores sound, with 0 page errors and 0 speech calls. Logs: `/dev/shm/bitgames-work/codex/keyboard-mash/`.

## Bug fixes after round 7 (2026-10-16)

- **A reach-bar pick lasts one trip.** `save.aim` is cleared in `arrive()` and is no longer saved or restored. A stray tap on 🌙 can't send every later trip to the Moon.
- **The keyboard turbo uses the same gate as the button.** `useTurbo()` now needs `flight.lit`, so Enter past the 85% cut-off does nothing.
- **Checks:** `play10.mjs` and `play9.mjs` (palm cases) pass. The shared `mash.mjs` passed twice; its first run, while /tmp was full, failed with "mashing left the sound off".

## Fun pass, round 7 (2026-10-16)

A reviewer scored round 6 at 8.4: intuitive 8.5, fun 8.5, variety 8.5, no text 9.5 and polish 7.5.

- **Palm-proof hold buttons.**
  - A page-wide set of active fingers is kept by capture-phase `pointerdown`, `pointerup` and `pointercancel` listeners.
  - A hold on 🏠, 🔊 or 🎵 starts only when exactly one finger is down anywhere.
  - Any other finger landing anywhere cancels it.
  - No new hold can start until every finger has lifted.
- **The garage 🏠 is a hold too** (0.7 s); a tap does nothing.
- **A place picked on purpose gets no turbo at all.** With a nearer place chosen on the reach bar, `canTurbo` is false and the ⚡ bar is hidden for that trip, so the Moon (or any chosen planet) lands.
- **Slightly higher turbo need on long trips:** 1.6 stars per group for the Ring Planet or farther (was 1.4).

**Evidence.**
- `play9.mjs` (CDP touch):
  - Three fingers on 🔊: no mute.
  - One finger on 🔊 plus three on the canvas for 1.6 s: no mute.
  - Canvas fingers first, then 🔊: no mute.
  - One finger for 1.5 s: mute, and again: unmute.
  - Garage 🏠: a tap stays, a hold goes to the title.
  - A palm on 🏠 mid-flight stays in flight.
  - A Moon pick with the big booster flew to target 0, with the turbo hidden and unlit after 40 stars.
- `play8.mjs`: the sloppy bot still lit the turbo on 8 of 8 eligible trips. Moon trips needed 13 and it lit at 53–62% of the way; Comet trips needed 16 and it lit at 55–75%.
- 0 errors.

## Fun pass, round 6 (2026-10-16)

A reviewer scored round 5 at 8.4: intuitive 8.5, fun 8.5, variety 8.5, no text 9.5 and polish 8.

- **Turbo on long trips.**
  - `checkTurbo()` now runs every frame, instead of only when a star is caught.
  - The cut-off moved from 75% to 85% of the trip.
  - Trips to the Ring Planet or farther need 1.4 stars per group instead of 1.8.
  - Re-calibrated with a bot that aims at a star about half the time, every 0.5–1 s, with a ±1.2 aiming error:
    - Moon trips needed 13 stars and caught 23–28; the ⚡ lit at 48–57% of the way.
    - Comet trips needed 14 and caught 23–31; the ⚡ lit at 45–66%.
    - The ⚡ lit on 8 of 8 trips that could use one. Trips to 👽 have no turbo, because there is nothing farther.
- **The reward card waits.** It now arrives after the first landing trick, or at 4.5 s, instead of at 2.2 s. On sideways screens it slides in from the right.
- **Hold buttons are one-finger only.**
  - `holdButton` clears any running timer on pointerdown and tracks the starting `pointerId`.
  - A second finger cancels the hold.
  - 🔊 and 🎵 now need 1.3 s; 🏠 keeps 0.7 s, and each ring fills over its own length.
  - Checked with CDP touch events: two fingers held for 1.6 s left the sound on; one finger had not muted at 0.8 s and had muted by 1.5 s.
- **A deliberate Moon pick usually lands.** When a nearer place was picked on the reach bar, only the top ⚡ lights; the floating ⚡ beside the rocket stays away.

**Evidence.** `play8.mjs`, with screenshots in `r6/`. 0 errors and 0 speech calls. `play6.mjs` still passes; its Moon-card check now runs before the card arrives.

## Fun pass, round 5 (2026-10-16)

A reviewer scored round 4 at 8.0: intuitive 8.5, fun 8.5, variety 8, no text 9.5 and polish 7.5. They used an imprecise five-year-old steering bot.

- **The turbo is reachable with rough steering, and in time to use.**
  - `flight.need` is now about 1.8 stars per star group: 13 on a Moon trip, 16 for Mars, 18 for the Ring Planet. That is about a third of what perfect steering catches.
  - The ⚡ never lights in the last quarter of a trip.
  - Calibrated with a sloppy bot that aims at a star only about half the time, every 0.5–1 s, with a ±1.2 aiming error. It caught 22–30 stars, and the turbo lit on 8 of 8 trips, at 45–75% of the way.
  - Leaving the rocket unsteered still catches too few.
- **No ⚡ lingering after the trip.** `arrive()` darkens the top ⚡ and hides the floating one.
- **Escape away from the garage takes two presses** within 1.2 s. The first press starts 🏠's ring as a cue. In the garage one press still goes home.
- **No big 🚀 over the flop.** The countdown 🚀 is cleared, so the cartwheel is in plain view.
- **Bigger landing tricks.**
  - Every trick starts with a ring, a ring-shaped puff of the planet's dust, sparkles and a springy squash-and-stretch of the pilot.
  - All last 2–2.6 s.
  - Moves are larger: the cartwheel goes 2.2 units, the figure-eight is wider, the high five and the alien jump go higher, the dust devil lifts higher, and the pilot bounces and twirls inside the hula hoop.

**Evidence.** `play7.mjs`, with screenshots in `r5/`.
- The sloppy-bot turbo table above.
- The ⚡ cue was gone and the top ⚡ dark after `arrive` on all 8 trips.
- One Escape stayed in flight; two returned to the garage.
- No countdown overlay during the flop.
- Start and mid frames of the tricks.
- `play6.mjs` and `play.mjs` still pass.
- 0 errors and 0 speech calls.

## Fun pass, round 4 (2026-10-16)

A reviewer scored round 3 at 8.4: intuitive 8.5, fun 8.5, variety 8, no text 9.5 and polish 7.5.

- **Sound can't be switched off by mashing.**
  - 🔊 and 🎵 are now press-and-hold, using the same filling ring as 🏠 away from the garage, through the shared `holdButton()`.
  - Mute and music are no longer saved: every visit starts with sound on.
  - The keyboard mute is now Ctrl+M (or Cmd+M); a bare M does nothing.
- **The turbo is earned on every trip.** `flight.need` is 4 stars per star group on the trip, about 80% of what perfect steering catches: 28 on a Moon trip, more on long ones. Perfect auto-steering caught 31-35 on Moon trips, rainbow star included.
- **Gifts are spread out.** A landing hands over at most 3 gifts (`GIFTS_PER_LANDING`); the rest wait for coming back, and fly-bys still give 1.
  - The reward card now always starts its row with a small **star picture** whenever the trip caught stars. The dots this trip lit pop on, and a picture finished on the trip shows whole.
  - So a repeat landing with no gifts left still shows what its stars were for.
- **Two tricks per planet.** Taps alternate between them:
  - 🌙 a somersault hop, or three bouncy hops, each one higher
  - 🔴 the dust-devil whirl, or a cartwheel across the sand and back
  - 🪐 the hula hoop, or a ring toss over the rocket's nose
  - ☄️ the loop-the-loop, or a figure-eight zoom
  - 👽 the jump-spin, or a high five with the friend
- **The two-flop hint is reliable.** It comes before the first-part hint, after 3 s of stillness, and always leads to the booster tab first, then a bigger booster. With the biggest booster already on, it goes to the wobbliest part's tab instead.
- **Cleanups.** The stale "fifteen" comments are gone. A place too far on the reach bar now shakes its head in a red ring.

**Evidence.** `play6.mjs`, with screenshots in `r4/`.
- 30 quick taps on 🔊 left it on; a hold muted it; a bare M did nothing; after a reload the sound was on again.
- The two-flop hint found the booster tab while the nose tab was open.
- The too-far ring showed.
- Perfectly steered Moon trips caught 27-35 stars; the need is now 28.
- Each card had at most 3 gifts plus the picture.
- The second tricks were captured for all five planets.
- 0 errors and 0 speech calls.

## Fun pass, round 3 (2026-10-16)

A reviewer scored round 2 at 8.2: intuitive 8.5, fun 8.5, variety 7.5, no text 9.5 and polish 8.

- **Pick where to fly.** The 🚀 on the reach bar now sits under the place this rocket will fly to, which is its boosters' reach, inside a yellow ring. Tapping a nearer place flies there instead, so the Moon can be landed with big boosters. Tapping a place too far away gives a soft no and wiggles the booster tab. Changing boosters sends the 🚀 to the new reach, and places beyond it are faded. This uses `aimAt()`, with the choice saved as `save.aim`.
- **Slower progression.** The turbo needs 20 stars, up from 15; the ⚡ bar now has four segments. Fly-bys still hand over one gift each.
- **A fly-by leaves a souvenir on the shelf too**, recorded in `save.waved`. Flags are planted only on landing.
- **Landing toys.** On every landing, tapping the scene plays that planet's trick:
  - 🌙 a floaty moon-gravity hop with a somersault
  - 🔴 a wandering dust devil that whisks the pilot up and round
  - 🪐 a hula hoop that hops up round the pilot's waist and spins
  - ☄️ a loop-the-loop on an icy sparkle trail
  - 👽 the pilot and the friend jump and spin together, with confetti

  The 👆 points at the pilot after a still moment, until the first trick.
- **The ready ⚡ is hard to miss.** The top button glows slowly while it waits, with no flashing. A bobbing ⚡ button also floats beside the rocket's nose and can be tapped.
- **The alien friend at home** now stands behind the pad on the left, placed by `placeHelpers()`, clear of the 🎲 and 🚀 buttons on every layout.
- **Background planets pass on the left only**, clear of the journey track.
- **A shorter first stretch on long trips.** `passAlt` starts the zones at 12% of the way instead of 30%, so trips with big boosters don't all open with a long moonlet stretch.
- **The reward card.** In portrait it is sized to its content, and gifts pop in faster (0.1 s apart instead of 0.18 s). The reviewer's empty lower half was most likely gifts still waiting to pop in.

**Evidence.** The session scratchpad `rocket-garage/` holds `play5.mjs` and screenshots in `r3/`, at 768×1024, 1024×768 and 390×844.
- The reach-bar 🚀 goes from 🪐 with the big booster; tapping 👽 is refused, and tapping 🌙 sets the 🚀 there and the flight target to 0.
- The ⚡ cue appears beside the rocket.
- All five landing toys were captured mid-trick.
- The friend stays in view at 1024×768.
- 0 console errors and 0 speech calls. The round-1 and round-2 scripts still pass.

## Fun pass, round 2 (2026-10-16)

A reviewer scored round 1 at 7.4 overall: variety 5.5, fun 7.5 and polish 7. This round answers each point.

- **Each stretch of a flight has its own things to meet**, chosen in `spawnPattern` by `zoneAt(y)`: the place the rocket is flying toward, the Moon first, then each planet once it is passed. A long trip passes through every zone in turn.
  - 🌙 **Moonlets.** Smiling little moons to bump. Each bump gives a boing, a sideways push, a squash, and two stars.
  - 🔴 **Dust swirls.** Mars dust spins round with three stars orbiting inside. Flying in twirls the rocket with a whistle.
  - 🪐 **Hoops.** Tilted glowing rings with stars stacked through the middle. Going through gives a chime, a sparkle shower and two stars.
  - ☄️ **Ice crystals.** They replace most stars, are worth two each, and tinkle when caught.
  - 👽 **A flying saucer.** It comes alongside with the waving alien in its dome, weaves from side to side and drops stars to chase.

  Junk is rarer now, at 18% of star groups instead of 35%.
- **A rare surprise.** From the third flight on, about one flight in three has a rainbow shooting star crossing the sky. Catching it is worth five stars and turns the exhaust rainbow for the rest of the trip.
- **Stars always pay off visibly.**
  - Stars are bigger (scale 0.62, up from 0.44) and squishy: they breathe, and stretch toward a rocket that comes close.
  - Every five stars, the pilot jumps with a "yippee" and a ring, and the exhaust gains new colours. Fifteen still light the ⚡.
  - Every three stars light a dot of a **star picture** on the garage wall. Back in the garage the new dots pop on one by one; a finished picture joins up its lines, plays a ta-da and makes Robot wave, then stays up whole for that visit. There are five pictures (rocket, cat, heart, star, fish), and they loop.
- **Reasons to keep playing after everything is unlocked.**
  - A **souvenir shelf** gains a little planet for each place landed on; it hops on when you get home, and tapping one makes it bounce and sing.
  - The **pink alien friend rides home** after the Alien Planet and stays beside the rocket; tap it to make it hop and giggle.
  - The star pictures and the rainbow star above.
- **Gifts are spread out.** A fly-by hands over one gift; the rest of that planet's gifts wait for a landing. Gifts are now saved in a `got` set; old saves keep every gift from planets they had visited. A turbo trip no longer pours out two planets' gifts at once.
- **🏠 away from the garage is press-and-hold.** A yellow ring fills around it in 0.7 s, with no words. A short tap mid-flight does nothing. In the garage it is still a tap.
- **The reach bar's places never landed on are dark silhouettes.** They used to be nearly invisible.
- **The reward card wraps tidy rows of gifts** at one size, set by a `--gift` variable. This replaces the nowrap and shrink rules that squeezed 13 gifts to 30 px in landscape, and the badges now scale with the gift.
- **Dead code removed:** `combo` and `comboT` (and the stale 🧪 comment).
- **`game.json`:** shorter `howToPlay`, fun-first `learning`.
- **New module:** `js/events.js` holds the event models, built from runtime shapes plus GLB clones of the Moon, the alien and the star, and the wall pictures. No Blender rebuild was needed.
- **New sounds:** `ice`, `cheer`, `hoop`, `ufo` and `sparkle`.

**Evidence.** The session scratchpad `rocket-garage/` holds `play4.mjs` (stepped flight to 👽 with the debug pause, screenshots of each event in view), `wall.mjs` (the wall reveal) and the round-1 scripts.
- At 768×1024, 1024×768 and 844×390, the moonlets, swirl, hoops, ice, saucer and rainbow star were each seen in view, with 0 console errors and 0 speech calls.
- A short 🏠 tap during the party stayed on the party; holding it returned to the garage.
- The reward card held 7 gifts and wrapped cleanly in short landscape.
- In the wall test (20 → 27 stars), the rocket picture completed and joined up, three new souvenirs hopped on and the friend came home. The next visit started the cat picture.

## Fun pass, round 1 (2026-10-16)

The owner's direction was that the games should be fun first, with no forced lessons, no text and no voice. A non-reading child should understand the game within seconds.

### Removed

- **Predict-then-test.** The "farther, same or less far?" dialog before a launch, the ghost rocket on the journey track, the guess chip in the flight bar, and the two-lane race and verdict on the reward card (`js/fairtest.js`, `fairtest.css`).
- **📓 Notebook and 🧪 workshop.** The findings pages, the A/B race workshop, the race challenge, and the steady ━ / wobbly 〰️ marks in the tray (`js/workshop.js`, `workshop.css`).
- **Robot's missions.** The 📮 mission cards, the "as it is" diagnosis question, Robot's fix-it rockets, the 🤖 pad tag, tiers, help and hint loops, and the mission verdicts on the reward card (`js/missions.js`).
- **The voice.** `js/speech.js` is no longer imported, and nothing calls `speechSynthesis`.
- **On-screen words.** The title tagline, "▶ Play", "GO!" on the launch button, the loading text, the error sentence (now just 🔄), and the hover `title` tooltips.
- **Counting in fives.** The star pill and five-dot frame, and the star tally on the reward card. The ⚡ bar alone shows the stars caught.
- **Save fields** for all of the above (old saves load fine; the extra keys are ignored and dropped on the next save).

### Added

- **The flop: a goofy outcome you find by playing.** A rocket that is too wobbly for its boosters doesn't fly away. Instead it:
  1. shivers harder during the 3-2-1
  2. sputters up with engine pops and grey puffs
  3. coughs, then a slide whistle plays as it hangs in the air
  4. does a cartwheel on the way down
  5. lands on the pad with a squash-and-stretch BOING, bouncing up to four times in rings of dust
  6. leaves the cat dizzy with 💫 while the robot spins

  Then the tray slides back in. The rule is `flops()` in `js/parts.js`: with no boosters, any wobbly nose, tank or fins flops; each booster size carries 0.2 more wobble. Steady rockets always fly. After two flops in a row and a short pause, the 👆 hand points to the booster tab, then to a bigger booster.
- **More life at lift-off.** A ring of smoke rolls across the pad, the rocket stretches as it leaps, and a whistle rides the rumble, which is louder now.
- **Livelier sound.** Flight music is at 120 bpm. The landing dance is at 116 bpm with soft claps, still played once. The landing ta-da is a brighter four-note arpeggio, and the landing thump is louder. New sounds: `pop`, `cough` and `dizzy`.
- **A bigger landing moment.** One burst of colourful confetti, replacing the 14 pale sparkles.
- **⚡ Turbo on every flight short of the 👽.** Fifteen stars light it up, and the button pops into a bigger "⚡ ➜ planet". It used to work only past planets already visited. A planet the turbo skips past still counts as a fly-by (since round 2, one gift per fly-by).
- **Bigger 🚀 emoji on the launch button**, filling the space the GO! label left.
- **Hand hints only when the child is idle.**
  - Parts, after 5 s if none has been touched yet.
  - Launch, after 6 s before the first flight, or after 30 s later on.
  - 🚀 on the reward card, after 20 s.
  - Idle time now restarts when the garage or reward card appears, so a long flight never brings the finger straight back.

### Kept

- Building with tap or drag, and tapping the rocket to swap a part.
- Paints, 🎲 surprise, and Robot's spin when tapped.
- The pad sway for wobbly rockets.
- Flight steering by tap, drag, tilt or keys, plus stars, space junk bumps, planet fly-bys and gifts.
- Landing, the pilot hopping out, the flag, the dance and the alien friend.
- The reward card (🔧 and 🚀) and the reach bar of places visited (🚩).
- Home, sound and music buttons.

### Files

`public/index.html`, `public/style.css` (turbo rules moved in from `fairtest.css`), `public/js/main.js` (2556 → about 2090 lines), `public/js/parts.js` (`flops`), `public/js/audio.js`, and `game.json`. Deleted: `public/js/fairtest.js`, `public/js/missions.js`, `public/js/workshop.js`, `public/fairtest.css` and `public/workshop.css`.

### Evidence

Playwright scripts in the session scratchpad `rocket-garage/` (`play.mjs`, `play2.mjs`, `play3.mjs`) ran headless Chromium (`--use-angle=gl`) at 768×1024, 1024×768, 390×844 and 844×390 touch. All screenshots were read.

- Console errors: 0.
- `speechSynthesis.speak` calls (stubbed and counted): 0.
- Visible words: none in the garage or on the reward card.
- The idle 👆 appears on a part.
- Ball tank with no boosters flops: up, cartwheel, bounce, dizzy, back to the garage.
- After two flops, the finger lands on the booster tab.
- Ball tank with the small booster flies to 🔴. A turbo at 15 stars carries it to 🪐, and both fly-by gifts reach the reward card.
- Stripes tank flies to 🌙.
- 🚀 again flies straight back up.

### Notes for the coordinator

- `examples/_studio/tests/curriculum.test.mjs` imports `compareBuilds` from `js/workshop.js`, which no longer exists. That test needs to drop or change. `DEFAULT_ROCKET` in `js/parts.js` is unchanged.
- `js/speech.js` is still copied into `public/js/` by `package-originals.mjs`, but this game no longer uses it.
- Manifests (`bitgames.json`) need the coordinator's rebuild.

## Earlier history (2026-10-04 to 2026-10-12, short)

- 2026-10-04: first version. Build from parts, fly an animal pilot to five places, steer for stars, turbo, landing party, and new parts on each planet.
- 2026-10-05 to 10-07: layout passes for phones, tablets and short screens; Moon fly-by parts; a readable countdown; a bigger iPad reward card; a real roof hatch.
- 2026-10-09 calm pass: no strobe on the pad lights, a gentler countdown rumble, softer celebrations and sounds, and slower hint timing. These visual-calm fixes are kept. The audio was livened again in the fun pass above.
- 2026-10-09 to 10-12: an educational layer was added (fair tests, notebook, workshop, missions in four tiers, voice), along with many bug fixes. The education and voice were removed on 2026-10-16. The layout, WebGL context-loss, thumbnail and reward-card fixes from those rounds are still in place.
