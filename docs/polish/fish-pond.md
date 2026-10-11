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
