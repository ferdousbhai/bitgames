# Paint Splash: polish log

## Phase 1 calm pass (2026-10-09)

The audit is in [AUDIT_2026-10-09.md](AUDIT_2026-10-09.md). Rolling, pickups, multiplayer, the gallery and the colour studio are kept. The 75 s timer stays: the untimed default is Phase 2.

### What changed and why

| Change | Where | Why |
| --- | --- | --- |
| The final-10 s hurry state is gone: no pink pulsing timer, no per-second ticks, no music speed-up. The timer just counts. | `public/js/main.js:1176`, `:1228`; `.timer.hurry` removed from `public/style.css`; `audio.tick()` removed | Frantic-timer pressure. |
| The countdown is softer: "3, 2, 1, 🎨" (no "GO!") at 0.9 s steps. Numbers fade in without zoom or overshoot. Beeps are soft sines. The waiting 🎨 no longer pulses. | `main.js:725-735`, `style.css` `.countdown`, `audio.js:185` | Softer start. |
| Pickup banners (💥 SPLASH!, 💧 Splish splash!, 🌈 Rainbow!) are gone; the paint on the ground shows what happened. | `main.js:943` | Removes shouty banners. |
| Pickups are calmer: respawn waits are `PICKUP_WAIT` (bucket 7–12 s, water 8–14 s, rainbow 18–26 s; was 2.5–6 s and 9–15 s). Caps drop to 2 buckets and 1 water. The bucket floats and spins more slowly, and its colour drifts slowly (hue speed 0.25 to 0.06). Rainbow trail sparkles drop from 10 to 3 per second. | `main.js:34`, `:893`, `:1082`; `public/js/items.js:5-7`, `:84` | Constant item stream and colour cycling. |
| **Shared result:** the per-player % and the AWARDS ranking (including "Colour swapper" and "Speedy roller") are gone. Results show "🤝 We painted N% together!" and one card per painter: animal, ⭐ for you, 🤖 for bots, and a dab of their colour. | `computeFinal()` `main.js:798`, `renderResults()` `:853`, `style.css` `.card .swatch` | Removes ranking; the result is the picture made together. |
| No white camera flash when the picture is kept. The 🖼️ button does one small hop instead (no 3× pulse). | `keepFinishedPicture`, `index.html` `#flash` removed, `style.css` | Strobe-like flash. |
| The reveal shows 28 slow petals in the painters' colours (was 220 confetti) and one soft sine chord (was a square-wave fanfare with a hiss). | `main.js:792`, `audio.js:196` | One soft moment. |
| Music has one steady tempo (0.22 s per step, was 0.17 and then 0.14). Splash and water sounds are about half as loud. The water squeak and piglet voice are triangle waves instead of square and sawtooth. | `audio.js` | Slower, softer audio. |
| The idle drag hint waits 30 s (was 4 s). It still shows at the start. The "you" marker bobs and spins slowly. | `main.js:32`, `:1198` | Idle nudges and busy motion. |
| These infinite CSS animations are removed: logo bob and Let's-paint pulse. The loading spinner is slowed. Results cards fade up instead of springing. A `prefers-reduced-motion` block is added. | `public/style.css` | No pulses; reduced motion is honoured. |

### Verification

- `node examples/_studio/tests/browser.mjs --browser chromium --ids paint-splash --run calm`: BOOT + PLAY ready, 0 errors.
- `node examples/_studio/tests/workshop-fallback.mjs`: PASS.
- Scratch replica of the paint-splash part of `original-quality.mjs` passed: the gallery keeps 3 pictures, and the controls are isolated.
- Played a 20 s round (`?debug&seconds=20`) plus the colour studio in Chromium at 834×1194 and 1194×834. 0 console errors.
- Screenshots: `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/183efacb-62c2-4cf6-9680-a97f4bb0fb5f/scratchpad/audit/paint-splash/before/` and `.../after/`. Compare `*-2-countdown`, `*-6-results` and `*-7-results-kept`.
- `public/bitgames.json` is now stale until the coordinator's rebuild.

### Not changed here

- The `final` message now carries only `{ seat }` rows. All devices run the same version, so this is fine. A device still on the old page would ignore the missing pct and award fields.
- The in-play HUD colour bar still shows each colour's share of the ground. It is a picture of the colours more than a score, but it reads as a race. Phase 2 should replace it with a single "together" fill.
- Shared studio and gallery files (`colour-studio.js`, `studio-dialog.*`, `gallery.*`) were not touched (coordinator-owned).

### Remaining (Phase 2)

- No timer by default: finish when done.
- Overlapping red, yellow and blue rollers mix colours using `colour-model.js`, so the studio's learning sits inside the main game.
- Optional guide outlines to fill.
- A single cooperative coverage bar.

## Phase 2: colour mixing in the core loop (2026-10-09)

### Design

- **No clock by default.** The default round has no timer and no "3, 2, 1" count-in: one soft chime and painting starts. The round ends when a child taps **🖼️ Finished!** (top right) and answers ✅ to a pictured, spoken "Is your picture finished?" (🖌️ means keep painting, so a stray tap can't end a picture). The round never ends by itself. At 85% coverage the bar is full, and the host shows the same ✅ / 🖌️ question, spoken as "The playground is nearly all painted! Is your picture finished?". With three painters that takes about 2 to 3½ minutes. If the child picks 🖌️, or leaves the question unanswered for 12 s, painting continues, and the game does not ask again until another 5% is covered. The child can still tap Finished at any time. Any player can say Finished: a friend's device asks the host, which ends the round for everyone.
- **The quick round stays.** A pictured ⏱️ *Quick* button sits beside Let's paint. It is off on every visit and not remembered. When it is on, the Go button reads "⏱️ Let's paint!" and the round is the old 75 s round: count-in, four painters, and the water and rainbow puddles.
- **Painting mixes.** Rollers carry the colour studio's toy red, yellow and blue (`colour-model.js` is imported, not edited). A different paint rolled over **wet** paint mixes with it: red and yellow make orange, yellow and blue make green, red and blue make purple, and all three make brown. Over **dry** paint, the new paint covers it, as real paint does. Paint stays wet for 8 s. Wet paint is visibly glossier and slightly lighter, and it dries to its true colour, so the rule can be seen and predicted.
- **The child chooses the paint.** Three pots (bottom left, or keys 1/2/3 or R/Y/B) dip the roller in red, yellow or blue. Each pot speaks its name. A child alone can therefore mix by themselves: roll red, dip in yellow, roll back over the shiny red.
- **Discoveries are named once.** The first time a mixed colour covers about a roller-width square, a recipe card (● + ● = ●, in the real paint colours) fades in under the bar. The game says "Red and yellow made orange!" with one soft chime and a few sparkles where it happened. A dab joins a row of found colours under the bar. Each colour is announced once per round, and announcements are queued so each one is heard.
- **Together.** The in-play per-colour share bar is now one 🤝 … 🖼️ fill showing how much everyone has painted. The results show "🤝 We painted it together!" and the painter cards, plus the colours found, each with its recipe pictured. The ending speaks what was learned: "We made orange and green! Red and yellow made orange! Yellow and blue made green!" If nothing was mixed, it gives a gentle hint instead: the three pots + 💧, "Next time, roll a new colour over wet paint to mix."
- **Robots and pickups.** With no clock there are three painters (one for each paint), so a child alone gets two robot friends, red/yellow/blue by seat. Robots keep their own primary, roll a little slower (0.65 instead of 0.8), and are happy to cross a friend's different colour, which is where mixes happen. The calm round keeps only the paint bucket: a big splash in your paint that mixes like the rollers. Water and rainbow are retired from the calm default and stay in the quick round. There, the rainbow roller now paints a colour wheel (red, orange, yellow, green, blue, purple stripes) from the same paint bits.

### How it stays in sync

Each cell stores, for each primary, the latest game time it was painted, plus the latest wash time (`paint.js` `PaintMap`, `write`/`settle`). Its colour is the set of primaries laid within `WET_MS` of its latest paint and after the latest wash. Every quantity is a maximum, so the picture does not depend on the order events arrive in. A two-device run produced identical picture hashes in both modes (below).

Protocol changes (all devices run the same version):
- Stroke events gain the paint bits: `[0, seat, t, x0, z0, x1, z1, bits, rainbow]`.
- Splats gain them too: `[1, seat, t, x, z, seed, bits]`.
- Snapshots gain the current pot at index 6.
- `setup` carries `mode`.
- `final` carries `found`.
- New round message: `finish` (guest → host).

### Changes (file:line)

| Where | What |
| --- | --- |
| `public/js/paint.js:30-60` | `RED/YELLOW/BLUE` bits, `MIXES` from `mixToyPaint`, `mixWords`, `SEAT_PAINT`, rainbow as colour-wheel bits, `WET_MS` |
| `public/js/paint.js:68-253` | `PaintMap` rewritten: per-primary times, `settle`, `mixAt`, `coverage`, `lastAt`, wet-time texture |
| `public/js/paint.js:270-304` | Ground shader: wet paint is glossy and slightly lighter, and it dries over `WET_MS` |
| `public/js/painter.js:40-80`, `:136` | `paint` bits and `setPaint`; remote pots follow snapshots |
| `public/js/bot.js:88-93` | Bots read `mixAt` and accept a friend's different colour |
| `public/js/arena.js:104` | The ground gets the whole `PaintMap` (both textures) |
| `public/js/main.js:35-50` | `MODES`, `CALM_DONE` (0.85), `FOUND_CELLS`, `NOTE_MS` |
| `public/js/main.js:404-457` | Mode choice, pots, Finished question |
| `public/js/main.js:657`, `:698`, `:832`, `:865` | Guest finish, three painters in calm, no count-in, spoken and pictured goal |
| `public/js/main.js:923-1000` | `found` in final, results recipes, spoken ending |
| `public/js/main.js:1031`, `:1112-1160` | Pickups by mode, events with paint bits |
| `public/js/main.js:1302-1360` | Together bar, recipe note, `noticeMixes`/`sayNextMix` |
| `public/js/main.js` `step()` calm branch, `askFinished(words)`, `ASK_AGAIN` | At 85% coverage the host asks "Is your picture finished?" and never ends the round alone. After 🖌️ (or no answer) it asks again only after another 5% (`game.askAt`) |
| `public/index.html` | `.go-row` + `#mode`, together bar, `#found-row`, `#finish` + `#finish-ask`, `#pots`, `#mix-note`, results `#found` |
| `public/style.css` | Styles for the above in all layouts. Small sideways phones stack the recipes in a column; 561–760 px windows move the bar under the corner buttons |

### Evidence

Scripts and screenshots are in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/183efacb-62c2-4cf6-9680-a97f4bb0fb5f/scratchpad/p2/paint-splash/`.

- `play.mjs` plays the loop at 834×1194, 1194×834, 667×375, 375×667 and WebKit 834×1194, all with 0 console errors. It rolls red, dips in yellow and rolls back, then checks: orange is found and spoken, autopilot runs, Finished → ✅ leads to results with recipes, and the spoken ending is right. Look at `portrait-3b-note.png`, `landscape-3b-note.png`, `portrait-5-ask.png`, `*-6-results.png` and `phone-land-6-results.png`.
- `wet.mjs` (`wet-1.png` and `wet-2-dry.png`): the fresh stripe is shiny and lighter, then dries. Blue over the dry red covers it with no mix.
- `duo.mjs` runs two iframes through a stand-in room bridge with real WebRTC:
  - calm: the guest changed pot (synced) and tapped Finished, and the host ended for both. Hashes matched (`1065561838` on both), and both devices showed purple as found.
  - timed: four painters, the 75 s timer, matching hashes (`939177541`).
  - 0 errors. See `duo-timed-play.png`.
- `ask85.mjs` (follow-up), Chromium and WebKit, 0 errors:
  - Chromium: the question appeared at 85.5% (WebKit 85.4%) and the round stayed in play. 🖌️ kept painting, the question came back at 90.8% (WebKit 90%), and ✅ ended the round with results.
  - Spoken in Chromium: "The playground is nearly all painted! Is your picture finished?" → "Keep painting!" → the same question again.
  - See `ask85-chromium-1-asked.png`. The calm `duo.mjs` was re-run and the hashes still match.
- `curve.mjs`: coverage with an autopilot child reaches 85% at about 2–3½ minutes on all three places, then slows. That is why the threshold is 85%, not 90%: square stalled at 89.6% for minutes.
- `browser.mjs --ids paint-splash --run p2`: Chromium and WebKit BOOT + PLAY ready, 0 errors.
- `original-quality.mjs`: all PASS, including the paint-splash gallery and controls check. `workshop-fallback.mjs`: PASS.
- `node --test`: 10/11. The only failure is the expected stale manifest (it reports bumper-ducks first; paint-splash's `public/bitgames.json` is stale too until the coordinator rebuilds).

### Left / open

- `game.json` `howToPlay` still describes the timed round and "make it yours". A suggested text is in the coordinator report.
- Wet paint is shown by gloss and lightness. Children may read the lighter shade as a different colour for a few seconds. Watch for this in real play.
- Purple needs a red roller over blue. By default only the child (or a friend) is red, so purple is the child's own discovery.
- Optional guide outlines to fill (from the Phase 1 list) were not built.
