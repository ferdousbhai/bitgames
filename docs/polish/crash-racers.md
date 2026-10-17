# Crash Racers polish

## Round 3 (review 8.2, 2026-10-16)

The second fresh review scored 8.2: intuitive 8.5, fun 8, variety 8, no text 9.5, polish 7.5. It found races close, bursts on the road and Bumpers working (7–17 bumps a minute). These are its fixes.

| Finding | Fix | Where |
| --- | --- | --- |
| Star-line bursts were free for mashing (14 bursts in one race) | A line counts only when the car is out on one side (over 0.8 m from the middle) and the child's last steer, within 4 s, was towards that side. It doesn't count when the steer changed side more than three times in 2 s, which is mashing. Each child gets at most one star burst a lap. Mashing now gets 6–7 bursts a race, about the same as careful play, and nearly all of them come from tapping the ⚡ button itself. | `main.js` `PICKUP_HANDLERS.onStar`, `humanController` (`flipTimes`, `steerFlips`) |
| 🚀 did nothing in Easy | Holding it is still no faster (balance unchanged), but it feels faster: the engine roars, flames puff from the exhaust, and the view widens by 4° (`car.revving`). Measured: field of view 80.9° holding, 76.0° released, the same speed. | `humanController`, `tick`, `updateCamera`, `frame` |
| One tap on 🧸 turned Easy off | 🧸 is a press-and-hold with the gold ring, like 🅿️ and 🔊. Five quick taps leave Easy on; a 1.2 s hold switches it. | `buildMenu`, `holdButton`; `index.html`; `style.css` |
| The Bumpers ending had no payoff | Each car is shown with its bumps as a row of 💥 (up to 12, then the number) and a 👑 for the bumpiest, with confetti and a cheer, or the fanfare when the child is the bumpiest. Bumps are a new `bumps` stat, shared through the existing `stats` message. A test run had 9–11 bumps per car in 50 s. | `newStats`, `onLocalHit`, `renderResults`; `style.css` |
| A palm of several fingers could start overlapping holds (reported in another game) | `holdButton` tracks the finger that started the hold. A second finger on the button cancels the whole hold, and nothing starts again until every finger has lifted. A pending animation frame is cleared before a new hold starts, and the step stops if the hold was cancelled. `palm.mjs` sends three CDP touch points on 🧸, 🔊 and 🅿️, lifted after 80–300 ms, 12 times each: nothing fires. A single 1.2 s hold still switches each button. | `main.js` `holdButton` |
| Mashing the menu muted the game (confirmed by the round-3 reviewer) | The menu's 🔊 uses the same press-and-hold as the race's. A mute is never saved, so every visit starts with sound on and an old saved `crash-racers-sound` is ignored. There is no mute key any more; Escape was never bound. A 12 s mash of the menu (`menumash.mjs`: corners, random spots, 🔊 and 🧸, three-finger palms on 🔊, M and Escape) ran at 768×1024 and 1024×768. Afterwards 🔊 was still on, Easy was still on, nothing was saved, and there were 0 errors. The mash did start a race through ▶, which is expected. A deliberate 1.2 s hold still mutes. | `main.js` `buildMenu`, `setMuted`, key handler; `index.html`; `style.css` |
| A resting hand could mute (shared mash check failed: one finger on 🔊 and two resting on the screen for 1.5 s) | The coordinator's hold rule is now in `holdButton`. A document-level set tracks every pointer that is down. A hold starts only when its finger is the only one down; any other finger landing anywhere cancels every running hold, and nothing starts again until all fingers have lifted. Only the starting finger's lift ends a hold. The step re-checks on every frame. `rest.mjs` holds one finger on 🔊 (menu and race), 🧸 or 🅿️ with two resting on the road for 1.5 s, in both orders: nothing fires. `palm.mjs` still passes, and single holds still work. `examples/_studio/tests/mash.mjs` PASSes: 30 s of mashing stays in play and saves no mute. | `main.js` `holdButton`, `pointersDown` |
| A ghost click: the lift after a hold fired could press whatever the new screen put under the finger | When a hold fires, the click from that finger's lift (within 400 ms of it) is swallowed in the capture phase. `ghost.mjs` holds 🧸 (1.6 s) and 🅿️ (3.2 s, until the results screen is up), then lifts at the same spot, at 768×1024, 1024×768 and 375×667: no click reached any button, and later taps still work. `mash.mjs` PASSes. | `main.js` (`swallowPointer`) |
| M flipped mute mid-race | There is no M key at all now (see the row above). | `input.on('key')` |
| A robot's 🤖 tag could sit on the HUD | A tag shows only in the middle of the view, not when its screen position is near an edge or behind the camera. | `fadeTags` |
| The 🟢 GO light covered the road | It is smaller (`.countdown.go`), sits higher, and shows for 0.45 s (was 0.7 s). | `runCountdown`; `style.css` |

Evidence: `r3.mjs`, `play.mjs` and `shots/r3-*.png` in the scratchpad folder. There were 0 page errors and 0 speech calls. In real-time races, mashing finished 🏆 (Montreal) and 🏆 (Ubud) with 6–7 bursts, and tapping finished 🏆 (Dino) with 6.

## Round 2 (review 7.0, 2026-10-16)

The first fresh review scored the pass 7.0: intuitive 8, fun 7, variety 8, no text 9.5, polish 6. Playing ⚡ at every gate won 68% of races and idling won 20%. These are the fixes.

| Finding | Fix | Where |
| --- | --- | --- |
| Easy Bumpers had about 3 bumps a minute: the robots went for other robots, through buildings, at 12 m/s | `Bot.hunt` follows the road to a child: the child bumped least recently, nearest on a tie, kept for 4 s (`preyFor`). Behind the child, a robot catches up at the child's speed + 3, plus more the further back it is (up to 27 m/s). Ahead, it waits in the child's line at the child's speed − 8 (4–12 m/s), to be bumped from behind. Within 14 m it steers straight in. After a bump it speeds off for 1.6 s (`BUMP_REST`), then slows to be caught again. In Bumpers the child's car no longer steers round a car ahead (`passLane` is race-only), so bumps land. `EASY_BUMPER` is gone. | `public/js/bot.js` (`hunt`, `bumped`), `public/js/main.js` (`preyFor`, `onLocalHit`, `botController`, `steeringHelper`) |
| A burst carried the self-driving car off the road at the next bend | In Easy, `zoomExtra` scans the next 100 m every 10 m. At each point it takes that point's safe speed (the cruise for the bend, plus the burst only where there is no bend or ramp) and allows only what the car can still shed at 4 m/s² (`ZOOM_BRAKE`). Easy off keeps the old rule. | `main.js` `zoomExtra` |
| A burst ran into a kicker (Stunt Park: a gate 20 m before the kicker; Ubud: one before its kicker) | Gates are scored on the straight 50 m in, the 15 m out (× 0.7), and a penalty for any ramp starting within 90 m after. The search runs from 40 m before the spot to 100 m after it, never within 25 m of the line. Gates now (m): Ubud 278 / 576 / 768, Helsinki 251 / 557 / 691, Montreal 239 / 449 / 704, Dino 265 / 654 / 954, Stunt 299 / 668 / 952. | `public/js/gates.js` `configure` |
| Ubud's kicker slowed the cruising car; held steers wedged the car at jump entrances | Ubud's kicker is narrower and further right (width 3, lateral 1.9; it was 4 and 1.2), so there is room to pass it on the left. `rampLane` passes a kicker 1.9 m clear (was 1.5), on the other side when the car's own side has no room, and notices it from 2.4 m beside (was 1.6). From 35 m before a ramp or jump to just past it, the helper drives the line by itself, whatever is held. | `public/js/cities.js` (Ubud `addRamp`), `main.js` `rampLane`, `steeringHelper` |
| A held steer ran the car onto the kerb | The kerb guard looks 0.6 s ahead from how fast the car is sliding across the road. A held steer towards the kerb is set aside from 1.8 m off the edge (was 1.2). | `steeringHelper` |
| Robots side-swiped a bursting child onto the pavement | A robot within 4.5 m of the child during a burst passes through it (as at jumps). | `main.js` `rampGhost` |
| Easy off: holding gas into a wall stuck the car for many seconds | The car backs itself out after 1.8 s against the wall (`WEDGED_SECONDS_FREE`); two failed tries mean a rescue. | `humanController`, `backOut` |
| Easy gave no reason to steer | Steering into the rainbow yourself counts like tapping ⚡, and an untouched car no longer gets chance bursts. A ◀ or ▶ held for more than 3 s stops counting, so holding one side all race earns nothing. Sweeping a whole line of five stars (after steering in the last 4 s) gives a small burst: half power for 2.5 s (`STAR_ZOOM`, banner ⭐💨). A small burst never cuts short a bigger one. | `passGate`, `zoom`, `PICKUP_HANDLERS.onStar` |
| 1024×768 touch with Easy off: the side buttons reached ◀ | Sideways tablets show the side buttons in two columns. | `public/style.css` |
| Accidental exits and mutes | 🅿️ and the race's 🔊 act on a 0.9 s press-and-hold while a gold ring fills; a quick tap only wiggles them (`holdButton`). A mute made during a race (🔊 or M) is not saved; the menu's 🔊 is the saved switch. The 🏠 in the corner is the store's own button, not the game's. | `main.js` `holdButton`, `setMuted`; `public/index.html`; `style.css` |
| Stars filled the screen right by the camera | They shrink away within 2.5–6 m of the camera, as the boxes do. | `public/js/pickups.js` |

### Evidence

Real-time, 2-lap Easy races in headless Chromium at about 57 fps, using real touches only. The scripts are `play.mjs`, `bump.mjs` and `sound.mjs` in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/15b3f60d-f934-46df-bd6d-46889fd68ba3/scratchpad/crash-racers/`. Results from the final code, or the last tuning step before it:

| Policy | Races | Wins | Notes |
| --- | --- | --- | --- |
| Tap ⚡ at every gate | 11 | 9 | Wins by 0.0–4.3 s. Losses: 2nd −1.0 s, and 4th −3.8 s after a robot side-swipe during a burst, which is now fixed. |
| Steer into the rainbow with ◀ ▶ (held 60 m) | 4 | 3 | One loss was 2nd by 1.2 s. |
| Never touch anything | 5 | 0 | 2nd–4th, 1.2–4.1 s behind. No bursts at all. |
| Hold ◀ or ▶ the whole race | 3 | 0 | 3rd–4th, 3.4–4.3 s behind (before the hold rule, holding won 2 of 2). |
| Mash ◀ ▶ 🔄 📯 ⚡ | 1 | 1 | |

- **Off the road during a burst:** 0 times in the last 15 tap and steer races. Before the fixes it happened in 5 of 15, at Montreal 449 and 604 (steering into a lane before a bend) and Stunt Park's kicker. The other off-road moments were robot side-swipes (now ghosted during a burst) and one Dino moment of 1.9 s with no burst.
- **Bumpers, Easy, 60 s:** 11–13 robot-to-child bumps a minute (Helsinki 11, Ubud 13), with robots mostly within 10 m. The review measured 3, with robots 150–210 m away.
- **Hold buttons:** six quick taps on the race's 🔊 changed nothing, and a 1.2 s hold muted. `localStorage` was untouched, and after a reload the menu showed 🔊. A quick tap on 🅿️ did not park, and a 1.2 s hold parked.
- **Tablet layout:** at 1024×768 with Easy off, the side buttons sit in two columns, clear of ◀ (`eoff-1024-hud.png`).
- `speechSynthesis.speak` was called 0 times. There were 0 page or console errors, apart from the dev server's `/favicon.ico` 404.

## Fun pass (2026-10-16)

The owner: the educational passes made the games boring, and the children stopped playing. Strip out forced learning, sentences and the voice; make it fun and obvious without instructions. For Crash Racers the owner's son wants a real race against the robot cars, so 🏁 Race stays the default and 🎪 Bumpers stays. There is no solo or bot-free mode.

### Removed

- **The present gates as a learning task.** Gone: the houses on the gantries, the presents over the lanes, "who would like this?", the harder three-lane step, the map step (house pins), the gate step stored per device (`crash-racers-gate-step`), the skipped-gate hints, the gate recap on the results, and the closing gate line. `houses.js` (house kinds and questions) is deleted; its picture texture moved into `gates.js`.
- **The voice.** `main.js` no longer imports `speech.js`. Every spoken line is gone: gate questions, "Tap a present for a speed boost!", "You passed Rocket!", the place lines, the gate endings. Sounds replace them (see below).
- **Text on screen.** Gone: the menu headings ("Pick your car", "Where do we go?"), the mode words, the car names, the city names and blurbs (the `blurb` field is deleted), the "Laps" word, "Easy mode", "GO!", "(me)", the waiting-screen sentences, the loading sentences, "of 4" on the place pill, "Lap 1/2", every word in the banners (Back on the road, Good as new, Turbo, Last lap, Everyone stops here, Time to park, You drive …), the results titles and the button words. Accessible names live in `aria-label`/`title`.

### Added

- **Zoom arches** (`gates.js`, rewritten). At three straight-approach spots near 0.3 / 0.6 / 0.88 of the loop (see Round 2 for how they are placed) a white gantry carries a six-band rainbow arch standing over one lane, a big ⚡ above it and a shimmering gold strip on the road with a ⚡ painted at its start. Drive through the rainbow, or tap the big rainbow ⚡ button in Easy mode, and the car gets the same burst of speed the right present used to give (`ZOOM_SECONDS` 5.5, `ZOOM_EXTRA` 10, `ZOOM_PUSH` 8: the tuned values, unchanged), with a whoosh-and-sparkle sound, a spray of rainbow gems, a rainbow dust trail, a small camera jolt and a "⚡💨" banner. After each pass the rainbow moves to a random lane. The other lane does nothing. The minimap shows each gate as a small ⚡.
  - Easy mode: the ⚡ button shows on the rainbow's side, with an arrow ◀ or ▶ beside it, from 120 m before the gate. It glows softly (1.6 s, no flashing) until it is tapped. A tap leans the car into that lane over the last 35 m, and the tap counts wherever the car ends up, as before. Without a tap, it counts only when the child's own ◀ or ▶ took the car 0.6 m or more into the rainbow's half within the last 4 s (Round 2), so a car left to drive itself never gets a burst by chance.
  - With Easy off, the car counts as in the lane from 0.12 × the road width into that half.
- **Stars are back** as things to sweep up: a ding that walks up a five-note scale along each line and a pop of gold gems. There is still no counter. A whole line swept up after steering to it gives a small burst (Round 2).
- **Juicier Easy bumps** (`friendlyBump`): a springy cartoon boing at a slightly different pitch each time, dust and a pop of rainbow gems (more for a harder bump), and a small jolt of the camera for the child's car. There are still no dents and nothing falls off. Normal mode keeps its sparks and crunch.
- **Bumpers is bumper cars again.** The robots come round for bumps with the children (`Bot.hunt`, Round 2). 🅿️ parks after 15 s, now with a press-and-hold.
- **Sounds for the race:** `zoom`, `tap` (the ⚡ button), `overtake` (a cheeky rising zip when the child moves up a place, and the place badge pops once), `overtaken` (a soft slide down), and `fanfare` for a win (a cheerful chord otherwise). `doorbell` is gone.
- **Pictures instead of words.**
  - Menu: 🏁🏎️ and 🎪💥 mode buttons, car pictures, each city as two pictures (🌾🐒, ⛪🚋, 🍁🚧, 🦖🌋, 🎢🎈; the flag emoji were dropped because some systems draw them as letters), laps as 🏁 ● / ●● / ●●●, 🧸, 🔊 and a big ▶.
  - Loading: each car's emoji drives onto the screen as it loads; the city's emoji while the city builds.
  - HUD: the place badge 🥇 🥈 🥉 or 4 beside the cars in race order; laps as 🏁 ●○.
  - Countdown: 3, 2, 1, 🟢.
  - Results: a real podium with three steps (2nd, 1st on the tall middle step, 3rd, then 4th) with each car's picture standing on it and dropping in once, the child's car marked with ⭐; 🏆 as the title for a win; 🔁 and 🗺️ buttons. A win gets 36 gold confetti pieces and a fanfare; any other place gets 18 rainbow pieces.
- `game.json`: a new tagline, `howToPlay` and `learning`.

### Balance lessons kept (do not regress)

These came from about 300 real-time races in the October 12–13 reviews. The zoom keeps every number.

- **Start at the back.** The robots line up in front and children start on a row of their own, so every race begins in 4th and a win needs overtakes (pole starts gave wire-to-wire wins).
- **Easy speeds.** The child cruises at `easyTop` = `clamp(19 − bend·35, 10, 19)`, the same holding 🚀, so 🚀 is no shortcut. The robots' paces are `EASY_BOT_PACE` 20.2 / 19.6 / 19.0 m/s with the same bend factor. Only the zoom goes faster, and only bend-aware (`zoomExtra` is scaled down into bends; `govern` brakes when well over the bend speed; `holdEasyCap` trims faster the further over it is), so a burst never carries the car into a wall. A jump run-up is always 24 m/s (`JUMP_SPEED`) and never boosted.
- **Pass, don't push.** During a burst, `passLane` looks 30 m ahead and passes 3.2 m beside. Right behind a car the child is `blocked` and the burst's clock waits (up to 2 s). Robots move aside for a quicker car close behind, and are trimmed back to their own pace after a push.
- **Rubber band.** Robots more than 15 m ahead of the last child ease off (85% by 90 m, 75% beyond 120 m). Robots 5–15 m behind a leading child push 7% harder, and 10–12% beyond that. A lead has to be re-earned at each gate, and nobody races alone at either end.
- **No pile-ups.** In Easy the robots pass through each other (only each other) for 14 s after GO. Every car is a ghost round small kickers, robots ghost through each other round jumps, and a robot pressed against a car for 0.7 s passes through it. Ghost wheels ignore other cars, so nobody lands on a ghost's roof.
- **Every race ends.** A held ◀ or ▶ fades to a quarter after 3 s (`HELD_TOO_LONG`). The helper takes the wheel past about 50° from the road or at the kerb. Net headway under 1.5 m/s over the window means a rescue. 🔄 does nothing to a car already moving on the road. The race ends 30 s after the last robot (`BOTS_HOME_SECONDS`) and 20 s after the first child (`FINALE_SECONDS`).
- **Robots stay out of the camera.** `Bot.politeness` makes a robot near the camera decide to pass wide or drop back. A respawned robot never lands within 12 m ahead or 14 m behind the child.

### Files

`public/js/gates.js` (rewritten), `public/js/main.js`, `public/js/audio.js`, `public/js/effects.js` (a `gems` pool and `sparkle`), `public/js/bot.js`, `public/js/cities.js`, `public/index.html`, `public/style.css`, `public/ipad.css` and `game.json`. `public/js/houses.js` is deleted. `public/js/speech.js` is now unused by this game; it was left untouched for the coordinator. `public/bitgames.json` needs the coordinator's build.

### Evidence

The scripts and screenshots are in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/15b3f60d-f934-46df-bd6d-46889fd68ba3/scratchpad/crash-racers/` (`play.mjs`, `batch.sh`, `phone.mjs`, `shots/`).

Each race was a real-time 2-lap race in headless Chromium (`--use-angle=gl`) at about 58 fps, on a touch tablet (768×1024 and 1024×768), driven only by real taps, held touches and button mashing. Speech was stubbed and counted.

| Policy (Easy mode) | Results |
| --- | --- |
| Tap ⚡ at every gate, after a 0.3–1.2 s reaction | 4 wins in 7: Montreal 🏆 +0.4 s, Helsinki 🏆 +2.5 s, Dino 🏆 +2.0 s, Stunt 🏆 +0.3 s, Ubud 2nd −1.5 s, Ubud 3rd −0.7 s |
| Never tap | Helsinki 🏆 +0.2 s (chance trips through the rainbow), Dino 2nd −3.1 s, Stunt 3rd −6.2 s |
| Hold ▶ the whole race (Montreal) | 4th, −9.3 s; the race finished |
| Mash ◀ ▶ 🔄 📯 ⚡ every 0.7 s (Ubud) | 3rd, −1.7 s |
| Bumpers (Helsinki) | Robots trundle in for bumps; 🅿️ parked at 45 s; chips results |

- Every race reached the podium. The place changed 2–8 times a race, and every win came from 4th at the start.
- `speechSynthesis.speak` was called 0 times. There were 0 page errors or console errors, apart from the local dev server's own `/favicon.ico` 404, which is not the game's.
- A scan of every visible leaf element found no words on the menu, the race HUD or the results.
- Phones (375×667 and 844×390): the menu has no sideways scroll, the ⚡ button sits clear of the pedals, and the podium fits.

Screenshots:

- `t1-ubud-tap-portrait-menu.png`: the picture menu.
- `t1-stunt-tap-landscape-gate.png`: the ⚡ button.
- `b1-dino-tap-landscape-zoom.png`: the rainbow gems and the ⚡💨 banner.
- `t1-ubud-tap-portrait-podium.png` and `phone-375-podium.png`: the podium.
- `b1-helsinki-smash-portrait-podium.png`: the Bumpers results.

Not tested: two-device play. Rooms need the store's bridge, so it can't run locally. No message types or `setup` fields changed. Easy off was not raced in real time.

## History (before the fun pass)

- **2026-10-09, calm pass.** Mute (🔊; since 2026-10-16 held, never saved, no M key), a music box on the menus, no crash slow motion or hype banners, shake capped at 0.6 and off under reduced motion, softer crash sounds.
- **2026-10-09 to 10-11, Delivery Town.** A map-reading delivery mode with tiers, road works and one-way streets. It was later removed completely, because the owner found it pointless and solo.
- **2026-10-11, present gates.** Matching tiers and map steps were added to Race and Bumpers. They are now replaced by the zoom arches.
- **2026-10-12, real race first.** The owner's son found the game "a solo driving game instead of competition". This brought Race as the default, the place pill, a podium in finishing order, Easy robots that really race, and the speed burst at the gates.
- **2026-10-12 to 10-13, nine reviews (7.0 → 8.3).** The balance lessons above come from these reviews:
  - The child starts at the back.
  - 🚀 is no shortcut.
  - Robots ghost through each other at the start.
  - Bursts brake into bends.
  - A burst passes a car instead of pushing it.
  - The rubber band keeps company at both ends of the field.
  - A held steer fades.
  - Every race ends.
  - Ramp pile-ups are gone.
  - A Montreal and Ubud scenery set-back means wide cars no longer hit the trees.
  - The jump-replay camera is off in races.

  The last review measured careful play winning about 80% by 0.1–2.9 s, with gate-ignoring play winning 0 of 5.
