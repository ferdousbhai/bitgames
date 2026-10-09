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
