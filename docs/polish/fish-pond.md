# Fish Pond: polish log

## Phase 1 calm pass (2026-10-09)

The audit is in [AUDIT_2026-10-09.md](AUDIT_2026-10-09.md). This pass keeps the core loop: cast, watch, reel, collect into the 📖 book. It also keeps the Count to 3 mission and the field notes.

### What changed and why

| Change | Where | Why |
| --- | --- | --- |
| Bite window is 4.5 s by default (was 2.1 s). The 🐢 mission pace stays at 6 s. New players still get +0.6 s and misses still add up to +1.5 s. | `public/js/main.js:462`, `BITE_WINDOW` at `:537` | Catching should come from watching the bobber, not from a reflex test. |
| Two or three slow bobs (0.8–1.2 s apart) come before every bite (was one or two, 0.5–0.8 s apart). | `main.js:337`, `:449` | Gives the child a rhythm to watch and predict. |
| The bite ripple rate is cut from 8 to 2 per second. | `main.js:477` | Less churn around the "!". |
| Camera shake on reel-in is removed. | `main.js:509` | Shake for a non-physical event. |
| The catch show no longer has spinning additive rays or confetti bursts (45/80/90/120 particles). Instead `softMoment()` releases 8 slow bubbles behind a still, soft glow, and the stage light drops from 14 to 6. | `main.js:540`, `:576-577`, `:624`; rays mesh removed | One soft moment instead of a strobe-like burst. |
| The mission trophy and the 15/15 trophy use `softMoment()` and one gentle chord (`audio.chord()`). | `main.js:245`, `:675` | Same reason. |
| Chest and golden-fish sparkle rates drop from 25/20 to 6/5 per second. Bear's cheer is slower (arm 12 to 4 Hz, bounce 8 to 3 Hz). | `main.js:607`, `:609`, `:720-736` | Less frantic motion. |
| The 🐟 session counter pill is gone. | `public/index.html` HUD, `main.js` `updateHud` | Removes the score. The book (n/15) already shows what was found. |
| The idle pointing finger now waits 30 s (was 8 s). The first-cast finger and bite finger stay. | `main.js:868` | Idle nudges are a pull-back hook. |
| Pity luck for 3★ creatures is capped at `MAX_LUCK = 8` (at most about ×2). | `public/js/creatures.js:46`, `:55` | No ever-growing rarity ramp. |
| Fanfares are sine or triangle music-box arpeggios. There is a new `chord()`. The cast ticks, reel clicks (10 to 6, half the gain) and chest creak are softer. Night crickets are lower (4.2 to 3.4 kHz) and less frequent (0.7–2.3 s to 2.5–5.5 s). | `public/js/audio.js:142-190`, `:236` | No square or sawtooth sounds; less busy audio. |
| These infinite CSS animations are removed: logo bob, place pulse, NEW! wobble, trophy emoji wobble. The "!" now pops once and holds still instead of a 0.45 s infinite swing. The hint finger is slowed to 1.8 s. A `prefers-reduced-motion` block is added. | `public/style.css` | No pulses or wiggles; reduced motion is honoured. |

### Habitats

Lake, river and night are fresh water, so sea animals now live only in the ice place. That place is renamed **Icy Sea** (it was Frozen Pond) in `public/js/world.js:42` and the `index.html` aria-label.

| Creature | Before | After |
| --- | --- | --- |
| Whale | all four places | Icy Sea only (weight 1.2, still 3★) |
| Narwhal | ice | Icy Sea (unchanged) |
| Octopus | lake, night | Icy Sea |
| Pufferfish | all four | river (freshwater puffers are real) and Icy Sea |
| Crab | lake, river | lake, river (freshwater crabs) and Icy Sea (snow crabs) |
| Goldfish | all four | lake, river and night (not the sea) |
| Turtle | lake, river | adds night |
| Ambient swimmers | | lake: trout replaces clownfish; night: turtle replaces octopus; ice: octopus replaces goldfish |

Two creatures have **no correct existing place** and wait for a sea place in Phase 2/3:

- **Clownfish:** least-wrong interim. It is a rare lake visitor (weight 3, removed from the river and from the ambient swimmers). Its field note now says real clownfish live in warm seas, not lakes (`public/js/field-guide.js`).
- **Glow Jellyfish:** it stays the night pond's signature catch. Its note now says most real jellyfish live in the sea and some make their own light. Freshwater jellyfish do exist, but they do not glow.

All 15 creatures can still be caught. This is documented in the `creatures.js` header comment.

**Needs the coordinator:** the `game.json` `howToPlay` still says "frozen pond". Proposed edit: replace `starry night or frozen pond` with `starry night or icy sea`.

### Verification

- `node examples/_studio/tests/browser.mjs --browser chromium --ids fish-pond --run calm`: BOOT + PLAY ready, 0 errors.
- Scratch replica of the fish-pond part of `original-quality.mjs` passed:
  - the mission choice persists and starts at zero
  - Count to 3 completes after three real catches

  The full `original-quality.mjs` stops earlier, at another worker's bunny-hop.
- Played in Chromium at 834×1194 and 1194×834 with 0 console errors. The measured bite window was 5.1 s (4.5 + 0.6 new-player help). The Icy Sea label, the book notes and the absence of place animations were confirmed.
- Screenshots: `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/183efacb-62c2-4cf6-9680-a97f4bb0fb5f/scratchpad/audit/fish-pond/before/` and `.../after/`. Files run from `*-1-menu` to `*-11-ice`; compare `*-6-show` and `*-7-rare`.
- `public/bitgames.json` is now stale until the coordinator's rebuild. The manifest test fails until then.

### Remaining (Phase 2/3)

- **Phase 2:** speak one observable fact at catch time (stripes, spots, shell), plus an optional "look closer" tap. Split freshwater and sea places properly.
- **Phase 3 (Blender):** a warm sea or coral place for the clownfish, jellyfish, octopus and crab. Then give Icy Sea a seaward shore.

## Phase 2: true habitats and "look closer" (2026-10-09, with its Phase 3 reef art)

### Design

- **A fifth place, Coral Reef 🐠 (warm sea).** Turquoise, see-through water over pale sand, soft caustics, warm light, palms, a beach hut and a lighthouse on the shore. Below the boat are low coral heads and three swaying anemones. Clownfish live beside the anemones and swim close to them. The calm music-box loop and a slow wave sound are its own.
- **Every animal lives only where it really lives.** Interim corrective notes are gone.

  | Place | Real animals that can bite |
  | --- | --- |
  | Sunny Lake, Sunset River, Starry Night (fresh water) | goldfish, rainbow trout, turtle |
  | Icy Sea (cold sea) | baby narwhal, friendly whale, crab (snow crabs), glow jellyfish |
  | Coral Reef (warm sea) | clownfish, pufferfish, octopus, crab, glow jellyfish |

  Pretend or rubbish catches turn up anywhere, and their notes say so: Blue Fish, Golden Fish, rubber duck, boot and treasure.

  **Glow jellyfish:** it moves from the night pond to both seas. Jellyfish drift in every ocean, from the Arctic (lion's mane) to tropical lagoons (upside-down jelly), and many make their own light. Freshwater jellyfish do not glow, so the night pond was the wrong home. Its note now reads: "Real jellyfish drift in every sea, warm or icy. Many can make their own light."

  Removed from fresh water: clownfish (lake), pufferfish and crab (river, lake). Removed from Icy Sea: octopus and pufferfish. Night gains trout. All 15 can still be caught (`creatures.js:23-39`; checked by `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/183efacb-62c2-4cf6-9680-a97f4bb0fb5f/scratchpad/p2/fish-pond/habitat-check.mjs`).
- **Look closer.** When a catch reaches the stage, Bear says its name and then asks, "Look closer! See its stripes?" A soft glow (an 84 px round button with a small 🔍) sits on that feature and follows the creature as it wiggles. The name card shows "🔍 stripes?".
  - One tap on the glow reads one short true fact, and the card shows the words. The catch then flies to the 📖 once the voice finishes, or after reading time when the game is muted.
  - The look is optional. A tap anywhere else still carries on (after 0.7 s, as before). Untouched, the catch waits 7.5 s on the stage (was 4.6 s) and then goes to the book. There is no timer, flash or reward for looking.
  - Catching the same creature again shows its next feature, where it has two: clownfish stripes or fins, goldfish tail or back fin, trout stripe or spots, whale blowhole or tail. Return visits find something new.
  - The 👆 finger points at the glow only until the child's first look.
  - Keyboard: Enter or L looks closer, and Space carries on.
  - Features: stripes, fins, tail, side fins, stripe, spots, spikes, shell, arms, tentacles, tusk, blowhole, beak, laces, crown and gold coins.
- Unchanged from Phase 1: the 4.5 s bite window (🐢 6 s), the slow bobs, `softMoment()`, sine and triangle sounds, and the 30 s idle finger.

### Changes

| File | What |
| --- | --- |
| `public/js/look.js` (new) | `LOOK`: per-creature feature point (builder coordinates), word and fact, with sources. `lookFor(id, timesCaught)` cycles the features |
| `public/js/main.js:568-576` | `startShow` picks the look, fills `#card-look` and queues the spoken question after the name |
| `public/js/main.js:590-711` | `updateShow` waits for a look (`LOOK_WAIT` 7.5 s, `LOOK_FROM` 1.3 s). `updateLook` projects the feature to the screen. `lookCloser` speaks the fact, then the catch moves on. `hideLook` |
| `public/js/main.js:776-786` | `spawnAmbient`: reef clownfish get an anemone home and swim slowly |
| `public/js/main.js:962`, `:1098`, `:1158-1166` | The finger points at the glow until the first look. A canvas tap near the glow counts as a look. Enter and L look closer |
| `public/js/creatures.js:12-50` | Habitat table and header, reef ambient swimmers. `featurePoint()` turns builder coordinates into model points. `home` wandering in `pickTarget` |
| `public/js/world.js:50-61` | `PLACES.reef` (palette, light, caustics, anemone spots). Anemones sway (`attachShore`, `update`). Bear's sun hat shows on the reef |
| `public/js/field-guide.js` | Clownfish, jellyfish, pufferfish, crab, octopus and Blue Fish notes are updated, with sources. The interim "not lakes" note is removed |
| `public/js/audio.js` | `TUNES.reef`, a slow wave ambience, and `say(text, { queue, onend })` |
| `public/js/book.js` | "It could be in any place" now counts five places |
| `public/index.html`, `public/style.css` | Reef place button (lake button now shows 🐢). Five-across place grid (44 px minimum, 320 px phones fit). `#look` glow button and `.clook` card line (its slow brightening is off under reduced motion) |
| `blender/models.py` | `build_shore_reef` with `reef_mats`, `palm`, `lighthouse`, `branch_coral`, `brain_coral`, `fan_coral`, `tube_sponge` and `anemone` (pivots `reef_anemone_0..2`). Reuses `hill`, `cabin`, `ico`, `slab`, `tube`, `lathe` and the shore sand, rock, wall, door and window-glow materials. Adds `--out DIR` for exploratory builds, and `same_glb()`, which keeps a shipped GLB's bytes when a rebuild is geometrically identical |
| `public/models/shore_reef.glb` (new) | 322,772 bytes, 8,405 faces, loaded only when the reef is visited. Ice is 296,736 bytes and 6,903 faces |

**Reuse and licence:** nothing external was imported. The reef is procedural, built with this game's own Blender kit and palette, so there is no third-party licence.

**Blender:** Blender 5.2.2 LTS CLI, `node examples/_studio/assets.mjs fish-pond` (8 threads, about 12 s, EEVEE previews only in the scratch folder).

Blender's glTF export is not byte-repeatable: two runs of the unchanged builder gave different triangle index order and last-digit normals. The builder now compares each fresh export with the shipped file and keeps the shipped bytes when they match. After the rebuild, the five existing GLBs have the same SHA-256 as before (`/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/183efacb-62c2-4cf6-9680-a97f4bb0fb5f/scratchpad/p2/fish-pond/models-before.sha256` and `models-after.sha256`). Only `shore_reef.glb` is new.

### Evidence

- `node examples/_studio/tests/browser.mjs --browser chromium --ids fish-pond --run p2`: BOOT + PLAY ready, 0 errors. WebKit gives the same result.
- `node --test examples/_studio/tests/*.test.mjs`: 11 of 11 pass.
- `original-quality.mjs` stops at another worker's crash-racers (a 40 s boot timeout). The fish-pond part replica, `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/183efacb-62c2-4cf6-9680-a97f4bb0fb5f/scratchpad/p2/fish-pond/mission.mjs`, passes in Chromium and WebKit: the mission persists and starts at zero on the reef, and Count to 3 completes after three real catches with untouched look-closer shows.
- End-to-end play (`/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/183efacb-62c2-4cf6-9680-a97f4bb0fb5f/scratchpad/p2/fish-pond/play.mjs`) at 834×1194, 1194×834 and 667×375, 0 console errors in each:
  - reef ambient swimmers: clownfish@home ×2, pufferfish, octopus, jellyfish
  - the glow appears on the clownfish's middle stripe
  - a tap gives the fact on the card and in speech, then the catch returns to idle
  - an untouched octopus goes to the book on its own after about 7.5 s
- All five places load the right shore and swimmers with 0 errors (`places.mjs`). Feature placement was checked for all 15 creatures (`looks-sheet.jpg`).
- Screenshots in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/183efacb-62c2-4cf6-9680-a97f4bb0fb5f/scratchpad/p2/fish-pond/shots/`: `portrait-2-reef`, `portrait-4-finger`, `portrait-5-fact`, `landscape-2-reef`, `phone-5-fact`, `portrait-1-title`, `title-320x568`, `looks-sheet.jpg`, `landscape-8-book`, `place-*.png`. Blender previews are in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/183efacb-62c2-4cf6-9680-a97f4bb0fb5f/scratchpad/p2/fish-pond/prev3/`.

### Needs the coordinator

- `game.json`:
  - `howToPlay`: replace `Pick a place: sunny lake, sunset river, starry night or icy sea.` with `Pick a place: sunny lake, sunset river, starry night, icy sea or coral reef.`, and append `After a catch, tap the glowing spot to look closer and hear a true fact.`
  - `learning`: optionally `"Observation, animal habitats (fresh water and sea) and counting"`.
- Rebuild the manifest (`public/bitgames.json`): new `js/look.js` and `models/shore_reef.glb`, plus the changed files.

### Remaining

- Icy Sea still mixes Arctic animals (narwhal, from Phase 1) with penguins on its shore, and penguins live in the far south. A seaward shore without penguins, or a note, is the Phase 3 follow-up.
- Humpback whales also visit warm reef waters to calve. The whale stays Icy Sea only for clarity (owner's call).
- Family play: does a 2–3-year-old find the glow without the finger, and is 7.5 s on stage too long for children who don't tap?

### Follow-up: Arctic shore (2026-10-09)

Icy Sea is an Arctic scene, because narwhals live in the Arctic and penguins live in the far south. The three penguins on `shore_ice` are now three resting seals (`blender/models.py` `build_shore_ice`, "Seal pals"), and the title tile shows 🦭 instead of 🐧. A `world.js` comment names the place Arctic. The field notes already agree: narwhal "icy Arctic Ocean", snow crabs and jellyfish in icy seas. The whale stays Icy Sea only, and pufferfish and crab keep the fresh-water/sea split.

The rebuild with `assets.mjs` changed only `shore_ice.glb` (306,788 bytes, 7,239 faces; was 296,736 bytes and 6,903 faces). The other five GLBs kept their SHA-256 (`models-before-seal.sha256` and `models-after-seal.sha256`). Chromium and WebKit `--run p2`: BOOT + PLAY 0 errors. Screenshot: `shots/place-ice.png`.

### Simplify pass (2026-10-09)

Quality cleanup only; play is unchanged.
- One voice: `main.js` creates the shared `speech.js` voice (rate 0.95, pitch 1.25) and passes it to the adventure and the book. `Audio.say`/`hush` are gone. Tap feedback (catch name, book tiles, the fact) interrupts; "Look closer!" queues after the name. A muted fact still allows reading time (the `onend` only runs when the fact is actually spoken).
- Removed the dead `party()`, the confetti pool and `CONFETTI` in `effects.js`; `updateShow`/`softMoment` use scratch vectors instead of allocating every frame.
- The look glow animates the opacity of a `::before` layer instead of `filter: brightness()`. Removed dead `.pill` (and overrides) and `.score b`.
- Shores: only the chosen place's shore downloads; the background prefetch of all five is gone (about 800 KB saved for a one-place visit). A newly chosen place can show its shore a moment after the water.
- Checked: `browser.mjs --run simp` Chromium and WebKit 0 errors; a scripted catch → look → fact → book run records the expected spoken order with no console errors.
- Iteration 2: the mission's fish row is the shared adventure progress (`icon: '🐟'`, a ⭐ tally when done); `.goal-fish` and its `bump` are gone (the shared pop replaces it), with the sizes kept on `#hud .adventure-steps`. The catch card's NEW! badge rule is now `#card-new` (a bare `.new` pulled the shared `.adventure-step.new` up to the corner). Interrupting lines use `voice.sayNow`.
- Third pass: the voice starts with `muted: audio.muted` and the 🔊 switch calls `voice.setMuted(!on)` (also used for the saved setting at load). The look-closer `if (!audio.muted)` guard stays: a muted `say` still runs `onend` at once, which would skip the fact's reading time. The per-game `#hud .adventure-goal[hidden]` rule is gone (shared CSS covers it). Checked: `browser.mjs --run simp3` Chromium and WebKit 0 errors, `original-quality.mjs` pass, and a speech-stubbed run (mute hushes, muted and saved-mute stay silent, unmute speaks, mission button and goal show/hide on title, play and Home, no console errors) in both engines.

### Exit paths (2026-10-09)

Every exit (🏠, Escape) goes through `toTitle()`, which hushes, drops the catch on stage or in flight and resets the card, look glow and phase. The `finishShow()` call there is gone: it only set up a fly that was thrown away. The catch is already in the book from `startShow`. A mission count lost by leaving doesn't matter, because `start()` calls `adventure.begin()`. The 15/15 trophy card is still skipped if the child leaves during that catch: `#intro` lives in the hidden HUD, so showing it later would be new behaviour (left for the owner). Removed the dead `onClose` passed to `Book`. Checked: `browser.mjs --run exits-fmp` Chromium and WebKit 0 errors, `original-quality.mjs` pass, and a speech-stubbed run (🏠 mid-show and Escape mid-fly hush, the title shows, the catch is kept, nothing spoken later, no console errors) in both engines.

## Round 1 of the 2026-10-10 re-audit: Bear's riddles, tap to count (2026-10-11)

Feedback: [AUDIT_2026-10-10.md](AUDIT_2026-10-10.md) scored Fish Pond 7. Its points were that the bite is random, so the cast spot doesn't matter; there are no riddles and no older tier; and the bugs were the octopus showing about 5 arms against "count its arms: eight" and a sea-turtle model with pond-turtle facts.

### Design

- **Where you cast is the choice.** A cast that lands within 2.6 units of a swimmer (3.4 at the ice holes) brings that swimmer to bite. The swimmer is locked when the line flies, so it still comes if it drifts. Open water far from everyone gives the old surprise roll, which is where the rare finds still come from.
- **Bear's riddle is always on.** A still chip at the top centre (under the round buttons on phones) shows a picture and a word, for example 🐻 🐚 shell. Tapping the chip says the riddle again. The child looks at who is swimming and casts near the animal that fits.
  - **Catch that fits:** one line, such as "Yes! A turtle has a shell!". The chip turns green with ✅, and the next riddle comes once the catch is in the book.
  - **Catch that doesn't fit:** one gentle line, such as "A goldfish. No shell.". The catch still goes in the book and the riddle stays.
  - **After two catches that don't fit:** a soft, still ring sits on the water over one animal that fits, and Bear says "Look for the soft ring." once per trip.
- **Harder tier for 6–8, adaptive, not a gate.** Tier 1 asks for one thing you can see: orange, blue, stripes, spots, shell, spikes, claws, 8 arms, tentacles or tusk. After three riddles in a row are answered with the first catch, tier 2 asks for an idea: a fish, not a fish, breathes air, or no bones. Several animals can answer, so it is real sorting. A right answer at tier 2 says why, for example "Jellyfish aren't fish at all!" or "Turtles come up to breathe air.". Two riddles in a row that take three or more catches step back to tier 1 quietly. The tier is saved.
  - Every riddle needs a real choice: at least one swimmer here fits it and one doesn't. Tier 1 prefers clues that fit few swimmers, and no two riddles in a row have the same answer.
- **Tap to count (octopus arms, clownfish stripes).** Tapping the look-closer glow puts a soft spot on each arm tip or white band. Each tap counts that one once (one-to-one counting), shows its number and says it aloud up to 10, because counting is the lesson here. When all are counted, Bear says "Eight arms! The suckers…". There is no clock while counting: only a 20 s rest carries on, and a stray tap between arms is ignored.
- **Bugs fixed:**
  - The octopus now leans its arms toward the camera on the stage (`lean = -0.6`), so all eight show. The scripted count found 8 tappable arm tips.
  - The turtle is now a pond turtle: its long flippers are replaced in the Blender builder by stubby legs with three pale claws, which matches its fresh-water home and its "pond turtles" facts.
- **Thinner voice:**
  - The riddle line replaces "You caught a…", so each catch gets one line.
  - "Look closer! See its…" is said only on the first two catches of a trip.
  - "Trickier riddles" and the ring hint are `sayOnce` lines.
  - A scripted 8-catch lake trip spoke 19 lines in all, including the riddles.

### Changes

| File | What |
| --- | --- |
| `public/js/riddles.js` (new) | `HAS` (what each catch has) and `TRAITS` (icon, word, ask, yes or no line, tier). `makeRiddle(kinds, tier, last)` makes riddles with a real choice, `fits()` checks a catch, and `verdict()` gives the one spoken line plus tier-2 "why" lines. Sources are in the header |
| `public/js/main.js:309`, `:333-345`, `:392-405` | `fish.aim` is locked at cast time. `sendBiter` sends the aimed or nearest swimmer, and open water rolls as before. `nearestSwimmer()` |
| `main.js:605-615` | `startShow`: the verdict line, `answer()` after it so a tier-up line isn't cut off, and "Look closer" for the first two catches only |
| `main.js:660-662` | The octopus lean, and less sway while counting |
| `main.js:713-810` | `lookCloser` goes to `startCount` or `readFact`. `countAt` (one count per arm, aloud to 10, then the fact), `countNext` (Enter or L), `updateDots`. The `updateShow` counting rest is 20 s |
| `main.js:871`, `:882-955` | The next riddle once the catch is in the book. `newRiddle`, `drawRiddle`, `answer` (streak and slow counts), `setTier` (`fish-pond-tier`), the chip's tap-to-repeat, and the help ring (`updateHelp`) |
| `main.js:1208` | `start()`: `voice.newRound()`, resets the look count, then the first riddle ("…Cast near it!") |
| `main.js:1302`, keydown | During a count, taps elsewhere and Space don't skip |
| `public/js/look.js` | `count` points: 8 octopus arm tips computed from the builder's arm formula, and 3 clownfish bands. The octopus fact no longer says the count itself |
| `public/index.html`, `public/style.css:246-290` | The `#riddle` chip (green when solved; tier 2 has a pale blue tint; "not" clues get a soft slash, not a red cross). `#dots` and `.count-dot` (54 px, or 44 px on phones; still, no pulse) |
| `blender/models.py` `creature_turtle` | Pond-turtle legs and claws. `assets.mjs fish-pond` (Blender 5.2.2, 8 threads) changed only `creatures.glb` (730,180 bytes, 20,058 faces). The other five GLBs kept their SHA-256 |

### Evidence

- `EXAMPLES_ORIGIN=http://localhost:4213 node examples/_studio/tests/browser.mjs --ids fish-pond --run fish-pond-r1`: BOOT + PLAY ready, 0 errors. `node --check` passes on main.js, riddles.js and look.js.
- Scripted play with speech stubbed (`scratchpad/polish/fish-pond/play.mjs`) at 834×1194 and 1194×834, 0 console or page errors:
  - two casts at swimmers that don't fit gave "A goldfish. No shell." and "A blue fish. No shell."
  - the ring then appeared over the turtle
  - every aimed cast brought the swimmer aimed at (9 of 9)
  - after three first-catch answers the tier moved to 2 ("Bear has trickier riddles now!"), then "Yes! A turtle! Turtles come up to breathe air."
  - on the reef, counting the octopus gave 1–8, a repeat tap on a counted arm did nothing, then "Eight arms! …"
  - counting the clownfish gave 1–3, then "Three stripes! …"
- The HUD was checked with Count to 3 on at 375×667, 667×375, 834×1194 and 1194×834. The chip, the mission row and the round buttons don't overlap.
- Screenshots are in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/264c5237-472d-4187-be3f-45d364aa4d2a/scratchpad/polish/fish-pond/shots/`: `p-1-riddle`, `p-2-miss`, `p-3-ring`, `p-4-yes`, `p-7-dots`, `p-9-counted`, `l-8-counting` (clownfish), `hud-*`. The Blender preview is `prev/creatures.png`.

### Needs the coordinator

- `game.json` `howToPlay`: add "Bear asks for an animal (something with a shell, a fish, an animal with no bones). Cast near one that fits: the fish closest to your bobber comes to bite. Tap the glow on an octopus or clownfish to count its arms or stripes."
- Rebuild `public/bitgames.json`: it needs the new `js/riddles.js` and the changed files and `creatures.glb`.

### Remaining ideas

- Book sorting page: fresh water, sea, or rubbish, as an action (drag or tap a catch to its page), perhaps at tier 2 only.
- Micro-habitats: weeds, a log or deep water that weight who lives there, so habitat knowledge also guides the cast.
- Under the ice, swimmers are faint. Family play should check whether ice riddles are findable without the ring.

## Round 2 of the 2026-10-10 re-audit: the riddle decides what you keep (2026-10-11)

Feedback: independent review 1 scored 7.6 (calm 8.5, focus 7.5, learning 7.5, fun/depth 6.8). Its blockers: wrong catches cost nothing, tier 2 was thin in the three fresh-water places, the tier rose too fast, and the colour clues did not match the screen.

### Design

- **Only riddle-fitting animals go in the book.** An animal swimming about the place that doesn't fit Bear's riddle gets one gentle line with the reason, then "Back you go!". It shows a 🌊 card with the reason in words, a soft plip and a dim glow, with no fanfare and no book entry, and after 3.6 s (or a tap) it plops back into the water and swims off. Surprises from open water are always kept: boot, duck, treasure, Golden Fish and whale. In the 12-catch scripted runs, careful play kept 12/12 (14/14 in Lake). Random tapping kept 4/12 in each of Lake, Icy Sea and Reef.
- **Misses teach.** Each miss names the first clue it fails and says why:
  - "An octopus. Those are arms, not tentacles. Jellyfish have tentacles."
  - "A turtle. Its claws are tiny, for walking. Look for big pinching claws."
  - "A goldfish. That one is a fish! It has fins and gills."
  - "A crab. It breathes under water."

  Each "why" has 2–3 versions per animal, and none repeats within a trip until the others are used.
- **Fresh water has a real sort.** A **frog** (spots, not a fish, breathes air, with lungs and skin) and a **crayfish** (shell, pinching claws, not a fish, no bones) are added to Lake, River and Night. The book is now 17. Tier 2 there asks 4 different questions: not a fish (turtle, frog, crayfish), breathes air (turtle, frog), no bones (crayfish), and a fish (3 of 6). An idea clue that fits more than 60% of the kinds is never asked, so "a fish" with 3 of 4 is gone. The reef's swimmers now include its crab.
- **Tier 3 (7–8): two clues at once.** Each riddle pairs an idea with something you can see, either positive or negative: "an animal that is not a fish, but has spots" (frog), "an animal that breathes air and has a hard shell" (turtle), "a fish that has no spikes" (clownfish), "an animal with no bones that has no tentacles" (octopus, crab). A pair is offered only when each clue rules out a swimmer the other one allows, so both clues have to be used. Lake has 12 pairs, Icy Sea 9 and Reef 18. The chip shows both pictures, with a soft slash on a "not", and words such as "not fish + spots".
- **Slower rise, quick gentle drop.**
  - Moving up a tier takes 4 first-catch answers in a row, using at least 2 different clues.
  - Climbing back to a tier already reached takes only 2.
  - Any riddle that takes 4 catches steps down a tier at once, quietly.
  - Only the best tier is saved, and each trip starts one tier below it. A drop also lowers that best by one, so a younger sibling settles back down.
  - A careful scripted Lake trip reached tier 2 at catch 5 and tier 3 at catch 9.
- **Guess, then count (tier 2+).** Tapping the octopus or clownfish look glow first offers three still number buttons (6/8/10 or 2/3/4) with "How many arms? Guess first!". Then the child taps to count as before, and the total says "Just as you guessed!" or "Counting tells us for sure!". There is no clock and no wrong sound.
- **A gentler help for little ones.** After two misses the soft ring appears, as before. After four, the ringed animal drifts over in front of the boat.
- **Colours match the screen.**
  - Swimmers are drawn just after the water surface, with a light 14% watery tint, so the goldfish reads orange in the Lake (it was tan).
  - The whale and the narwhal are now `blue`, and the narwhal and octopus have `spots` (both models show them). The pufferfish is `yellow` and has `spots`.
  - The ice sheet is thinner (alpha 0.86 to 0.66), so the swimmers under it show.
- **Bugs fixed.**
  - At the ice holes the aim now comes from the tapped point, not from the snapped hole. The swimmer tapped is the one that comes: 20/20 tap-driven casts.
  - A tap on the boat with a swimmer just behind it now casts instead of poking Bear.
  - A swimmer that circles the bobber turns harder after 4 s and arrives by 9 s. In 65 screen-tap casts across Reef, Ice and Lake there was no missing bite (longest wait 7.3 s), and every swimmer tapped was the one that bit.
- **Calm.**
  - The look glow brightens once and holds (it was an infinite 3.2 s pulse).
  - The book button's bump is now scale 1.1 with no rotation (it was 1.35 with a −8° overshoot).
  - Riddles don't repeat within the last three.

### Changes

| File | What |
| --- | --- |
| `public/js/riddles.js` | Rewritten. `HAS` covers frog, crayfish and the colour/spot fixes. `TRAITS` gain `has`/`hasnt` phrases, plus `lead`/`short` for idea clues. `riddle()` builds one- or two-clue riddles (`clues`, `key`, `ask`, `word`, `icons`). `makeRiddle(kinds, tier, last, recent)` builds the tier-3 pairs, applies the 60% filter and skips recent riddles. `WHY` lists with `pick()` rotation, and `NEAR` misses. `verdict(r, id, name, said)` explains the first clue a catch fails |
| `public/js/main.js:307-314` | `castTo` aims from the tapped point |
| `main.js:459-466` | Approach safety (`w.coming`) |
| `main.js:594-660` | `startShow`: keep or put back, the reason line and card, fanfare only when kept |
| `main.js:713`, `:893-960` | `BACK_WAIT`, `finishShow` and `updateToBook` fly a put-back to the water and respawn it |
| `main.js:780-845` | `askGuess` and the guess check in `countAt` |
| `main.js:974-1030` | `newRiddle` (recent list), `drawRiddle` (one picture per clue), `answer` and `setTier` (best tier, start one below it, 4/2 to rise, drop after one slow riddle) |
| `main.js:1056` | The ringed swimmer comes closer after four tries |
| `main.js:1430` | Boat-tap fix |
| `public/js/creatures.js` | Frog and crayfish (lake 3/2.5, river 2.5/3.5, night 4/2.5; 2★). `AMBIENT` gives the fresh-water places six kinds and adds the reef crab. `vivid()` swaps in swimmer materials (renderOrder 1.5, `WATERY` tint) and swaps back on reel. Crayfish tail wag and frog/crayfish bob |
| `public/js/look.js`, `field-guide.js` | Frog features (back legs, skin) and crayfish features (claws, tail flip), plus their notes, with sources |
| `public/js/world.js:241` | Thinner ice |
| `public/js/book.js` | The crayfish faces the camera |
| `public/index.html` | `#guess` and 0/17 |
| `public/style.css` | `.guess`, `.card-catch.back`, multi-icon `.ri.not`, still look glow, softer bump, a ≤360 px chip size |
| `blender/models.py:789-880` | `creature_frog` (spotted, eyes on top, folded webbed back legs) and `creature_crayfish` (tail plates and fan on a `crayfish_tail` pivot, claws, feelers, eight legs). `assets.mjs fish-pond` (Blender 5.2.2, 8 threads) changed `creatures.glb` (719,168 to 875,168 bytes, 24,133 faces). The four shores kept their SHA-256. `world.glb` re-exported with different bytes although its builder is unchanged, so the committed file was restored |

### Evidence

- `EXAMPLES_ORIGIN=http://localhost:4213 node examples/_studio/tests/browser.mjs --ids fish-pond --run fish-pond-r2`: BOOT + PLAY ready, 0 errors. `node --check` passes on every `public/js` file.
- Speech-stubbed play (`scratchpad/polish/fish-pond/r2play.mjs`, `r2taps.mjs`, `r2count.mjs`, `tiers.mjs`) at 834×1194, 1194×834, 667×375 and 375×667: 0 console or page errors.

  | Run | Kept | Spoken lines |
  | --- | --- | --- |
  | Lake, careful, 14 catches | 14 | 33 |
  | Lake, random, 12 catches | 4 | 20 |
  | Reef, careful, 10 catches | 10 | 25 (tier 3 reached) |
  | Reef, random, 12 catches | 4 | 20 |
  | Icy Sea, careful, 12 catches | 12, aim 12/12 | 29 (tier 3 reached) |
  | Icy Sea, random, 12 catches | 4 | 20 |

  - Tiers: tier 3 reached gives best = 3, the next trip starts at tier 2, and one slow riddle drops to tier 1 with best = 2.
- Screenshots are in `scratchpad/polish/fish-pond/r2shots/`:
  - places: `p-place-lake` (orange goldfish, frog, crayfish), `p-place-ice`, `p-place-night` and `p-place-reef`
  - put-back: `l-reef-random-show-0`
  - guess and count: `p-c2-guess`, `p-c4-done` and `ph-c2-guess`
  - stage: `cray-c1-show` and `frog-c1-show`
  - book: `p-book` and `phone-book` (17 tiles)
  - riddle chip: `chip-*` (widest two-clue chip, 334 px at 375 wide)

  The Blender close-ups are `bl/closeup.png` and `bl/top.png`.

### Needs the coordinator

- `game.json` `howToPlay`: replace "can you find all 15?" with "can you find all 17?", and add "Bear asks for an animal (something with a shell, not a fish, or two clues for older players). Cast near one that fits: animals that fit go in your book, and the others are put back gently." Optionally set `learning` to "Observation, sorting animals (fish or not, breathing, bones), habitats and counting".
- Rebuild `public/bitgames.json`, since `creatures.glb`, `index.html`, `style.css` and several JS files changed.

### Remaining ideas

- Bear's riddle page in the book: one sticker per clue solved, with no count.
- Habitat clues ("lives in salty sea water") in a mixed sorting page. Within one place every swimmer shares the habitat, so these would not work as riddles.
- Counting crayfish legs (8 walking legs + 2 claws) as a tier-3 count.

## Round 3 (2026-10-11)

Review 1 of round 2 scored 7.9. It found four problems: colours that didn't match the screen (the red-orange crayfish was "not orange"), riddles about animals off screen, a smeared octopus face during counting, and too much talking (13 lines a minute with repeated facts). It also found that tier 2 plateaued. This round fixes the bugs and adds three deeper changes: tier 2 asks for **two different** animals, the fresh water has a **pond snail that hides under a lily pad**, and the voice is **paced**.

### Design

- **Colours match the screen.**
  - The crayfish is rebuilt olive brown, as wild crayfish are; they only turn red when cooked.
  - The crab is now `red`, from a new `red` clue, and is never asked for as orange. New near-miss lines explain this: "A crab is red. Look for orange." and "A crayfish is brown."
  - `tests/colours.mjs` weighs each catch's swimming materials by surface area, names the main colour, and checks it against `HAS` in both directions. 18/18 pass.
- **Riddles only ask about what's on screen.** `newRiddle` projects every swimmer and passes only the kinds in view to `makeRiddle`. It falls back to `AMBIENT` when fewer than 3 kinds are in view. In every logged trip on every screen, each riddle had at least one fitting swimmer in view.
- **Tier 2 sorts a group: "Find two different animals that breathe air."**
  - After the turtle, Bear asks "Who else breathes air?". The child then has to think of the frog or the snail.
  - The same kind again is put back gently: "Another turtle! Back you go. Who else breathes air?"
  - The chip shows one still slot per animal, which fills green, with no numbers.
  - Two-clue (tier 3) answers now say how they fit both clues: "Yes! A rainbow trout! It's a fish, and it has spots." This replaces a fish fact that kept repeating.
- **A pond snail lives under a lily pad (fresh water, 18th book tile).**
  - It is a ramshorn snail: shell, not a fish, breathes air, no bones.
  - One lily pad sits in plain view at the front of the water and stays still, even on the river. The snail creeps about under its edge, peeking out.
  - It widens the fresh-water sort. "No bones, no claws" is the snail and "breathes air and has a shell" is turtle or snail. "Not a fish, but has spots" is no longer always the frog.
  - The book's mystery tile says "Pond snails hide under lily pads", so knowing its habitat tells the child where to cast.
- **Riddles vary.** `makeRiddle` prefers riddles whose answers didn't solve the last three, and it leads with a different idea than the last riddle. A 12-riddle simulated reef run now mixes fish, not fish and no bones, where before it was "not a fish" five times.
- **The octopus is counted square on.**
  - The arms are rebuilt as a star around the lower half of the head: back arms high and wide, front arms hanging below. All eight tips are clear of the face and of each other.
  - On the stage the octopus faces the camera with no lean (it was -0.6), and it shows a little bigger.
  - `look.js` repeats the arm path for the count spots.
  - The NEW! badge hides while guessing or counting. Count dots are 40 px on phones.
- **The voice is thinner.**
  - One-feature animals rotate 2 facts. A look whose facts have all been heard this trip doesn't glow again.
  - After the first, glows on animals already in the book wait for a 40 s calm gap (`FACT_GAP`). New animals and a first count still glow.
  - "Look closer!" is said once a trip.
  - A second count of the same animal in a trip skips the guess and is silent: the numbers show with a tick and only the total is said.
  - "A blue fish is blue" becomes "Yes! A blue fish!".
- **Smaller fixes.**
  - The first-cast finger (new players only) and the idle finger point at a swimmer that fits the riddle, never at a fixed spot.
  - The chip's solved background is a plain colour (no fade from transparent on the night sky).
  - A swimmer you chose bobs the float 1–2 times before biting; a surprise bobs it 2–3 times.

### Changes

| File | What |
| --- | --- |
| `blender/models.py:661-690` | `creature_octopus` star arms, `OCTO_TIPS`, `octo_arm_ends()` |
| `blender/models.py:850-856` | crayfish olive brown |
| `blender/models.py:894` | `creature_snail` (coiled tube shell with a pale band, grey foot, feelers) |
| `public/models/creatures.glb` | rebuilt with `node examples/_studio/assets.mjs fish-pond` (Blender 5.2.2, 8 threads): 959,224 bytes. The shores and `world.glb` are unchanged |
| `public/js/riddles.js` | `red` clue; crab `red`, snail; `ask2`/`more`/`is` on the idea clues; `twoOf()` and `more()`; `fits` excludes kinds already found; `makeRiddle(..., answered)` with the turn and fresh-answer filters (`:205-218`); two-clue verdicts (`:246`); new near misses and WHY lines |
| `public/js/main.js` | `visibleKinds` `:1120`, `placeSnailPad` `:1136`, snail in `spawnAmbient` `:1157`, `newRiddle` `:1001` (seen kinds, `twoOf`), `answer` `:1047` (misses, found, returns solved), `startShow` (`again`, `FACT_GAP` glow rule), `lookFact`/`takeFact` `:760`, quiet repeat counts `:807`/`:881`, square-on octopus `:692`, finger `:1359`, nibbles `:351` |
| `public/js/look.js` | `facts` lists and `factsOf`; snail shell/feelers; `octoArms` mirrors the builder |
| `public/js/creatures.js` | snail entry (2★; lake 2.5, river 2, night 2.5) and `AMBIENT`; `homeR` |
| `public/js/world.js:609` | the anchored pad doesn't drift |
| `public/js/book.js` | `HIDES` hint for the snail |
| `public/js/field-guide.js` | snail note and source |
| `public/index.html` | 0/18 |
| `public/style.css` | still `.riddle.solved` colour, `.slots`, 40 px phone count dots |
| `tests/colours.mjs` | colour-truth check |

### Evidence

- `EXAMPLES_ORIGIN=http://localhost:4213 node examples/_studio/tests/browser.mjs --ids fish-pond --run fish-pond-r3`: BOOT + PLAY ready, 0 errors.
- `node --check` passes on every `public/js` file.
- `EXAMPLES_ORIGIN=… node examples/fish-pond/tests/colours.mjs`: 18 ok.
- Real mouse-click trips with speech stubbed (`scratchpad/polish/fish-pond/r3/play.mjs`). Every one had 0 console or page errors.

  | Trip | Screen | Kept / catches | Lines / min | Tier reached |
  | --- | --- | --- | --- | --- |
  | Lake, careful, new player | 834×1194 | 14/14 | 10.0 | 3 |
  | Lake, careful, returning player | 834×1194 | 14/14 | 10.2 | 3 |
  | Night, careful | 375×667 | 12/12 | 10.7 | 3 |
  | Icy Sea, careful | 834×1194 | 12/12 | 10.7 | 3 |
  | River, careful | 1194×834 | 12/12 | 10.5 | 2 |
  | Reef, careful, returning player, two first counts | 1194×834 | 14/14 | 13.3 | 3 |
  | Lake, random | 834×1194 | 3/12 | 6.5 | 1 |
  | Lake, random | 1194×834 | 3/12 | 6.4 | 1 |
  | Night, random | 834×1194 | 4/12 | 6.6 | 1 |
  | Reef, random | 375×667 | 2/12 | 6.3 | 1 |
  | Icy Sea, random | 834×1194 | 4/12 | 6.7 | 1 |

  - The harness runs about 14 s a catch, faster than a child, so real play has fewer lines a minute.
  - The 13.3 on the reef includes two counts the child chose to do, with every number spoken.
- A second octopus count in one trip had no guess and spoke one line: "Eight arms! If an octopus loses an arm, a new one grows back."
- Screenshots are in `scratchpad/polish/fish-pond/r3/shots/`:
  - octopus counting: `p-octopus0-3dots` and `-4done`, `l-octopus0-4done`, `ph-octopus0-4done`
  - find two: `p-two-2-onefound` (chip ●○) and `p-two-3-again`
  - the snail under its pad: `p2-night`, `l-two-0-finger` (finger on the goldfish for "orange")
  - the snail on the stage: `ph-night-careful-show-2`
  - the book with 18 tiles: `ph-book`

  The Blender close-up is `r3/octo.png`.

### Needs the coordinator

- `game.json` `howToPlay`: say "can you find all 18?". Optionally add "Older players: Bear asks for two different animals, or gives two clues."
- Rebuild `public/bitgames.json`, since `creatures.glb`, `index.html`, `style.css` and several JS files changed.

### Remaining ideas

- A tier-2/3 "Bear's sorting" page in the book: drag kept catches into fresh water, sea or rubbish.
- An octopus den on the reef, like the snail's pad, so it can hide by the rocks.
- Counting crayfish legs (8 + 2 claws) as a tier-3 count.

## Round 4 (2026-10-11)

Review 1 of round 3 scored 8.4. Calm, focus and learning held up. The weakest areas were fun depth (7.7) and voice (7.9). The reviewer found that struggling children heard the same miss line word for word, that a stray tap on the look glow trapped a child in a count for 20 s, and that random casts into open water still won the rarest tiles. Other findings: swimmers bunched up so a tap could pick the wrong animal, every catch was followed by a spoken "Next riddle", habitat knowledge was never a decision, and there was no planning layer for 6–8 year olds. This round fixes all of these and adds **Bear's list**.

### Design

- **Bear's list: a planning layer that uses habitats (tier 3, ages 6–8).**
  - A child who has reached two-clue riddles gets a list of three animals to find, saved between visits. It shows on the title as still picture chips, for example "🦷 tusk", "🫧🐚 air + shell" and "🦓 stripes". Tapping it reads the list and asks "Which water do they live in?".
  - The list never says where an animal lives. Each item lives in only one kind of water, and at least one is in fresh water and one in the sea. The child must choose the place on the title from what they know: a tusk is the Icy Sea, white stripes are the Coral Reef, air plus a shell is the turtle or snail in fresh water.
  - In a place where an item lives, the item becomes every other riddle, with 📜 on the chip and a warm chip colour. Finding one ticks it (✅) and Bear says "One for Bear's list!".
  - Fishing where nothing on the list lives gets one quiet line: "Nothing on Bear's list lives here."
  - A finished list gets one thank-you and a calm card. A new list appears next time on the title.
  - The list rules: no two items can be answered by the same animal, and in a two-clue item each clue must rule someone out wherever it is found (`riddles.js makeList`).
- **Miss lines rotate, then go quiet.**
  - Each near miss has two wordings. Plain misses get three ("No spots." / "No spots. Bear wants something with spots." / "Look for something with spots."). Idea misses have their own lists ("It breathes with gills, under water.").
  - All are picked with a `pick()` that cycles and never says the same line twice in a row.
  - Short reason only: when the same animal misses the same clue twice in a row, or from the third miss on one riddle, Bear says just the short reason ("No pinching claws.").
  - From the fifth miss, Bear says nothing: a soft plip, the card's words, and the help ring with the animal drifting close.
- **No stray-glow trap.** A guess or count that gets no first tap ends gently after 7 s (12 s once counting has started). Two taps away from the count dots, or any two taps while guessing, carry on fishing. Space always carries on; Enter or L still counts.
- **Open water follows the riddle.**
  - The golden fish and the whale are put back when they don't fit: "Wow! A golden fish! No spots. Back you go!". Only the jokes (boot, rubber duck, treasure) are always kept.
  - The deep leans 3× toward a surprise that fits the riddle, so the rare tiles come from thinking. For example, a golden fish turns up for "a fish" and the whale for "breathes air".
- **Picking is on the swimmer you touch.**
  - `pickAt` chooses on the screen, by each swimmer's own drawn size. Before, picking used where the tap met the water plane, and that point is about 1.5 units nearer the boat than a swimmer below the surface.
  - A still warm ring sits under the chosen swimmer while the line flies and it swims over.
  - Swimmers choose wander targets clear of each other and nudge apart within 2.2 units.
- **Quieter riddles.** After the first riddle of a trip, a new riddle is shown on the chip without being read: the chip settles in once (no pulse). Bear reads it only after 6 s with no cast, on a chip tap, for a riddle from the list, or for a new kind of riddle (tier change).
- **Tier 2 asks less "a fish".** It is the easiest idea, so 75% of tier-2 riddles prefer breathes air, no bones, or not a fish.
- **Calmer bite and glow.**
  - The bobber, rod and biter sway at 7–9 rad/s with smaller amplitudes (was 20–31 rad/s).
  - A got-away is a ripple and a few bubbles. The 😝/😜 teasing emoji and the giggle are gone.
  - The look glow has a warm amber ring and a 42 px magnifier badge, so it shows on pale fins.

### Changes

| File | What |
| --- | --- |
| `public/js/riddles.js:115-135` | `NEAR` as arrays, `NOT_IDEA` |
| `public/js/riddles.js:228` | tier 2 leans away from "fish" |
| `public/js/riddles.js:236-285` | `makeList`, `listRiddle`, `answersHere` |
| `public/js/riddles.js:289` | cycling `pick` |
| `public/js/riddles.js:325-348` | miss verdicts with the repeat and short forms, `missReason` |
| `public/js/creatures.js:68` | `roll(..., boost)` |
| `public/js/creatures.js` `pickTarget` | targets spaced apart |
| `public/js/creatures.js:305-315` | `SPACE` nudge |
| `public/js/main.js:320` | `castTo(point, chosen)` |
| `public/js/main.js:360` | open-water boost |
| `public/js/main.js:436` | `pickAt` |
| `public/js/main.js:474` | calm got-away |
| `public/js/main.js:632` | `JOKES` and the keep rule |
| `public/js/main.js:680` | silent misses after four |
| `public/js/main.js:770` | `IDLE_COUNT` timeouts in `updateShow` |
| `public/js/main.js:1073-1140` | `newRiddle` with list items, `sayRiddle`, `tickList`, `ensureList`, `renderList` |
| `public/js/main.js:1266` | `updatePickRing` |
| `public/js/main.js:1449` | slower bite sway |
| `public/js/main.js:1682` | stray taps end a count |
| `public/js/main.js:1860` | quiet-riddle timer |
| `public/index.html` | `#bear-list` on the title |
| `public/style.css` | `.look` amber ring and badge, `.riddle.fresh`, `.riddle.list`, `.bear-list` |
| `game.json` | `howToPlay` covers riddles, 18 tiles and Bear's list |

### Evidence

- `EXAMPLES_ORIGIN=http://localhost:4213 node examples/_studio/tests/browser.mjs --ids fish-pond --run fish-pond-r4`: BOOT + PLAY ready, 0 errors (run twice).
- `node --check` passes on every `public/js` file. `tests/colours.mjs`: all ok.
- Mouse-click trips in Playwright Chromium (`--use-angle=gl`) with speech stubbed, using `scratchpad/polish/fish-pond/r4/play.mjs`. The harness taps each swimmer's body. Every trip had 0 console or page errors.

  | Trip | Screen | Kept / catches | Lines / min | Tier reached | Tapped animal came |
  | --- | --- | --- | --- | --- | --- |
  | Lake, careful | 834×1194 | 14/14 | 8.4 | 3 | 14/14 |
  | Lake, careful | 834×1194 | 12/12 | 8.6 | 3 | 12/12 |
  | Night, careful, with a list | 1194×834 | 12/12 | 8.2 | 3 | 12/12 |
  | Icy Sea, careful | 1194×834 | 12/12 | 8.8 | 3 | 12/12 |
  | Reef, careful, with a list, two counts | 1194×834 | 12/12 | 12.1 | 3 | 12/12 |
  | Lake, random | 834×1194 | 2/16 | 5.3 | 1 | 14/14 |
  | Lake, random | 375×667 | 5/14 | 5.3 | 1 | 11/11 |
  | Night, random | 834×1194 | 8/18 | 4.9 | 1 | 15/15 |
  | Reef, random | 834×1194 | 4/14 | 5.3 | 1 | 13/13 |
  | Icy Sea, random | 834×1194 | 5/14 | 5.1 | 1 | 11/11 |

  Before this round, careful trips ran at 10–13 lines a minute.
- Targeted checks, using `r4/checks.mjs` and `r4/listdone.mjs`:
  - Body taps with ±15 px finger jitter picked the right swimmer 7/7 times. The gap to the nearest lake swimmer was 1.6–3.7 units (it dipped to 1.05 at worst).
  - A forced golden fish under "something with spots" went back, with "Wow! A golden fish! No spots. Back you go!" on the voice and "No spots." on the card. The book stayed at 0.
  - A tap on the clownfish glow at tier 3 opened the guess; with no further tap the catch carried on after 7 s. An octopus count at tier 1 ended after two taps elsewhere.
  - Bear's list end to end:
    - The title list shows at 834×1194, 1194×834, 375×667 and 667×375 with no overflow.
    - Starting at the lake with a tusk/stripes list said "Nothing on Bear's list lives here."
    - At the reef, "From Bear's list: something with eight arms." was answered, then "That's everything on Bear's list. Thank you!" with the 📜 card. A new three-item list was on the title when the child went home.
  - In random trips, repeated misses shorten to "No tentacles." and go silent after the fourth. No miss line is repeated word for word in full.

### Remaining ideas

- A book sorting page (fresh water / sea / not an animal) where tiles are dragged into place.
- An octopus den on the reef, like the snail's pad.
- Counting crayfish legs (8 + 2 claws) as a tier-3 count.

## Round 5 (2026-10-11)

The open audit item was the book's sorting page (fresh water, sea or rubbish). The last review (8.5) also flagged collection pressure (stars and a progress bar in the book) and the crayfish running off a portrait stage. This round closes the audit item and fixes those two.

### Design

- **The book has a sorting page: "Where does each one live?"**
  - The book head has two tabs: 📖 pictures (with the found count) and 🏞️🌊🧸 sorting. The sorting tab appears once something is in the book.
  - Kept catches wait in a tray. Three baskets sit below it (beside it on short landscape screens): 🏞️ **Fresh water** with ☀️🌅🌙, 🌊 **Sea** with ❄️🐠, and 🧸 **Not real** with 🥾🦆. Each basket shows the places that belong to it, so where the child fished links to the kind of water.
  - Tap a catch (it lifts with a still amber ring, and its name is said), then tap a basket. Dragging a catch onto a basket also works. A basket tapped with nothing picked says what belongs in it.
  - "Not real" holds the toys, rubbish and treasure and the two made-up fish (Blue Fish, Golden Fish), which their field notes already call pretend. So the page teaches real versus pretend as well as fresh versus salty.
  - Right: a soft plop, the catch moves into its basket, and one reason ("Yes! Crabs live in the sea.", "Yes! A boot is rubbish."). Sorting is saved (`fish-pond-sorted`), and new catches arrive in the tray later. When the tray is empty there is one "Everyone is in the right place." and a still 🐻👍.
  - Wrong: bubbles, and the catch stays in the tray, still picked. Tier 1 hears the answer ("Frogs live in fresh water.") and the right basket gets a still amber ring. From tier 2 the first wrong try gives something to think with: "You catch frogs at the sunny lake, the sunset river and the night pond." or "Is Blue Fish a real animal?". A second wrong try gives the answer and the ring. The same words are never spoken twice in a row; a repeat stays on the page only. So careful sorting is quiet and quick, and random tapping gets reasons rather than progress.
  - The question is asked once per visit to the page. Pictures, words and baskets carry the rest.
- **Less collection pressure.** Book tiles lose their 1–3 star ratings and star tints, the rainbow progress bar is gone, and the catch card no longer shows stars (a put-back still shows 🌊). The rare-catch fanfare is unchanged.
- **Crayfish on a portrait stage.** `showSize()` shows the crayfish at 1.05 in portrait (1.3 in landscape), so its feelers stay on screen. It is checked on every catch, so rotating the device updates it.

### Changes

| File | What |
| --- | --- |
| `public/js/book.js:9-55` | `BASKETS`, `PLACE_WORDS`, `PRETEND`, `REAL_Q`, `MANY`, `homeOf()`, saved `fish-pond-sorted` |
| `public/js/book.js:221-247` | `setPage` (two pages, the question once a visit), `unsorted` |
| `public/js/book.js:249-331` | `buildBaskets`, `renderSort`, `marks` (picked tile, tier-aware basket ring), `pick` |
| `public/js/book.js:333-376` | `dragOn`: tap-tap or drag with a ghost picture; keyboard select |
| `public/js/book.js:378-430` | `drop`, `why`, `clue` (tier 1 the answer; tier 2+ a clue first) |
| `public/js/book.js` `render` | no tile stars; no progress bar; sorting tab hidden while the book is empty |
| `public/index.html` | `.book-tabs` replaces the title and `.book-bar`; `.sort-page` with `.sort-tray` and `.sort-baskets` |
| `public/style.css:110, 181-220, 253-260` | `.cstars:empty`; tabs, tray, tiles, ghost, baskets and the short-landscape row layout; the star tile rules are removed |
| `public/js/main.js:630` | `showSize()` (portrait crayfish 1.05) |
| `public/js/main.js:674` | the catch card shows no stars |
| `public/js/main.js` `new Book` | `getTier` (the trip tier when playing, the best tier on the title) |
| `game.json` | `howToPlay` covers the sorting page; `learning` adds real or pretend |

### Evidence

- `EXAMPLES_ORIGIN=http://localhost:4213 node examples/_studio/tests/browser.mjs --ids fish-pond --run fish-pond-c1`: BOOT + PLAY ready, 0 errors.
- `node --check` passes on `book.js` and `main.js`.
- `scratchpad/polish/fish-pond/r5/sort.mjs` (Playwright Chromium `--use-angle=gl`, speech stubbed, real mouse clicks and a real mouse drag) ran at 834×1194 (tier 1), 1194×834 (tier 3), 375×667 (tier 2) and 667×375 (tier 1). Each run had 0 errors and no horizontal overflow, and all 8 catches were saved as sorted.
  - At tier 1, a wrong frog said "Not there. Frogs live in fresh water." and ringed Fresh water. A second wrong try was silent.
  - At tier 3, the first wrong try said "Not there. You catch frogs at the sunny lake, the sunset river and the night pond.", then gave the answer.
  - The boot was dragged into Not real ("Yes! A boot is rubbish."). The last catch said "Yes! Jellyfish live in the sea. Everyone is in the right place."
- `r5/homes.mjs`: every one of the 18 catches has the right home. Fresh water: goldfish, trout, turtle, frog, crayfish, snail. Sea: clownfish, pufferfish, crab, octopus, jellyfish, narwhal, whale. Not real: Blue Fish, Golden Fish, duck, boot, chest.
- A careful lake trip (`r4/play.mjs`, 834×1194) had 0 errors. `r5/cray.mjs` shows the crayfish whole on the portrait stage (`p-cray.png`) and in landscape (`l-cray.png`).
- Screenshots are in `scratchpad/polish/fish-pond/r5/`: `*-book.png`, `*-sort-0.png`, `*-sort-wrong.png`, `*-sort-drag.png` and `*-sort-done.png` for p, l, s and sl.

### Checklist

- Book sorting page (fresh water, sea or rubbish): **done**.

### Remaining ideas

- Deeper tier 3 (a 6th Icy Sea swimmer, single-answer variety), and Bear's list items that are never single look clues (review ranks 1–2).
- Look closer that matches the riddle's clue, and a snail that stays by its pad (review ranks 5–6).
- An octopus den on the reef; counting crayfish legs at tier 3.

## Round 6 (2026-10-11)

Review 1 scored 8.4 (fun depth 7.9, voice 8.2). No checklist items were open. This round fixes the four bugs it found and works through ranked improvements 1–10.

### Design

- **What you see is what Bear means.**
  - The octopus no longer counts as spotted (`HAS.octopus`), and its pale back spots are gone from the model. Before, a "spots" riddle could be answered by an octopus that looked plain.
  - The narwhal's mottling is now 16 larger, darker blotches, so you can see them on a small swimmer.
  - A turtle caught for "spots" now gets a near-miss line that matches what the child sees: "Those are shell plates, not spots."
- **A fuller Icy Sea.** Two animals join it:
  - The **Arctic cod**, a real fish of the icy sea (the polar cod narwhals eat). It has a brown back with dark spots, a silver belly, a chin whisker and three back fins.
  - The octopus (octopuses live in every ocean).
  - The Icy Sea now has cod, Blue Fish, narwhal, jellyfish, crab and octopus. "A fish", "no bones", "eight arms" and "spots" are now real choices there: cod vs Blue Fish, octopus/jellyfish/crab, narwhal vs cod.
  - Look closer on the cod counts its **three back fins** (tier 2+ guesses first) or explains its chin whisker.
  - The book has 19 tiles, and the cod sorts into the Sea basket.
- **The same answer never comes twice running.** `makeRiddle` leaves out riddles that the last answering animal could answer again. A Bear's list item is skipped when only that animal could answer it. List answers already go into `game.answered`, so an octopus no longer answers three riddles in a row. The recent-riddle window is now 5 (was 3), and the answered window is 4.
- **Bear's list stays a two-clue list.** For each water, `makeList` takes an idea item or a two-clue item first. It uses a single look ("tentacles") only when nothing else fits. In 500 simulated lists (1,500 items), no item was a single look.
- **Each short miss line is said once per riddle.** The short reason ("It isn't blue.") is spoken the first time. After that the card shows it and the miss makes a soft plip with no voice (`r.mute`). A golden fish or whale miss still says its "Wow!", without repeating the reason.
- **"Not a fish" misses no longer repeat themselves.** Reasons that only say "not a fish" again are filtered out. "That's not a fish! An octopus is not a fish." is now "That's not a fish! An octopus crawls on its arms."
- **Sorting is harder to win by trying every basket (tier 2+).**
  - A first wrong try still gives a clue.
  - A second wrong try moves the catch to the end of the tray ("Not there. We'll come back to the frog."), so the child sorts the others first.
  - The answer and the ringed basket come only on a wrong try after the child comes back to it.
  - Tier 1 is unchanged: the answer and ring come on the first wrong try.
- **Calmer layout.**
  - Sorting baskets are capped at `clamp(150px, 22vh, 220px)`, down from about 300 px of mostly empty space in portrait. The tray takes the rest. Short landscape still uses the row layout.
  - The hint finger taps 3 times each time it appears, then rests. It used to loop forever.
- Names in sentences keep "Arctic" capitalised: "Yes! An Arctic cod!" (`lower()`).

### Changes

| File | What |
| --- | --- |
| `public/js/riddles.js:48-50` | octopus without spots; `cod: ['spots', 'fish']` |
| `public/js/riddles.js:125` | NEAR `spots:turtle` |
| `public/js/riddles.js:228-231` | prefer riddles the last answerer can't answer |
| `public/js/riddles.js:276-286` | `makeList`: an idea or two-clue item before a single look |
| `public/js/riddles.js:318` | `lower()` (exported) |
| `public/js/riddles.js` `verdict` | `r.mute` once-per-riddle short reasons; "not a fish" reasons filtered |
| `public/js/main.js:682-683` | hush when `r.mute` |
| `public/js/main.js:1081-1083` | list item skipped when only the last answerer fits |
| `public/js/main.js:1093, 1200` | recent 5, answered 4 |
| `public/js/book.js:77-78, 291, 409-420, 440-444` | `aside` and `told`: twice-wrong tiles wait at the end of the tray; ring only once the answer was said |
| `public/js/creatures.js:57, 66` | `cod` (ice 8); octopus `ice: 2.5`; Blue Fish ice 9→5; ice ambient of six |
| `public/js/look.js:132` | cod: count 3 back fins; chin whisker fact |
| `public/js/field-guide.js:40`, `book.js:41` | cod note; "Arctic cod" plural; octopus note says warm and icy seas |
| `public/style.css:167, 207, 258` | finger `3 forwards`; basket cap; short-landscape `height: auto` |
| `public/index.html`, `game.json` | 0/19, "find all 19" |
| `blender/models.py:632-640, 748-760, 778-805` | octopus spots removed; narwhal blotches; `creature_cod` |
| `public/models/creatures.glb` | rebuilt with `node examples/_studio/assets.mjs fish-pond` (only this GLB changed) |

### Evidence

All scripts and screenshots are in `scratchpad/polish/fish-pond/r6/`.

- **Browser harness.** `EXAMPLES_ORIGIN=http://localhost:4213 node examples/_studio/tests/browser.mjs --ids fish-pond --run fish-pond-c2` reported BOOT + PLAY ready with 0 errors. `node --check` passes on every file in `public/js`.
- **Model renders.**
  - `close.png` is a Blender close render of the cod, narwhal, octopus and turtle. The cod's spots and three fins read clearly, the narwhal's blotches show, and the octopus is plain.
  - `p-ice-careful-show-3.png` shows the narwhal on stage with visible spots. `-show-6.png` shows the cod on stage.
- **Playwright trips** (`play.mjs`, Chromium `--use-angle=gl`, speech stubbed; all with 0 errors):
  - **Icy Sea, careful, tier 3, 1194×834:** 14 of 14 riddles answered with the first catch. The cod and the octopus both answered riddles, and Bear's list ticked twice. "Yes! An Arctic cod! It's a fish, and it is not blue." The cod count went "1 2 3, Three back fins! Just as you guessed!"
  - **Icy Sea, careful, portrait:** tier 1 to tier 2 to tier 3 in one trip. The cod answered "two different kinds of fish" alongside Blue Fish.
  - **Lake, random:** "A turtle. Those are shell plates, not spots." "It isn't orange." was said once; the next three misses were silent.
  - **Night, random:** "It isn't blue." was said once, then the card only.
  - **Reef, random:** "That's not a fish!" no longer repeats itself.
  - In none of the four trips was a miss line spoken twice on one riddle.
- **Simulation** (`sim.mjs`, 40 riddles per place and tier, random answerer): the same animal answered two riddles in a row 0 times in all nine place/tier runs.
- **Sorting** (`sort.mjs`, real clicks and drag):
  - Tier 1, 834×1194: the first wrong try said "Not there. Frogs live in fresh water." and ringed Fresh water.
  - Tiers 2–3 at 1194×834, 375×667 and 667×375: the clue came first. The second wrong try said "Not there. We'll come back to the frog.", moved the frog to the end of the tray, unpicked it and showed no ring. The answer and ring came only on the next wrong try.
  - Every run sorted all 10 catches, had no horizontal overflow and 0 errors.
  - The baskets are 220 px tall in portrait (`p2-sort-almost.png`).

### Checklist

- No audit items were open. Review bugs 1–4: **fixed**. Ranked improvements 1–10: **done**.

### Remaining ideas

- An octopus den on the reef. Counting crayfish legs at tier 3.
- An Icy Sea "under the ice" spot where the cod gathers, so knowing its habit tells you where to cast.

## 2026-10-11 — Round 7 (review: 8.4)

Review 1 scored 8.4 (fun depth 8.1, voice 8.4). No checklist items were open. This round fixes all five bugs and works through ranked improvements 1–8.

### Design

- **Blue Fish is pretend everywhere.** Before, the riddles called it a real fish with gills, while the sorting page called it a pretend friend. Now Blue Fish and Golden Fish answer only what you can see (blue, yellow), and never an idea clue. Catching one for "a fish", "not a fish" or "breathes air" says the same thing as the sorting page: "Blue Fish is a pretend friend. Bear wants a real animal." So at tier 2, "a fish" is a real choice between real and pretend. Its side-fin fact now begins "Blue Fish is pretend, but real fish have side fins like these."
- **No whole sentence twice in a trip.** `pick()` no longer starts a list over within a trip. Once its lines are used it returns nothing, and the line gets shorter: "Yes! A goldfish!" or "A goldfish. Back you go!" (the card still shows the reason). `once()` covers each part of a line on its own: the two-clue "It's a fish, and it has no spots.", "Yes! A goldfish is orange!", "Who else breathes air?" and "Can you find a different fish?". A short miss reason is said once per trip, and saying it inside the first miss line counts. A riddle that comes round again is shown on the chip but not read aloud; tapping the chip still reads it.
- **No double negatives.** A "not" idea (not a fish, no bones) is only paired with something the animal has (`plainNegs`), in riddles and on Bear's list. "An animal that is not a fish, and has no spots" can no longer be asked; "not a fish, but has spots" still can.
- **A step past two clues (tier "4").**
  - After three two-clue riddles in a row are answered with the first catch, about half of the next riddles ask for *two different animals that fit both clues*, such as "two different animals that breathe air and have a hard shell" (turtle and snail). The chip shows two slots.
  - Every catch is checked against both clues. The usual recent-riddle and last-answerer rules still apply.
  - One slow riddle empties the streak and ends the run. Where fewer than three two-clue riddles fit (the Icy Sea has one real fish now), idea riddles join the pool, so the narwhal is not the answer every time.
- **Count to 3 happens once per trip.** After three kept catches it says its reward once with a plain card (🐟 "1, 2, 3!", no trophy, chord or golden glow) and then rests. The next trip starts a new count. The goal row shows three fish pictures that light up as they are counted, with no "n / 3" and no ⭐ (`renderProgress`).
- **The sorting page comes back each trip.** Sorted catches are kept only for the current trip (`book.newTrip()` in `start()`), and the old saved key is removed. The first time the sort page opens in a trip, it asks its question again.
- **Less collection pressure.** The ×2/×3 tile badges and the n/19 badge on the in-play book button are gone. The title and the book page still show n / 19.
- **Crayfish claws.** On the stage the crayfish now turns a little side-on (−0.6 rad, was −1.05). Before, its near claw pointed straight at the camera and looked like part of the head. The glow point moves to the claw's pincers. In landscape it is shown at 1.15 (was 1.3), so it covers less of Bear.

### Changes

| File | What |
| --- | --- |
| `public/js/riddles.js:36-40` | `bluefish: ['blue']`, `goldenfish: ['yellow']` |
| `public/js/riddles.js:146` | `PRETEND` miss reasons |
| `public/js/riddles.js:159` | `twoOf` makes plural two-clue pairs (`lead2`, "are/have/do"), with its own `more` line |
| `public/js/riddles.js:204, 235, 270` | `plainNegs`; idea riddles join a thin tier-3 pool; `{ two }` prefers pairs not asked lately |
| `public/js/riddles.js:334-346` | `pick` never starts a list over; `once()` |
| `public/js/riddles.js:357-430` | `verdict`: trip-level dedupe, `r.reason` for the card, pretend misses, `both()` |
| `public/js/main.js:270-285` | calm one-time count card; `renderProgress` with no tally |
| `public/js/main.js:1053` | removed the restart after a completed count |
| `public/js/main.js:1095-1102` | `deep` gives `twoOf(...)` tier 4 |
| `public/js/main.js:1117-1122` | `sayRiddle` reads each riddle sentence once per trip |
| `public/js/main.js:697` | the card uses `r.reason` |
| `public/js/main.js:639, 752` | crayfish show size and side-on pose |
| `public/js/main.js:1478, 1593` | no HUD count; `book.newTrip()` |
| `public/js/book.js:49, 166, 205` | per-trip sorting; no ×n badge; `newTrip()` |
| `public/js/look.js:74, 124` | Blue Fish fin fact; claws point `[0.64, -0.3, 0.02]` |
| `public/index.html`, `public/style.css` | `#count` badge and `.badge-count` / `.tile-count` CSS removed |
| `game.json` | howToPlay describes real fish, two-animal pairs and sorting each trip |

### Evidence

All scripts and screenshots are in `scratchpad/polish/fish-pond/r7/`. Chromium was run with `--use-angle=gl` and speech was stubbed.

- **Harness.** `browser.mjs --ids fish-pond --run fish-pond-c3` gave BOOT + PLAY ready with 0 errors. `node --check` passes on every file in `public/js`.
- **Riddle simulation** (`sim2.mjs`, 60 tier-3 riddles per place):
  - 0 double negatives.
  - The Icy Sea mixes two-clue and idea riddles.
  - In the lake's pair mode, 2 pair riddles share the pool with 6 single-answer riddles.
- **Trips** (`play.mjs`, 0 console errors in all six):
  - **Lake, careful, 1194×834:** 16/16 answered with the first catch. "Two different animals that breathe air and have no spots" came up, and snail then turtle answered it. The only repeated sentences were short forms ("Yes! A turtle!" ×3).
  - **Icy Sea, careful, 834×1194:** 14/14 answered. The only repeats were short forms and the count numbers.
  - **Reef, careful:** 12/12.
  - **Lake and Icy Sea, random:** "A blue fish. Blue Fish is a pretend friend. Bear wants a real animal." No sentence was repeated.
  - **Night, random:** no sentence was repeated.
- **Count to 3** (`mission.mjs`, 6 kept catches): the reward was said once and the goal stayed at 3 lit fish. There was no restart and no ⭐.
- **Sorting** (`sort2.mjs`, both orientations):
  - 6 in the tray, then 4 after sorting two.
  - A new trip brought back all 6 and asked the question again.
  - `fish-pond-sorted` was gone, with 0 tile badges and no HUD badge.
- **Crayfish** (`cray.mjs`): `p-crayfish-1.5.png` and `l-crayfish-1.5.png` show the glow on the near claw's pincers, side-on.
- **Chip** (`p-chip4-crop.png`): 🫧 + slashed ⚫, two slots, "air + no spots".

### Checklist

- No audit items were open.
- Review bugs 1–5: **fixed**.
- Ranked improvements 1–8: **done**. For 4, pairs were chosen over a counted or habitat clue.

### Remaining ideas

- The reef cannot make two-clue pairs: its only non-fish are the octopus, jellyfish and crab, and each one-look clue fits only one of them. A reef hermit crab or sea star would allow "no bones and has a shell".
- A "which place?" sorting round (☀️🌅🌙❄️🐠) for tier 3.

## 2026-10-11 — Round 8 (review: 8.2)

Review 1 scored 8.2 (fun depth 7.8, polish 8.0). No checklist items were open. This round fixes all six bugs and works through ranked improvements 1–7.

### Design

- **A ringed seal joins the Icy Sea** (improvement 2). Before, "a fish" there was only the cod and "breathes air" only the narwhal, so tier 3 fell back to one-idea riddles. The seal is the small seal of the Arctic (the shore already had seals resting on it).
  - It is grey with dark spots in pale rings, is not a fish, and breathes air. It is grey, never blue, so "something blue" is still only the narwhal.
  - Two clues now tell the narwhal and seal apart: "breathes air and has no tusk", "breathes air and is blue", "breathes air and is not blue". "Not a fish, but has spots" has two answers, so it works for a find-two.
  - The model is built in Blender (`creature_seal`). The shore seals were recoloured to the same silver grey.
  - Look-closer has three entries: spots ("Each dark spot has a pale ring round it…"), whiskers, and flippers (it keeps a breathing hole open in the ice with its claws).
  - The book now has 20 animals.
- **"No bones and no shell"** (improvement 1). `nobones` may take one "no" look, the shell, because it is one easy phrase and holds the idea: a crab has no bones but wears its shell outside. On the reef and the Icy Sea this two-clue riddle is answered by the octopus or the jellyfish, so the invertebrates answer tier-3 riddles again. As a find-two it reads "two different animals with no bones and no shell". The rule against double negatives still blocks "not a fish, and has no spots".
- **No learnable answer pattern** (improvement 1):
  - `makeRiddle` now chooses who answers first, then a riddle for them, so a place with five fish riddles and one octopus riddle still gives each answer a fair share.
  - At tier 3 the "different answer / different idea / not the last animal" rules apply 60% of the time. Two clues have to be read every time, so the same answer twice running is fine there.
  - The recent-riddle window keeps at least two choices open, so a small pool never falls into a fixed order.
  - Riddles still on Bear's list are kept out by a separate `avoid` list. Before, a short recent window could drop them, and "no bones and no shell" was asked straight after the same list item.
- **The look-closer glow confirms the clue** (improvement 3). A catch that answered a riddle glows on the part the child reasoned with: trout and spots, seal and spots, crab and shell, jellyfish and no bones (tentacles), turtle and shell. If that part has no fact left this trip, the glow moves to the next feature as before. The clue's glow skips the 40 s fact gap, but only while it has an unheard fact.
- **Counting holds still and never ends silently** (improvement 4):
  - The sway, bob and tail wag ease to zero while guessing or counting.
  - A tap counts the nearest uncounted dot within 64 px, so a tap between two clownfish stripes 60 px apart counts one instead of nothing.
  - After 10 s idle with some counted, Bear says, once, "One! Two more stripes to find." After a further 8 s it says "Three stripes in all." and the show ends.
- **Every new two-clue riddle is read out once** (improvement 6), even when the child casts fast. The slashed icons are hard for a six-year-old to decode. A riddle that comes round again is still only shown.
- **A little one stuck on one riddle** (improvement 7). After six misses on a riddle (once per riddle, never for list items), Bear swaps it for a one-look riddle that the real animal nearest the last cast answers. The soft ring goes on that animal, it drifts in front of the boat, and the new riddle is read. Careful play never reaches this point.
- **Book picture and stage pose** (bugs 4 and 5):
  - The crayfish book and sorting picture now looks down on its back, nose up, with claws spread (the classic crayfish shape), at 1.25×. It reads at the same size as the other tiles. The seal is drawn at 1.12×.
  - On the stage the crayfish (portrait size 0.9) and the cod sit a little lower (`SHOW_DROP`). The crayfish is now clear of Bear and the boat, and the cod's counted back fins sit on Bear's tummy, not his face.

### Changes

| File | What |
| --- | --- |
| `blender/models.py:814` | `creature_seal` (ringed spots, whiskers, clawed front flippers, `seal_tail` pivot); listed in `build_creatures`; shore seals recoloured (`seal_grey` #9a958f) |
| `public/models/creatures.glb`, `shore_ice.glb` | rebuilt with `node examples/_studio/assets.mjs fish-pond` (world, lake, river and reef unchanged) |
| `public/js/creatures.js:37-45, 66, 75` | seal entry (ice 4) and source; `AMBIENT.ice` includes the seal |
| `public/js/riddles.js:56-57, 104, 113` | `HAS.seal`, `WHY` lines |
| `public/js/riddles.js:94, 176, 218-220` | `nobones.nor`, `plainNegs(t, f)`, `nor()`, two-clue and find-two phrasing |
| `public/js/riddles.js:228-315` | `makeRiddle` options `want` and `avoid`, the bounded recent window, the soft variety rules at tier 3 (`vary`), choosing by answer group |
| `public/js/look.js:143-148`, `field-guide.js`, `book.js:45-50` | seal looks, note, plural |
| `public/js/book.js:12-17, 135-141` | `THUMB` scales; top-down crayfish picture |
| `public/js/main.js:637-668, 704-711` | `CLUE_PARTS`, `clueLook`, `SHOW_DROP`, crayfish portrait size 0.9 |
| `public/js/main.js:789-822` | `s.still` freeze; partial-count nudge and total |
| `public/js/main.js:1006-1030` | `NUMBER`, `countNear` (dot handler and stage taps) |
| `public/js/main.js:1167-1173, 1188` | list item never repeats the riddle just answered; `avoid: listKeys`; two-clue riddles are read |
| `public/js/main.js:1193-1225` | `EASIER_AFTER`, `easierRiddle` (from both the put-back and the kept paths) |
| `public/index.html`, `game.json` | 0/20, "Can you find all 20?" |

### Evidence

Everything is in `scratchpad/polish/fish-pond/r8/`. Chromium was run with `--use-angle=gl` and speech was stubbed.

- **Harness.** `browser.mjs --ids fish-pond --run fish-pond-c4` gave BOOT + PLAY ready with 0 errors. `node --check` passes on every file in `public/js`.
- **Seal model.** `seal3.png` is a Blender close-up. `l-seal.png` shows it on stage with the glow on its ringed spots.
- **Riddle simulation** (`sim.mjs`, 300 riddles per place and tier):
  - **Reef, tier 3:** "no bones and no shell" (octopus or jellyfish) 40 of 200, clownfish 86, pufferfish 74. Before: 0 invertebrate answers out of 300.
  - **Icy Sea, tier 3:** every riddle has two clues. Answers: narwhal 92, seal 95, jellyfish/octopus 60, narwhal/seal 53. Before: 74% one-idea riddles.
  - **Icy Sea, tier 2:** "breathes air" is narwhal or seal (117).
- **Trips** (`play.mjs`, 0 console errors in every run):
  - **Reef, tier 3, careful** (landscape and portrait): 14/14 and 14/14 answered. Octopus and jellyfish answered single and find-two riddles. The glow matched the clue: octopus and arms, jellyfish and tentacles.
  - **Icy Sea, tier 2→3, careful:** 14/14 answered. The seal answered "breathes air", "no tusk" and "not a fish, but has spots". Its glow fell on flippers and spots.
  - **Lake, tier 3, careful:** 14/14 answered. Trout "has spots" glowed on its spots; frog "breathes air" on its skin.
  - **Lake, tier 1, careful:** 14/14 answered, with no repeated sentence.
  - **Random trips:** six misses swapped the riddle (lake: "something blue" became "something with spots", with misses starting at 4 so the ring and drift come at once). No sentence was repeated.
- **Counting** (`stage.mjs`):
  - Two taps midway between the first two clownfish stripes counted 2 (portrait).
  - A count left after 1 said "One! Two more stripes to find." and then "Three stripes in all." The phase went back to idle.
  - Taps between octopus arms more than 64 px apart count nothing, as intended.
- **Poses.** `p-crayfish.png` shows the crayfish in front of the boat, clear of Bear. In `l-cod-count.png` the dots are below Bear's face.
- **Book.** `l6-crop.png` and `p6-sort.png`: the crayfish reads from above at full tile height, the ringed seal sits next to the cod, and the count is 18 / 20.

### Checklist

- No audit items were open.
- Review bugs 1–6: **fixed**.
- Ranked improvements 1–7: **done**.
  - For 1, the seal and "no bones and no shell" were used instead of a new reef animal.
  - For 4, the 64 px reach is done in code (`countNear`) rather than CSS, so overlapping hit areas never swallow a tap.

### Remaining ideas

- The reef crab still answers only one-look and idea riddles at tier 3: its red, shell and claws are each unique on the reef. A reef hermit crab or a spotted reef crab would give it a two-clue riddle.
- A seal-pup snow den on the ice shore, for a "where does it live" look.

## 2026-10-11 — Round 9 (review: 8.4)

### Bugs fixed

1. **Crayfish "hard shell" glowed on its claws.** It had no shell look, so `clueLook` fell through to the next feature. `public/js/look.js:130` adds a crayfish `shell` look, on the body plate of `creature_crayfish`, with its own fact: its shell can't stretch, so it climbs out and grows a new one. "A hard shell", "no bones" and "breathes under water and has a hard shell" now glow on the shell (`l-cray-shell.png`, `p-cray-water-shell.png`).
2. **Icy Sea tier 3 swung narwhal, seal, narwhal, seal.** `riddles.js:337-351`: who answers is now a weighted pick. Recent answers have lower weight: `LATELY` 0.1 (0 below tier 3), then 0.35 and 0.7. This replaces the "not the last animal" and "fresh answer" filters. The "lead with another idea" turn now applies only below tier 3 (`:320`). In 2,000 Icy Sea tier-3 riddles, sole-answer A-B-A-B runs went from 47 to 0, A-B-A from 335 to 61, and the same answer twice running from 92 to 2 (`pingpong.mjs` against the HEAD copy).
3. **Some animals never answered at tier 3.** There are two changes:
   - A new idea, **breathes under water** (`riddles.js:97`, with `HAS` entries, `WHY.water` at `:112` and `NOT_IDEA.water`). It is true of the fish, crab, crayfish and octopus (gills) and the jellyfish (through its skin). It is the other side of "breathes air". At the lake, the crayfish now answers "breathes under water and has a hard shell". At the Icy Sea, the cod answers "breathes under water and has spots".
   - The reef crab's red, shell and claws are each unique there, so no strict two-clue riddle can single it out. A fallback adds idea-and-look riddles only it fits, such as "no bones and has pinching claws" (`:268-286`). These riddles are weighted at 0.6.
   - `ok` now needs a real animal that doesn't fit (`:250`), so "breathes under water" isn't asked where only a duck or a boot is left out.
   - Results from `sim.mjs`, 300 riddles at tier 3:
     - Reef: clownfish 97, pufferfish 85, crab 74, octopus/jellyfish 44. Before, 80% of answers were the two fish.
     - Lake: the crayfish answers alone 33 times.
     - Icy Sea: the cod answers alone 29 times, and in 3 other groups.
4. **Voice stacked at a tier change, and right answers ran to 3–4 sentences.**
   - `setTier` (`main.js:1360`) no longer speaks. It leaves `game.tierNote`, and `sayRiddle` (`:1234`) says the note and the riddle as one line: "Now two clues at once! Find a fish that has no spots." A Bear's list riddle is not chosen in that same turn (`:1170`).
   - "Bear has a list for you!" now waits until the child is home, where the list sits (`:1698`).
   - Right answers are at most two short sentences. `whyLine` and `named` (`riddles.js:501-506`) let the reason name the catch, for example "Yes! A crayfish wears its hard shell outside, with no bones inside." or "Yes! A rainbow trout has fins, and gills to breathe under water." The two-sentence WHY lines were folded into one.
   - Playing 18 riddles from tier 1 to 3 in portrait gave no repeated sentence, and every tier change was followed by exactly one line.

### Improvements

- The night lantern no longer flickers. It breathes slowly instead: `world.js:590`, 0.8 rad/s at ±6%. The tail wag on stage is halved to 6 rad/s (`main.js:796`).
- Sort page, tier 1 (`book.js:447`): the first wrong basket gives the place clue ("You catch goldfish at the sunny lake…"). The answer and the ringed basket come on the second miss. Verified with `sort.mjs`: sea → place clue, no ring; pretend → answer, fresh ringed.

### Evidence

All files are in `scratchpad/polish3/fish-pond/`.

- Every play was in Chromium with `--use-angle=gl` and speech stubbed:
  - lake from tier 1, 20 riddles (landscape) and 18 (portrait)
  - lake, Icy Sea and reef at tier 3 (portrait and landscape)
  - night pond
  - a random lake trip

  Every trip had 0 console errors, and every careful riddle was answered.
- `browser.mjs --ids fish-pond --run fish-pond-f1`: BOOT + PLAY ready, 0 errors.
- `node --check` passed on every edited file, and `tests/colours.mjs` passed.

### Remaining ideas

- At tier 3, counting could let taps on the real arm or stripe count, instead of pre-placed dots.
- The sort page could hide the place emojis at tier 3.
- The reef crab still answers only the easier fallback two-clue riddles. A spotted reef crab would give it a strict one, but the same model is the Icy Sea snow crab.

## 2026-10-11 — Round 10 (reviews: 8.6, 8.6)

### Bugs fixed

1. **Reef tier 3 was mostly clownfish vs pufferfish, in five "a fish that has no X" phrasings, and the crab could be answered from one look.**
   - `riddles.js:256` `groupOf`: every fish-led riddle is one answer group, "the fish", weighted ×0.5 at tier 3 (`:346`). The recent-riddle filter now works inside each group (`:303`), so five fish keys can't push out the two non-fish riddles.
   - `:297` one way to ask for each answer per trip (`trip`, the new `game.asked` in `main.js:1188`), so a trip has two fish phrasings, not five.
   - `:106` `nobones.nor` adds `tentacles`: "an animal with no bones and no tentacles" (crab or octopus) is a real two-clue riddle, where each clue rules someone out. The `loose` one-look fallback for the crab ("not a fish, but is red") is removed.
   - `:331` a "find two" is not forced straight after another, so the reef's two pair riddles don't swing back and forth.
   - Sim (`r2/trip.mjs`, 30 trips of 22 riddles): reef tier 3 is octopus/jellyfish 30%, octopus/crab 27%, clownfish 22%, pufferfish 21%, with 2.0 fish phrasings per trip. Before: fish 57–61% in five phrasings, and the octopus and jellyfish about 6% each.
2. **The glow didn't always land on the part the child reasoned with.**
   - New looks in `look.js`: frog `spots` (`:148`), cod `spots` and `gills` (`:170-171`), narwhal `spots` and `blowhole` (`:137-139`), goldfish and trout `gills` (`:87`, `:93`), octopus `head` (`:119`), jellyfish `bell` (`:129`).
   - `main.js:652-654` `CLUE_PARTS` gains `water` (gills, shell, head, bell) and `notfish` (legs, flippers, blowhole, arms, tentacles, shell).
   - The crab's "not a fish" reason now names its shell (`riddles.js` `WHY.notfish.crab`).
   - Look facts that repeated the reason were replaced: the narwhal and whale blowholes, and the jellyfish bell.
   - Blender (`blender/models.py:402` `fish_face(gill=)`) draws a gill-cover curve on the goldfish, trout and cod, and a blowhole on the narwhal (`:780`). Only `creatures.glb` changed; the other GLBs are byte-identical.
   - Verified (`r2/glow.mjs`, screenshots `p-narwhal-air`, `l-frog-spots`, `p-cod-spots`, `p-trout-water`, `l-goldfish-water`, `p-octo-water`, `l-jelly-water`, `l-cod-water`, `p-crab-notfish`, and `glows.png`): each glow sits on the named part.
3. **The narwhal was taught as blue.**
   - `models.py:763`: the narwhal is now mottled grey (`#9aa1a8`, darker grey spots).
   - `riddles.js:64` drops `blue` from it. "Something blue" on the Icy Sea is now the whale or Blue Fish.
   - The seal's comment was updated to match.
4. **Reef tier 2 swung between fish and not-fish.**
   - `riddles.js:314`: the "different answer from last time" rule only applies where three or more answer groups are in the pool.
   - The harder-idea filter is 0.65 (`:326`).
   - Sim: reef tier 2 "a fish" is 23% (was 50%). Lake and Icy Sea tier 2 still have 0 same-group repeats.
5. **First counts said every number up to 8.** `main.js:1012` now uses the shared `COUNT_ALOUD` (5). Play log: "1 … 5", then "Eight arms! Just as you guessed!"
6. **The list tick and the next riddle were two lines.**
   - `game.listTick` (`main.js:1153`) is now said as the lead of `sayRiddle`: "One for Bear's list! Next: a fish that is not orange."
   - It is said alone if the riddle is not read.
7. **Place names differed between screens.** `book.js:30` `placeWord` uses the button names everywhere, with an or-list for mystery tiles: "Try the sunny lake, the sunset river, or the starry night."
8. **Random jokes were welcomed with "Wow!".**
   - `SAY` drops "Wow" (`main.js:684`).
   - While a riddle is out, a joke catch is kept quietly (`JOKE_SAY`, `:693`): "An old boot! Not an animal.", with the one-star tune and no bubbles (`:738`).

### Improvements

- Sort page: from tier 2 the fresh-water and sea baskets hide their place emojis (`book.js:299`, `style.css:217`). From tier 3 the mystery tiles hide them too (`book.js:163`). Verified with `r2/sort.mjs`: the place pictures are `hidden` at tier 3 and `visible` at tier 1.

### Evidence

All files are in `scratchpad/polish3/fish-pond/r2/`. Every play was in Chromium with `--use-angle=gl` and speech stubbed.

- **Careful trips**, every riddle answered and 0 console errors:
  - reef tier 3: portrait 22/22 and 16/16, landscape 22/22
  - Icy Sea: tier 2→3 landscape 18/18, tier 3 portrait 14/14
  - lake from tier 1: portrait 18/18, landscape 18/18
- **Random trips:** lake and reef, 0 errors. The only joke line was "An old boot! Not an animal."
- No sentence of more than four words was said twice in a trip.
- `browser.mjs --ids fish-pond --run fish-pond-f2`: BOOT + PLAY ready, 0 errors. `node --check` passes on every file in `public/js`.

### Remaining ideas

- No fresh-water place has a counting moment yet. The turtle's four legs could be one.
- On the Icy Sea the narwhal only answers tier 3 alongside the seal ("not a fish, but has spots"), since its tusk alone singles it out.
- The sort page's tier-1 second hint (review idea 7) was not added. With three baskets, two misses always leave the right one.
