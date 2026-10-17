# Star Catcher

## Fun pass (2026-10-16)

The game follows the owner's new direction: fun first, no text, no voice and no forced learning. Round 1 stripped the old version out. Round 2 answered the first review (7.0/10: fun 6.5, variety 5.5).

### The game now

- **Title**: a big ▶ that breathes slowly. Any tap starts the trip, except a tap on Kitty, who meows.
- **Catch**: drag anywhere and the rocket follows (arrow keys work too). Every star counts, and missed ones just leave.
  - A catch plays a tink, and quick catches in a row climb the scale. It also bursts into sparkles, squashes and stretches the rocket, and makes Kitty squint happily and blush.
  - The caught star swoops up to its place in the corner picture, clicks in with a spreading ring and a bell, and the outline grows.
- **Each planet plays differently** (`LEGS` in `main.js`):
  - Moon: plain gold stars fall.
  - Ring Planet: stars swirl down in wide loops.
  - Candy Planet: candy-coloured stars bounce off the bottom of the sky up to three times, each with a softer bip.
  - Snowy Planet: frost stars float sideways on a slow, changing breeze.
  - Jungle Planet: stars ride up from below in wobbling bubbles that pop when caught.
- **Surprises on every planet**:
  - A big pink star (22% of spawns) bursts into three.
  - A tapped UFO beeps and drops three stars, and Kitty stays put so the child chases them.
  - Tapped planets giggle and wobble.
  - On the candy and jungle planets, sleepy rocks give a soft boing, 💫 and wide eyes from Kitty.
- **The payoff**: when the last star lands, the picture bounces out of the panel onto the middle of the screen as a chunky creature.
  - It has a strong colour fill, a thick glowing outline and a face (eyes with shines, a smile, pink cheeks). It blinks, and its eyes glance the way it faces.
  - Each animal moves and sounds its own way: the bear walks with paws swinging, the fish wags its tail, the bird flaps, the bunny hops with floppy ears, the butterfly flutters, and the cat swishes its tail.
  - Steering stays live. For about 4.5 s a shower of little sparkles falls; each one caught (or a tap on the animal) sets off its trick, a hop, a loop or a leap.
  - Then the animal shrinks and joins a parade that follows the rocket's path for the rest of the trip, always staying clear of Kitty.
- **Trip**: five of the six animals, one per planet, with the emoji journey track (🏡 at both ends). Then a calm flight home.
- **Home (the sky zoo)**: the parade glides into a loose grid. Each friend plays in its own cell (no bumping) and does its trick and sound when tapped. The only buttons are 🏠, a big ▶ and 🔊.
- **Buttons during play**:
  - 🏠 needs a 0.8 s press-and-hold while a gold ring fills, so a stray tap never ends a trip. 🏠 and 🔊 sit in their own small bar.
  - A drawn 👆 hand swipes under the rocket only after 4 s of no steering and no catches.

### Round 6 fixes (review of round 5: 8.0/10)

1. **Zoo ▶ is a 0.6 s press-and-hold** on its visible disc only, with a white ring filling round the gold button. It still rests, dimmed, for 2.5 s after arriving home. A keyboard press (Enter, or Space on the focused button) flies at once. Measured: 8 s of quick random taps over the whole bottom half stays in the zoo, and a 0.8 s hold flies.
2. **Parade spacing**: after every friend moves, a separate `spaceParade` pass runs.
   - It first sidesteps any star nearby, including leftover stars drifting away.
   - It then settles every pair of friends at least a body apart, and everyone clear of Kitty, in 4 passes that keep them on screen.
   - Measured during hard swoops with 4 friends: the closest pair is 0.92–0.97 of a body apart, and a passing star stays about half a body from a friend's centre (the friend also fades).
3. **The zoo makes room for Kitty**: the zoo box ends above the top of her rocket where she rests in the corner, so she never sits on a friend.
4. **Waking looks full at once**: the body fill and face pop in on the first frame (from 70% awake), and the sparkle burst fires immediately rather than at 0.8 s.
5. **Calmer journey row**:
   - It now shows only 🏡, the five planet pictures in trip order, and 🏡, joined by short lines that turn gold as legs are done.
   - The stop being flown to stands a little bigger, with a gold ring that fills as its picture is caught.
   - The 🚀 marker riding a track is gone.
6. **`Popups`** stays imported: it shows the 💫 when Kitty bumps a rock.

7. **The hold rule (shared `hold-rule.md`)**:
   - After a hold fires, the click made when that finger lifts is swallowed once, so a lift never presses whatever screen is now under it.
   - Escape and M do nothing during a trip (they still work on the title and in the zoo).
   - Checked with `ghost.mjs` at 768×1024 and 844×390:
     - Holding 🏠 until it fires, keeping the finger down, then lifting on the same spot (in a trip and in the zoo) stays on the title.
     - A resting hand (one finger on 🏠 or 🔊 plus two on the canvas for 1.5 s, in either order) does nothing.
     - One finger alone still mutes.
   - `mash.mjs` passes ("30 s of mashing stays in play and saves no mute").

Evidence for round 6:

- **Full touch trips** (▶ now pressed with a 0.8 s hold): 768×1024, 1024×768 and 844×390 each reach the zoo and start a new trip, with 0 errors, 0 `speechSynthesis.speak` calls and only emoji text.
- **`bits6.mjs`** at 768×1024 and 844×390: fill opacity 0.64–0.67 at 0.15 s into a wake; the parade gaps listed above; Kitty clear of the zoo; zoo mashing stays in the zoo.
- **`palm.mjs`**: all four hold buttons still ignore multi-finger palms.
- **Shared check**: `browser.mjs --ids star-catcher` passes.

### Round 5 fixes (review of round 4: 8.4/10)

1. **Zoo buttons**: the zoo's 🏠 and 🔊 use the same press-and-hold ring as the trip buttons. Every trip starts with sound on, so a mute made in the zoo (or by a sibling) never carries into the next trip.
2. **Zoo ▶**: it rests, dimmed and not answering, for 2.5 s after arriving home. After that, only taps inside its round disc count (keyboard presses always do).
3. **Parade gaps**: friends now hold a real minimum distance from each other and from Kitty (`room` in `follow`), as well as spacing along the path. In a measured hard swoop with 4 friends, the worst gap was 0.91 of the wanted gap (it was 0.58).
4. **Planets clear Kitty's sky**:
   - While Kitty flies over or near the planet ahead, it fades and steps out toward its edge, with hysteresis so it doesn't bob in and out.
   - Drifting planets always appear on the opposite side from the planet ahead.
5. **Idle progress**: after 20 s with no catch, one slow, sparkly gift star drifts down and steers itself onto Kitty. Over 70 s, a child who never steers gets 4 of 11 stars at 844×390, so they still reach the next picture.

6. **Multi-touch-safe hold buttons** (`holdToPress`):
   - Each hold tracks the `pointerId` that started it, and a token stops any stale animation frame from firing.
   - Any second finger landing (on the button or anywhere on the page) cancels the hold, and nothing restarts until every finger has lifted.
   - A primary pointer resets the tracking, so a missed lift never leaves a button stuck.
   - Tested with `palm.mjs` (CDP `Input.dispatchTouchEvent`) on 🔊 and 🏠, in a trip and in the zoo, at 768×1024 and 844×390. Three fingers landed together or staggered, were lifted after 80–300 ms, and this repeated 8 times, plus one long three-finger palm: nothing fired. A one-finger hold still mutes and goes home.

Evidence for round 5:

- **Full touch trips**: 768×1024, 1024×768 and 844×390 ran 79–109 s each with 0 errors, 0 `speechSynthesis.speak` calls and only emoji text.
- **`bits5.mjs`**:
  - Mashing ▶ in the first 1.5 s stays in the zoo, and a tap in ▶'s corner does nothing.
  - Quick zoo 🔊 and 🏠 taps do nothing, and a hold mutes.
  - After ▶, the new trip has sound on.
  - The gap and planet measurements are as above.
- **Shared check**: `browser.mjs --ids star-catcher` passes.

### Round 4 fixes (review of round 3: 7.9/10)

1. **Catching is earned**:
   - The catch reach scales with the view width (`catchReach`), down to 72% in portrait, with a +0.3 kindness bonus while Kitty is moving.
   - After the two gift stars, ordinary spawns avoid Kitty's column.
   - Measured idle for 20 s: 3 of 11 stars at 768×1024 and 1 of 10 at 844×390 (the reviewer saw 11 of 12).
2. **The zoo grows over a session**: `sky.collection` keeps every friend made since the page loaded, up to the newest 12. The zoo shows them all in a grid of up to 4 columns. A repeat animal wakes in a new colour wearing a party hat, a bow or a crown.
3. **More surprises**:
   - The UFO arrives at random (6–22 s, then every 12–30 s).
   - Most legs after the first (60%) get a rare event:
     - the planet ahead sneezes ("ah-choo") and flings 5 stars out;
     - or a chain of 5 shooting stars glides across on a slant, so catching them in a row climbs the scale.
   - The comet stays one per trip.
4. **Recognisable animals**:
   - The fish has a rounded body, a dorsal fin, and a separate tail fin in its own colour.
   - The bird has a separate orange beak, a lighter wing drawn over its body, and a rounder body.
   - The butterfly's flap is gentler (it never goes edge-on).
5. **The corner panel is gone**: the faint picture in the play field shows progress. The journey track moved to the top left, level with the buttons.
6. **After the picture wakes**, the sparkle shower falls around Kitty and drifts toward her, so a little steering catches a lot. Each sparkle sets off the animal's trick.
7. **HUD at 844×390**: slimmer track and 40 px buttons, all in one row.

Evidence for round 4:

- **Full touch trips**: 768×1024, 1024×768 and 844×390 each ran 82–103 s with 0 errors, 0 `speechSynthesis.speak` calls and only emoji text.
- **`bits4.mjs`**:
  - Idle catch rates as listed above.
  - After two trips the zoo holds 10 friends, with repeats wearing a crown, bow or hat.
  - The sneeze makes 5 flung stars, and the chain makes 5 streak stars.
- **Shared check**: `browser.mjs --ids star-catcher` passes.

### Round 3 fixes (review of round 2: 7.6/10)

1. **🔊 is press-and-hold during a trip**, with the same filling ring as 🏠. Mute is never saved: storage is gone entirely, so a reload always starts with sound on. The home-screen 🔊 is still a tap.
2. **Parade spacing**:
   - Friends ride the rocket's path at even distance gaps.
   - They stay below Kitty, or beside her, behind the way she last flew, when she is low in the sky.
   - A friend fades to 30% and shrinks by a quarter while a catchable star is near it.
3. **Layering**: Kitty, every falling thing, the comet and the sparkles are drawn after the star pictures (a second camera-layer pass). A big woken animal never hides the rocket or the sparkle shower.
4. **Catchable stars stand out**:
   - Gold, candy and frost stars are about 0.8 scale, with warmer, stronger halos.
   - While stars are being caught, the background twinkles dim to 40% and turn cool blue.
5. **Quick start**: each leg's first two stars pop in a short reach from Kitty at 0.35 s and 0.9 s, with a twinkle. Spawning is faster after that (every 0.5–0.9 s, up to 6 at once).
6. **Variety**:
   - The planet order is shuffled every trip, and the journey track follows it.
   - One leg per trip (never the first) has a surprise: a big comet sweeps across with a rainbow sparkle trail and drops a rain of 7 stars.
   - In the zoo, tapping empty sky drops a sparkle treat, and the nearest friend hurries over, gobbles it, does its trick and sound, then goes home. Friends also do their tricks on their own every 4–9 s.
7. **Progress where the child looks**: a faint copy of the picture waits in the middle of the play field. Caught stars swoop into it (a short flight, with a ring pop at both copies), and the picture wakes right there. The small panel stays as a second view.
8. **Leftover rocks** fade and float away with the stars when a picture wakes.

Evidence for round 3:

- **Full touch trips**: 768×1024, 1024×768 and 844×390 each ran 73–87 s with 0 errors, 0 `speechSynthesis.speak` calls and only emoji text.
- **`bits3.mjs`**:
  - The first stars appear near Kitty within 1.4 s.
  - A quick 🔊 tap keeps sound on, and a hold mutes.
  - The comet runs when forced onto the current leg.
  - After a reload the sound is on.
  - Zoo treats get gobbled.
- **Zoo turns** over 10 s: 0–5 per animal, never thin.
- **Shared check**: `browser.mjs --ids star-catcher` passes.

### Round 2 fixes (from the review)

1. **Zoo flicker**:
   - Turns snap instantly with a small squash instead of easing through zero width.
   - A 1.2 s turn cooldown applies everywhere.
   - Each zoo friend roams only its own cell, at half speed.
   - Measured over 10 s: 0 to 4 turns per animal, and the share of thin samples is 0.
2. **Animals read as animals**: silhouettes built from 9–12 outline stars, triangulated fills, thick round-jointed outlines, faces, and a bigger stage with a bounce on arrival. I didn't need Blender models.
3. **No hands-off time**: the stage time is 4.5 s with steering live and the sparkle shower, and the animal then tags along in the parade.
4. **A mechanic per planet**: see `LEGS` above.
5. **Juice**: the flying star is bigger, landings pop with a ring, quick catches climb the scale, Kitty's face reacts, and the pink star is bigger and more frequent.
6. **🏠 is press-and-hold** with a ring, set apart from the track.
7. **Title tap anywhere** starts the trip.

### Removed in round 1

- Numbered stars, rows of choices, the levels and adaptation, rule text, join the dots, the hidden-number picker and the choice cards.
- Constellation names, facts and riddles, the gentle-counting mission, banners, the logo, tagline and hint text.
- The TTS voice: `speech.js` and `adventure.js` / `adventure.css` are no longer imported or linked.
- The separate music button, `numberTexture`, and the sounds `notThis` and `constellation`.

### Files

All under `examples/star-catcher/public/`:

- `index.html`
- `style.css`
- `js/main.js`
- `js/sky.js`: creatures, `PictureView` (with repeat looks), the play-field picture, and the stage, parade and zoo actors
- `js/audio.js`: catch, sparkle, wake, per-animal voices, UFO beep, bubble pop and candy bip
- `js/effects.js`: the bubble texture, with number textures removed
- `js/world.js`: comments only

`game.json` was updated too. There are no GLB changes: the candy, frost and pink stars tint a clone of the existing `star_body` material at runtime.

### Evidence

Scripts are in the session scratchpad under `star-catcher/`:

- `play.mjs`: full trips with real CDP touch drags
- `fast.mjs`: completes the pictures through the debug hook and measures zoo turns
- `bits.mjs` and `bits2.mjs`: the UFO, nudge, title tap, home hold, spark tricks and the parade

Results:

- **Full trips**: at 768×1024, 1024×768 and 844×390, each trip ran 78–94 s and ▶ then started a new one.
  - 0 console or page errors.
  - 0 calls to `speechSynthesis.speak` (stubbed and counted).
  - The only visible text is the emoji buttons and the track.
- **Interactions**:
  - A quick 🏠 tap keeps playing, and a hold goes to the title.
  - A tap anywhere on the title starts the trip.
  - A caught spark sets off the stage animal's trick.
- **Shared check**: `browser.mjs --ids star-catcher` passes.

### Known follow-ups

- `examples/_studio/tests/original-quality.mjs` still expects a mission picker for star-catcher.
- The `js/speech.js`, `js/adventure.js` and `adventure.css` copies are unused here.
- Parade friends can overlap each other slightly while the rocket swoops.

## Earlier history (condensed)

- **2026-10-04**: first version. A Blender rocket with a kitten pilot flies past five planets, catching points stars and power-ups.
- **2026-10-05 to 10-07**: learning missions added.
- **2026-10-09**: calm pass (no strobe, quieter sounds, gentle trail), then real constellations lit star by star at each planet, a home night sky, and a simplify pass.
- **2026-10-11**: rounds 1–4 added numbered rows of choices, adaptive counting levels, join the dots, hidden numbers and choice cards, plus three bug passes.

The full write-ups are in git history: `git log -- docs/polish/star-catcher.md`. Kept from those rounds:

- the HUD band, so falling things grow in below the panel
- the safe-area insets and sideways-phone zoom
- the guarded storage
- the gentle exhaust and UFO glow
- the reduced-motion handling
- the journey track
