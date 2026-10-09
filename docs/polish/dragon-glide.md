# Dragon Glide polish

## Phase 1 calm pass (2026-10-09)

Audit scores before this pass: Calm 5, Focus 4, Educational 3, Engagement 5, Visual 9, Audio 7, UX 8, Technical 8 (see [the audit](AUDIT_2026-10-09.md)). Flying, fire, the four worlds, the family nests and the ring-counting mission are unchanged. The pass removes the score economy and the rush.

### What changed and why

| Change | Where |
| --- | --- |
| **One calm speed.** Every world cruises at `CALM_SPEED = 12` (was 15 → 16.5 → 17.5 → 18). The Gentle and counting missions still scale it with `pace`. | `public/js/worlds.js:7-8` and each world's `speed` |
| The rainbow star no longer speeds Ember up (×1.45) or kicks the FOV (+8°), and there is no FOV widening with speed. The gem magnet stays. Its banner reads "🌈 Rainbow star! Gems fly to you!". | `js/main.js:781-783`, `main.js:947`, `main.js:607-611` |
| **No score economy.** The 💎 count is now the number of gems found: +1 per gem, big gem or bubble. Rings and lanterns no longer add rising points. The HUD number changes without bouncing. | `main.js:384-387`, `main.js:579-606` |
| The combo line "💫 N rings in a row!" is removed, along with "+N", "+3 Pop!", "+2 ✨" and the "Yay!/Woo-hoo!" popups, the streak twirl and the miss "whiff". The "Bonk!" popup stays as funny physical feedback. | `main.js:390-394`, `main.js:579-622` |
| **No graded stars or best score.** The end card shows the worlds Ember flew through (🌼🍭🏰🌙) and what Ember found: 💎 gems, ⭕ rings, and 🏮 lanterns when any were lit. "New best", the best line and the title's best pill are removed. This also makes the `course.possible` denominator bug moot, since nothing divides by it any more. | `main.js:288-296`, `public/index.html` (`#results`) |
| **The nest waits for the child.** The 4.6 s auto-advance is gone. After the cheer, a "▶ 🍭" button (named after the next world, or "🪺 ▶" at the end) appears, and a tap anywhere or Space also flies on. Ember's bounce settles to a gentle rest, and the nest confetti stops after 3.5 s. | `main.js:665-688`, `main.js:844-859`, `style.css` `.fly-on` |
| **Nest framing.** With the arrival no longer cut short, the waiting view has Ember seated between both parents with every face visible. Screenshots `after/portrait-5b-nest-waiting.png` and `after/landscape-5b-nest-waiting.png` show it. No camera change was needed. | — |
| Particles are cut to soft amounts. Rings: one ring and 8 sparks (was two rings and 24 sparks). Gems: 5 or 10 sparks (was 12 or 26). Bubbles: 10 (was 26). Lanterns: 8 (was 20). Rainbow star: 14 (was 40). The rainbow trail is about a third of what it was. Air sparkles: 8/s (was 30/s). | `main.js:579-612`, `main.js:796-815` |
| A bump shakes the camera by 0.2 (was 0.35), and not at all under `prefers-reduced-motion`. | `main.js:617-618` |
| Audio: the ring chime is fixed, with no streak climb. Gem notes walk round a five-note scale and never climb forever. The fanfare has no square layer. The rawr is triangle-only and quieter (was sawtooth), the fire hiss is quieter and its sawtooth is now triangle, and the pop is quieter. The world loops are slower (tempo 112/120/104/92 → 92/96/88/80), and Candy Clouds plays triangle (was square). | `js/audio.js`, `worlds.js` |
| CSS: the infinite logo bob, Let's fly pulse, power pill pulse and tip nudge are off. `prefers-reduced-motion` also stills the loading flyer, the world row and the banner scaling. | `public/style.css:286-301` |

### Verification

- `node examples/_studio/tests/browser.mjs --browser chromium --ids dragon-glide --run calm`: BOOT + PLAY ready, 0 errors.
- `original-quality.mjs`: dragon-glide's mission choice persists and starts at zero.
- I played Meadow Isles to the nest, waited at least 3 s after the fly-on button appeared (the state stayed `nest`), tapped ▶, and flew Candy Clouds through to the end card. This was in portrait 834×1194 and landscape 1194×834, with 0 console errors. Before screenshots are in `audit/dragon-glide/`, after screenshots in `audit/dragon-glide/after/`.

### Remaining (Phase 2, from the audit)

- Give each world a purpose inside the steering: numbered rings flown in order, or gems gathered by colour or shape and arranged in the nest. Numbered rings need Blender work (Phase 3).
- Optionally let the child hover or slow down by holding still.
- A first-run choice could make Gentle flight the default.
