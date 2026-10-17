# Cake Stack polish

## Round 10 (2026-10-16)

Round 9 scored **8.2/10**. Kept the guarded candle tap and existing document-wide pointer, palm, ghost-click and keyboard protection.

- **Tray taps place toppings:** `public/js/main.js:1298` selects and calls `addTopping(null, 'tray')`. Tray taps preserve the idle finger clock and visible hint; successful cake taps still reset it. Both routes place the chosen topping.
- **Decorating lasts:** `main.js:1314, 1403, 1426, 2373` separates child-placed toppings from the seven shower toppings. The shower neither spends the 22-topping cap nor resets the child's quiet clock. Once full, extra placement is ignored and cap completion waits until six seconds since decorating began.
- **Idle candles:** `main.js:1181, 1535, 2383` resets the candle quiet clock on initial lighting and trick-candle relighting, then calls the normal `blowCandles()` after ten seconds. The friend performs the same breath animation as a tap.
- **Ready candle cue:** `public/style.css:242` keeps the guarded button at 0.8 opacity / 0.9 saturation. `main.js:2356` adds a single 450 ms scale pop and soft rising music-box jingle when it becomes ready; the existing gentle bob remains.
- **Perfect-cake variety:** `main.js:588` adds side decorations to every perfect layer before the final layer, alternating strawberries, hearts, cherries and stars with layer/friend index. Gold rims and the halo remain.
- **Portrait flames:** `main.js:920, 1002` enlarges lit flames 1.65× at the portrait candle moment and gives each cloned flame material a warm emissive glow.

Evidence: `/dev/shm/bitgames-work/codex/cake-stack/r10.mjs` uses one GL Chromium browser at 768×1024, test-only source injection and actual touch taps on the tray/cake/candle button. Renderer **ANGLE (Mesa, AGX G13/G14, OpenGL ES 3.2)**. Tray-only tap placed one topping and the finger returned; cake-only tap placed one. Eight manual placements stayed eight after all seven shower toppings arrived. A 50-call placement burst capped at 22 and decorating ended at **6.021 s**. Untouched decorating advanced at **14.014 s**; candles automatically blew at **9.950 s** after the test checkpoint, and the untouched balloon bonus reached the card. **0 page errors, 0 speech calls**. Reviewed `r10-tray.jpg` and `r10-candles.jpg` in the same scratch directory. The initial harness attempt waited for the continuously bobbing button to become stable; retry used a real forced touch tap, bypassing only Playwright's stability wait.

`r10-perfect.mjs` additionally checks six real perfect drops: all six gold-rimmed, five with 8–9 side decorations; reviewed `r10-perfect.jpg`, zero errors/speech. Shared mash **PASS** including palms, resting hands and keyboard: “30 s of mashing stays in play and saves no mute.” Used GL / DPR 1 with the existing `r8-output.mjs` preload solely to redirect artifacts into this game’s scratch directory. `node --check examples/cake-stack/public/js/main.js` PASS. No build, commit or publication. Every test browser closed. Sound not checked by ear; no physical iPad check or fresh independent score.

## Round 9 (2026-10-16)

Round 8's fresh score was **8.4/10**: the candle hold stranded tap-only children. Restored a guarded tap while keeping document-wide palm cancellation.

- **Candle tap:** `public/js/main.js:2490` uses `pressButton`, not a hold. Until one topping is placed **and** two seconds pass, a tap makes only a tiny click and soft wiggle. `updateDecoratingReady` (`main.js:2343`) dims the guarded button and adds a gentle glow/bob once ready. The hint then points at the tap button. No candle click-swallow listener is installed; the existing home/sound/music holds are unchanged.
- **Idle escape:** `main.js:2350` advances a separate quiet clock even while the finger hint is visible; selecting toppings cannot keep this clock alive. After 14 seconds without a new topping (six seconds with 10+), a soft grow/ta-da leads into the candle sequence. The topping cap is 22 (`main.js:1238`).
- **Landscape cake:** tighter decorating framing (`main.js:168`) and a 28 px screen-space tolerance around each layer (`main.js:1325`) make skinny cakes easier to decorate.
- **Phone layout:** 58 px topping buttons and two columns for the full short-landscape tray; compact card padding, shelf and fresh-cake layers (`public/style.css:241–257`). At 844×390 the ten-layer card measures 259.6×284.5 px and fits at y=52.8.

Evidence in `/dev/shm/bitgames-work/codex/cake-stack/`: `r9.mjs` checks 390×844, 768×1024 and 844×390, all nine topping targets, early/ready candle taps, two-pointer cancellation, Escape/M safety, card bounds, zero page errors and zero stubbed speech calls. GPU verified **ANGLE (Mesa, AGX G13/G14, OpenGL ES 3.2)** in all three. A guarded early tap followed by one ready tap after the first topping reaches candles (within the requested three taps). Reviewed `r9-decorate-844.jpg` and `r9-card-844.jpg`; other viewport screenshots alongside. Test-only source injection exposes helpers; no runtime debug API added. `r9-idle.mjs` verifies the actual idle path through `finishCake`: no topping input, decorating exits at 14 s and lit candles appear at 18.4 s including the transition. `r9-idle-many.mjs` also passes: 10 manual toppings plus the shower, automatic exit six seconds after the final topping, then lit candles (10.9 s after the test’s post-shower checkpoint).

Shared mash **PASS**, including palms, resting hands and keyboard: “30 s of mashing stays in play and saves no mute.” Ran with GL, DPR 1 and the existing `r8-output.mjs` preload solely to redirect artifacts into this game's scratch directory. `node --check examples/cake-stack/public/js/main.js` PASS. Browsers closed after each check. No build, commit or publication. Remaining limits: no sound-by-ear or physical-device check, and no fresh independent round-9 score yet.

## Round 8 (2026-10-16)

Fresh round-7 review: **8.6/10 (passing)**. Kept the existing play loop, bonuses, careful-drop rims and halo, and palm protection.

- **Keyboard:** Escape only returns home from the card; Escape and M do nothing during play (`public/js/main.js:2589`).
- **Bonus finish:** `launch()` reports success; capped/expired sky taps return false without resetting idle or quiet. After nine seconds without productive taps, unopened gifts open themselves one at a time, then the bonus finishes after a short grace (`main.js:1777, 1876, 1901, 1934`).
- **Phone presents:** centred offsets −1.6, −0.8, 0, 0.8, 1.6; `bonusX` projects inset screen edges onto z=0.78, leaving room for each box (`main.js:1606, 1645`).
- **Decorating:** 🕯️ uses the shared 0.6 s hold with its filling ring and palm cancellation. It also ignores completion for the first two seconds unless a topping has landed (`main.js:1270, 2447`; `style.css:241`). Ordinary taps never skip decorating.
- **Fast tappers:** every full-height cake gets the crown moment, including skinny squished cakes; careful play keeps its gold rims and perfect halo (`main.js:1147`).
- **Layout:** the settled crown is 1.05 rather than 1.45, leaving the face visible (`main.js:1057, 1069`). The short landscape flavour tray fits all seven picks. Portrait cards use a compact shelf and move the camera aim down to show the finished cake above it (`main.js:182`; `style.css:230–240`).

Evidence in `/dev/shm/bitgames-work/codex/cake-stack/`: `r8.mjs` / `r8-results.json` cover 390×844, 768×1024 and 844×390, Escape/M, bonus framing, capped dead taps and automatic leftover gifts. Chromium renderer verified **ANGLE (Mesa, AGX G13/G14, OpenGL ES 3.2)** in all three viewports. Zero page errors and zero speech calls. Reviewed `r8-presents-390.jpg`, `r8-card-390.jpg` and `r8-crown-768.jpg`; more viewport screenshots alongside them. Test-only source injection exposes helpers; no new runtime debug API shipped. `r8-focused.mjs` PASS: all seven landscape flavours inside the viewport; 🕯️ taps and an early hold ignored; a deliberate later hold works; settled crown scale 1.05; zero errors/speech.

Shared mash **PASS** at DPR 1 with GL, including palms/resting hand: “30 s of mashing stays in play and saves no mute.” Command: `TMPDIR=/dev/shm EXAMPLES_IDS=cake-stack EXAMPLES_ORIGIN=http://localhost:4213 EXAMPLES_CHROMIUM_EXECUTABLE=/usr/bin/chromium NODE_OPTIONS=--import=/dev/shm/bitgames-work/codex/cake-stack/r8-output.mjs node examples/_studio/tests/mash.mjs`. The preload only redirects artifacts into the permitted scratch folder; it does not alter DPR or browser flags. `node --check public/js/main.js` PASS. Every browser closed. No build, commit or publication. Remaining limits: sound not checked by ear; no physical-device playtest or fresh reviewer score for round 8.

## Fun pass, round 7 (2026-10-16)

Fresh round-6 review: 8.4/10. Kept cake-height limits, party bonuses and palm protection.

- **Bonus framing:** the five presents now scale their offsets about the camera centre to fit `camGoal.halfW - 0.3`, retaining distinct spacing. Balloons, bubbles, stars, rockets and the piñata use the same safe width; drifting items stay clamped. Bonus hints select projected on-screen targets, and hide if a moving target leaves the frame (`main.js`, `bonusX`, `startBonus`, `updateBonus`, `updateHint`).
- **Remix friends:** each remix supplies a new hat colour and costume index. Animals receive a matching gentle body tint and a bigger, taller, alternately tilted hat, including the cake figurine (`main.js`, `customerDef`; `animals.js`, `AnimalKit.make`).
- **Portrait stacking:** below aspect 0.6 the camera frames 18% tighter and raises its aim by 0.45, lowering the counter in the image; the existing dots/mover clearance still applies (`main.js`, `aimCamera`).
- **Touch safety:** ▶ and holds share one document-capture active-pointer set. A second finger anywhere cancels presses and holds, blocking new starts until all fingers lift. Pointer-generated clicks cannot bypass the press check. Completed holds swallow the following ghost click (`main.js`, `pressButton`, `holdButton`).
- **Landscape sound controls:** 🎵/🔊 only hide for the overlaid card, rather than the whole bonus (`style.css`, short-landscape rule). At 844×390 both are visible at y=10, 48×48, x=730 and x=786.

Evidence: `/dev/shm/bitgames-work/codex/cake-stack/r7.mjs` checks all six bonus kinds at 390×844, 768×1024 and 844×390 (18 scenarios), projected present centres and second-finger cancellation of ▶; zero page errors and zero speech calls. Results and reviewed JPEG screenshots are alongside the script. Test-only source injection exposes existing helpers and selects bonuses; shipped runtime has no new test hooks. Chromium GL could not create a WebGL context here, so the matrix uses SwiftShader. `presents-touch.mjs` additionally PASSed at 390×844: all five settled presents opened through projected on-screen touch taps, the idle finger stayed in bounds, and a deliberate single-finger 🎵 hold still toggled music; zero page errors. The hint's horizontal margin is 20% of the frame so the large finger graphic also stays clear of the edge. Both edited JS modules pass `node --check`. Shared mash **PASS**: “30 s of mashing stays in play and saves no mute,” including the shared palm cases. Command: `TMPDIR=/dev/shm EXAMPLES_IDS=cake-stack EXAMPLES_ORIGIN=http://localhost:4213 EXAMPLES_CHROMIUM_EXECUTABLE=/usr/bin/chromium EXAMPLES_CHROMIUM_ANGLE=swiftshader NODE_OPTIONS=--import=/dev/shm/bitgames-work/codex/cake-stack/redirect-output.mjs node examples/_studio/tests/mash.mjs`. The preload redirects artifacts into this scratch folder and sets render DPR to 0.5, retaining the harness's 768×1024 CSS viewport and unchanged touch checks. Caveat: the DPR-1 SwiftShader mash run returned to the title after several minutes; the reduced-resolution retry passed. GL was unavailable, so this does not establish GPU-loaded timing safety at full render resolution.

## Fun pass, round 6 (2026-10-16)

A fresh reviewer scored round 5 at 8.3/10 (intuitive 9, fun 8.5, variety 8.5, no text 9.5, polish 7). Changes:

| Feedback | Change | Where |
| --- | --- | --- |
| Fast tappers got an extra layer | `spawnMover` returns once the cake has `targetLayers()` layers. The tumble timer is stored in `game.nextTimer` and cleared by any spawn, including a hurried one. A layer still falling when the party starts melts away instead of landing. Touch mashing at 90–210 ms per tap gave exactly 6/6, 8/8 and 10/10 layers on friends 1, 3 and 7, at 768×1024 and 390×844. | `main.js` `spawnMover`, `tumble`, `drop` |
| Empty floor at the party on 390×844 | When the aspect is under 0.6, the party, bonus and card views frame tighter (the outer guests peek in from the edges) and sit slightly higher, so the cake, the piñata and the presents fill the screen. | `main.js` `aimCamera` |
| ▶ ignored a moving finger | The title and card ▶ use `pressButton`: a single pointer down and up on the button, moved less than 40 px, counts as a press. Pointer capture keeps the lift on the button. A second finger cancels the press. The click that follows a press is ignored, so it can't fire twice. A 15/10 px wiggle starts the game and moves on from the card exactly one level. | `main.js` `pressButton` |
| A tiny crown on the head | The crown sits on the head at 1.45 (was 0.95): about 88 px wide on 390×844 and 150 px on 768×1024. | `main.js` `crownMoment` |
| Remix friends bring nothing new | Each `REMIX` entry has its own favourite topping (⭐ 🌸 🍬 🫧 🍦). It shows in the intro bubble, is ringed and picked first in the tray, and gets the favourite hop. | `animals.js` `REMIX`; `main.js` `decorate`, `startLevel` |
| Perfect cakes all look alike | Each friend's stand is washed with 30% of their party-hat colour. On every other friend (not the slim towers) the lined-up layers taper by 0.035 each, down to 70% width, like a wedding cake. | `main.js` `newCake`, `land`, `startLevel` |

Checks: the shared `examples/_studio/tests/mash.mjs` passes for cake-stack ("30 s of mashing stays in play and saves no mute"). `r6.mjs` runs friends 2, 4, 9 and 10 at 390×844 and 768×1024 with 0 errors and 0 speech calls. `poke.mjs`: 17 key presses finish a 6-layer cake.

## Fun pass, round 5 (2026-10-16)

A fresh reviewer scored round 4 at 8.0/10 (intuitive 9, fun 8.5, variety 8, no text 9.5, polish 7). Changes:

| Feedback | Change | Where |
| --- | --- | --- |
| The bonus ends early for fast tappers | Items still to come count as pending: every delayed spawn goes through `later()`, which counts `bonus.toSpawn`, and bonuses not yet started count in `bonus.unstarted`. The 900 ms `done()` checks `pending` again and carries on if something new has arrived. Fast-tap runs on friends 1, 3, 6, 7 and 9 reach the card only after everything is popped, opened or burst, with nothing left on screen. | `main.js` `partyBonus`, `later`, `startBonus`, `updateBonus` |
| Slow piñata work is cut off | Every successful bonus tap resets `bonus.idle`. | `main.js` `tapBonus` |
| Decorating and candles never change | Candles rotate between plain, trick candles and a helper. Trick candles flicker back on one by one after the first puff, everyone gasps, the bubble shows 🌬️🕯️🌬️, and the second puff has a guest helping. On helper cakes a guest leans in and blows too. The eighth topping sets off a topping shower: seven random toppings rain onto the cake by themselves, with petals and a cheer. The friend's own favourite topping always gets a hop, and sometimes their voice. | `main.js` `blowCandles`, `startLevel` (`candleStyle`), `toppingShower`, `addTopping` |
| Minor | The new stand slides in and lands with a bounce, a plop and a sparkle, and the old cake slides out faster (0.8 s). `#play` pops in after 0.05 s (was 0.3 s), so a first tap isn't lost. | `main.js` `startLevel`, `nextCake`; `style.css` |
| Multi-touch holds (add-on) | `holdButton` tracks the `pointerId` that started the hold. A second pointer anywhere cancels the hold and blocks new holds until every finger is up. Any pending rAF is cleared before a hold starts, and the tick bails out once the hold is cancelled. In a CDP `Input.dispatchTouchEvent` test, three-finger palms (all at once, or staggered by 40 ms) lifted after 80–300 ms, plus two-finger holds of 1 s, were repeated on 🏠, 🔊, 🎵 and the card 🏠: nothing fired. A single-finger hold still works. | `main.js` `holdButton` |

## Fun pass, round 4 (2026-10-16)

A fresh reviewer scored round 3 at 8.0/10 (intuitive 8.5, fun 8, variety 7, no text 9.5, polish 7.5). Changes:

| Feedback | Change | Where |
| --- | --- | --- |
| The card's 🏠 is a plain tap | It is now a small round button set 44 px away from ▶, and it is press-and-hold like the HUD buttons. | `main.js` `holdButton($('card-home'))`, `index.html`, `style.css` `.card-home` |
| Twists should be visible and playable | Jelly layers are glossy and see-through (opacity 0.72, roughness 0.06) and never sit still: each layer squashes out of step with the others. Tapping the butterfly makes it do a loop-the-loop, with a trill, sparkles and a giggle. The narrow tower starts at 0.85 wide and the wide cake at 1.75. The wide icon is ↔️. | `main.js` `jellify`, `updateCake`, `tapButterfly`, `startLevel`; `audio.js` `flutter` |
| The crown is tiny | The crown now gets its own moment once the friend hops onto the counter. It rises out of the cake at double size, spins with sparkles and a chime, then arcs onto the friend's head in place of the party hat. A perfect cake's sparkle halo circles the crown there. | `main.js` `crownMoment`, `finishCake` |
| Thin bonuses | Piñata: 7 hits, 1.5× bigger, nearer the cake in portrait; from the 4th hit sweets shake loose, and the burst throws 8 sweets that bounce on the counter and bounce again when tapped. Presents: 5 of them, each with a different surprise (a balloon, a little friend who jumps out and waves, bouncing stars, bubbles, or sweets). Fireworks: rich colours in a normal-blend pool (no white wash), 40-star blooms; capped at 25 rockets or 20 s. Balloons and bubbles: a hit reach of 0.38 × their size; everything uses ray-distance reach. | `main.js` `startBonus`, `hitPinata`, `dropSweet`, `updateSweets`, `openPresent`, `launch`, `tapBonus`; `effects.js` `glints`, `bloom` |
| Variety runs out from friend 6 | `twists` and `bonus` are now lists. Friends 6–8 combine them: 🐷 jelly + wide with falling stars (a new bonus: stars drift down, and each one caught rings the next note of a tune), 🦊 butterfly + narrow with balloons and a piñata, 🐥 jelly + butterfly with presents and fireworks. From friend 9 on, `REMIX` in `animals.js` cycles five more mixes. | `animals.js` `CUSTOMERS`, `REMIX`; `main.js` `customerDef`, `partyBonus` |
| Follow-up | During stacking, a tap on the butterfly makes it loop and still drops the layer (in a 🦊 run, 15 taps with 5 aimed at the butterfly finished 10 layers). On short wide phones (aspect > 1.6) the party frame has more headroom, so a tall cake's top and the piñata stay in view at 844×390. | `main.js` `tap`, `aimCamera` |
| Portrait: the slide covers the friend's head | In portrait the layer slides higher (`hover` is 0.95, was 0.7), above the friend's head and hat. The friend still ducks. | `main.js` `hover` |

## Fun pass, round 3 (2026-10-16)

A fresh reviewer scored round 2 at 7.8/10 (intuitive 8.5, fun 8, variety 6.5, no text 9.5, polish 7.5). Changes:

| Feedback | Change | Where |
| --- | --- | --- |
| Every friend plays the same loop | Each friend in `CUSTOMERS` now has a `twist` and a `bonus`:<br>🐻 plain cake, balloons<br>🐰 jelly cake (bouncier squish, bigger, slower wobble, a constant jiggle), presents<br>🐱 a butterfly flutters along the slide; a layer that brushes it bumps it away with sparkles and a giggle; bubbles<br>🐶 a narrow tower (start width 1.0), a star piñata (each tap swings it; the fourth bursts it into confetti and sweets)<br>🐼 a wide cake (1.55), gentle pastel fireworks (five go up by themselves, and each tap on the sky sends another)<br>🐷 jelly, bubbles<br>🦊 butterfly, piñata<br>🐥 narrow, fireworks<br>The intro bubble shows the new flavour, the new topping and a twist icon (🍮 🦋 🗼 🎂). | `animals.js` `CUSTOMERS`; `main.js` `startLevel`, `makeButterfly`, `updateButterfly`, `partyBonus`, `makePinata`, `hitPinata`, `launch`, `updateRockets`; `effects.js` `bloom`; `audio.js` `bloop`, `whistle`, `bloom` |
| A perfect cake has no payoff | Every lined-up drop pipes a gold rim round its layer, so careful play shows on the cake. When 60% or more of the layers are perfect, a golden jewelled crown rises on top. When all but one are perfect, a slow ring of sparkles circles the crown. | `main.js` `goldRim`, `makeCrown`, `topDecorations`, `updateCake` |
| Layers pass over the friend's face | A tumble toward the friend is now a deliberate gag: the layer flies into their face, splats, leaves icing blobs on their face (they slide off after about 2 s), and the friend shakes, then laughs. Tumbles away from the friend splat on the counter as before. Sliding layers still make the friend duck. | `main.js` `tumble`, `creamFace` |
| Mashing is slow | The wait after a tumble is 380 ms (700 ms for the face gag), and a tap during it brings the next layer at once. After two tumbles the next layer holds on. | `main.js` `tumble`, `tap`, `spawnMover` |
| Layout | The 🕯️ button sits 26 px in from the corner, so `.ready` never clips. The toppings tray is a column (two columns past five toppings) on the left in every orientation, and the decorating view shifts the cake right so the tray never covers it. The HUD 🏠 hides while the card shows. | `style.css`; `main.js` `aimCamera` |
| Plain shelf cakes | The shelf cakes are bigger (56 px; the newest 92 px, with thicker layers). They show gold-rimmed layers, a coloured dot for each topping on the front, and 👑 over the friend for a crowned cake. | `main.js` `miniCake`, `layerDots`; `style.css` `.mini` |
| One new topping per friend | You start with 🍓, and each friend brings one more: 💗 🍒 ⭐ 🌸 🫧 🍬 🍦 🌈. Flower, pearl, candy and sprinkle toppers are built at runtime. The new one is ringed in yellow and selected first. | `main.js` `TOPPINGS`, `unlockedToppings`, `makeTopping` |
| Next friend | The next friend's face peeks out of the card's ▶ button. | `index.html` `#next-peek`, `style.css` |
| Mashing mutes the game (add-on) | 🏠, 🎵 and 🔊 are all press-and-hold (0.6 s, with a filling ring). Keyboard Enter acts at once. The mute is never saved (the `cake-stack-sound` key is gone), so every visit starts with sound. | `main.js` `holdButton`; `style.css` `.round-btn::before` |

## Fun pass, round 2 (2026-10-16)

A fresh reviewer scored round 1 at 7.5/10 (intuitive 8, fun 7.5, variety 6, no text 9.5, polish 8). Changes:

| Feedback | Change | Where |
| --- | --- | --- |
| A miss should be funny | A drop more than 58% of the top layer's width off-centre topples over the edge. It splats on the counter with icing flying both ways, the friend gasps and then giggles, and the next layer comes. After two tumbles in a row the next layer holds on, squished, so tapping each layer the moment it appears still builds a cake (17 taps for 6 layers in the keyboard run). There is no game over. A tall cake (4+ layers) whose layers average more than 0.15 off-centre teeters in a big slow sway, then its layers shuffle back toward the middle with a rising chime. | `main.js` `land`, `tumble`, `teeter`, `updateCake`, `updateSlivers` |
| Toppings where the child taps | The tray picks a topping (the picked one is ringed; 🍓 to start). A tap on the cake raycasts onto the layer and sticks the topping there: on the side facing that point, or standing on top. A tap beside the cake only clicks. The idle finger points at the cake first, and at 🕯️ after three toppings. A key press places one on the front. The decorating ends by itself at 40 toppings. | `main.js` `selectTopping`, `addTopping` |
| A surprise for each friend | Odd friends' parties release six balloons to pop (snap sound, confetti, someone cheers). Even friends' parties drop three wrapped presents onto the counter; a tap pops the lid off and a balloon floats out. A perfect run of 3, 6 or 9 makes another friend pop up from behind the counter to cheer, then duck away. From the fourth friend the slide speeds up by 6% per friend (at most 30%). The camera still rises with the tower. | `main.js` `partyBonus`, `tapBonus`, `peek`, `slideSpeed` |
| Portrait: the layer crosses the friend's face | The slide reach in portrait is 1.0 (was 1.15). The friend stands lower (`FLOOR_Y + 0.3`) at x 1.3, and ducks a little when a layer slides right over its head. | `main.js` `resize`, `updateAim`; `animals.js` `duck` |
| Faint perfect cue | A soft shadow disc on the cake top shows where the layer will land. It fades as the layer slides past the edge, and turns gold with a gold rim when the layer is lined up (eased, no flashing). The friend leans in, wide-eyed, at the same moment. The steady glow stays. | `main.js` `updateAim`; `animals.js` `eager` |
| A report-like end card | The card is the friend with 🎂 above a wooden bakery shelf. Each finished cake is drawn small with its real layer colours and widths and the friend's face on top. The shelf is kept between visits (`cake-stack-shelf`, last 12; 8 shown on wide screens, 5 on phones), and the newest cake drops on with a bounce. | `main.js` `showCard`, `miniCake`; `style.css` `.shelf` |
| Accidental 🏠 | During play, 🏠 must be held for 0.7 s while a pink ring fills around it. A short tap does nothing. Keyboard Enter and Esc still go home. | `main.js` (home hold); `style.css` `#home::before` |
| `game.json` | Shorter `howToPlay`, fun-first `learning`, and the category changed from `puzzle` to `pop` (Tap & Pop). | `game.json` |

Evidence: Playwright Chromium (`--use-angle=gl`) with touch at 768×1024, 1024×768 (presents), 390×844 and 844×390. In each, a full cake, toppings tapped onto the cake (12 placed exactly where tapped), candles, a bonus played out (balloons popped or presents opened), the shelf card and the next friend. Console errors: 0. `speechSynthesis.speak` calls: 0. `miss.mjs` shows tumbles (the layer count stays the same), one teeter, a single 🏠 tap staying in play, and a hold going home. Scripts and screenshots are in the session scratchpad `cake-stack/`.

## Fun pass, round 1 (2026-10-16)

Round 2 replaces some of this: where toppings go, the end card, and the category.

The owner's direction: the learning passes made the games boring. Strip the forced education, the text and the voice; make it fun and wordless for children aged 3–8.

### Removed

- The friend's pictured orders, the AB/ABC and made-up patterns, the memory orders, wrong-layer "take it off" taps, the hidden difficulty tiers (and their `cake-stack-tier` localStorage).
- The counting missions and the free-stacking mode picker (no more `adventure.js`).
- Sharing the cake fairly at the party (`js/party-share.js` deleted) and the 🎂 📖 recipe studio (`recipe-studio.js` and `studio-dialog.js` are no longer imported).
- The TTS voice: `js/speech.js` is no longer imported, so nothing calls `speechSynthesis.speak`.
- All text: the tagline, "Warming up the oven…", "▶ Play", "Next ▶", "Happy Birthday!", "The cake is ready!", "Make a wish!", the layer count and the banners. The flavour tag over the sliding layer and the order markings on the dots are gone too.
- Dead code: `js/orders.js`, the float labels and camera shake in `effects.js`, `cheer()` in `audio.js`, and about 450 lines of order, share, studio and mission CSS.

### Added or changed

- **Core loop.** Each friend wants a cake with 6–10 layers, shown as dots that fill with each layer's icing colour, with the friend's face at the end. Tap anywhere to drop the layer. The flavour buttons change the sliding layer on the spot. The surprise mix of flavours stays.
- **Juice.** A falling layer stretches and then squashes on landing, and the whole cake squishes under it. A tall cake wobbles more and keeps a gentle sway. Lined-up drops play a chime one note higher each time in a row (a small scale), and the friend cheers harder after three. Overhangs still splat and tumble off.
- **Decorating.** When the cake is finished, a tray of toppings appears (🍓 💗 🍒 ⭐). Each tap, on a topping or on the cake, pops one onto the front of the least-decorated layer, with a rising pop and sparkles. The friend cheers every fourth topping. A big 🕯️ button (it grows after four toppings) moves on to the candles. After 24 toppings the game moves on by itself.
- **Party.** Two guest animals in party hats pop up behind the counter. A 🌬️🕯️ bubble appears and the child taps to blow. Then two party poppers fire confetti from each side, petals drift, and Happy Birthday plays while every animal dances. Tapping any animal (on the title too) makes it squeak, hop and shake its head.
- **Hints.** The finger shows only when the child is stuck: 4 s before the first drop, 12 s idle while stacking, 5 s idle while decorating (on a topping, or on the candle once three are on), and 2.5 s at the candles.
- **Card.** It shows the friend with 🎂, the cake's layers as pictures, and ➡️ the next friend with the flavour they bring. The buttons are ▶ and 🏠.

### Evidence

- Playwright Chromium (`/usr/bin/chromium --use-angle=gl`) at 768×1024, 1024×768, 390×844 and 844×390 with touch: a full cake with perfect and sloppy drops and a pantry pick, then 4 topping taps, 4 cake taps, the candle button, the blow, the party, the card and ▶ to the next friend. Console errors: 0. `speechSynthesis.speak` calls (stubbed and counted): 0. No visible text with letters except the logo. The keyboard run (Space to drop, Space ×30 to decorate) hit the 24-topping auto-finish and reached the candles. Scripts and screenshots are in the session scratchpad `cake-stack/` (`play.mjs`, `poke.mjs`).

### For the coordinator

- `js/speech.js`, `js/adventure.js`, `adventure.css`, `js/studio-dialog.js`, `studio-dialog.css` and `js/recipe-studio.js` are unused now. `_studio/package-originals.mjs` still copies them into this game.
- `_studio/tests/original-quality.mjs` still expects `#adventure-choice` and `window.__adventure` for cake-stack, so the cake-stack mission checks need removing. `window.cakeStack` still exposes `game`, `mover`, `cake`, `drop` and `choose`.
- Rebuild `public/bitgames.json`.

## Earlier history (summary)

- 2026-10-04: the first version had sliding layers, perfect/good/squish drops, side decorations every third layer, and a party with candles and an animal friend.
- 2026-10-05 to 10-06: learning missions, a recipe studio and layout fixes.
- 2026-10-09 calm pass: one constant slide speed, a steady glow instead of a flicker, no score, stars or praise banners, candles that wait for the child, soft petals instead of a confetti storm. The layout and slide-speed fixes are kept. The rest was superseded by the fun pass.
- 2026-10-09 to 10-11 learning passes (Phase 2 and Rounds 1–7): pictured orders, patterns, memory orders, tiers, counting missions and fair sharing. All of it is removed by the fun pass.

## Round 10 review: 8.6, passed (2026-10-16)

A fresh reviewer scored 8.6: intuitive 9, fun 8.5, variety 8.5, no text 9.5, polish 8.5. No kind of child got stuck. Ideas for after release, deliberately not done now, because the game has passed and late mechanics changes have made other games worse:
- In short landscape (844×390), a fast masher hits the ready 🕯️ about 2 s in and skips most of decorating. A possible fix is to arm 🕯️ after about 3 toppings and 3.5 s, or after a short pause in canvas taps (`main.js:2356`).
- Tray taps don't reset `D.idle` (`main.js:1355–1358`), so the hint finger points at 🕯️ while a tray tapper is still busy.
- The child's own toppings blend in with the automatic perfect-layer decorations (`main.js:588`, `1374–1377`).
- The idle path is long: about 14 s of decorating, 10 s at the candles, then the bonus (`main.js:2373`, `2384`).
- The blow bubble sits beside 🏠 in short landscape.
