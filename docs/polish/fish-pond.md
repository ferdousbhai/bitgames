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
