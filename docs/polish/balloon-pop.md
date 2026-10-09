# Balloon Pop: Phase 1 calm pass (2026-10-09)

The audit found that Balloon Pop's charm (the clay countryside, the balloon faces, the surprise taps on the sun, sheep and houses) sat under an attention-hook layer: an endless speed ramp, combo banners, confetti on every pop, a frantic "pop as many as you can" party and best-score chasing. This pass removes that layer and keeps the core action, the balloon friends, the star chain-pop, the rainbow babies and the learning missions.

## What changed and why

All paths are under `examples/balloon-pop/public/`.

**Pacing**
- `js/main.js:41-52`: one constant pace (`PACE = { speed: 1.0, every: 1.35 }`) for every level. `level(n)` stays at level 6 instead of ramping to 2.3x speed with a balloon every 0.55 s. Levels still introduce one new friend each.
- `js/main.js:53,323`: the "Balloon party! Pop as many as you can!" (a balloon every 0.22 s, up to 15, 1.3x speed) is now a 9-second "Balloon parade" of mixed friends.
- `js/main.js:225-232`: the parade keeps the normal cap of 9 balloons and spawns every 0.9 s.

**Feedback**
- `js/main.js:290`: the counter shows balloons popped. The combo window and "Nice! / Super! / Balloon boss! +N" banners are gone, and so are the floating "+N" labels and the point values.
- Intro cards now describe each friend instead of its worth ("Can you find the hearts?", "They wear a little crown").
- `js/main.js:375`: the title shows "🎈 You popped N balloons!" in place of the best score, the "New best" message and the in-play "🏆 Best!" badge. `index.html` drops `#best`, `#best-badge` and `#banner`.

**Celebrations**
- `js/effects.js:208-228`: a pop is a soft ring, rubber shreds and a puff. The per-pop confetti (22, or 50 when big) is gone. Gold and power balloons get 8 slow twinkles instead of 24 fast sparkles.
- `js/effects.js:141,231`: level-ups and missions now get one soft moment of 18 slow petals in their own low-gravity pool, replacing the 160-piece confetti shower. A finished mission adds one gentle chord (`js/main.js:114-115`).
- Gold and star twinkle rate cut from `dt*8` to `dt*2` (`js/main.js:579`).

**Camera and motion**
- The star balloon no longer shakes the camera or shows a "Star power!" banner. Its chain-pop is slower (`200 + i*180` ms instead of `90 + i*80`, `js/main.js:296`). The camera-shake code is removed from `main.js` and `effects.js`.

**Audio** (`js/audio.js`)
- Pop (`:87`): the 2200 Hz highpass snap drops from gain 0.55 to a 0.16 bandpass. Each colour plays its own pentatonic note, so the pitch no longer climbs with a combo.
- Star `boom()` (`:99`): softer, with no crackle.
- `levelUp()` (`:110`): a slow triangle and sine arpeggio instead of square plus hiss.
- New `chord()` (`:117`) for finished missions.
- Music box (`:198`): 0.3 s per step, was 0.19 s (about 158 bpm).

**CSS** (`style.css`)
- Removed the infinite logo bob, friends bob, Play-button pulse, best-badge bob, banner and float-label styles.
- The tap-hint finger slows from 0.9 s to 1.8 s.
- Intro and mission cards fade in with no overshoot.
- Added a `prefers-reduced-motion` block (`:176`).

**Bug: balloons under the HUD**
- The HUD already let taps through (`#hud { pointer-events: none }`), so a balloon under the level bar is still poppable.
- The bar is now see-through at 0.85 opacity (`style.css:57`) so a balloon rising behind it stays visible.
- Moving spawns or the HUD further would cost more than it is worth, so I left them.

## Verification

- `node examples/_studio/tests/browser.mjs --browser chromium --ids balloon-pop,bumper-ducks,bunny-hop --run calm`: 0 errors. Layout, touch targets and both orientations pass.
- `node examples/_studio/tests/original-quality.mjs`: all pass, including "Three directly touched balloons complete the raw-count mission" and mission persistence.
- `node --test examples/_studio/tests/*.test.mjs`: 10 of 11 pass. The failure is the expected stale `public/bitgames.json` hash manifest, which the coordinator's build regenerates.
- Played with scripted touches in both orientations up to level 6, the parade, a star chain-pop, home, and the red-hunt mission to completion. There were no console errors.
- Before screenshots: `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/183efacb-62c2-4cf6-9680-a97f4bb0fb5f/scratchpad/audit/balloon-pop/`. After screenshots: `…/scratchpad/audit/after/balloon-pop-*.png`.

## Catalogue text needing the coordinator

`game.json` `howToPlay` still says "golden balloons with a crown are worth 5". Suggested replacement:

> Tap or click a balloon to pop it (or steer the pin with the arrow keys and press Space). Each level brings a new balloon friend: hearts, golden crowns, bunnies, a star that pops every balloon, and a rainbow that makes baby balloons. Tap the sun, a sheep, a house, a tree, the windmill or the hot-air balloon for a surprise. Nothing is ever lost, so take your time.

## Remaining Phase 2 work (from AUDIT_2026-10-09)

- A spoken "pop the 4 blue ones" sky with picture slots, counting up to 10, built into the levels rather than only as optional missions.
- Deeper missions: colour mixing with the rainbow babies, and number-to-quantity matching.
- Consider starting with music off, or a quieter music box with rests.
