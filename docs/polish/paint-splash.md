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

### Simplify pass (2026-10-09)

Quality cleanup only; play is unchanged.
- `speak` is now the shared `speech.js` voice (rate 0.95, pitch 1.15) with `{ interrupt: true }`, as every line answers a tap or a new moment; the studio's close calls `voice.hush()`.
- The wet-paint texture is two-channel (`RGFormat`, half the memory and upload of RGBA); the shader still reads `.r`/`.g`. Uploading only the dirty row band was skipped: three r186 `updateRanges` assume RGBA and send one row per range, so it is not a cheap fit.
- `paint.js` names mixes with `describeMix().base` from `colour-studio.js` instead of its own copy.
- Removed dead CSS `@keyframes bob` and `.banner`/`.banner.show`.
- Checked: `browser.mjs --run simp` Chromium and WebKit 0 errors; a scripted round (mode toggle, pots, mixes, studio, finish) records the expected spoken order and paints correctly.
- Iteration 2: the `speak` wrapper is gone; lines use `voice.sayNow` (also handed to the colour studio). Turning sound off and leaving a round with Home now call `voice.hush()`. Removed the orphaned `.logo span` `animation-delay`s.
- Third pass: the colour studio gets `voice` (it hushes on close itself), so the `onClose` passed in is just `releaseControls`. The voice starts with `muted: !settings.sound` and the 🔊 switch calls `voice.setMuted`. `paint.js` exports one `LIST = Intl.ListFormat('en-GB')` used by `mixWords` and the results line in `main.js` (`listWords` gone); spoken text unchanged. Checked: `browser.mjs --run simp3` Chromium and WebKit 0 errors, `original-quality.mjs` pass, and a speech-stubbed run (studio greets and hushes on close, pots speak, mute hushes and silences, unmute speaks, saved mute silent from load, no console errors) in both engines.

### Exit paths (2026-10-09)

`stopRound()` is the one exit cleanup: it calls `voice.hush()` and `clearTimers()`, which also clears the results line booked at 900 ms. So 🏠, the results "change" button, the host's `menu` message and 🔁 / the next round (`startRound` → `stopRound`) all go quiet. `goHome` no longer hushes on its own. Checked: `browser.mjs --run exits-fmp` Chromium and WebKit 0 errors, `original-quality.mjs` pass, and a speech-stubbed run (change, 🔁 and 🏠 before the 900 ms results line: hushed, results line never spoken, right state, no console errors) in both engines.

## Round 1 of the 8.5 pass: paint requests (2026-10-11)

Starting point: the 2026-10-10 re-audit (6.5). The game was calm but passive: robots made the mixes and the game announced them, nothing asked for a colour, and all three secondaries were found in about 25 s with no step up. Portrait left the bottom 35–40% as empty ground.

### Design

- **Paint requests are the core decision.** In the no-clock round the host chalks a dashed shape on the ground near the child, drawn in the colour it wants: "Paint the fish green!" The pots still hold only red, yellow and blue, so the child must choose the right two paints and roll the second over the first while it is still wet and shiny. A card under the bar shows the shape, the wanted colour and the recipe (● + ●). Tapping the card says the request again.
- **Mistakes matter, gently.** A part is painted once 60% of it is the wanted colour. Paint that can't become that colour (red in a green fish, or wet orange plus blue making brown) blocks this until it dries and is painted over. The game says once what happened and the recipe: "That's orange. Yellow and blue make green." Once a round it adds "Let it dry, then roll over it." In a scripted test, careful rows finished each shape in 7–15 s. Random pots over the same shape reached only 6% after 28 s, with 84% of it the wrong colour.
- **Painted shapes become the picture.** At 60%, a part is tidied inside its lines (washed, then filled with exactly that colour at one game time, so every device agrees). It is then **kept**: later rolling can't spoil it. Its outline turns to dark ink. The finished picture is a page of coloured-in shapes, and the gallery keeps it. A shape still waiting when the round ends is removed. The results show each painted shape (🐟 ●), then the colours found. The spoken ending names the shapes: "We painted a purple fish, an orange heart, a green and brown tree and a green leaf!"
- **The steps adapt and are never a gate.**
  - Tier 0 pictures and says the recipe.
  - Tier 1 hides it as ❓ + ❓. It is shown after a slip, or after 35 s with no progress.
  - Tier 2 adds two-part shapes with brown: a tree (green leaves and a brown trunk), a flower (petals and a green stem), a carrot (an orange root and green leaves). Painting one part spills onto the other while it is wet, so a careful child finishes one part (it is then kept), lets it dry, and paints the other.
  - A shape finished with no slip and no tip adds 0.5 to the skill. A slip takes away 0.5. The skill is kept between visits (`paint-splash-skill`), so a 7-year-old starts at tier 2 next time.
  - A "Roll blue over the shiny yellow!" tip comes when one recipe paint has sat on the shape for 14 s with nothing mixing.
- **Only the child's own roller names a mix.** Discoveries count only cells changed by this device's child (`PaintMap.mineCounts`). A friend's discoveries reach the host with the end-of-round stats. Robots now paint bare ground only. They keep off every shape and stay more than 5 m from a child, giving children a wider berth than other robots. The bucket never spawns within 6 m of a shape.
- **Less voice.** Each pot says its name once a round (`voice.sayOnce`). A recipe is said once a round. The old opening instruction is gone: the first request carries it. A careful 70–80 s round with four shapes spoke 18 lines, against 45–66 in the worst trips of the re-audit.
- **Portrait framing.** The follow camera works out where the bottom screen edge meets the ground. It keeps the near edge of the playground (with its flower beds) at the bottom of the screen, so tall screens show more picture and no bare cobbles.
- The "nearly all painted" question now comes at 80% (was 85%). Shapes and the space around the child are kept free of robots, so coverage now levels off near 84%.

### Changes (file:line)

| Where | What |
| --- | --- |
| `public/js/jobs.js` (new) | `SHAPES` (:30, eight shapes, three with two parts), `chooseJob(tier)` :76, `fits` :106, `Job` :114 (cells, `check` :164, `fill` :201 keeps a painted part, dashed or ink `ribbon` :227) |
| `public/js/paint.js:75,136` | `locked`: a painted part ignores later paint (order-independent: writes after the lock time are skipped) |
| `public/js/paint.js:85,172` | `mineCounts`/`mine`/`who`: cells each colour gained from this child's roller |
| `public/js/bot.js:85-90,119` | Robots skip shapes and a child's surroundings, paint bare ground only, and steer round shapes |
| `public/js/main.js:56` | `TOP_TIER`, `HELP_MS`, `WET_TIP_MS`; `game.skill` from storage |
| `public/js/main.js:1430-1590` | `nextJob` (host, near the child and on screen), `onJob` (guests, `job` message), `addJob`, `renderJob`, `checkJob` (slips, tips, skill), `partPainted`, `finishJob` |
| `public/js/main.js:429` | Pot names said once a round |
| `public/js/main.js:810,1154,1161,1378` | Only the child's own strokes and splats name mixes |
| `public/js/main.js:677,931` | A guest's found colours join the host's results |
| `public/js/main.js:901` | An unfinished shape is removed before the reveal |
| `public/js/main.js:981` | Results line names the painted shapes; results show shape chips (`.found.many` shrinks them when there are many) |
| `public/js/main.js:1288` | Portrait camera clamp |
| `public/index.html:67-68`, `public/style.css:113` | `#job` request card; `#mix-note` now flows under it in `.hud-top` (no fixed offsets per layout) |
| `game.json` | `howToPlay` and `learning` describe requests and tiers (`public/bitgames.json` is stale until the coordinator rebuilds) |

### Evidence

Scripts and screenshots are in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/264c5237-472d-4187-be3f-45d364aa4d2a/scratchpad/polish/paint-splash/`. Speech was stubbed and every line logged.

- `full.mjs`, a careful round from menu to results, had 0 console errors in each of these runs:
  - Chromium 834×1194 at tier 0 and 1194×834 at tier 1.
  - 375×667 and 667×375 at tiers 2 and 0.
  - WebKit 834×1194.

  See `r1/portrait-3-later.png` (inked heart, star and leaf; the tier 1 card shows ❓ + ❓), `r1/portrait-4-results.png` and `r1/landscape-4-results.png`. Compare `before/portrait-3b-note.png`, which shows the empty bottom, with `r1/portrait-1-job.png`.
- `play.mjs 834 1194 tier2 2`: a tree went green and brown. In an earlier version, a carrot's leaves turned brown when the root was painted wet beside them. That led to the bigger two-part shapes with a gap between parts, and to keeping each part once it is painted.
- `careless.mjs`: random pots over the shape leave it unfinished (above).
- `duo.mjs` uses two iframes and real WebRTC:
  - calm: the host painted the star and the guest's star was inked too. Both lists show `[["star",5]]` and the picture hashes match (`-123248695`).
  - timed: the hashes match.
- `ask.mjs`: on autopilot, coverage levels off near 84–85%, which is why the threshold is now 80%.
- `gal.mjs`: the gallery keeps 3 pictures, a tap on the card repeats the request, and 🏠 clears the shapes.
- `EXAMPLES_ORIGIN=http://localhost:4213 node examples/_studio/tests/browser.mjs --ids paint-splash --run paint-splash-r1`: BOOT + PLAY ready, 0 errors (Chromium, and WebKit as `paint-splash-r1-wk`). `node --check` passes on every edited JS file.

### Remaining ideas

- An older ladder within mixing: ratios (more yellow = yellow-orange) and tints (a white pot). Both need more paint bits in `PaintMap` and new colours in `colour-model.js`.
- Guests' devices show the request but don't run the tips or adapt; only the host's child sets the tier.
- The leaf outline is a plain lens; a midrib line would read better.
- Needs real children: is a 60% fill the right bar for 3-year-olds on a touch stick, and is the 8 s wet window long enough?

## Round 2 of the 8.5 pass: honest slips, a page that lasts, rescue and a rule tier (2026-10-11)

Starting point: independent review 1 of round 1 scored 7.2 (calm 8, focus 7.5, learning 7.5, fun/depth 6.5, visual 7.5, voice 7, polish 6.8). It found three blockers. Careful play on two-part shapes was marked as a slip. The robots filled the ground, so requests stopped after 4–5 shapes. There was nothing below tier 0 and nothing above tier 2.

### Design

- **Slips are honest.** Only the part being painted can slip. That is the unfinished part with the most of its own paint on it, so a carrot root spilling over the gap into its leaves is no longer a mistake. A cell counts as a slip only when the paint that spoils it was laid since the part opened. When a part is finished, the other parts open afresh from that moment, so earlier spill is not held against them. When a shape is chalked, the ground under it is washed clean at the same game time on every device, so leftover trails and robot paint can't spoil it or stall it at 59%. A part at 45%+ that stops growing for 8 s with nothing wrong on it counts as painted, which covers hard-to-reach tips.
- **A page with a frame.** With no clock the playground is a colouring page. The robots paint only a 2.6 m frame round the edge: they roll across the page with the roller lifted. They also leave the bucket to the child, and the bucket now waits in the frame. A finished shape gets ink lines, and the spill just round it is washed away. At the reveal, paint outside the shapes inside the page softens halfway toward the ground. Only the colour shown changes, so picture hashes are unaffected. The kept picture is now bright inked shapes on a pastel page in a bright frame.
- **Requests never run out.** The page fits about 10 shapes: 4–6 full size, then smaller ones (scale 1 → 0.8 → 0.65 → 0.55) in the gaps. When no shape fits, the host asks once: "Your page is full! Is your picture finished?" ✅ ends the round. 🖌️ files the whole page in My pictures (a top-down snapshot) and washes it for a fresh page on every device, and requests carry on. The coverage-based "nearly all painted" question is gone from the calm round, so there are no double asks. The coverage bar shows only in the quick round.
- **A rescue below tier 0.** If nothing right has gone on the shape for 20 s (or after two slips), a soft dashed ring appears round the pot to use next. It is still, with no pulse, and it moves to the second paint once the first is on. The game says once: "Try the yellow pot." At 45 s a still picture appears on the shape: one nearly solid stripe of each paint, crossing, with the mix where they meet (three stripes for brown). The game says: "Look: yellow, then blue on top while it shines." Progress is timed for the whole shape, so painting part one doesn't count as being stuck on part two. A rescue counts as help, so the skill does not rise. At skill below 0.5, shapes are 85% size.
- **Tier 3 for ages 6–8: rules with more than one answer.** About 45% of top-tier requests are rules on one-part shapes:
  - "Paint the heart a colour with blue in it!": green or purple, and the child chooses.
  - "Paint the star a mixed colour with no blue!": only orange, worked out by elimination.

  The card shows 🦋 ❓ and the rule in pictures: ● + ❓, or a paint with a line through it. The chalk is drawn in the named paint, or in grey for a "no" rule. A slip names why: "That's orange. It has no blue in it." The shape is filled and listed in the colour the child chose (`Job.chosen`), and devices sync it as `mix`. At tier 3 a slip on a named colour says "That's orange, not green." and never shows the recipe. Tier 2 is now mostly two-part shapes.
- **More shapes, less repetition.** There are now 14 shapes: 8 one-part (adding sun, apple and butterfly) and 6 two-part (adding mushroom, boat and ice cream). Thin ink details help shapes read: a fish eye, a leaf midrib, an apple stalk, a butterfly body and antennae. `chooseJob` gets the round's history. It skips the last 3 shapes and any (shape, colours) pair already asked this round, and changes the colour from the last request.
- **Less voice.**
  - A painted shape gets a chime and its ink lines, with no spoken name; names wait for the ending, and more than 4 shapes are counted: "We painted 7 shapes, in green, orange, brown and purple!"
  - Mixes found while a request is active are added silently to the row of dabs.
  - Pot names are said only in the first round of a visit.
  - Careful scripted play spoke 6.0–7.3 lines a minute, mostly one request line per shape at a scripted pace of 7–30 s per shape. That was 13 lines in 130 s at tier 2→3. Round 1 was 18–26.
- The quick ⏱️ round is unchanged but labelled as free painting ("A quick free paint, with a clock."), so it no longer looks like it is missing the requests.

### Changes (file:line)

| Where | What |
| --- | --- |
| `public/js/jobs.js:30-87` | 14 shapes, `deco` ink details, `SINGLE`/`DOUBLE`/`RULED` |
| `public/js/jobs.js:106`, `:118` | `ruleColours`; `chooseJob(tier, history)` with rules at tier 3 and no repeats |
| `public/js/jobs.js:160` | `fits` takes a scale and a page edge; gap between shapes 0.3 m |
| `public/js/jobs.js:192` | The ground under a new shape is washed at `t0` |
| `public/js/jobs.js:243` | `check`: slips only on the active part, judged on the offending paint's own time, against `part.t0` |
| `public/js/jobs.js:286-330` | `chosen` (rule colour), `fill` (re-opens the other parts, tidies when the shape is done), `tidy`, `ghost` |
| `public/js/paint.js:243` | `soften(keep)`: display-only fade of non-shape paint |
| `public/js/bot.js:24`, `:64`, `:91`, `:128` | Frame mode: goals along the edge, no swirls, narrow wall margin |
| `public/js/main.js:55-76` | `TOP_TIER` 3, `RESCUE_MS`, `GHOST_MS`, `STALL_*`, `FRAME`/`inFrame`, `potsNamed` |
| `public/js/main.js:385` | 🖌️ on a full page turns to a fresh page |
| `public/js/main.js:854`, `:1786` | Coverage bar and coverage ask only in the quick round |
| `public/js/main.js:1087` | Calm bucket spawns in the frame |
| `public/js/main.js:1230`, `:1248` | Robots paint only in the frame; no pickups for calm robots |
| `public/js/main.js:1424` | Calm discoveries are silent |
| `public/js/main.js:1484-1560` | `nextJob` (scales, page full), `onJob` (rules, `mix`, `page`), `addJob` |
| `public/js/main.js:1563-1610` | Rule card, `nextPaint`, `suggestPot` |
| `public/js/main.js:1609-1690` | `checkJob`: rule and tier-3 slip lines, job-level progress, rescue ring and ghost, stall finish |
| `public/js/main.js:1696-1750` | `finishJob` (chime only), `freshPage`/`turnPage`, `softenPage`, `keepWholePage` |
| `public/js/main.js:1013` | Long shape lists are counted with their colours |
| `public/js/main.js:1856` | Debug `chalk()` for tests |
| `public/style.css` | `.pot.suggest` (still dashed ring), rule card `.q.big`, `.no` |
| `public/index.html`, `game.json` | Quick round labelled free painting; `howToPlay`/`learning` describe the frame, rescue, fresh page and rules (`public/bitgames.json` stale until the coordinator rebuilds) |

### Evidence

Scripts and screenshots are in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/264c5237-472d-4187-be3f-45d364aa4d2a/scratchpad/polish/paint-splash/` (`r2/`). Speech was stubbed and logged. Every run had 0 console or page errors.

- `careful2.mjs`, careful rows with drying between parts:
  - Portrait tier 0: 7 shapes and 0 slips. The skill climbed 0 → 3 and the recipe hid from shape 2.
  - Landscape tier 2: 7 shapes, including the mushroom, the tree and two rules, with 0 slips. The skill went 2 → 3.5. A carrot run had 0 slips (round 1 had a false slip on every carrot). Before the job-level progress fix, a two-part shape set off a false "Try the yellow pot." That is fixed.
  - Landscape tier 1: 4 shapes. The results line named them.
  - See `r2/fin2-land-t1-5-results.png` (softened page, bright frame) against round 1's scribble.
- `stuck.mjs`:
  - One pot: the slip and the fix line, then the ring at 20 s with "Try the yellow pot.", then the ghost at 46 s with "Look: yellow, then blue on top while it shines." That was 5 lines in 57 s with no nagging. See `r2/one2-1.png`.
  - Random pots: 0 shapes in 100 s, with 84–100% of the shape wrong.
- `botpage.mjs`: idle child, 90 s. Robots painted 29,137 of 39,650 frame cells and 314 of 69,050 page cells (the roller's edge bleeding inward).
- `pagefull.mjs`: 10 shapes fit before the page was full (scales `[1,1,1,1,0.8,1,1,0.8,0.55,0.55]`). 🖌️ moved the gallery from 0 to 1 picture, washed the page and chalked a new request (see `r2/pf-portrait-full.png`, `r2/pf-portrait-fresh.png` and `r2/kept-page.jpg`).
- `duo2.mjs`: two iframes with real WebRTC at tier 3. A rule butterfly and a balloon were painted across a fresh page. Both devices had the same `jobs`, the same chosen colours and 1 gallery picture each, and the final hashes matched (`-951741609`).
- `look.mjs`: the rule cards fit at 1194×834, 667×375 and 375×667. `shapes.mjs` (`r2/shapes.png`) shows all 14 shapes. `quick2.mjs`: the quick round is unchanged (coverage bar, spoken mixes).
- `EXAMPLES_ORIGIN=http://localhost:4213 node examples/_studio/tests/browser.mjs --ids paint-splash --run paint-splash-r2`: BOOT + PLAY ready, 0 errors. `node --check` passes on `main.js`, `jobs.js`, `bot.js` and `paint.js`.

### Remaining ideas

- Tints and ratios (a white pot, yellow-orange) for a fifth step. This needs more paint bits and `colour-model.js` colours.
- On small portrait phones a request can land partly off screen. `nextJob` prefers on-screen spots but doesn't require them.
- A guest's own child gets no rescue or adaptation (only the host's child does).
- The child's travel trail across the page stays vivid during play (it softens only at the reveal). A lifted roller while travelling would be cleaner, but painting freely is the toy.

## Round 3 of the 8.5 pass: honest rules, findable requests, a quiet question, a tier for 6–8 and the child's own choice (2026-10-11)

Starting point: independent review of round 2 scored 7.9 (calm 8.5, focus 8, learning 8, fun/depth 7.6, visual 7.7, voice 7.8, polish 7.2). It found these blockers:
- A false teaching line: brown was said to have "no red in it".
- Requests were chalked partly or wholly off screen.
- Queued lines cut off the Finished question.
- Careful two-part play was marked as a slip.
- Scribble competed with the shapes during play.
- The depth stopped at tier 3, and the child never chose anything.

### Design

- **Rules say exactly what counts, and slips tell the truth.** "A colour with blue in it" became "a mix of blue and one more paint" (green or purple). "A mixed colour with no yellow" became "a mix of two paints with no yellow" (purple). That matches the scoring: brown and plain blue are not two-paint mixes.
  - Slip lines come from `ruleSlip`. Brown always gets "That's brown. It has all three paints in it. Use just two." A forbidden plain paint gets "That's yellow. This one needs no yellow." "It has no X in it" is said only when the colour truly lacks X.
  - Plain X left on an "X and one more" shape gets "Blue alone is not a mix. Blue needs a friend!" once a round. The rescue ring then waits 8 s more before it comes.
- **Requests are always findable.**
  - `nextJob` first requires the whole shape (13 rim and centre points) to sit in the clear part of the screen: below the request card, above the pots, and as seen from where the follow camera is heading. It tries every scale this way first. Only when nothing fits does it accept partly visible spots, scored by how much shows. Only when nothing fits at all is the page full.
  - A request that still lands out of sight gets a camera glance: the follow camera eases 75% of the way over to it for 2.8 s, then comes back.
  - Whenever the active part's middle is off screen or under the card, a still arrow (➜ in a white disc, with the shape's emoji) sits at the edge of the clear view, pointing to it. It fades in and out and has no motion of its own.
  - Shapes also keep clear of the ground hidden behind tall things (a fountain hid a boat hull in round 2). The hidden strip is 0.75 m per metre of height.
- **The Finished question is never talked over.** While ✅ / 🖌️ shows, waiting lines and the next request hold back (`asking()`). When it closes, there is a 1.5 s pause before anything waiting is said.
- **Careful two-part painting is never a slip.** When a part is painted, the other parts open 2.5 s later (`OPEN_GRACE_MS`, was 2 ms), so rolling on from the last row of petals onto the stem is forgiven.
- **The shapes are the picture during play.** Dry paint off the shapes softens once a second, by 55% on the page and 30% in the robots' frame. Wet paint stays true while it can still mix, and so does paint on a shape still being painted. Fresh paint on a cell shows bright again. The fade is display only (`PaintMap.soft`), so picture hashes are unchanged. The reveal uses the same amounts.
- **Tier 4 for 6–8 year olds** (`TOP_TIER` 4; recipes stay hidden from `RULE_TIER` 3). About 85% of tier-4 requests are rules:
  - Rules on the choosy part of two-part shapes: "Paint the flower: a green stem, and the petals a mix with red but no blue!"
  - Two-condition rules, solved by elimination: "Paint the balloon a mix with yellow but no red!"
  - The card shows ● + ❓ beside a crossed-out ●.
- **The child's own choice.** Every 5th request, at any tier, is "Paint the fish any colour you can mix!" (🎨 on the card). Brown counts too. When it is painted, the game says what the child chose and how they made it: "Purple! Red and blue make purple." It is listed in the results like any shape. It is for making, so it does not move the skill up.
- **Spread.** `chooseJob` still skips the last 3 shapes. It now also never picks a shape asked more than once more than the least-asked one this round. In two 4-minute runs the most-asked shape came up 3 times out of 19–21.

### Changes (file:line)

| Where | What |
| --- | --- |
| `public/js/jobs.js:92`, `:106`, `:108` | `RULED2`, `OPEN_GRACE_MS`, `CHOICE_EVERY` |
| `public/js/jobs.js:118-185` | `ruleColours` (`with` + `without`, `any`), `makeRule`, `chooseJob` (tier 4, choice every 5th, spread) |
| `public/js/jobs.js:195` | `fits` keeps clear of ground hidden behind tall obstacles (`arena.js:123` records `h`) |
| `public/js/jobs.js:342` | Other parts reopen after the grace |
| `public/js/paint.js:180`, `:251` | `soft` display flag; `soften(amountAt, before)` |
| `public/js/main.js:58`, `:71` | `RULE_TIER`, `GLANCE_MS` |
| `public/js/main.js:487`, `:1453` | `asking()` holds `sayNextMix` and `nextJob` |
| `public/js/main.js:1348` | `followTarget` glance |
| `public/js/main.js:1489-1505` | `ruleWords`, `ruleSlip` |
| `public/js/main.js:1522-1638` | `clearView`, `shownShare`, `nextJob` (strict on screen first), `updateJobArrow` |
| `public/js/main.js:1640` | `validRule`/`cleanRule` accept two-condition and choice rules from the host |
| `public/js/main.js:1678` | Glance when a request is chalked out of sight |
| `public/js/main.js:1772`, `:1778` | "needs a friend" line; the rescue waits after a tip |
| `public/js/main.js:1805`, `:1835` | A choice shape doesn't raise the skill; the chosen colour and its recipe are said |
| `public/js/main.js:1875-1890` | `softAmount`, `softenDry` (in `updateHud`), `softenPage` |
| `public/index.html:81`, `public/style.css` | `#job-arrow`; card `.gap` and `.pick` |
| `game.json` | `howToPlay` and `learning` mention tier 4 and the child's choice (`public/bitgames.json` stale until the coordinator rebuilds) |

### Evidence

Scripts and screenshots are in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/264c5237-472d-4187-be3f-45d364aa4d2a/scratchpad/polish/paint-splash/r3/`. Speech was stubbed and logged. Every run had 0 console or page errors, except one found and fixed: a tier-0 choice request tried to say a recipe for a rule part.

- `careful.mjs` (the reviewer's script) ran with only 1 s between parts:
  - Portrait tier 0: 19 shapes in 254 s with 0 slips. The skill went 0 → 4.5.
  - Landscape tier 3: 21 shapes in 241 s with 0 slips.
  - Voice was 7.1–7.5 lines a minute: one request per shape plus a choice line every 5 shapes.
  - See `fp-t0-3-later.png` (soft trails, crisp inked shapes) and `fl-t3-5-results.png`.
- `random.mjs` (random pots over the shape): the skill stayed at 0–1 against 4.5 for careful play, and most shapes had a slip.
- `checks.mjs` and `grace.mjs`:
  - Brown on "with red" says "That's brown. It has all three paints in it. Use just two."
  - Plain blue on "with blue" says "Blue alone is not a mix. Blue needs a friend!"
  - Red spilled on the stem within the grace gives 0 slips. Red on the stem later gives 1 slip.
  - While the question showed, nothing was said and no request was chalked for 8 s. After 🖌️, "Keep painting!", then the queued line, then the next request.
  - A choice balloon in purple said "Purple! Red and blue make purple." and was listed as `['balloon', 5]`.
- `offscreen.mjs` teleports the child between instant fills and measures each request 1.5 s after it is chalked:
  - 375×667: 0 of 12 entirely off and 0 partly off (round 2: 4 of 5 partly off).
  - 834×1194: 0 of 10.
  - Requests that had to land out of sight were shown by the glance. The arrow showed whenever the request was off screen (`ph-arrow.png`).
- `look.mjs`: the tier-4 card fits at 375×667, 667×375 and 1194×834.
- `fill.mjs`: shapes before the page is full: square 7, farm 8, toys 11.
- `duo2.mjs` at tier 4: the guest got `{with:1, without:2}` rules. The final hashes matched (`1399552252`), and both devices sent the same `final`.
- `EXAMPLES_ORIGIN=http://localhost:4213 node examples/_studio/tests/browser.mjs --ids paint-splash --run paint-splash-r3`: BOOT + PLAY ready, 0 errors. `node --check` passes on `main.js`, `jobs.js`, `paint.js` and `arena.js`.

### Remaining ideas

- Tints and ratios (a white pot) are still not built. They need more paint bits and `colour-model.js` colours. Tier 4 deepens reasoning about recipes instead.
- A guest's own child gets no rescue or adaptation (only the host's child does).
- The square fits fewer shapes per page now (about 7), because the fountain's hidden strip is kept clear.
- Random scribbling over a shape can still finish some shapes through the 45% stall rule. The skill does not rise, though, so the steps stay with careful play.

## Round 4 of the 8.5 pass: coats, a slower ladder, the child picks the next shape, and rests (2026-10-11)

Starting point: independent review of round 3 scored 8.4 (calm 8.5, focus 8.5, learning 8.6, fun/depth 8, visual 8, voice 8.1, polish 8.1). Blockers: the wet-layering lesson barely mattered (scrubbing while swapping pots did as well as coats), making stayed narrow (the host placed and chose every shape), the ladder climbed 0.5 a shape and was carried between visits, requests came back to back, and the quick round was noisy. Bugs: requests hidden under the pots tray had no arrow; the results card showed the last pot, not the seat colour; a quick child heard about 11 lines a minute.

### Design

- **Coats are the skill.** The host notes each change of paint the child rolls onto the part being painted (`Job.roll`), giving a list of runs. A part is *in coats* when it has at most one run more than its recipe: yellow then blue (2), or one touch-up (3); brown allows 4. Only a clean, unhelped shape painted in coats moves the requests up. Swapping pots back and forth while scrubbing still paints the shape and is never a failure, but it moves nothing.
  - The first time in a round a shape is done in coats, the game says once: "One coat, then the next on top while it shines. Just like a painter!" The first time a clean shape is scrubbed, it says once: "Next time, try red all over first, then yellow on top."
  - Paint stays wet for 12 s, up from 8 s, so three whole coats of brown fit over a big part before the first coat dries. The shine lasts as long as the paint can still mix, so "while it shines" stays true.
  - Rescue timing counts a coat that can still become the wanted colour as progress (half weight). Laying the first two coats of brown no longer brings a false "Try the blue pot."
- **A slower, age-safe ladder.** Each clean shape in coats now adds +0.25 (it was +0.5), and a slip still costs 0.5. A visit starts at tier 2 at most (`CARRY_SKILL`), so tiers 3–4 are earned again each visit. Tests can start at any step with `?debug&skill=4`.
- **The child picks the next shape.** After the first shape, the card offers three chalk shapes in dashed rings, all with room on the page. The child taps one and it is chalked near them. The game still chooses its colour or rule, which is the puzzle.
  - "Which shape next? Tap one." is said once a round.
  - A child who doesn't pick gets a shape after 16 s.
  - If no offered shape fits, the page is full.
- **Rests.** There is now a 6 s pause after each shape (it was 3 s). Every 4th shape, the pause is 10 s longer and the card waits up to 60 s for the pick, so there is time to paint freely or look at the page. A careful child now hears 4.3–4.6 lines a minute (round 3: 5–7.5).
- **Requests are never hidden under buttons.** `underButtons` treats the pots tray and 📣 as covered ground in three places: in placement (`shownShare`), in the arrow (`updateJobArrow`) and in the rescue picture. The still picture of the mix is now drawn at the visible point of the part nearest its middle (`visiblePoint`), not at the polygon centre.
- **Results.** Each painter card shows the painter's seat colour (the ring they wore). Shape chips stop at 8 (7 plus "+N"), so a long round reads as a picture, not a tally.
- **Quick round.** The coverage bar is gone and new mixes are no longer spoken. A mix just joins the row of dabs, and its recipe card shows silently with a soft drip.

### Changes (file:line)

| Where | What |
| --- | --- |
| `public/js/jobs.js:229`, `:325`, `:338`, `:368` | `runs`/`cellSet` per part; `roll(paint, t, x, z, bits)`; `Job.layered`; other parts' runs reset when they open |
| `public/js/jobs.js:396` | `ghost(part, at)` draws at a given visible point |
| `public/js/paint.js:62`, `:268` | `WET_MS` 12000; `PaintMap.index` |
| `public/js/main.js:73-90` | `NEXT_JOB_MS` 6000, `REST_MS`, `PICK_N`, `REST_EVERY`, `PICK_WAIT_MS`, `REST_PICK_MS`, `SKILL_STEP`, `SLIP_STEP`, `CARRY_SKILL` |
| `public/js/main.js:234` | `?debug&skill=` override for tests |
| `public/js/main.js:437` | Card tap: pick an offered shape, or hear the request again |
| `public/js/main.js:890`, `:1481` | Quick round: no coverage bar, silent discoveries |
| `public/js/main.js:1090-1117` | `SHAPE_CHIPS` cap; seat colour on the cards |
| `public/js/main.js:1280` | Host notes the child's runs on the request (`emitStrokes`) |
| `public/js/main.js:1582-1690` | `underButtons`, `inView`, `placeSpot`, `nextJob` (offers), `pickJob`, `chalkJob` |
| `public/js/main.js:1705`, `:1776` | Arrow when under buttons; card renders the offer |
| `public/js/main.js:1849`, `:1900-1915`, `:1931` | Progress counts coats; skill step only for coats, plus the two once-a-round lines; `visiblePoint` |
| `public/style.css:133` | `.job-card.offer`, `.opt` (dashed chalk rings, no motion), `.shape-chip.more` |
| `game.json` | `howToPlay`/`learning` describe coats and picking (`public/bitgames.json` stays stale until the coordinator rebuilds) |

### Evidence

Scripts and screenshots are in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/264c5237-472d-4187-be3f-45d364aa4d2a/scratchpad/polish/paint-splash/r4/`. Speech was stubbed. Every run had 0 console or page errors.

| Run | Shapes | Slips | Skill | Lines a minute | Notes |
| --- | --- | --- | --- | --- | --- |
| `careful.mjs … coats`, portrait tier 0 | 11 in 4 min | 0 | 0 → 2.25 | 4.6 | Runs were "12" / "24" |
| `careful.mjs … coats`, landscape, stored skill 3 | 8 in 3.5 min | 0 | 2 → 3.75 | 4.5 | Carried skill capped at 2 |
| `careful.mjs … coats`, tier 4 with `Q='&skill=4'`, portrait | 4 | 0 | 4.5 | — | Brown parts "4124" / "124" |
| `careful.mjs … coats`, tier 4 with `Q='&skill=4'`, landscape | 5 | 0 | 4.5 | — | Two-condition rules |
| `careful.mjs … rows` (round 3's script: swaps pots every row), portrait tier 0 | 12–14 | 0 | 0 → 0.75–1.25 | — | Runs "1212" / "141414" earned no step; heard "Next time, try red all over first, then blue on top." once |
| `sloppy.mjs` (swaps pots every 1.5–3 s), landscape, stored skill 3 | 9 | — | 2 → 2.25 | — | Flower "1212" / "12124242" |
| `sloppy.mjs`, portrait tier 0 | 12 | — | 2.25 | — | Small tier-0 shapes often finish in 2–3 runs, which really is coats |
| `random.mjs shape` | 3 in 3 min | 1 each | 0 | — | — |
| `random.mjs free` | 0 in 3 min | — | — | — | Ring at 21 s, ghost at 46 s |

- `stuck.mjs one`: the wet tip at 20 s, the ring at 34 s, then the ghost at 51 s with "Look: red, then yellow on top while it shines." That was 4 lines in 72 s.
- `offer.mjs`: the offer card at 834×1194, 1194×834 and 375×667 (`offer-*.png`). Its aria-label reads "Pick the next shape: flower, carrot or butterfly".
- `pots.mjs`: a fish chalked under the landscape pots tray shows the arrow (`pots-arrow.png`).
- `duo.mjs`: the guest's card stays hidden while the host picks. After `pick(1)` both devices got the apple. Final hashes matched (`-625073458`), and the final messages were identical.
- `quick.mjs`: the quick round spoke only its start line and the ending. The coverage bar is hidden.
- `cl-t3-5-results.png`: the pig's card is red, its seat colour.
- `EXAMPLES_ORIGIN=http://localhost:4213 node examples/_studio/tests/browser.mjs --ids paint-splash --run paint-splash-r4`: BOOT + PLAY ready, 0 errors. `node --check` passes on `main.js`, `jobs.js` and `paint.js`.

### Remaining ideas

- Tints and ratios (a white pot) for a step past recipe logic. This needs more paint bits and `colour-model.js` colours.
- The child picks which shape comes next, but not where it goes. Dragging a chalk shape onto the page would add placement.
- The coat count uses the roller's middle plus four points 0.55 m out. Edging along a part's outline can note a run.
- A guest's own child still gets no rescue or adaptation, and no pick card (the host picks).

## Round 5: a white pot for tints, ratio goals, true coats, and the reviewer's bugs (2026-10-11)

Starting point: the round 4 review scored 8.5 (calm 8.7, focus 8.5, learning 8.7, fun/depth 8.1, visual 8.2, voice 8.6, polish 8.4). Open audit item: "an older ladder: ratios (yellow-orange), brown from three, tints". Brown from three was already built; tints and ratios were not. Bugs: the boat said "a brown boat"; the pick card was silent after the first offer; the rescue stripes sat under the child's painter; wet paint could smudge a just-inked shape. Blockers: breadth stopped at four mixes, and quick pot swapping over small shapes still counted as coats.

### Design

- **Tier 5: the white pot (tints).** A careful child who passes tier 4 gets a ⚪ white pot beside red, yellow and blue. It is said once a round: "A new pot: white! White makes a colour lighter." About half of the requests now ask for a light colour ("Paint the heart pink!", "a light blue sail and a brown hull", "a light green scoop"). The rest are tier 4's mixes and rules, where white would spoil the colour. So the decision on every shape is whether white belongs, and which paint it lightens. Recipes stay hidden (❓ + ❓). A slip names what happened, and the first time in a round it says why: "That's light green, not green. White makes colours light." On a rule part it says "That's pink. White made it light. This one needs no white." The rescue, the wet tip ("Roll white over the shiny red!") and the still picture all work with white. Every 5th shape the child's own choice can now be light ("any colour you can mix, light or not"), and the ending says the recipe back ("Pink! Red and white make pink."). The results show tint recipes too (● + ⚪ = pink).
  - A light mix (light green, light orange) needs three coats while wet. A careful script could not finish those over large petals within `WET_MS`, so only the smaller ice-cream scoop asks for them. The big shapes ask for pink or light blue.
- **Ratios, in the colour studio.** The bit-based paint grid records which paints are on a cell, not how much, so a ratio cannot be painted on the ground. The colour studio counts drops, and it already said "More yellow: a yellowish orange!". It now gives a child who has reached the rule steps (on any visit) a 🎯 goal swatch: "Can you mix a yellowish orange?" Mixing it, with more of one paint than the other and none of the third, says "A yellowish orange! More yellow than red." and ticks the swatch ✅. Emptying the cup brings the next of six goals (reddish orange, bluish green, and so on). Each goal is said once.
- **Coats mean coats.** A part counts as painted in coats only when the first coat covered at least 80% of it before the next paint went on (`COAT_SHARE`). A paint that only crossed a part on its way (less than 10% cover, `TRANSIT_SHARE`) is forgotten. After a part is painted, the paint the child is still rolling (finishing the row) is neither a coat nor a slip on the next part until they change pot (`carry`). Without this, careful two-part shapes failed: the cone logged "2124" from the scoop's last yellow row.
- **Re-earning is quicker.** Each visit still starts at most at tier 2. Below the highest step reached on any earlier visit (`paint-splash-peak`), each careful shape adds 0.5 instead of 0.25. An older child is back at tier 5 in about six shapes, but every step is still earned by careful painting.
- **Reviewer bugs.**
  - The boat's brown part is the "hull" and the carrot's orange part is the "root" ("Paint the boat: a light blue sail and a brown hull!").
  - On later pick cards (not rests), a child who hasn't picked after 8 s hears the shapes named once: "Star, ice cream or fish?". This line is dropped if they pick first.
  - The still rescue picture avoids cells within 1.8 m of the child's painter.
  - A finished shape is washed once more 2 s later, on every device at the same game time, so a roller still rolling at its edge leaves it crisp.

### Changes (file:line)

| Where | What |
| --- | --- |
| `_studio/originals/colour-model.js:57-66` (copied to `public/js/`) | `WHITE_PAINT`, `TINT`, `tintToyPaint` (the three-drop `mixToyPaint` is unchanged, so `curriculum.test.mjs` still passes) |
| `_studio/originals/colour-studio.js:26`, `:69`, `:82-104`, `:327-334`, `:391`, `:441` (copied) | `GOALS`, the `goals` option, `offerGoal`/`meets`, the 🎯/✅ swatch, the goal line, the next goal on 🫗 |
| `public/js/paint.js:36-62` | `WHITE`, `POTS`, 16 `MIXES` (tints from `tintToyPaint`, white `#ffffff`), `TINTS` |
| `public/js/paint.js:91`, `:178` | Four paint-time layers; `settle`, `write`, `soften` use the white layer |
| `public/js/jobs.js:19-23`, `:41-90`, `:100` | Tint constants, `tints` per shape (big shapes pink and light blue only), `hull`, `root`, `TINTED` |
| `public/js/jobs.js:107-109`, `:132`, `:161` | `COAT_SHARE`, `TRANSIT_SHARE`; `any` + `light`; tier 5 in `chooseJob` |
| `public/js/jobs.js:246`, `:319`, `:345-381`, `:406`, `:528` | `byMix` 16; slips ignore carried paint; `roll` (transit, carry, first cover), `layered`, `fill(…, carry)`, `coverSince` |
| `public/js/main.js:57-99`, `:241`, `:271` | `TOP_TIER` 5, `WHITE_TIER`, `REEARN_STEP`, `RETIDY_MS`, `PICK_SAY_MS`; `peak`; studio `goals` |
| `public/js/main.js:465-506` | `w`/`4` key; `choosePot` accepts white once it is out; `updatePots` shows the white pot |
| `public/js/main.js:1118`, `:1471` | Tint recipes on the results; the white dab gets a ring |
| `public/js/main.js:1512`, `:1547-1554`, `:1694` | Stale offer lines dropped; `ruleWords`/`ruleSlip` for white; shapes named after 8 s |
| `public/js/main.js:1712`, `:1753-1768`, `:1790` | `white` on the job message; guests accept tints and `light`; white pot plus its once-a-round line |
| `public/js/main.js:1882`, `:1947`, `:1967-1970`, `:1984`, `:2063` | Pale slip line; re-earn step; carry and retidy; `visiblePoint` off the painter; `retidy()` |
| `public/index.html:79`, `public/style.css:110`, `:161` | `#pot-white` (hidden until tier 5), `.dab.white`, `.pot.white` |
| `game.json` | `howToPlay`/`learning` mention the white pot and the studio's ratio goals (`public/bitgames.json` stays stale until the coordinator rebuilds) |

### Evidence

Scripts and screenshots are in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/264c5237-472d-4187-be3f-45d364aa4d2a/scratchpad/polish/paint-splash/r5/`. Speech was stubbed. Every run had 0 console or page errors.

| Run | Shapes | Slips | Skill | Lines a minute | Notes |
| --- | --- | --- | --- | --- | --- |
| `careful.mjs`, tier 5, landscape (`t5l2`) | 10 in 4 min | 0 | 5 → 5.5 | 5.2 | 7 light requests, all in coats ("18", "48"); `t5l2-3-later.png` |
| `careful.mjs`, tier 5, portrait (`t5p5`) | 7 | 0 | 5.5 | 4.4 | Two-part shapes now coats: "18" + "24", "14" + "124" |
| `careful.mjs`, tier 5, portrait (`t5p6`) | 7 | 0 | 5.5 | — | `t5p6-5-results.png` shows the light shapes and pink/light-blue recipes |
| `careful.mjs`, tier 2, landscape (`t2l2`) | 6 | 0 | 2 → 3 | 3.7 | Every brown part "124@1.00" (round 5's first try: "2124@0.54", failed) |
| `careful.mjs`, tier 0, portrait (`t0p2`) | 9 in 3 min | 0 | 0 → 2 | — | Every first coat covered 100% |
| `sloppy.mjs` (swaps pots every 1.5–3 s) ×4 | 9–12 | 0–1 | 1.25–2.5 | — | Small shapes often still covered 80%+ per swap, which really is coats; larger shapes show "@0.29"/"@0.47" and earn nothing |
| `random.mjs` (four pots, on the shape) | 1 in 3 min | 1 | 2 → 1.5 | 3.7 | — |

- `tint.mjs`:
  - A pink heart rolled red, then white, painted as "18@1.00" with "One coat, then the next…".
  - White rolled over a green leaf is a slip: "That's light yellow. Yellow and blue make green." (tier 0 wording).
  - The studio goal: "Can you mix a yellowish orange?" After 2 yellow and 1 red, "A yellowish orange! More yellow than red." with ✅ (`tint-6-studio-met.png`). After 🫗, "Can you mix a reddish orange?".
- `t5p4`: a boat with a light blue sail then a brown hull said "That's light blue, not brown. White makes colours light." The script had carried white rows over the hull, which led to the `carry` rule; the run after it (`t5l2`, `t5p5`) had no such slip.
- `names.mjs`: the first offer says "Which shape next? Tap one.". The second says "Sun, butterfly or apple?" after 8 s with no pick (`names-offer.png`).
- `stuck.mjs one`: the rescue picture was placed 1.2–2.5 m from the painter (round 4: under it).
- `duo.mjs` (host at tier 5):
  - The guest sees the white pot and can paint white, and the host sees seat 1 holding paint 8.
  - A light-blue butterfly is chalked, painted and inked on both devices.
  - Final hashes match (`-1102310138`), and both final messages are identical.
- `quick.mjs`: the quick round has no white pot and speaks only its start line and the ending.
- `look.mjs`: the card (pink ● with ● + ⚪ recipe) and results at 1194×834 and 834×1194 (`look-*.png`).
- `EXAMPLES_ORIGIN=http://localhost:4213 node examples/_studio/tests/browser.mjs --ids paint-splash --run paint-splash-c1`: BOOT + PLAY ready, 0 errors.
- `node --check` passes on `main.js`, `jobs.js`, `paint.js`, `colour-studio.js` and `colour-model.js` (both copies). The colour-model tests in `curriculum.test.mjs` pass. That file's catalogue comparison fails until the coordinator rebuilds.

### Checklist status

- **Older ladder: ratios, brown from three, tints: closed.**
  - Brown from three: tiers 2–4.
  - Tints: tier 5, the white pot, in core play.
  - Ratios: the colour studio's goals. The paint grid holds which paints, not amounts, so ratios live where drops are counted.

### Remaining ideas

- The child still picks which shape comes next, not where it goes.
- A guest's own child gets no rescue or adaptation.
- There is no way to swap a request.
- Softened dry trails look pastel, close to the tints. They are display-only and off the shapes. A different soften colour (greyer, not lighter) could keep "light" special at tier 5.

## Round 6: ratios in play, grey dry trails, a way out when stuck, a sand timer (2026-10-11)

Starting point: the round 5 review scored 8.5 (calm 8.7, focus 8.6, learning 8.7, fun/depth 8.3, visual 8.1, voice 8.7, polish 8.5). The checklist item "older ladder: ratios, brown from three, tints" stayed open: ratios lived only in the colour studio, behind a peak-skill gate, and nothing in play pointed to them. Bugs: softened dry trails at tier 5 looked like the tints; difficulty only stepped down when a shape was finished, so a stuck child never got an easier request; the studio goals were hard to find.

### Design

- **Tier 6: ratios on the playground.** The paint grid now records, per cell, which paint a two-paint mix has more of (`PaintMap.lean`). Rolling a paint again over a wet two-paint mix whose other paint went on after it gives "more of" that paint (yellow, red, then yellow again: a yellowish orange). Rolling the other paint again evens it back out. Each step has the same wet window as ordinary mixing (12 s per cell between coats), so big shapes can ask for ratios too. The six ratio colours come from the colour model at 2 : 1 drops. About a third of tier 6 requests are ratios ("Paint the sun reddish orange!"). The first one in a round adds "Reddish means more red." This explains the word without giving the method. The rest are tier 5 requests (tints and rules). So the decision on each shape is now which paint, whether white belongs, and which paint goes on twice. The card shows ❓ + ❓ + ❓ (three coats). An even orange counts as two-thirds of the way there, not as a slip. If the child stops on the even mix for 5 s, one tip comes while it is still wet: "Orange! Now more yellow: roll yellow over the shiny orange." After that the rescue ring points to the lean paint, and the still picture shows two stripes of it and one of the other paint. Coats are judged as before, with three runs for a ratio. Results show `● + ● + ● = ●` and say "Two yellows and one red made yellowish orange!". A request or result names a ratio by a code (bits | lean << 4). Guests accept those codes, and finished ratio cells are filled with their lean on every device.
- **Progress counts coats.** A coat on its way counts as the fraction of the colour's coats it holds: yellow is ⅓ of a yellowish orange, ½ of orange. Before this, the second coat of brown or of a ratio looked like no progress, so tips fired while a careful child was mid-plan.
- **Dry trails go grey, not pale.** `soften` now fades paint toward a quiet grey of its own lightness (`0.75·L + 0.25·220`, `PAGE_SOFT` 0.6), not toward the white ground. A dry red trail is dusty rose (≈196,123,130), not pink (244,173,180), and dry blue is slate (≈118,142,172), not light blue (173,200,231). Light colours now appear only where a child used white.
- **A way out when stuck.** Stuck means one of two things. Either 60 s pass after the still picture with less than 20% of the part painted, or a shape is still less than half done after 3 minutes, even with progress creeping along. Then the requests step down `SLIP_STEP`, once (finishing the shape afterwards moves nothing), and the card shows a quiet dashed 🔄. The voice says once a round: "This one is tricky! Tap the arrows for another shape, or keep trying." Tapping it removes the shape on every device (`drop` message, `dropJob`) and offers new shapes from the easier step.
- **Quick round without a race feel.** There is no 3‑2‑1 any more: one soft chime, as in the calm round. The visible seconds are replaced by a ⏳ sand bar that runs down smoothly (no numbers, colour change or ticking). The voice says "A quick free paint, until the sand runs out." The mode button is ⏳.
- **No idle motion in play.** The "you" heart no longer bobs or spins; it moves only with the painter. Pickups stop floating, spinning and drifting through colours once landed. Their pop-in remains.
- **The studio is findable.** On the menu, "Mix my colours" has a still 🎯 once the child has reached the rule steps, which is when the studio's ratio goals appear. Younger children's studio stays a free mixing table by design.

### Changes (file:line)

| Where | What |
| --- | --- |
| `public/js/paint.js:63-91` | `ISH`, `ratioCode`, `RATIOS` (2 : 1 colours from `describeMix`), `RATIO_CODES`, `colourOf`, `mixWords` for ratios |
| `public/js/paint.js:119`, `:185-235` | `lean` per cell; `write` detects "more of" over a wet mix; `setLean`; `settle(i, lean)` keeps or clears lean and shows the ratio colour |
| `public/js/paint.js:318-330` | `soften` toward grey of the paint's own lightness |
| `public/js/jobs.js:99-105`, `:160-194` | `LEANED`, `WHITE_STEP`, `RATIO_STEP`; tier 6 in `chooseJob` (ratio codes) |
| `public/js/jobs.js:252-260`, `:326-336`, `:547` | Part `code`/`target`/`lean`; ratio hits need the lean, and near counts coats (`coatsIn`) |
| `public/js/jobs.js:405`, `:430-440`, `:470-480` | `layered`, `fill` (sets lean) and `ghost` use `colourOf(code)` |
| `public/js/main.js:52-76` | `TOP_TIER` = 6, `RATIO_TIP_MS`, `STUCK_MS` |
| `public/js/main.js:353`, `public/style.css:79-80` | 🎯 on the studio button |
| `public/js/main.js:462`, `:1843-1862`, `:1758-1762`, `:1840`, `public/style.css:146-147`, `:313` | 🔄 swap: `swapJob`, `dropJob`, guests follow `drop` |
| `public/js/main.js:913`, `:940-952`, `:2158-2161`, `public/index.html:40`, `:64`, `public/style.css:107-110` | No count‑in; sand timer |
| `public/js/main.js:1800-1808`, `:1874-1882`, `:1921`, `:1932-1937`, `:1961-1975` | "Reddish means more red." once a round; `nextPaint` for ratios; progress by coats; ratio tip; step down when stuck |
| `public/js/main.js` (results, card, words) | `colourOf(code)` in `jobName`, `requestWords`, `renderJob`, `recipe`, slip line, ghost words, scrub tip, sparkles, `jobsDone`, `jobsOf`, `onJob` |
| `public/js/main.js:2187`, `public/js/items.js:82-87` | Still heart marker; still pickups |
| `public/js/main.js` debug `chalk` | Also sends the job to guests (for the two-device test) |
| `game.json` | `howToPlay`/`learning`: ratios in play, 🔄, ⏳, 🎯 |

### Evidence

Scripts and screenshots are in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/264c5237-472d-4187-be3f-45d364aa4d2a/scratchpad/polish/paint-splash/r6/`. Speech was stubbed. Every run had 0 console or page errors.

| Run | Shapes | Slips | Skill | Lines a minute | Notes |
| --- | --- | --- | --- | --- | --- |
| `careful.mjs`, tier 6, landscape (`t6l`) | 8 in 4.6 min | 0 | 6 → 6.5 | 4.5 | Ratios "121" (reddish orange sun), "212" (yellowish orange heart), "242" (yellowish green leaf, tree), all in coats |
| `careful.mjs`, tier 6, portrait (`t6p`) | 6 | 0 | 6.5 | 4.7 | Reddish orange cap "121", reddish purple butterfly "141"; `t6p-5-results.png` shows `● + ● + ● = ●` chips |
| `careful.mjs`, tier 5, landscape (`t5l`) | 5 | 0 | 5 → 6 | 5.9 | Earns the ratio step |
| `careful.mjs`, tier 0, portrait (`t0p`) | 10 in 3.5 min | 0 | 0 → 2 | 5.3 | No change at the low steps |
| `random.mjs`, tier 4, on the shape (`rnd4`) | 3 in 5 min | 3 | 4 → 3 | 3.9 | Careless play goes down; careful play goes up |

- `ratio.mjs`:
  - A yellowish-orange fish painted yellow then red stays at share 0 and near 0.67.
  - After 5 s: "Orange! Now more yellow: roll yellow over the shiny orange."
  - One more yellow coat finishes it as code 35 (`ratio-even.png`, `ratio-done.png`).
- `stuck.mjs` (tier 4, no painting, `sim`):
  - The rescue goes ring (25 s), then picture (55 s), then step down to 3.5 with 🔄 on the card (125 s, `stl-swap.png`).
  - Tapping 🔄 brought a tier 3 flower. The voice said "This one is tricky! Tap the arrows for another shape, or keep trying." once.
- `duo.mjs`:
  - The guest saw the host's bluish-green leaf (code 70, lean 4).
  - After painting blue, yellow, blue, all 1256 cells lean blue on both devices, and both list `["leaf",70]`.
  - Final hashes, which now include lean, match (`1617538268`).
- `quick.mjs`:
  - The count-in shows only 🎨 before play.
  - The timer is "⏳" plus a bar (`scaleX(0.424)` at 23 of 40 s, `quick-play.png`).
  - Speech is only "A quick free paint, until the sand runs out." and the ending.
- Trails: in `t6l-3-later.png` and `t6p-3-later.png` the dry trails around the heart and the mushroom are grey-green, slate and dusty rose. The pink fish and star sit apart from them.
- `look.mjs`: the menu 🎯 (`look-1194-menu.png`) and the ratio card at 834 and 1194 wide.
- `EXAMPLES_ORIGIN=http://localhost:4213 node examples/_studio/tests/browser.mjs --ids paint-splash --run paint-splash-c2`: BOOT + PLAY ready, 0 errors.
- `node --check` passes on every file in `public/js/`. The shared colour helpers were not changed this round.

### Checklist status

- **Older ladder: ratios, brown from three, tints: closed.**
  - Brown from three: tiers 2–4.
  - Tints: tier 5, the white pot.
  - Ratios: tier 6, in core play: more of one paint, laid again over the wet mix.
  - The studio keeps its drop-count ratio goals, marked with 🎯 on the menu.
- Reviewer bugs:
  - Pastel trails: fixed.
  - No step down while stuck: fixed (step down + 🔄).
  - Studio hard to find: fixed (🎯). Ratios no longer depend on the studio.

### Remaining ideas

- A guest's own child still gets no rescue or adaptation; the host's checks drive the request.
- The request card can still cover a finished shape near the top edge when the camera follows the child. New requests are kept clear of it (`clearView`), but older inked shapes are not.
- Ratio colours on the ground are display state. If two guests' strokes over the same cell arrive in different orders, they could disagree on a lean mid-stroke. The host's fill makes finished shapes identical everywhere.

## Round 7: bug pass on the third reviews (2026-10-11)

Both reviews scored 8.5 and 8.6. This pass fixes every bug they list and makes no redesign. Paths are under `examples/paint-splash/public/` unless noted.

### Bugs and fixes

| Bug | Fix (file:line) |
| --- | --- |
| Results after a page turn showed a nearly empty fresh page; the full page was only in My pictures | `gallery.keep` returns the picture (`examples/_studio/originals/gallery.js:66-76`, copied to `js/gallery.js`). `freshPage` keeps the last two full pages in `game.pages` (`js/main.js:2175`). The results show them as small page chips before the shape chips (`js/main.js:1123-1128`, `style.css:160-162`, `:317`). When the last page has no finished shape, the last full page is the picture itself (`#results-page`, `index.html:95`, `style.css:235`, `blankPage` `js/main.js:1090`), and the empty page is not auto-kept (`js/main.js:1096`). |
| Hint and slip sentences repeated within a round ("Orange! Red and yellow make orange." twice; the same `ruleSlip` twice on one shape) | Slip lines are said once a round per rule (or colour) and wrong mix (`slip:` key, `js/main.js:1975-1990`, `ruleKey` `:1597`). At the low tiers a repeat slip still shows the recipe on the card, silently (`giveRecipe(..., say)`). The child's own-colour readback says the recipe once a round, then just "Orange!" (`js/main.js:2158-2164`). The wet tip and the ratio tip are once a round per colour (`wet:`/`more:` keys), and the rescue lines go through `sayOnce` (`js/main.js:1955`). |
| Rescue said "Try the red pot." to a child already holding red | It says "Roll your red over the sun." (the part's word on a two-part shape) when the next paint is the one held (`js/main.js:2046-2052`). |
| The same rule was asked twice running ("no blue" on the star, then the heart) | History entries carry `rules` (`chalkJob`). `chooseJob` skips a rule equal to either of the last two ruled requests (`js/jobs.js:186-201`). |
| Tier 2 offered only one-part shapes on a busy page, so brown from three paints could vanish | From tier 2, if no offered option is two-part, `nextJob` tries up to 12 more requests and swaps in the first two-part shape that fits (`js/main.js:1708-1720`). |
| A wrong-lean ratio (red, yellow, red for a yellowish orange) was counted as 2/3 progress and never named | `Job.check` counts the cells leaning the wrong way as `part.off`, at 1/3 progress (the other paint evens it out again) (`js/jobs.js:336-351`). Once `off` reaches `WRONG_SHARE`, it is a gentle slip, named once a round: "That's reddish orange: more red. Yellowish orange needs more yellow." (`js/main.js:2012-2024`). |
| The rescue ring said blue, but the voice and the still picture said "yellow, then blue" on a "with blue" rule | `planOf(part)` gives the colour and its order (the rule's paint first). `nextPaint`, the "Look: …" words and the ghost stripes all use it (`js/main.js:1931-1950`, `:2055-2059`, `js/jobs.js:470-486`). |
| Landscape: an older inked shape near the bottom was cut by the pots tray and the screen edge | `leanToShapes` leans the follow camera down up to 3 m when a finished shape lies just below the clear view, fading out by 7 m and never pushing the shape being painted under the card (`js/main.js:1422`, `:1427-1452`). |
| Robots crossing the page came within about 2 m of the child | Minding the frame, a robot picks no goal whose straight path passes within `CHILD_GAP` (4.5 m) of a child. It waits rather than cross, and gives a child wider room when steering (`js/bot.js:5-13`, `:110`, `:139`, `:120`). |
| The idle drag finger wiggled forever | Three slow strokes, then still (`style.css:206-207`). It is also hidden while the card offers shapes or the finish question shows (`js/main.js:2257`). |

### Evidence

The scripts and screenshots are in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/264c5237-472d-4187-be3f-45d364aa4d2a/scratchpad/polish3/paint-splash/`. Speech was stubbed and logged. Every run had 0 console or page errors.

- `pages.mjs` (834×1194 and 1194×834): the page fills, turns, and the round ends on the empty fresh page.
  - `pg-p-results.png` and `pg-l-results.png` show the full six-shape page as the results picture.
  - `pg-p2-results.png` has one apple on page two. It shows the apple page with the full page as a chip.
  - `t2p-5-results.png` is the natural tier 2 → 4 climb: 14 shapes over a page turn, with a page chip.
- `careful.mjs`:
  - Tier 2, portrait (`t2p.log`): every tier-2 offer includes a two-part shape ("icecream/carrot/tree", "balloon/tree/carrot", "sun/carrot/mushroom"). Rules up to tier 4 never repeat back to back. 26 lines in 6.2 min (4.2 a minute), and no sentence is repeated.
  - Tier 4, landscape (`t4l.log`): 12 shapes, 3.9 lines a minute, no repeated sentence.
  - Tier 6, portrait (`t6p.log`): 8 shapes, ratios "reddish orange" in play, 4.1 lines a minute.
- `rules.mjs`: `chooseJob` ran 200 rounds × 12 requests at tiers 3 and 4: 2652 ruled requests, 0 back-to-back repeats.
- `wronglean.mjs`: on a yellowish-orange fish, red, yellow, red gives `off` 1.0, near 0.33, one slip. The voice says once: "That's reddish orange: more red. Yellowish orange needs more yellow."
- `rescue.mjs` (1194×834):
  - On "a mix of blue and one more paint", holding blue: the ring is on blue and the voice says "Roll your blue over the star.", then "Look: blue, then yellow on top while it shines." The ghost stripes are blue (#4e8ad5), then yellow.
  - Holding red on an orange sun: "Roll your red over the sun."
  - Holding blue on an orange fish: "Try the red pot."
- `lean.mjs` (1194×834): with the ice cream finished below and the child on a star above it, the cone's bottom moved from y 929 px (under the tray) to 715 px, with the whole cone in view (`lean-l.png`). The star's top stayed in view at 203 px.
- `bots.mjs`: the closest any robot came to an idle child in 60 s, at four spots. Before: 4.39, 3.57, 5.45 and 4.06 m. After: 5.04, 5.48, 5.29 and 6.71 m.
- `random.mjs` at tier 3: careless play. No line is repeated, and the step down to 🔄 still works.
- `EXAMPLES_ORIGIN=http://localhost:4213 node examples/_studio/tests/browser.mjs --ids paint-splash --run paint-splash-f1`: BOOT + PLAY ready, 0 errors. `node --check` passes on every file in `public/js/` and on `examples/_studio/originals/gallery.js`.

### Remaining ideas

- In portrait, the request card still covers the top edge of the page.
- Quick mode is still a free paint, and a robot can share the child's paint there.
- The climb from tier 0 to the ratio step is still about 24 careful shapes.
