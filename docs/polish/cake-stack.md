# Cake Stack polish

## Phase 1 calm pass (2026-10-09)

Audit scores before this pass: Calm 6, Focus 7, Educational 5, Engagement 6, Visual 9, Audio 7, UX 8, Technical 8 (see [the audit](AUDIT_2026-10-09.md)). The stacking, the birthday friends, the flavour unlocks, the missions and the recipe studio are unchanged. The pass removes the pressure and hype around them.

### What changed and why

| Change | Where |
| --- | --- |
| The slide speed is one constant, `SLIDE_SPEED = 1.25`. The ramp by level (+0.12) and by cake height (+3% per layer, up to 3.0) is gone, so timing and patience stay the skill. The mission `pace` multiplier still applies. | `public/js/main.js:115-117` |
| The "lined up" glow is a steady warm glow. It used to flicker at about 3 Hz (`Math.sin(t * 20)`). | `main.js:324-325` |
| Perfect drops no longer give stars, show a "Perfect!" or "Perfect xN!" banner, or play a chime that climbs with the streak. The soft golden ring and one fixed two-note chime remain. Width regrowth after three perfect drops is a quiet mechanic and stays. | `main.js:394-398`, `js/audio.js:176-184` |
| Floating "⭐ / ⭐⭐" labels, the score pill, the "🏆 Best!" badge, the title's best score, "Last time" and "New best" are all removed, along with their `localStorage` best. | `main.js` (`land`, `updateHud`, `toTitle`, `start`), `public/index.html` |
| The decorated-layer "Yummy!" banner is removed. The toppers still pop on. | `main.js` (`decorateSide`) |
| **Candles wait for the child.** The 7 s `autoBlow` timer is removed; the finger points at the candles until the child taps. | `main.js:655-657` |
| **Party: one soft moment.** It used to be 220 confetti, 2×60 party poppers, camera shake 0.5, a sawtooth party horn with crowd noise, and a "⭐ +5" bonus with a score bounce. Now 28 slow pastel petals drift down (`effects.drift`, gravity 0.25, 4–5.5 s life) while the music-box Happy Birthday plays once. | `main.js:709-717`, `js/effects.js:131-138`, `js/effects.js:254-263` |
| The party card shows the cake the child made: each layer's flavour emoji from the bottom up, and the layer count. This replaces "⭐ +N". | `main.js:727-730`, `index.html` (`#card-cake`, `#card-count`), `style.css:120-121` |
| The mission reward drifts 14 petals (was a 90-piece confetti shower). The mission banner and its spoken reward are kept. | `main.js:923` |
| Perfect sparkles: 8 slow rising sparkles (was a 26-piece burst). | `effects.js:206-210` |
| Audio: the "cake ready" fanfare uses sine and triangle (was square). `cheer()`, used by the recipe studio, is a gentle sine chord (was a sawtooth horn plus noise). Splat and pop gains are lowered. The waltz step is 0.32 s (was 0.24 s). | `audio.js:176-184`, `audio.js:233-238`, `audio.js:254-262`, `audio.js:275` |
| The idle finger now waits 30 s (was 6 s). The first-drop finger and the candle finger stay. | `main.js:952-954` |
| CSS: the infinite logo bob, Play pulse, badge bob, goal bob, card-emoji bob, and the studio's next-step and next-recipe pulses are off. The finger taps three times, slowly, then rests. `prefers-reduced-motion` turns off the finger, title, card and button entrance animations. | `public/style.css:434-443` |

The recipe studio still passes each layer's position to `perfect(step)`, so a correct recipe sounds as a short rising scale.

### Verification

- `node examples/_studio/tests/browser.mjs --browser chromium --ids cake-stack --run calm`: BOOT + PLAY ready, 0 errors.
- `node examples/_studio/tests/original-quality.mjs`: all pass, including "Actual cake drops count three placed layers" and the mission persistence check.
- `node --test examples/_studio/tests/*.test.mjs`: 10/11 pass. The manifest-hash test fails only because `public/bitgames.json` is stale until the coordinator's build regenerates it.
- I played a whole cake (perfect, good and sloppy drops), the candles, the party, the card, the recipe check and the share tab in Chromium at 834×1194 and 1194×834, with 0 console errors. Before screenshots are in the scratch audit folder `audit/cake-stack/`, after screenshots in `audit/cake-stack/after/`.

### Remaining (Phase 2, from the audit)

- The friend orders a picture recipe (for example 🍓🍦🍓) on the layer dots, and the child waits for the matching flavour, then lines it up. This puts sequencing inside the core action.
- At the party, cut and share the actual cake equally between the guests, reusing the studio's equal-share logic.
- The studio's text buttons ("Check recipe ✓") could become picture-only for pre-readers.
- Trimmed slivers can land beside the camera in landscape and look oversized (`FLOOR_Y` path in `updateSlivers`).

## Phase 2: the recipe inside the stacking (2026-10-09, not yet built or deployed)

### Design

- **The order.** Each birthday friend orders a pictured cake, bottom to top. The order is drawn on the layer dots, each dot an icing-coloured circle with its flavour picture. It also shows in the intro bubble and is spoken: "Bunny wants strawberry, vanilla, strawberry, chocolate!" Tapping the dots says it again. The next dot needed has a steady pink ring (no pulse).
- **Stacking.** Layers still slide at the one constant Phase 1 pace, and each carries a small flavour picture tag. A layer the order does not need yet slides across once and shrinks away; the next one follows. The wanted layer keeps sliding to and fro until the child lines it up and taps. Only the wanted layer gets the "lined up" glow, and the friend hops when it arrives. The odds are tuned so that no more than two other layers pass in a row. Waiting for the right layer is the patience skill; checking the dots is the sequencing skill.
- **A wrong tap is gentle.** The layer dips onto the cake with a soft wobble and floats back up to keep sliding. Nothing is lost or trimmed. The friend says "That one is chocolate. Let's wait for strawberry!", and the next dot grows briefly.
- **Patterns.** Friends 1, 2, 3 and 5 order short sequences of 4–5 layers. Puppy, Fox and every cake after the eighth friend order repeating AB AB AB patterns; Pig and Chick order ABC ABC. The dots are grouped by the repeating unit. Each landed layer is named aloud. When the cake is complete the game names what was built: "Strawberry, vanilla, strawberry, chocolate. Just like Bunny's order!" or "You finished the pattern! Mint, chocolate, …".
- **The party share.** After the candles and Happy Birthday, 2, 3 or 4 friends come to the party (2 + (level − 1) mod 3: the birthday friend and friends from other cakes). The share card shows the child's cake from above, cut into two slices per friend, and one plate per friend with that friend's face. Tapping a plate moves a slice there. Each slice is drawn with the child's actual layer colours. A plate already ahead waits, with a small sideways nudge and the words "Cat has 2. Dog and Panda are still waiting!", so the child deals "one for you, one for you". The friends still waiting have a steady yellow ring. When every slice is shared, the game says "4 friends, 2 slices each! Everyone has the same." The party card then shows the cake's layers and each friend with their slices (🐱🍰🍰 🐶🍰🍰 …).
- **Modes.** The adventure picker now runs 🧁 Friend's order (the default), 🐢 Gentle layer counting, 🧮 Count five layers, then 🎂 Free stacking. The counting missions and free stacking keep any layer that lands, with numbered dots and the 🕯️ finish button, as before. The order is the core loop and owns its own ending, so the 🕯️ button is hidden in order mode. A saved choice of 0 (formerly Free stacking) now opens the friend's order; saved choices 1 and 2 are unchanged.
- **Equal-share rule.** The rule is the recipe studio's: two slices per friend, and fair means every plate holds slices ÷ friends. `recipe-studio.js` is a copied shared file and exports nothing for this, so `party-share.js` restates the rule (`SLICES_EACH = 2`) and cites the studio. It does not edit the studio.

### Files

| Change | Where |
| --- | --- |
| Orders per friend, the generated patterns for cake 9 onward, and word helpers | new `public/js/orders.js` |
| The party share card: the cake top cut into wedges, plates, dealing "one each", spoken result | new `public/js/party-share.js` |
| Speech helper that respects mute (`speak`, `hush`) | `main.js:72-83` |
| The adventure options (order first, free stacking last) | `main.js:109-115` |
| `orderMode`, `targetLayers`, `wanted` | `main.js:128-131` |
| `pickOrderFlavour` (at most two misses in a row) | `main.js:295-309` |
| A passing layer slides once and shrinks away; the glow is only for the wanted layer | `main.js:334-375` |
| `notThisOne`: the gentle dip, bounce back and spoken hint | `main.js:403-430` |
| Naming each landed layer; the 🕯️ button hidden in order mode | `main.js:505-513` |
| The learned summary at the finished cake | `main.js:704-710` |
| `partyGuests`, `startShare`, the card's share line | `main.js:812-862` |
| The order chosen at each cake, the pictured intro and the spoken order | `main.js:896-925` |
| Order dots, `sayOrder`, `askPip`, the mover tag | `main.js:1014-1100` |
| Keyboard: Space/Enter gives to the next waiting friend, 1–4 pick a plate; tapping the dots repeats the order | `main.js:1283-1300` |
| `#mover-tag`, `#card-share`, `#share` | `public/index.html` |
| Order dots, mover tag, share card, plates, reduced motion | `public/style.css:444-end` |

### Evidence

- I played full cakes with Playwright in Chromium at 834×1194 (Bunny), 1194×834 (Cat) and 667×375 (Puppy, AB pattern), and in WebKit at 1194×834. Each run deliberately tapped wrong layers twice, built the exact ordered cake, blew the candles, tapped an ahead plate (refused gently, state stayed 1/0/0), dealt the rest fairly to 2/2/2 or 2/2/2/2, reached the card and started the next friend. 0 console errors. Scripts and screenshots are in the scratch folder `p2/cake-stack/` (`play.mjs`, `keys.mjs`, `*-N-*.png`).
- Keyboard with reduced motion: Space on a passing layer places nothing (0 layers). In the share, "2" twice gives one slice (the second press is refused), and Space deals the rest fairly to reach the card.
- `browser.mjs --run p2 --ids cake-stack`: Chromium and WebKit BOOT + PLAY ready, 0 errors.
- `original-quality.mjs`: all 15 pass, including "Actual cake drops count three placed layers". The counting missions keep free stacking, so any tap lands.
- `node --test examples/_studio/tests/*.test.mjs`: only the manifest-hash test fails, as expected until the coordinator rebuilds.

### Left

- The other guests appear only as faces on the share card, not as 3D animals at the counter.
- In order mode the child cannot finish early except through 🏠 (orders are 4–6 layers).
- The studio's text buttons could become picture-only (unchanged from Phase 1).
- Slivers in landscape (unchanged from Phase 1).

### Simplify pass (2026-10-09)

- One shared voice (`speech.js`, rate 0.85, pitch 1) replaces the game's own `speak`/`hush`. It is passed to the adventure and the recipe studio. Game lines still interrupt, as before: they are tap feedback. The party share keeps its `speak` callback.
- Removed dead code: `effects.js` `shower()`, `popper()`, `CONFETTI` and the 700-instance confetti pool, which was still being updated every frame. The header comment now describes the petals. `drift()` is the one soft moment.
- Dead CSS removed: `.pill`, `.scores`, `.score b`, `#best-badge`, `.badge`, `.pill.score.pop` with `@keyframes score-pop`, and the `.banner.low` block (no code adds `low`).
- Checks: Chromium and WebKit `browser.mjs` passed with 0 errors. A Playwright play from order to wrong taps, cake, candles, share and card spoke every line in order, with 0 console errors in both engines. Tests: 11/11.
- Iteration 2: the mission progress uses the shared step row (`icon: '🍰'`, `goalWords: true`); `renderProgress` and the `.goal-slices` CSS are gone, and the slice sizes moved to `#hud .adventure-steps`. The `speak` wrapper became `voice.sayNow` (the party share gets `voice.sayNow` too). `isMuted` is no longer passed to the adventure. The sound toggle now hushes the voice when it mutes. The calm-pass `animation: none` overrides were folded back into their sources: the logo, Play, full-pips and card-emoji loops, the recipe-step `step-pulse`, and the dead `bob`, `pulse` and `step-pulse` keyframes are gone. The hint finger's three slow taps now live on `.hint-finger` itself.
- Iteration 2 checks: Chromium and WebKit `browser.mjs` 0 errors; `original-quality.mjs` passed; tests 11/11. A Playwright run with a stubbed `speechSynthesis` showed the new choice button, the slice row lighting 1/3 to ⭐, the words "1", "2", reward in order, mute cancelling speech, and 0 console errors in both engines.
- Third pass: the voice starts with `muted: sound.muted`, and `setSound` calls `voice.setMuted(!on)`, which also covers the saved setting on load. The `[hidden]` goal rule is gone; `#hud.partying .adventure-goal` stays.
- Third pass checks: Chromium and WebKit `browser.mjs` 0 errors; `original-quality.mjs` passed; tests 11/11. A Playwright run with stubbed speech in both engines showed that mute hushes, nothing is said while muted, unmute speaks again, and a saved mute stays silent after a reload. The goal shows only for the mission options, with 0 console errors.
- Exit paths (iteration 9): every exit (🏠, Escape, card 🏠, Play again) goes through `endRun()`, which bumps `game.run`, clears tweens and hushes. The one late timer without the run guard, the 250 ms "↔️" grow label after a perfect drop, now checks `run === game.run`.
- Exit-path checks: Chromium and WebKit `browser.mjs --run exits` 0 errors; `original-quality.mjs` passed; tests 11/11. A Playwright run with stubbed speech forced a growing perfect drop: staying shows ↔️; Escape or 🏠 right after the landing hushed and left no ↔️ on the title 3 s later (the unguarded code showed one). 0 console errors in both engines.

## Round 1 decision pass (2026-10-11, not yet built or deployed)

Starting point: the 2026-10-10 re-audit (overall 7). The wanted layer was the only one that stayed and glowed and made the friend hop, so the game made the choice for the child. Every slice and every layer was spoken. Sharing was always two slices each, the share card's vanilla top read as a blank white circle, and vanilla was shown as 🍦.

### Design

- **Every layer looks and moves alike.** In an order, each layer slides across and back once and then makes way for the next one, the wanted one included. Any layer glows when it is lined up (the glow is about timing, not flavour), and the friend no longer hops for the right one. To decide, the child has to compare the layer's picture with the next dot. A wanted layer that is let go comes round again: at most two others pass in a row.
- **Wrong taps matter, gently.** A wrong layer dips, bounces back and then slides away (it does not come back to slide). The wanted layer then has to come round again, and the next dot grows. Only the first slip of a cake is put into words. Tapping at once also lands layers off-centre, so random tapping builds a slimmer cake more slowly than careful tapping does.
- **Patterns hide their end.** Pattern orders show "?" dots for the last part (at least two whole units stay visible where the cake is tall enough). The voice reads only the visible part: "Puppy wants a pattern! mint, chocolate, mint, chocolate. What comes next?" A "?" layer the child works out is named as its picture appears. After two wrong taps on the same "?", its picture shows ("Mint comes next.").
- **Adaptive tier (0–3), never announced.** A cake built with no wrong taps steps up one tier; three or more wrong taps step down one. The tier is kept per device in `localStorage`.
  - Tier 1: some party shares leave slices that cannot go round.
  - Tier 2: every friend orders a 6–9 layer AB or ABC pattern to finish (the friend's new flavour leads it), and up to 4 slices each.
  - Tier 3: ABB, AAB, ABC and AABB patterns, and sometimes a growing pattern (A B, A B B, A B B B, with the last part hidden).
- **Real division at the party.** The cake is cut into 4, 6, 8 or 12 slices for 2–4 friends. Dealing still refuses a plate that is ahead.
  - From tier 1 a baker's plate (🧑‍🍳) is there whenever 3–4 friends come, even when the slices share out exactly, so the child decides when the sharing must stop. When too few are left for everyone, a friend's plate refuses: "Only 2 left for 3 friends. Not enough to go round!" The baker refuses while a round can still go round: "Friends first!".
  - The result is spoken once: "8 slices, 3 friends. 2 each, and 2 for the baker!" The party card shows the baker's slices too.
- **Thinner voice.** Each landed layer and each slice is no longer spoken (pops and pictures carry the count). Nudge sentences use `voice.sayOnce` (once per cake; `voice.newRound()` runs at each cake). A two-cake trip at tier 0 with deliberate mistakes spoke 13 lines, including the two share nudges.
- **Bugs fixed.**
  - The share card's cake top has a plate ring, a sponge-coloured rim, a cherry on every wedge, and brown cut lines (white on dark icing). It no longer reads as a blank circle.
  - Vanilla is 🌼 (vanilla comes from a flower), not 🍦.
  - The leftover "↔️" label after three lined-up drops is gone; the quiet widening stays.
- **Recipe studio: picture-only controls.** Tabs 🎂 / 🍽️🍽️; ⌫, ✓ and ➡️; the friends button shows the faces it would bring (🐻🐰🦊); 🔄 and ✓ ⚖️. Each control keeps its words as `aria-label` and `title`, and the buttons are touch-sized.

### Files

| Change | Where |
| --- | --- |
| `orderFor(level, tier, { fresh, flavours })` returns `{ layers, groups, hidden }`. It adds the harder units (AB/ABC; ABB/AAB/ABC/AABB) and growing patterns, and `hiddenFor` | `public/js/orders.js:19-61` |
| `tier`, `slips` and `tried` state; the tier is read from `localStorage` | `public/js/main.js:73-80` |
| `isMystery(i)` | `main.js:114` |
| `LEAVE_AFTER = 2` | `main.js:123` |
| Every order layer leaves after two crossings; no wanted-only hop or glow | `main.js:318-330`, `main.js:340-370` |
| `notThisOne`: slip counting, the first-slip line, the "?" hint and the reveal after two tries; the layer leaves | `main.js:388-428` |
| A solved "?" is named; layers are otherwise silent; no ↔️ label | `main.js:461`, `main.js:478-510` |
| `adaptTier()`, called at a finished order cake | `main.js:747-760` |
| `shareCut(n)`: exact or leftover cuts and the baker's plate | `main.js:851-870` |
| The per-cake order with `voice.newRound()` | `main.js:920-930` |
| Dots: grouping by `groups`, and "?" dots rendered in `updateHud` | `main.js:1045-1090` |
| `sayOrder` reads only the visible part | `main.js:1097` |
| Key 0 gives to the baker | `main.js:1331` |
| `cakeTop` redrawn, the baker plate, `canGoRound`, `giveBaker`, `finish()`, no per-slice speech, `speakOnce` | `public/js/party-share.js:46-75`, `party-share.js:100-200` |
| Vanilla 🌼 | `public/js/cake.js:13` |
| The `.pip.want.mystery` dot, the dashed `.share-plate.baker`, touch-sized studio picture buttons | `public/style.css:425`, `style.css:475`, `style.css:519-end` |
| Picture-only studio controls (source, copied to the game) | `examples/_studio/originals/recipe-studio.js:74-77`, `recipe-studio.js:352-360` |

### Evidence

- Playwright in Chromium (`--use-angle=gl`) with stubbed `speechSynthesis`. Scripts and screenshots are in the session scratch folder `polish/cake-stack/` (`play.mjs`, `count.mjs`, `studio.mjs`, `a-*`, `b-*`, `c-*`, `d-*`, `studio-*`).
  - 834×1194 at tier 0, Bear then Bunny: two deliberate wrong taps on Bear, so the tier stayed 0. Bunny was clean, so the tier rose to 1, and Bunny's share was 4 slices for 3 friends with 1 for the baker. An ahead plate and an early baker were both refused gently. 13 spoken lines, 0 errors.
  - 834×1194 at tier 2 from Puppy: ABC×3 patterns with "???" dots. The voice said "…What comes next?", then "mint" and "lemon" as the "?" layers were solved, and "8 slices, 3 friends. 2 each, and 2 for the baker!". 0 errors.
  - 1194×834 at tier 3, friends 9–11: AAB/ABB patterns, a 4-friend share with a decoy baker, 0 errors.
  - 667×375 at tier 2: 9 dots, the 4-friend share and the baker all fit, 0 errors.
- Counting mission (🐢, 3 layers): the layers never leave, 3 taps give 3 layers, and the mission completes.
- Recipe studio in both orientations: the picture buttons are readable, 0 errors.
- `EXAMPLES_ORIGIN=http://localhost:4213 node examples/_studio/tests/browser.mjs --ids cake-stack --run cake-stack-r1`: BOOT + PLAY ready, 0 errors. `node --check` passes on every edited JS file.

### Remaining ideas

- An off-centre cake could gently lean (a visual stack pivot), so timing shows without trimming. This needs the layers moved into a pivot group.
- On tall portrait screens the share card with a baker row covers part of the birthday friend. A single plate row with a smaller baker plate would help.
- The other guests still appear only as faces, not as 3D animals.
- The studio's share tab still says "2 each" in its own rule; it could reuse the party's leftover division.

## Round 2 decision pass (2026-10-11, not yet built or deployed)

Starting point: independent review 1 scored 7.6 (calm 8.5, focus 8, learning 7.3, fun/depth 7). Its blockers: random tapping still built the exact cake as fast as careful play; the party share's yellow "waiting" ring did the division for the child; a random tap often solved a "?" and two misses named the answer aloud; there was no choice or creation in the main loop; and tier-3 cakes were always nine slow layers.

### Design

- **A wrong layer really lands.** A layer the order does not need lands on the cake, slightly askew. Its dot shows that flavour, tilted with a dashed rim. The friend tilts its head, and the next layer waits until the child taps to take the wrong one off; it floats up and away. The line "Oops, that layer is not in the order. Tap to take it off." is said once per cake (a fixed sentence, so `sayOnce` really holds). After 1.4 s the finger points at the layer. Careless tapping now costs time and taps.
- **A cake stacked off-centre leans.** The cake tips toward where its layers sit, up to about 4°, and never falls. The sliding layer, candles and topper follow the lean, so lining a layer up still looks right. A hurried cake stands visibly crooked at the party, while a careful one stands straight and wide.
- **The pantry: the child chooses.**
  - At every "?" of a pattern, no layer slides in until the child picks one from the pantry: the pattern's flavours at tiers 0–1, plus one other known flavour at tiers 2–3, in a fixed shuffled order. A wrong pick lands as a wrong layer, and after it is lifted off that choice stays dimmed. Nothing names the answer, so the pattern has to be reasoned (or eliminated).
  - In free stacking and counting, the pantry offers every flavour met so far. The pick slides in and stays until it is changed, and changing it mid-slide swaps the layer in place. Until the child picks, the flavours are a surprise mix.
- **The share is the child's division.**
  - Any plate takes a slice, the baker's too, and nothing rings the "right" plate. A slice landing on a plate that is already ahead wobbles once. Each slice on a plate is a button that puts it back on the cake.
  - When the cake is empty, the game checks the plates: fair means every friend has the same and the baker has fewer than one more each. If it is not fair, the game shows "⚖️ ?" and says once: "Is it fair? Look at every plate. You can put a slice back." If the baker kept too many: "The baker has enough for every friend to have one more!"
  - After two unfair checks, small count badges appear on the plates as a scaffold. A fair share speaks the division once, as before.
- **Harder tier, less waiting.** Patterns at tiers 2–3 vary in length from 6 to 9 layers (AB×3/4, ABC×2/3, ABB/AAB×2/3, AABB×2, growing). Units are limited to the flavours the child has met, with the friend's new one first. At tier ≥2 the wanted layer comes more often (0.5, and at most one other in a row).
- **Counting matches the cake.** In 🐢/🧮 each cake is exactly the mission's 3 or 5 layers, and the mission restarts per cake. The 🕯️ early finish is free-stacking only.
- **Voice.** Correct layers, slices and "?" answers are no longer spoken. All nudges are fixed sentences said once per cake. Careful play: 2–4 lines per cake. Random play: 5–7 lines per cake (it was 10).
- **Layout fixes.**
  - The layer hovers lower: 0.52 in landscape and 0.7 in portrait (it was 1.05), so it no longer floats in front of the shelves.
  - In portrait the share card is one plate row with a smaller baker, so the birthday friend stays visible.
  - Each friend's group on the card is its own non-wrapping span.
  - The dots and the pantry are hidden while the share card and the party card show.
  - On sideways screens the pantry stands in a column at the left edge. In portrait it sits above the dots, and the camera reserves room for it.
- **Recipe studio** (shared source, copied to the game): slices are no longer spoken ("Bear: 1"). The recipe strip is numbered 1… from the bottom instead of Bottom/Layer 2/Top, and the status line is pictures (🌼 ⬆️ 🍓, 🔎 3, 🎉 ✓, 🎉 🐻🍰🍰 🐰🍰🍰 = ½).

### Files

| Change | Where |
| --- | --- |
| `hover()` by aspect | `public/js/main.js:62` |
| `missionTarget`, `targetLayers`, `built()` (a wrong layer on top does not count), `isMystery` without the reveal | `main.js:116-123` |
| Pantry room in the camera lift (`pantryReserve`) | `main.js:171-190` |
| Quicker wanted layer at tier ≥2 | `main.js:304` |
| `spawnMover(flavour, from)`, `askChoice`, `choose`, `renderPantry` | `main.js:330-425` |
| `drop` → `landSurprise` / `liftSurprise` | `main.js:470-560` |
| `leanAt` and the lean in `updateCake` (layers, deco, mover) | `main.js:685-705` |
| Card share spans | `main.js:1020` |
| Per-cake reset of `wrongAt`/`choices`/`pick`; mission per cake | `main.js:1060-1068` |
| The "oops" dot | `main.js:1224` |
| A tap lifts a wrong layer; Digit 0–4 give, Shift+digit takes back | `main.js:1452`, `main.js:1480` |
| `repeatsFor`, units limited to known flavours | `public/js/orders.js:30-70` |
| Share rewritten: any plate, `check()`, `takeBack()`, slice buttons, count scaffold | `public/js/party-share.js:100-260` |
| `#pantry` | `public/index.html` |
| Pantry, `.pip.oops`, share plate/slice/check/portrait styles, card spans | `public/style.css:477-479`, `style.css:530-end` |
| Studio narration and picture labels | `examples/_studio/originals/recipe-studio.js` (copied to `public/js/`) |

### Evidence

Playwright in Chromium (`--use-angle=gl`) with stubbed `speechSynthesis`. Scripts and screenshots are in the scratch folder `polish/cake-stack/r2/`: `play.mjs` (careful/random bots), `oq.mjs`, `studio.mjs`, and `*.png`. There were 0 console or page errors in every run.

| Run | Cakes | Time and result | Spoken lines | Screenshots |
| --- | --- | --- | --- | --- |
| Careful, 834×1194, tier 0 | Bear, Bunny | 2 per cake share exactly with no check (Bunny's has a decoy baker). The friend is visible above the share card. | 3 per cake | `pc-*` |
| Careful, 1194×834, tier 3 | Puppy, Panda | ABB×3 (9 layers, 21 s) and AAB×2 (6 layers). 0 slips. Pantry choices at the "?" layers. | 4 per cake | `lc-*` |
| Random, 834×1194, tier 2 | Cat | AB×4: 46 s, 16 slips; the cake leans and shrinks to 0.68 wide; the tier fell to 1. The share was dealt unevenly, the check came up, and it was fixed to 1 each plus 2 for the baker. | 7 | `pr-0-oops`, `pr-0-pantry`, `pr-0-check` |
| Random, 1194×834, tier 3 | 2 cakes | 7 and 2 slips; visible lean (`lr-1-check`) | 6–7 per cake | `lr-*` |
| Free stacking | Bunny | 7 layers with pantry picks | 2 | `fr-0-free` |
| Counting 🐢, 1194×834 | Bear, Bunny | 3 layers each; "1, 2, Three layers make your little cake!" per cake | — | `cn-*` |
| 667×375, tier 2 | Puppy | The pantry column and the share fit | — | `sm-*` |

- Recreation of the `original-quality` cake check (768×1024 touch, counting mission 3): 3 layers, mission complete.
- Recipe studio in both orientations: no per-slice speech, numbered strip, picture status.
- `EXAMPLES_ORIGIN=http://localhost:4213 node examples/_studio/tests/browser.mjs --ids cake-stack --run cake-stack-r2`: BOOT + PLAY ready, 0 errors. `node --check` passes on every edited JS file.

### Remaining ideas

- A tier-3 "which layer is wrong?" repair task on a pre-built pattern, or letting the child design the next friend's pattern.
- The other guests are still faces on the share card, not 3D animals.
- The "?" pantry could also open at tier 3 for a whole unit at once (choose the whole repeat) for the oldest children.

## Round 3 decision pass (2026-10-11, not yet built or deployed)

Starting point: independent review 1 of round 2 scored 8.2 (calm 8.5, focus 8, learning 8, fun/depth 7.5, visual 8.5, voice 8.5, polish 8). Its blockers: few decisions per cake (the bakery sends most layers), "?" picks at tiers 0–1 were a free 2-way guess, tier 3 often hid only one layer, the counting modes had no decision, and the tier rose after one clean cake and replaced every friend's order.

### Design

- **From tier 1, the child chooses every layer.** In a friend's order no layer slides in until the child picks it from the pantry, using the dots as the reference. Timing the drop is still the motor skill; choosing becomes the sequencing skill. Tier 0 keeps the bakery's passing layers (patience) and the "?" choice.
- **The pantry is fixed for the whole cake** (`orderPantry`): the order's flavours, plus one known decoy from tier 1 when the order has fewer than three flavours, and always from tier 2. The buttons never swap places between picks. A tried flavour dims only after two misses at the same layer, so guess-and-dim is no longer free.
- **More of each pattern to work out.** Tier 2 always hides a whole unit. Tier 3 hides everything past the first two units, but keeps at least one whole unit in view (AB×4 hides 4, AABB×2 hides 4, ABB×3 hides 3). Growing patterns hide the whole last group (A B B B).
- **Smoother tier.** The tier steps up after two clean cakes in a row (remembered across visits) and still steps down after three or more slips. From tier 2, odd friends keep their own fixed order, so Bear, Cat, Panda and Fox stay themselves. Even friends ask for a generated pattern.
- **Counting is a decision.** In 🐢 and 🧮 the cake never ends by itself. The friend says their number once ("Bear wants 3 layers."), and the child taps 🕯️ when they think the cake has that many. The dots show only the layers on the cake (no empty slots to fill), while the goal row shows the friend's number of slices to compare with. The friend then counts the cake aloud, and each dot grows in turn.
  - Right: the mission's reward line plays and the party starts.
  - Too few: "Bear wants 3." and stacking goes on.
  - Too many: the top layer tilts, and one tap takes it off. Each extra layer tilts in turn, and then a finger rests on 🕯️ so the child can count again.
  - The cake stops growing two past the number. After two miscounts the friend's empty dots come back as a scaffold.
- **Care shows at the end.** A cake with no lean and full width gets one "So straight!" added to the finishing line. It is never a score.
- **Fixes.**
  - The hint finger rests on the middle of the wrong layer itself, not on the layers below it.
  - Slivers no longer fly toward the camera and stay on the counter. Splat blobs are smaller and fly sideways.
  - The second tap of a quick double tap, just after a layer lands, is no longer taken as a choice for the next layer.
  - The first pantry gets a soft, steady ring (`.pantry.invite`) instead of a finger, because a finger on one button looked like a suggestion.
- **Voice.** How-to sentences ("Look at the dots, and choose the next layer.", "Choose the layer that comes next.", "Tap the candle when the cake is ready.") are said once per visit (`tellOnce`), not once per cake.

### Files

| Change | Where |
| --- | --- |
| `hiddenFor(length, unit, tier)`, friends' own orders on odd levels at tier ≥2, growing hides 4 | `public/js/orders.js:35-79` |
| `tellOnce`, game state (`chooseAll`, `choices`, `clean`, `miscounts`, `over`, `landedAt`) | `public/js/main.js:66-94` |
| Quiet mission count (`announce`) | `main.js:107-110` |
| `choosing`, `countCap` | `main.js:138-140` |
| `orderPantry`, `askChoice`, `choose` (double-tap guard), `renderPantry` (dim after two) | `main.js:385-460` |
| `landSurprise` records every slot, `pointAtLater` (finger on the layer) | `main.js:522-563` |
| `liftSurprise` chain for an over-count | `main.js:566-600` |
| Counting never auto-finishes, cap and candle finger | `main.js:677-690` |
| Sliver path stays on the counter | `main.js:697-712` |
| "So straight!" | `main.js:900` |
| `adaptTier` (two clean cakes) | `main.js:950` |
| `checkCount`, `tiltTop` | `main.js:969-1030` |
| Per-cake reset, counting intro | `main.js:1200-1240` |
| Counting dots (`ghost`) | `main.js:1381` |
| Idle ring on the pantry, element hints | `main.js:1479-1510` |
| Smaller, sideways splats | `public/js/effects.js:182` |
| `.pip.ghost`, `.pip.counted`, `.pantry.invite` | `public/style.css:593-596` |

### Evidence

Playwright in Chromium (`--use-angle=gl`) with stubbed `speechSynthesis`. Scripts and screenshots are in the scratch folder `polish/cake-stack/r3/`: `play.mjs` (careful and random bots, now with counting and swap handling), `finger.mjs` and `*.png`. There were 0 console or page errors in every run.

| Run | Result | Spoken |
| --- | --- | --- |
| Careful, 834×1194, tier 0 (`p0`) | Bear and Bunny with no slips, 24 s and 34 s. The tier rose to 1 only after the second clean cake. | 4 per cake |
| Careful, 834×1194, tier 1 (`pc`) | Every layer was chosen from the pantry. The tier went 1 → 2 after two clean cakes. Cat (an odd friend) kept her own order at tier 2. About 25 s per cake. | 3–4 per cake |
| Careful, 1194×834, tier 3 (`lc`) | Puppy's growing pattern hid 4 layers, Panda's fixed order had 5 picks, and Pig's ABB×3 hid 3. | 3–4 per cake |
| Random, 1194×834, tier 3 (`lr`) | 4 and 11 slips, 0.54–0.59 wide, 57 s and 110 s per cake, and the tier fell 3 → 2 → 1. | 5–7 per cake |
| Random, 834×1194, tier 1 (`pr`) | 8 slips over 89 s, and the tier fell to 0. "So straight!" does not show on narrow cakes. | ≈7 per cake |
| Counting 🧮, careful (`cc`) | Candle at 5: the friend counted 1–5, then the reward line. | 8 per cake |
| Counting 🐢, random (`cr`) | Candles at 5, 4 and 2. Over-counts tilted the extras off one at a time (`cr-1-oops.png`: the finger on the top layer, with 4 dots shown). It finished only at exactly 3. | — |
| Pantry check (`finger.mjs`) | The pantry stays in place in both orientations, and two misses dim both tried flavours. The first-ask ring shows in `finger-p.png` and `finger-l.png`. | — |

- The hint finger rests on the wrong layer itself (`lr-2-oops.png`).
- `EXAMPLES_ORIGIN=http://localhost:4213 node examples/_studio/tests/browser.mjs --ids cake-stack --run cake-stack-r3`: BOOT + PLAY ready, 0 errors. `node --check` passes on `main.js`, `orders.js` and `effects.js`.

### Remaining ideas

- A tier-3 "spot the mistake" cake: a pre-stacked pattern with one wrong layer to lift out and replace.
- A design loop, where the child builds a pattern for the next friend to copy.
- At tier 3, open the pantry for a whole unit at once.
- The other guests are still faces on the share card, not 3D animals.

## Round 4 pass (2026-10-11, not yet built or deployed)

Starting point: independent review 1 of round 3 scored 7.8 (calm 8.5, focus 8, learning 7.8, fun/depth 7.4, visual 8.4, voice 8.6, polish 6.8). Blockers: counting timing races (a reward for the wrong cake, "too many" lines during the party), half the tier-3 cakes were plain copying, random tapping was as fast as careful play, the counting dots showed the answer as numerals, and there was no creation in the main loop.

### Design

- **Counting is now real counting.** The dots carry no numerals. A number appears on each dot only as the friend says it during the candle check. Every cake after the first asks for a different number (🐢 2–4, 🧮 4–7, never the same twice in a row, and smaller after two miscounts), so the child counts the cake instead of remembering the last answer. The goal row shows only the friend's number as slices, with no "0 / 3" tally to contradict the cake. The friend counts aloud up to ten here, because counting is the lesson.
- **Tier 3 memory orders.** The odd friends' own orders (Bear, Cat, Panda) show while the friend says them ("… Remember it!"). Then every dot turns to "?" and the child builds the order from memory. Tapping the dots peeks for 2 s, which is never a mistake, but only a cake made with no peek and no slip earns "You remembered Bear's whole order!". After two misses at one layer, its dot shows again.
- **Made-up patterns (creation).** From tier 2, Bunny, Pig and every fourth friend after them ask "a pattern that you make up". The child chooses the repeating part from the pantry (two layers at tier 2, three at tier 3) on dashed dots. If the part so far is all one flavour, that flavour dims for the last pick ("A pattern needs two kinds."). The friend then says the pattern back ("Your pattern! vanilla, vanilla, chocolate. Keep it going!"), and the child stacks the rest from "?" dots.
- **Choosing the cut (tier 3 share).** Two cake tops are offered, such as 6 or 8 for three friends. One goes round exactly, and the other leaves slices for the baker. Either works, and the consequence is shown in the deal and in the closing line.
- **Careful play is faster.** From tier 1 every order's pantry has a familiar decoy (chocolate on Bear's two-flavour cake), so guessing is a one-in-three chance. After a wrong layer is lifted off, the next dot is pointed at and the pantry waits 0.85 s. Random play now takes 65–166 s per cake against 24–40 s for careful play.
- **Portrait composition.** On tall screens the friend stands at x 1.22 and 0.5 higher, so their whole face clears the counter and stays beside even a seven-layer cake. On wide screens the friend is raised 0.22.

### Fixes

- Counting race: `spawnMover`, `land`'s delayed spawn and the pantry all check `game.counting`. After a right count, `game.counting` stays set until `finishCake`, which clears it. `pointAtLater` only runs in play, and `showCard` hides the hint.
- `isMystery` is bounded by the order's length, and the pantry and `spawnMover` stop once an order is complete, so the "?" pantry no longer flashes over the finished cake.

### Files

| Change | Where |
| --- | --- |
| Picture-only counting goal row, varying count options, `countFor` | `public/js/main.js:108-143` |
| `sameSoFar`, `designing`, bounded `isMystery` (peek, memory reveal) | `main.js:160-168` |
| Friend position `view.custY` | `main.js:295-306` |
| `spawnMover` guards (counting, order complete) | `main.js:388-392` |
| Decoy from tier 1 (`orderPantry`), design pantry, `shuffle` | `main.js:428-441` |
| Design and memory lines in `askChoice` | `main.js:444-456` |
| Made-up layer recorded on drop, `setPattern` | `main.js:566-568`, `main.js:615-624` |
| Glance before the pantry reopens | `main.js:667-673` |
| Party clears `counting`/`over`; "You remembered…"/"You made up a pattern…" | `main.js:952`, `main.js:977-978` |
| Numbers shown while counted, aloud to ten, locked until party | `main.js:1062-1092` |
| Tier-3 cut choice in `shareCut` | `main.js:1221-1227` |
| Memory cover after the intro, design intro | `startLevel` |
| Design dots in `updateHud`, `sayOrder` lines, `peek()` | `main.js:1700-1795` |
| Memory orders and made-up pattern orders | `public/js/orders.js:56-69` |
| `cutCake`, `offerCuts`, `cutting` state | `public/js/party-share.js:226-290` |
| `.cut-choice`, `.pip.want.design` | `public/style.css` (end) |

### Evidence

Playwright in Chromium (`--use-angle=gl`) with stubbed `speechSynthesis`. Scripts and screenshots are in the scratch folder `polish/cake-stack/r4/` (`play.mjs` with a cut-choice step, `shot.mjs`, `countrace.mjs`, `endpantry.mjs`). There were 0 console or page errors in every run.

| Run | Result | Spoken |
| --- | --- | --- |
| Careful, 834×1194, tier 1 (`pc`) | Bear, Bunny and Cat with a 3-way pantry. 24–28 s per cake, and the tier rose 1 → 2. | 13 over 3 cakes |
| Random, 834×1194, tier 1 (`pr`) | 7, 2 and 10 slips; Bear took 76 s, and the tier fell to 0. | 18 over 3 cakes |
| Careful, 1194×834, tier 3 (`lc`) | Bear from memory (29 s), Bunny made up a 3-layer pattern ×3 (42 s), Cat from memory, Puppy AAB×3 with 3 hidden. The cut choice was 6 or 8 for 3, and 4 or 6 for 4. | 23 over 4 cakes |
| Random, 1194×834, tier 3 (`lr`) | 5 and 6 slips, 65 s and 74 s, and the tier fell 3 → 2 → 1. | 19 |
| Made-up pattern, random, Pig, tier 3 (`d3r`) | "A pattern needs two kinds" dimmed vanilla for the third pick. 10 slips over 96 s while keeping it going. | 9 |
| Counting 🧮, careful (`cc`) | Friends asked for 5, 4 and 7. Each count was right first time, with numbers on the dots only while counted. | 8–10 per cake |
| Counting 🐢, random (`cr`) | Candles at 1, 1 and 3 for Bear (wants 3), then Bunny wanted 2 and Cat 3. An over-count of 5 tilted the extras off. | — |
| `countrace.mjs` (candle 260 ms after the last landing) | 'play' with `counting` held for 4.5 s, then the party with 3 layers. No layer was added. | — |
| `endpantry.mjs` | The pantry is hidden right after the last layer of an order. | — |

- `EXAMPLES_ORIGIN=http://localhost:4213 node examples/_studio/tests/browser.mjs --ids cake-stack --run cake-stack-r4`: BOOT + PLAY ready, 0 errors. `node --check` passes on `main.js`, `orders.js` and `party-share.js`.

### Remaining ideas

- A "spot the mistake" cake: a pre-stacked order with one wrong layer to find and replace.
- At the card, let the child choose the next friend's pattern for someone else to finish.
- `examples/_studio/tests/original-quality.mjs` still expects counting progress per landed layer (since round 3 it counts at the candle check).
