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
