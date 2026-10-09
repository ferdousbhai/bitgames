# Rocket Garage: Phase 1 calm pass (2026-10-09)

Source: the [2026-10-09 audit](AUDIT_2026-10-09.md), Phase 1. Kept as before: building, painting, unlocks, the 🧪 fair-test workshop, flight steering, turbo, the landing, flag and dance.

## What changed and why

All references are to `examples/rocket-garage/public/`.

### Strobe and shake

- **Launch pad** (`js/main.js:977`): pad lights no longer blink hard between 3 and 0.3 at `sin(t*12)` (about 2 Hz). They brighten steadily with the countdown.
- **Countdown rumble** (`js/main.js:967`): reduced to about a quarter amplitude, at a lower frequency.

### Celebrations

- **Landing** (`js/main.js:1579`): the 90-piece screen confetti plus continuous party confetti (`updateParty`) become 14 pale sparkles around the pilot, played once.
- **Turbo and fly-by**: bursts cut from 40 and 30 particles to 12 and 10.
- **Star catches**: the "+1" popup and ring are removed; the burst drops from 16 to 6 particles.

### Feedback

- **Catch notes** (`js/main.js:1176`, `js/audio.js` `catch`): the combo pitch climb is replaced by a note based on where the star was caught.
- **HUD**: the star pill bump and the turbo bar's triple bump are removed. The stars count stays, because it is what the child collected and feeds turbo.

### Audio (`js/audio.js`)

- **Dance song** (`:25`): 150 bpm square wave with claps becomes 100 bpm triangle with no claps.
- **Flight song** (`:17`): 132 bpm slows to 112 bpm.
- **Countdown beep** (`:172`): square at vol 0.18 becomes sine at 0.09, lower pitch.
- **Liftoff**: noise drops from 0.35 to 0.16, and the sawtooth (0.25) becomes a triangle (0.12).
- **Turbo**: the sawtooth becomes a triangle.
- **Fanfare** (`:238`): one soft sine/triangle chord.
- **Landing thump**: 0.3 drops to 0.18.

### Hints (`js/main.js:809-825`)

- The idle "press GO" finger now appears after 30 s instead of 15 s.
- The reward-card "fly again" finger appears after 30 s instead of 8 s.
- The finger's tap bob is slower and smaller.
- First-time teaching hints are unchanged.

### CSS (`style.css`)

- Removed: the infinite logo bob, the Play pulse, the GO throb, the twinkle on new-part badges and the hopping wipe emoji.
- Gentler: the countdown entrance (scale 2.2 becomes 1.25).
- Slower: the loading hop.
- Added a reduced-motion block.

## Bugs fixed

- **Finger hint covering GO** (`js/main.js:822`): the fingertip now rests on the lower-right edge of its target, clamped to the viewport, so the 🚀 and "GO!" stay visible. See `after-p-3-garage-built.png`.

## Verification

- `browser.mjs --ids rocket-garage --run calm`: passed, 0 errors.
- `curriculum.test.mjs`: the workshop comparisons still pass. Only the manifest-hash test fails, because manifests await the coordinator's rebuild.
- Own playthrough (`rg.mjs`) at 834×1194 and 1194×834, with no console errors:
  - title, then garage
  - change the tank and paint it
  - open the workshop
  - launch, countdown and steered flight
  - Moon landing party, then the reward card with 4 new parts
- Screenshots: before `scratchpad/audit/rocket-garage/before/`; after `scratchpad/audit/rocket-garage/after-{p,l}-*.png`.

## Remaining (Phase 2)

- Ask "farther, same or shorter?" before each launch after a part change, and show a ghost of the last distance.
- Count stars aloud in groups, and give them a meaningful use rather than a tally.
- The reward screen's dance loop still plays until the child leaves; consider ending it after one phrase.

# Phase 2: the fair test inside every launch (2026-10-09)

The 🧪 workshop's fair test now happens on every launch after a part change. The workshop, unlocks, building, painting, steering, landing and dance are unchanged.

## Design

- **Before launch.** GO compares the rocket's parts (paint is ignored) with the parts of the rocket that flew last. If nothing changed, it goes straight to the countdown. If something changed, the robot shows last time's rocket faded beside the planet it reached, and the changed part as old ➜ new. It asks aloud: "You changed the fins. Last time, it reached the Moon. Will it go farther, the same, or less far?" Three big picture buttons follow. Each shows last time's faded rocket under a dashed line, with this rocket higher, level or lower. The three glow in turn, so none looks like the right answer. Picking one says "You think farther. Let's find out!" and the countdown starts. 🔧 (or Esc) goes back to the garage. Keys 1–3 and ←/→ with Enter also work.
- **During flight.** The guess rides along in the top bar. On the journey track, last time's rocket appears as a faded ghost beside the 🚀. It flies at its own real speed (same take-off and cruise rules) and parks at the planet it reached, which is marked by a dashed line. Planets that only the ghost reached sit faded above this flight's goal. **Test flights have no turbo**, because a fair test changes one thing. Turbo still works on every flight where nothing changed (for example 🚀 "fly again").
- **After landing.** The reward card replays both rockets on the workshop's two-lane track: the 👻 lane for last time and this flight's lane, each wobbling by its real wobble. The card then shows the guess picture with ✔ (matched) or 💡 (a new discovery), never "wrong". The robot says one sentence from `explainFlight()` (`js/workshop.js`), which uses the workshop's own words and rules:
  - boosters → distance ("Small boosters gave it a push, so it went farther!")
  - nose/tank/fins → wobble only when the wobble really changed ("The tank changed the wobble, not the distance."), otherwise "The nose did not change the distance."
  - window/pilot/sticker → "just for fun. Same distance!"
  - several changes at once → "…hard to tell which one did it."
- **Over time: the 📓 notebook** (under 🏠 in the garage). It has one page per part: boosters, fins, tank, nose, window, pilot and sticker. Only fair tests (exactly one part changed) fill a page, which teaches changing one thing at a time. A page shows the tested part and a pictured finding (🪐⬆ distance, 〰️ wobble, 🪐= same distance, 🎨 just for fun) and reads it aloud when tapped. An empty page shows a grey silhouette and "?". Tapping it says "Change only the fins, then fly, to find out what they do." The 📓 wears a ✨ until a new page is seen. A test that finds a new page adds "I put it in your notebook!" and 📓✨ on the card.
- **Stars in fives.** Turbo now needs 15 stars (three fives; it was 14). The star pill shows a five-frame that fills, beside a gold 5 / 10 / 15… number, and each full five is said aloud ("five", "ten"…). The turbo bar is drawn in three segments. The reward card shows the stars as the gold fives number plus the stars left over (17 = [15] ⭐⭐).

## Changes (`examples/rocket-garage/public/`)

- `js/fairtest.js` (new): `fairTest`, `verdict`, guess pictures, the two-lane result race, notebook notes and sentences, and the `#predict` and `#notebook` dialogs.
- `fairtest.css` (new; linked in `index.html`): the dialogs, guess pictures, five-frame, turbo segments, journey ghost, reward test row, 📓 button, phone, tablet and reduced-motion rules.
- `js/workshop.js`:
  - `:20-24` exports the word tables and adds `placeName` ("Mars", not "the Mars")
  - `:54` adds `explainFlight(before, now)`, sharing `compareBuilds` and the wording
  - `isBuild` is exported
  - the workshop itself is unchanged
- `js/main.js`:
  - `:46` saves `last`, `notes` and `notesNew`
  - `:159` sets `TURBO = 15`
  - `:817` stops hints while the dialogs are open
  - `:886` sets up the predictor and notebook
  - `:985` makes `launch()` ask first
  - `:1087`/`:1119` handle the test flight, last build and no turbo
  - `:1133` draws the stars in fives
  - `:1151-1215` adds the ghost and the journey track
  - `:1297` counts fives aloud
  - `:1691` adds notebook notes
  - `:1736` adds the reward test
  - `:1771` shows reward stars in fives
  - `:1858` re-lays-out the GO column after the tray slides back. This fixes an existing bug: after going 🏠 mid-countdown, 🧪/🎲 used to sit over the tray in portrait.
- `index.html`: adds the `#notebook-btn`, `#guess`, five-frame star pill and `#reward-test` elements.
- `js/audio.js:46,94`: `resume()`/`suspend()` now catch rejections, as Crash Racers already does. WebKit raised an uncaught `Failed to start the audio device` during the longer playthrough.

## Evidence

- Own playthrough (`scratchpad/p2/rocket-garage/play.mjs`) in Chromium at 834×1194, 1194×834, 667×375 and 375×667, and in WebKit at 834×1194. The script runs:
  - first flight (no question)
  - boosters only (guess "same" → 💡 farther, notebook page)
  - tank only (guess "farther" → 💡 wobble, notebook page)
  - booster and sticker (guess "less" → ✔ with "hard to tell")
  - unchanged GO (no question)
  - the notebook
  It had 0 page errors and 0 console errors. Screenshots are `scratchpad/p2/rocket-garage/<engine>-<p|l|s|sp>-*.png`.
- Every single-part change from the default rocket was checked against `explainFlight` and the notebook sentence (`explain.mjs`). All match the real `reach`/`wobble` rules.
- `browser.mjs --ids rocket-garage --run p2`: Chromium and WebKit both pass with 0 errors.
- `node --test`: 10/11. Only the manifest-hash test fails, pending the coordinator's rebuild (two new files: `fairtest.css` and `js/fairtest.js`).

## Remaining

- Owner's call: test flights skip turbo, for a clean comparison. If the children miss turbo, an alternative is to keep it and add "then your stars gave a turbo push" to the result.
- Counting every five aloud is calm but frequent on long flights (up to about 10 times). It could stop after 15 if it feels chatty.
- Booster thumbnails are drawn at a shared scale, so the small booster looks tiny on its notebook page.
- Follow-up (owner): the reward screen's dance song now plays one phrase, about 10 s ending on the home note, and then goes silent instead of looping until the child leaves (`js/audio.js` `SONGS.dance.once`, checked in `updateMusic`). The pilot keeps dancing silently. Turbo skipped on test flights, counting fives aloud and the booster thumbnail scale stay as they are for family play. Chromium and WebKit `browser.mjs --run p2` pass with 0 errors.

# Simplify pass (2026-10-09)

- One voice (`js/speech.js`) is shared by the garage, the workshop, the launch question and the notebook. Answers to taps interrupt what is being said; star counts and the landing verdict wait in the queue. Closing the workshop calls `voice.hush()`.
- `workshop.js` now exports `el`, `keyGuard`, `buildRace` and `flyRace`, and `fairtest.js` uses them. That removes the copies in `fairtest.js` (`el`, `keyGuard`, its race builder and `runRace`). The workshop keeps its 1.9 s landing and the reward card keeps 1.7 s.
- `explain` and `explainFlight` now share one rule function (`ruling`). A check over 200,000 random build pairs gave the same sentences as before.
- The journey track and the ghost rocket write their positions only when they move, and `#journey-fill` is looked up once instead of every frame. The rocket thumbnail cache now drops only its oldest picture.
- Removed dead CSS: `@keyframes bob`, `.pill.bump` and `@keyframes bump`.
- Checks: Chromium and WebKit browser checks pass with 0 errors. A scripted play covered a first flight, a booster change with a guess, the reward race and the workshop save, test and say-again. Speech stayed in order.
- Second pass:
  - The local `speak` wrappers in `fairtest.js` and `workshop.js` are now direct `voice.sayNow` calls.
  - The workshop writes its two race lanes directly. One `won(result, slot)` helper decides the winning lane and card.
  - Muting and Home call `voice.hush()`.
  - Removed the leftover `animation-delay` on the `.logo span` colour rules.
  - Checks: Chromium and WebKit browser checks, `original-quality.mjs` and the unit tests pass. A scripted workshop test (save A, change the tank, guess A, test, say again) lit both lanes and cards on the tie. Speech stayed in order, and mute and Home each cancel speech. No console errors.
- Third pass:
  - `workshop.js` exports `changedWords(changed)`, used by the workshop question and the launch question.
  - `workshop.js` exports `ruling` and `PLURAL_SLOTS`. `noteFrom` takes the note kind from `ruling` (keeping "same" when a wobbly part didn't change the wobble), and the notebook's `plural` reads `PLURAL_SLOTS`. A check over 1,620 single and double part changes gave the same notes and explanations as before.
  - The voice starts with the saved mute setting, and the sound switch calls `voice.setMuted`.
  - Checks: Chromium and WebKit browser checks, `original-quality.mjs` and the unit tests pass. With speech stubbed, the workshop says "You changed the tank. Which rocket will fly farther?", mute cancels speech, muted taps stay silent and unmuting speaks again. No console errors.
