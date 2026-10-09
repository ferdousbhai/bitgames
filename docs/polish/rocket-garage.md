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
