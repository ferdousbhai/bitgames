# Fish Pond: polish log

## Ghost-click guard (2026-10-16)

- After a hold fires, the next click is swallowed by a one-shot capture listener. The guard lasts until the holding finger lifts, plus 500 ms. This stops the lift landing on whatever the new screen shows under the finger.
- **Verified:**
  - I held 🏠 past firing for an extra 0.6–1.4 s, then lifted at the same spot, three times each at 768×1024, 1024×768, 390×844 and 844×390. The game was on the title while held and stayed on the title after the lift.
  - In a forced worst case, with the lake button moved under the finger, the lift still left the title showing, and a fresh tap afterwards starts play.
  - The shared mash check reports PASS, and `tests/play.mjs` passes.

## Resting-hand rule (2026-10-16)

- **The rule** (from the coordinator's hold-button rule): a document-level capture listener tracks every finger that is down.
  - A hold on 🏠, 🔊 or 🎵 starts only when exactly one finger is down on the page.
  - Any other finger landing anywhere (a palm resting on the water, or mashing) cancels the running hold, and no new hold can start until every finger has lifted.
  - Only the starting finger can end a hold.
- **Escape** no longer leaves the pond during play (hold 🏠 instead). It still closes the book. Enter or Space on a focused button still acts at once.
- **Verified:**
  - Self-test (a), 24 three-finger presses on the buttons: 0 bad.
  - Self-test (b), one finger on each button with two resting on the water for 1.5 s, with the button finger landing first or last: 0 bad.
  - Self-test (c), a single 0.9 s hold on 🔊 still mutes.
  - The shared `examples/_studio/tests/mash.mjs` reports PASS for fish-pond, and `tests/play.mjs` passes.

## Multi-finger fix (2026-10-16)

- **The bug:** in `holdButton`, a second finger on a button during a hold started another rAF loop and orphaned the first. After release, the orphaned tick fired the action at once, so a palm on 🏠, 🔊 or 🎵 could exit or mute.
- **The fix:**
  - A pointerdown while a hold is running now cancels the hold, with a wiggle.
  - Only the starting `pointerId` can finish the hold.
  - Any pending rAF is cancelled before a new hold starts.
  - `tick` bails out when no hold is active.
- **📖 mashing:** a 📖 pointer tap within 0.45 s of a water tap only wiggles the button. The keyboard B key still opens the book.
- **Verified:** I sent 24 CDP `Input.dispatchTouchEvent` three-finger presses (8 rounds × 🏠, 🔊, 🎵), lifted after 80–300 ms. The game stayed in play with sound and music on. Five water-then-📖 mashes left the book closed, and a deliberate 📖 tap opens it. A single 0.9 s hold on 🔊 still mutes. `tests/play.mjs` passes, with 0 errors.

## Hardening round (2026-10-16, after an 8.5 review)

- **Mash-proof play buttons.** In play, 🏠, 🔊 and 🎵 need a 0.7 s press and hold (`holdButton`, `HOLD`). A yellow ring fills round the button as you hold. A quick tap only wiggles the button with a blip. Enter or Space on a focused button acts at once, and so does Escape.
  - Sound and music now start on with every visit, and a mute made during play is not saved. The old `fish-pond-sound` and `fish-pond-music` keys are cleared once.
  - The 📖 button stays a plain tap.
- **Shorter wait from tap to bite.** The first look comes after 0.2–0.4 s. A chosen swimmer nibbles once, a surprise twice, 0.4–0.6 s apart. The approach is faster (steer 3.6, turn 5.5) and gives up after 5 s (was 9 s), and surprises from the deep arrive faster.
  - Measured tap-to-bite on chosen swimmers, including the 0.9 s cast flight: 1.9–3.0 s, average 2.47 s (it was about 4 s).
  - Mashing 40 s gives 6 catches.
- **Bubbling patch** (`updatePatch`, `openWater`, `rareFind`). Every 18–30 s, a patch of open water in view (an ice hole at the Icy Sea) bubbles, ripples and glints softly for 9 s. A cast into it brings up a rare find from that place: the golden fish, the chest, or the whale at the Icy Sea. It leans toward one not yet in the book. In testing, a cast into the patch caught the golden fish.
- **Small fixes.** The place buttons are now at most 104 px and the title card up to 680 px wide. At 1280×800 the buttons span x 64–636 inside the card's x 38–662. Two stale comments are fixed.
- **Evidence:**
  - Quick taps ×5 on each play button: still in play, sound on, music on. A 0.9 s hold on 🔊 mutes, with nothing stored. A hold on 🏠 goes to the title.
  - `tests/play.mjs` passes, and the portrait and landscape playtests pass with 0 errors, 0 speech and no words.
  - Screenshots in the scratchpad `shots/` folder: `r3-hold.png`, `r3-patch.png`, `r3-patch-night.png`, `r3-1280.png`.
- **Debug:** `fishPond.patch()`.

## Fun pass, round 2 (2026-10-16, after a 7.5 review)

The review asked for five things: mashing must still catch fish, each fresh-water place needs creatures of its own, repeat catches need a fresh moment, the "!" must be easier to see, and some small fixes.

- **Mashing still catches.** While the line is out, a tap only casts again when it is a single deliberate tap on another swimmer's body (0.6 s or more after the cast), or any tap after 1.5 s with nobody coming. Taps 0.45 s or less apart count as mashing and never re-cast. Once a fish is nibbling, nothing re-casts. Every other tap wiggles the bobber with a blip.
  - The wait is shorter: the first look comes after 0.3–0.6 s, a chosen swimmer nibbles one or two times, surprises nibble twice, and nibbles come 0.6–0.9 s apart. Fish from outside also come from closer.
  - Measured in Chromium with about 215 random taps over 40 s: 4–5 catches (it was 0).
- **Each fresh-water place has its own creatures.** Three new models were built with the Blender 5.2 CLI (`creature_sunfish`, `creature_salmon`, `creature_catfish` in `blender/models.py`, plus a `belly_paint` helper). Only `public/models/creatures.glb` was rebuilt; `world.glb` was restored because nothing in it changed.

  | Place | Its own creatures | Swimmers |
  | --- | --- | --- |
  | Lake | Pumpkinseed sunfish (orange belly, blue cheek squiggles, red-tipped ear flap); the turtle and pond snail are mostly here | sunfish ×2, goldfish, blue fish, turtle, frog, snail |
  | River | Sockeye salmon (red body, green head, hooked jaw), which leaps highest | salmon ×2, trout ×2, blue fish, crayfish, turtle |
  | Night | Catfish (slate blue, long whiskers) | catfish ×2, frog, goldfish, blue fish, crayfish, trout |

  The `places` weights match. The book now holds 23 creatures.
- **Repeat catches feel fresh:**
  - **Big ones:** a repeat has a 35% chance to be a big one (20% once you have one). It shows 1.38× bigger, with a bigger splash, a deep whump and a little shake.
  - **Shiny ones:** now and then (7%, one at a time) a swimmer is shiny, with a soft golden glow and a sparkle trail in the water, so there is something special to aim at. A repeat surprise from the deep can be shiny too (10%). Shiny catches sparkle on the stage.
  - **Badges:** the first big one earns a 🏅 and the first shiny one a ✨. Each pops under the catch and stays as a badge on the book sticker (`fish-pond-extra`).
  - **Tricks:** a plain repeat arrives with a cartwheel or a happy shake.
- **The "!" is easier to see.** It is now 86 px with a soft halo and a gentle bob, and the bobber sits higher during a bite (y −0.12, was −0.3).
- **Small fixes:**
  - The title no longer peeks at a place on hover.
  - `learning` in `game.json` is fun-first.
  - A keepsake: once every creature of a place is in the book, a 🏆 card shows that place's picture, and its title button keeps a little 🏆 (`fish-pond-done`).
  - The show-off is capped at 6.5 s, and each tickle adds 1.6 s.
- **Debug:** `fishPond.debug.variant = 'giant' | 'shiny'` forces the next catch.
- **Evidence:**
  - `tests/play.mjs` passes, and the portrait/landscape playtest still passes with 0 errors, 0 speech and no words.
  - Screenshots in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/15b3f60d-f934-46df-bd6d-46889fd68ba3/scratchpad/fish-pond/shots/`:
    - `r2-grid.png`: the three places, the bite, shiny and big catfish, a big frog, the book with badges, and the title trophy.
    - `r2-salmon.png`: shiny and big salmon, and a salmon leap.
  - The Blender previews are in `.../fish-pond/blend/prev/`.

## Fun pass (2026-10-16)

The owner's direction: the learning layers made the games boring and the children stopped playing. Strip forced education, text and the voice, and make the play itself fun and obvious to a child who cannot read. Fish Pond is now: tap near a fish, watch it come and nibble, tap on the "!", feel the tug, see the leap and splash, tickle your catch, and watch it fly into a picture book.

### Removed

- **Bear's riddles**, which decided what you could keep, and everything that came with them: the riddle chip, the tiers, the find-two slots, the "put back, here's why" catches, the help ring, and the easier-riddle swap. Every catch is kept now.
- **Bear's list** on the title screen.
- **Look closer** (the glowing feature, its facts, tap-to-count dots, and the "guess how many" buttons).
- **The book's sorting page** (fresh water, sea or pretend), its tabs and the field-guide notes.
- **The Count to 3 mission** and the shared adventure helper, including the mission button on the title.
- **The voice.** `speech.js` is no longer imported, and nothing is spoken.
- **All words on screen** apart from the FISH POND logo: the title tag line, "Filling the pond…", the place name card ("Tap the water to fish!"), the catch name card, the NEW! sticker, the trophy title, and the names under the book pictures. Button `title` tooltips are gone; `aria-label`s stay.
- **Modules**: `js/riddles.js`, `js/look.js` and `js/field-guide.js` are deleted, along with `Creatures.featurePoint`, the riddle boost in `roll()` and about 200 lines of riddle, list, count, guess and sort CSS. The test `tests/colours.mjs` checked riddle colours, so it is deleted too.
- The old saved keys (`fish-pond-best`, `-tier`, `-list`, `-looks`, `-sorted`, `fish-pond:adventure`) are cleared once on load.

### Added (the fun)

- **The tug** (`main.js` `reel`, `updateCatch`, `TUG = 0.5`). Tapping the bite starts half a second of thrashing at the bobber: spray, ripples, a twangy line sound (`audio.tug`), a double buzz on phones, and Bear's rod bent hard to the water. Then the catch leaps out with the big splash.
- **Tickle your catch** (`tickle`, `onShowCreature`). A tap on the creature showing off makes it jump, squash and stretch and giggle-shake, with a springy boing pitched to its size. Every third tickle it does a happy cartwheel. The duck squeaks (`audio.quack`), the pufferfish deflates and puffs up again, the whale spouts again, and the chest and golden fish shower sparkles. Each tickle keeps it on stage a little longer, up to 9 s. A tap anywhere else, or 3.8 s untouched, sends it to the book with a whoosh.
- **A gold star ⭐** pops in under a creature that is new to the book, with an extra chime. Rare (3★) catches also get a burst of sparkles.
- **Leaping fish** (`updateHops`). Every 6–12 s a fish in view (goldfish, trout, clownfish, frog, narwhal and others) jumps clean out of the water, nose first, with a splash and a bloop going out and another coming in. This also happens on the title, and one jumps about a second into every trip, so the water plainly has fish in it. There is none on the ice, where the swimmers are under the sheet.
- **A fish that gets away giggles**, with a bubble trail (`letGo`, `audio.giggle`). A bite now also throws a small splash.
- **A picture-only book.** Caught creatures appear in full colour and hop when tapped, each playing its own note on a pentatonic scale (`audio.chime`). Uncaught ones are dark shapes with a "?" and the pictures of the places where they can be found, so a child can choose where to fish next. The header shows 📖 n / 20.
- **A ▶ play badge** on the place played last, and bigger place buttons, so the title has one obvious thing to tap.
- **The pointing finger appears only when someone seems stuck**: after 2.5 s for a brand-new player who has not cast, after 12 s idle otherwise (pointing at a fish in view), and at the bobber when a bite has waited 0.8 s (2.2 s for players who have caught a couple).
- The full book still gets its 🏆 card, now just 🏆 and 📖 20 / 20.

Unchanged and kept: the five places, the creatures and their habitats, casting at the swimmer you tap, surprises from open water (whale, golden fish, treasure, boot, duck), the generous bite window (4.5 s, plus up to 1.5 s after misses), the soft glow, the bubbles, the calm music-box tunes, the sky giggle, Bear's wave and 💕, keyboard play (Space casts, reels and carries on; Enter tickles; B opens the book), and reduced motion. No square or sawtooth sounds, no flashing, no score.

### Files

- `public/js/main.js` (2091 → 1411 lines): fishing without riddles, the tug, tickles, leaping fish, the star, and the stuck-only hint.
- `public/js/book.js`: picture grid only.
- `public/js/audio.js`: `tug`, `boing`, `quack`, `blip`, `whoosh`, `chime`; `newOne(delay)`.
- `public/js/creatures.js`: the riddle boost and `featurePoint` are removed; the comments are trimmed.
- `public/js/world.js`: one comment.
- `public/index.html`, `public/style.css`: the text and the old UI are removed; `#new-star`, `.tile-where`, the hop animation and the ▶ badge are added.
- `game.json`: tagline, howToPlay and learning.
- `tests/play.mjs` (new): a real-tap check. It casts at a swimmer and checks that swimmer is the one caught, reels it in on the "!", tickles it, and finds it in the book. It also checks that no visible text other than the logo is on the title, in play or in the book, and that `speechSynthesis.speak` is called 0 times.

### Evidence

- `EXAMPLES_CHROMIUM_EXECUTABLE=/usr/bin/chromium node examples/fish-pond/tests/play.mjs` passes ("cast at goldfish, reeled, tickled and booked it; no words, no voice").
- Scratch playtests ran in Chromium (`--use-angle=gl`, touch) with 0 console errors and 0 `speak` calls. Visible words outside the logo: none.
  - Portrait 768×1024 on the lake and landscape 1024×768 on the reef: two real-tap catches each, and the swimmer aimed at was the one caught every time.
  - Forced whale (ice), chest, duck and seal catches, each tickled, and a missed bite.
  - The 20/20 trophy and full book.
  - Phone layouts 390×844 and 844×390.
- Screenshots are in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/15b3f60d-f934-46df-bd6d-46889fd68ba3/scratchpad/fish-pond/shots/`: `portrait-*`, `landscape-*`, `x-*` (rare catches, tickles, hop, miss, trophy, full book) and `p-*` (phones).
- No Blender rebuild was needed. The GLBs are untouched.

### Needs the coordinator

- `public/js/speech.js`, `public/js/adventure.js` and `public/adventure.css` are no longer used by Fish Pond. Drop `fish-pond` from `helpers` in `examples/_studio/package-originals.mjs`, then delete the copies.
- `examples/_studio/tests/original-quality.mjs` still lists `fish-pond` among the mission games (`#adventure-choice`, `window.__adventure`). Remove it there.
- `public/bitgames.json` is stale until the next build.

### Ideas for a next pass

- A rare "big one" of a common fish (a bigger leap and splash), if reviewers want more surprise.
- Little splashes or a happy wobble from Bear when a child taps the water during the wait.

## History (shortened)

- **2026-10-04 to 10-06:** the original cozy fishing game was built: Bear in a rowboat, a "!" bite, a show-off, and a picture book of 15. The Count to 3 mission, field notes and fixes followed (the finger clear of the place card, a book that fits every screen, gold trophy cards).
- **2026-10-09, calm pass:** the bite window became 4.5 s with slow nibble bobs. Shake, rays, confetti and infinite CSS loops were removed, soft music-box sounds came in, and reduced motion was honoured. Animals were moved to their true habitats, a warm **Coral Reef** was added (Blender: coral, anemones, palms, lighthouse), and the Icy Sea got an Arctic shore with seals. "Look closer" facts and one exit path per screen were added.
- **2026-10-11, rounds 1–10 of the re-audit:** Bear's riddles (tiers, two clues, find two, Bear's list), tap-to-count with guessing, the sorting page, and the frog, crayfish, pond snail, Arctic cod and ringed seal (built in Blender, 20 creatures in all). It also brought many fixes that this pass keeps: picking the swimmer under the finger by drawn size, the snail anchored under its lily pad, the crayfish book picture seen from above, `SHOW_DROP` and `SHOW_SIZE` posing, and the vivid swimmer tint so colours read true under water. Reviews reached 8.6, but the owner found the result too much like school, which led to the fun pass above.
