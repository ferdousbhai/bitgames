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

# Phase 2: the counting sky (2026-10-09)

## Design

Each level is now one calm, spoken and pictured request instead of "pop everything". The child looks across the sky, finds the right balloons and counts them.

- **Requests** (`js/sky.js`), each spoken through speechSynthesis (respecting mute) and shown as a card at the bottom of the screen, with the colour word printed in its colour:
  - colour and count: "Pop 4 blue balloons." A red heart counts as a red balloon, because that is what a child would call it.
  - shape: "Pop the hearts! 3 hearts." Bunnies join from level 4.
  - adding: "Pop 3 green balloons, then 2 more." The first group is always the bigger one, so the child counts on from it. Two groups of slots with a + between them; it is named "3 and 2 more make 5 green balloons!"
  - dots (older play, from level 8): a gold balloon on the card carries 1–10 dots (dice faces, then two rows like a ten-frame). Every balloon popped lights one dot and appears beside it, numbered, in its own colour: one balloon for each dot. Named "6 dots, 6 balloons!"
- **Picture slots** are empty dashed balloons in the target colour (or grey hearts or bunnies) in rows of five. Each matching pop fills the next one and numbers it, and the count is said aloud and played as a climbing bell note. Speech is queued, so a quick double pop or a star chain is counted "1, 2, 3" without cutting words off.
- **Other balloons** still pop for fun with a softer pop (55 % gain) and are not counted. There is no timer and no failure; the score pill still shows every balloon popped.
- **Counts grow gently**: up to 3 at levels 1–2, then 4, 5, 5, 6, 7, 7, 8, 9, 9 and 10 from level 12. The opening order is colour, heart, colour, bunny, colour, adding, shape, dots; later levels mix all four kinds without repeating a kind, colour or count twice in a row. About two in five new balloons match the request, so one is always on its way.
- **Completion**: the card glows softly, the request is named aloud ("4 blue balloons!"), one soft chord and the Phase 1 petal drift play, and the next request comes after a 4.5 s pause. Popping during the pause counts for nothing and costs nothing.
- **Kept from Phase 1**: the countryside surprises, every balloon kind and its intro card (hearts at level 2, crowns 3, bunnies 4, star 5, rainbow 6), the constant pace and the nine-balloon cap. The star's chain-pop counts the matching balloons it pops; rainbow babies count for colour requests.
- **Ending**: going home shows and says what was learned: "You counted 5 skies, up to 7 balloons!"
- **Menu**: the existing pictured choice button now cycles 🔢 Counting sky (default, shown as two filled slots and one waiting) → Count three → Hearts → Red → 🎈 Free popping. Free popping is the Phase 1 sky (level bar, parade) for the youngest. The three missions (shared `adventure.js`) still run on the Phase 1 sky with their own picture strip, unchanged. Saved choices 1–3 keep their meaning; a saved 0 (old "Free play") now opens the counting sky.

## Changes (all under `examples/balloon-pop/public/`)

- `js/sky.js` (new): colour names, request generator `makeRequest(level, last)`, count ranges and the dot layout.
- `js/main.js:79-90`: menu options and pictures (`Counting sky`, `Free popping`); `picture()` draws a balloon in any request colour.
- `js/main.js:181-307`: `say()`, `newRequest()`, `renderSky()` (slots, + groups, gold dots and tally), `countPop()`, `nextSky()`.
- `js/main.js:341`: spawn bias toward the requested colour or shape.
- `js/main.js:434,466`: counted pops versus soft uncounted pops; the counting sky skips the level bar and parade.
- `js/main.js:535-543`: home summary, and the menu choice keeps its pictures after a round (it used to fall back to plain text); `:559` start; `:697` the hint finger points at a matching balloon; `:742` the calm pause.
- `js/audio.js:87-97`: `pop()` takes a softness; new `count(n)` bell.
- `index.html`: the `#sky` card; title tag "Look, count and pop!".
- `style.css:134-256`: the request card, colour slots, numbers, + sign, gold dot balloon, done glow, phone, short-screen and tablet sizes and reduced motion.

## Evidence

- `node examples/_studio/tests/browser.mjs --browser chromium --ids balloon-pop --run p2`: ready, 0 errors. The same with `--browser webkit`: ready, 0 errors.
- `EXAMPLES_ORIGIN=http://localhost:4173 node examples/_studio/tests/original-quality.mjs`: all pass, including "balloon-pop: native mission choice persists and starts at zero" and "Three directly touched balloons complete the raw-count mission".
- `node --test examples/_studio/tests/*.test.mjs`: 10 of 11 pass. The failure is the expected stale `public/bitgames.json` manifest (a new `js/sky.js` and changed files) until the coordinator rebuilds.
- Playwright playthroughs with real touches on matching balloons (`scratchpad/p2/balloon-pop/play.mjs`): the first colour request, an adding request, a dots request and a level-12 request (up to 10), then home. Run in portrait 834×1194, landscape 1194×834 and phone 667×375 in Chromium, and portrait in WebKit. All finished their requests with 0 console errors. Home read "🎈 You counted 4 skies, up to 10 balloons!"
- `other.mjs`: tapping a non-matching balloon pops it (score 0 → 1) and leaves the count at 0.
- Screenshots: `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/183efacb-62c2-4cf6-9680-a97f4bb0fb5f/scratchpad/p2/balloon-pop/`.
- The shared machine rendered at only a few frames per second during testing. Game time is clamped per frame, so the 4.5 s pause took much longer in real time; the playthrough script shortens that pause once a request is complete.

## Left for later

- `game.json` (coordinator): `howToPlay` should describe the counting sky. Suggested text: "Listen and look at the card: pop the balloons it asks for (4 blue ones, the hearts, 3 then 2 more, or one for each dot on the gold balloon) and watch the slots fill as you count. Other balloons still pop for fun. Tap the sun, a sheep, a house, a tree, the windmill or the hot-air balloon for a surprise. Choose Free popping on the menu to pop everything." `learning` could become "Counting to 10, colours, shapes, adding on and matching dots to quantities".
- Colour mixing with the rainbow babies (from the audit) is still open.
- Music still starts on, as in Phase 1.
- Have the owner's children try it, especially the 4.5 s pause and whether a 2-year-old prefers Free popping.

## Simplify pass (2026-10-09)

- One shared voice (`js/speech.js`, rate 0.82) for the game and its missions; the game's own speech wrappers are gone. Starting play hushes earlier words; counts and the named total queue.
- The mission choice is drawn through the adventure's `renderChoice` (no repaint after `begin()`); `renderSky` builds its rows of five with one `rowsOfFive` helper.
- Verified: chromium and webkit boot + play, and a stubbed-speech play of a counting sky and a mission (words in order, no errors).
- Iteration 2: missions carry their own `pictures`, `caption`, `balloons` (progress and reward pictures) and `sky: true`; the `missionPictures` side table, the label `replace` chain and the custom choice builder are gone (the shared button draws them; `.mission-next` became `#title .adventure-next`). The `say` alias is gone. The tree-leaf pool is `leafBits` with 66 pieces (was a 700-piece `confetti` pool). Home and the sound button now hush the voice themselves. The progress strip stays custom: its drawn colour balloons and caption above the slots are more than `icon` draws.

## Simplify pass, third pass (2026-10-09)

- The voice starts with `muted: audio.muted`; `setSound` calls `voice.setMuted`, which hushes on mute (the toggle no longer hushes when unmuting). The local `#hud .adventure-goal[hidden]` rule is gone; `adventure.css` owns it.
- Options list each picture array once through `balloonRow(balloons, filled)` and no longer carry the unused `emoji`.
- The Red hunt matches with `COLOURED_KINDS` (now exported from `sky.js`) and `colourName(b.color) === 'red'`, so a red heart (`#ff4d6d`) now counts, as a child would expect (deliberate change). `RED` is `SKY_COLOURS.red`.
- Verified: `browser.mjs --run simp3` (Chromium, WebKit), `original-quality.mjs`, `node --test`, and a stubbed-speech check (mute hushes and silences, unmute speaks again, choice/goal show and hide, no console errors).

## Exit paths (2026-10-09)

- `stopPlay()` is the one cleanup shared by `toTitle()` (🏠, Escape) and `start()` (Play): it hushes the voice, clears the play timers (star-chain pops and the sky's chord, now scheduled through `later()`), the mission-reward timer and the `#intro` banner (`introTimer` and its `show` class).
- Verified: `browser.mjs --run exits` (Chromium, WebKit), `original-quality.mjs`, `node --test`, and a stubbed-speech check: 🏠 mid star-chain cancels speech, no friend pops in the next 3 s (control run without leaving pops them all), the intro banner is cleared by 🏠 and Escape, no console errors.

# Round 1 of the 2026-10-10 re-audit: the friend's basket (2026-10-11)

The re-audit scored Balloon Pop 6/10: calm, but passive. Pops past the target were ignored, the dots request accepted any balloon, every count was spoken, it stopped at 10, the request card sat over the spawn zone, and the completion chord threw on every finished sky.

## Design

- **Stopping is the skill.** Each request is for a friend (🐻 Bear, 🦊 Fox, 🐸 Frog, 🐷 Pig, 🐼 Panda, 🦉 Owl, 🐨 Koala, 🐭 Mouse): "Bear wants 4 blue balloons." Matching pops go into the basket, and the child decides when it is right and taps **🧺 Give** (or presses G, or uses the keyboard pin). If there are too few, the friend tilts its head: "That's 3. Bear wants 4." If there are too many, the extras wait outside the slots, then float back up into the sky: "That's 5. One too many, so it floats away." The basket holds up to three spare balloons. Nothing fails, but careful counting and random tapping now play out differently.
- **Dots are a real quantity match.** In a dots request, about a third of the new balloons carry a scattered face of the asked-for number of dots, a third carry a near number (±1–2), and the rest are plain. The card shows the number as a dice face and, in tier 2, as a numeral alone. Only balloons with the right number go in; a wrong one is named once per round ("That one had 6 dots."). Because the balloon faces are scattered, the child has to count each one rather than match a picture. Three finds finish the request.
- **Harder tier, adaptive rather than a gate.** From level 4, three clean baskets in a row move to tier 2. A clean basket has no early or over-full hand-over, no wrong dots, and at most two stray pops. Two bumpy baskets in a row move back. Tier 2 replaces the stopping slots with ten-frames (two for the teens, 7–14 from level 8), stops counting aloud and drops the hint finger. It adds **one more / one less** ("Fox has 7 green balloons. Koala wants one more green balloon than Fox"), with Fox's bunch drawn in rows of five, adding up to 10, and dots up to 8 shown as a numeral.
- **Thinner voice.** Each request is said once, and counts are spoken only to 5 (`voice.count`) and only in tier 1. Past that, the climbing bell and the basket carry the count. The tier-2 explainer and the full-basket reminder are `sayOnce`, so each plays once per round. A typical tier-1 sky is now 3–7 lines; a tier-2 sky is 2.
- **Other changes:**
  - The card moved to the top, between the buttons in landscape and under them in portrait, clear of the spawn zone.
  - The "🎈 N popped" pill is hidden in the counting sky; the basket is the count. The home line is now "You helped N friends, up to M balloons!"
  - Star chain-pops no longer fill the basket, so the child's own taps decide.
  - The tier-1 full basket gives Give a steady glow, with no pulse. On the very first sky the finger points at Give.

## Changes (under `examples/balloon-pop/public/`)

- **Bug:**
  - `js/main.js:397` now calls `later(() => audio.chord(), 500)`. Before, the unbound `audio.chord` threw on every finished sky.
- `js/sky.js`:
  - `:27` `FRIENDS`.
  - `:38` `countRange(level, tier)`, with level 1 now asking for 2–3.
  - `:46` the tier-2 request pool.
  - `:64` `makeRequest(..., tier)` adds `friend`, `want` and the `more`/`less`/`dots` requests. The colour `accept` ignores dotted balloons.
  - `:167` `scatterLayout(n)`.
- `js/main.js`:
  - `:167-410` cover the basket: `newRequest`, `adapt` (tier up and down), `skySlot`, `frameCell`, `renderSky` (slots and extras, the ten-frames, the reference bunch, the dots card), `countPop(b, chain)`, `give`, `floatAway` and `worldAt`, and `finishSky`.
  - `:417-450` draw the dotted balloon faces as one cached sprite material per number, drawn over the balloon from its centre so the face does not slide off in perspective.
  - `:486` biases dots spawns. `:793` and `:844` let the pin and the G key hand the basket over.
  - `:876` points the finger at Give. `:885` gives tier 2 no finger, and `:934` adds the one full-basket reminder.
  - `start()` calls `voice.newRound()`.
- `index.html`: the card gains `#sky-friend` and the `#give` button.
- `style.css`:
  - `:133` the top card, Give button and steady glow, ask tilt, extras, reference bunch, ten-frames and gold numeral.
  - Phone, short-screen and tablet sizes.
  - `:314` portrait placement.
  - Reduced motion.

## Evidence

- `EXAMPLES_ORIGIN=http://localhost:4213 node examples/_studio/tests/browser.mjs --ids balloon-pop --run balloon-pop-r1`: BOOT + PLAY ready, 0 errors. `node --check` passes on `main.js` and `sky.js`.
- Playwright with real touches and speech stubbed (`scratchpad/polish/balloon-pop/play.mjs`, `adapt*.mjs`), at 834×1194, 1194×834, 667×375 and 390×844, all with 0 console or page errors:
  - an exact basket with the finger on Give;
  - Give with 0, then 4 hearts for 3: one floated away, "3 hearts! Thank you…";
  - a dots request with a wrong dot balloon ("That one had 6 dots.");
  - tier-2 add, more, less, teens (13 on two ten-frames) and numeral dots;
  - three clean baskets from level 3 moved to tier 2;
  - home.
- Spoken lines for a tier-1 sky: `Pig wants 2 blue balloons.`, `1`, `2`, `2 blue balloons! Just right!` For a tier-2 sky: `Bear wants 13 pink balloons.`, `13 pink balloons! Thank you!`
- Screenshots: `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/264c5237-472d-4187-be3f-45d364aa4d2a/scratchpad/polish/balloon-pop/`.

## For the coordinator

- `game.json` `howToPlay`, suggested: "A friend asks for balloons: pop the ones they want (4 blue ones, the hearts, 3 then 2 more, or the balloons with 5 dots) and tap 🧺 Give when the basket is just right. One too many floats away. Confident counters get ten-frames, the teens and one more / one less. Other balloons still pop for fun. Tap the sun, sheep, houses, trees, the windmill or the hot-air balloon for a surprise. Choose 🎈 Free popping to pop everything." `learning`: "Counting and stopping at a number to 15, colours, shapes, adding on, one more / one less, and counting dots to match a number". `ages` could become [3, 8].

## Remaining ideas

- "Which colour has most?" and colour mixing with the rainbow babies (from the audit).
- The tier is kept per visit only; remembering it across visits would help returning 7-year-olds.
- Free popping and the three missions are unchanged.

# Round 2: decisions that matter (2026-10-11)

Review 1 scored 7.1. The blockers were that random tapping plus mashing Give did as well as careful play, that the tier-1 glow made the stopping decision for the child, that the step to ten-frames was a cliff, that mashing Give made the voice nag, and that the tier was forgotten between visits.

## Design

- **An over-full basket is the child's job to fix.** Giving with extras no longer floats them away and thanks the child. The friend tilts its head and says "That's 6. Too many! Koala wants 4." The first time each visit, it adds "Tap a balloon in the basket to let it go." In tiers 1 and 2 the finger points at the last extra. Tapping any balloon in the card (a slot or a ten-frame cell), or pressing Backspace, lets that balloon float back up. The child can also do this before giving.
- **Give rests after a wrong hand-over.** It dims for 2.5 s, then 3.5 s, up to 5 s. During the rest, taps get only the click and the tilt, and even an exact basket waits. A reminder is spoken only when the count has changed, at most three times a sky. Tier-1 counts are spoken once per number per sky, so refilling after letting a balloon go stays quiet.
- **"Just right!" is said only when the first hand-over was exact.** Otherwise the friend says a plain "Thank you!". Dots requests always end with "Thank you!".
- **A middle tier.** The tiers are now 1 → 2 → 3, moved one step at a time:
  - Tier 1: numbered slots, the glow, counts spoken to 5, and the finger.
  - Tier 2: plain slots with no numbers, no glow and no spoken counts. The child has to notice the slots are full. Requests are colour, shape, add, and dots up to 6.
  - Tier 3: ten-frames, one more / one less, and numeral dots. The first counts are capped at 4–7, and the cap rises by one with each clean basket (`climb`), up to 10, or 14 from level 8.
  - Three clean baskets move the child up a tier (to tier 2 from level 3, to tier 3 from level 5). Two bumpy baskets move them down, and dropping out of tier 3 also lowers `climb` by 2.
  - A clean basket means the first hand-over was exact, nothing was let go, there were no wrong dots, and there were at most 2 strays.
- **The tier is remembered.** `localStorage` key `balloon-pop-tier`, read and written inside try/catch. A returning child starts at their tier: tier 2 at level 3, tier 3 at level 5.
- **Strays matter a little.** A balloon the friend didn't ask for gets a small head shake on the card and a soft low boop, with no words. Three strays in a row bring the finger back to a matching balloon (tiers 1 and 2). In the Hearts and Red hunts, a wrong balloon gets the boop too.
- **Dots.** The 1-2-3 count of finds is no longer spoken. The first right find says "4 dots!", so the only number spoken is the dot number. The card's dice face now uses the sky balloons' own big cream dots with a purple ring (21% of the balloon, 15% for 7–10). When a new request starts, leftover dotted balloons lose their dots and become plain balloons of their colour.
- **Layout.** The card is opaque. The sun drifts down out from under the card whenever the two would overlap (portrait, and wide landscape cards). Dotted and let-go balloons are cleared on 🏠.
- **Music.** The music box starts off, and a saved "on" is still honoured. When it plays, every other 32-step phrase is a rest.

## Changes (under `examples/balloon-pop/public/`)

- `js/main.js`:
  - `:175` `giveRest`.
  - `:179` `loadTier`/`saveTier`.
  - `:192` `newRequest`, with tier lines said once and `undot` of leftover balloons.
  - `:208` `adapt`, which moves one tier at a time and handles `climb`.
  - `skySlot`/`frameCell` carry `data-i`; numbers appear in tier 1 only.
  - `:338` `placeSun`.
  - `:357` `friendFace`.
  - `:365` `countPop`: strays, guide, dots speech, counts once.
  - `:408` `give`: rest, the over-full decision, and capped reminders.
  - `:436` `release`.
  - `:467` `finishSky`: just right or thank you.
  - `:535` `undot`.
  - `:687` the hunt boop.
  - `:806` `toTitle` cleanup.
  - `:820` the remembered tier in `start`.
  - `:844` taps in the card.
  - `:882` music off by default.
  - `:955` Backspace.
  - `:995` `updateHint`: the finger on an extra, on Give, or back after strays.
- `js/sky.js:39`: `countRange(level, tier, climb)`. `:50` has three tier pools. `makeRequest(..., tier, climb)`, with tier-3 `more`/`less` references kept within the cap.
- `js/audio.js:11`: music off. `:100` `boop()`. `:105` `release()`. `updateMusic` adds rests.
- `js/world.js:123`: `layout(avoid)` places the sun below a rect it would overlap. `:143` `placeSun`, with a gentle drift in `update`.
- `style.css`:
  - `:141` opaque card.
  - `:149` head shake.
  - `:152` tappable basket balloons.
  - `:164` resting Give.
  - `:205-215` matching dice dots.
  - Reduced motion covers `.no`.

## Evidence (scratchpad `polish/balloon-pop/r2/`)

- `browser.mjs --ids balloon-pop --run balloon-pop-r2`: BOOT + PLAY ready, 0 errors. `node --check` passes on `main.js`, `sky.js`, `audio.js` and `world.js`.
- `compare.mjs`, 150 s each with stubbed speech:
  - At 834×1194, careful play finished 7 skies: 6 "Just right!", 25 spoken lines, and it climbed to tier 3. Random tapping (sweeping balloons, tapping the card, mashing Give three times every loop) finished 5 small tier-1 skies with 0 "Just right!" and 46 lines. No line was said more than 6 times, and those were the short counts. Before the changes, random play was 178 lines in 4 minutes, with one nag said 12 times.
  - At 1194×834, careful play with the tier pinned to 1 finished 5 skies, all just right. Random play finished 3 skies, none just right.
- `flow.mjs` at 834×1194, 1194×834 and 390×844, all with 0 errors:
  - The first sky ends "Just right!".
  - After 3 strays, `guide` is on.
  - An early Give mashed 11 times gives one reminder.
  - Over-full: "That's 4. Too many! Koala wants 2 hearts." and the release hint, with the finger on the extra. Eight more mashes stay silent. Two card taps let balloons go, and the basket ends "2 hearts! Thank you!".
  - Dots: "Frog wants the balloons with 5 dots.", "5 dots!", "5 dots, every one! Thank you!".
  - Promotion: tier 1 → 2 at level 6 (plain slots, said once), then → 3 at level 9 with a first count of 4–7.
  - 🏠 leaves 0 dotted or let-go balloons.
  - A reload starts at tier 3, level 5.
- `missions.mjs`: Count three completes at 3. The Red hunt and Free popping run. Music starts off. 0 errors.

## For the coordinator

- `game.json` `howToPlay`, suggested: "A friend asks for balloons: pop the ones they want (4 blue ones, the hearts, 3 then 2 more, or the balloons with 5 dots) and tap 🧺 Give when the basket is just right. Too many? Tap a balloon in the basket to let it go. Confident counters move on to plain slots, then ten-frames, the teens and one more / one less. Other balloons still pop for fun. Tap the sun, sheep, houses, trees, the windmill or the hot-air balloon for a surprise. Choose 🎈 Free popping to pop everything." `ages`: [3, 8].

## Remaining ideas

- Free popping, and the Count-three mission (the shared test requires it to finish on any 3 pops), still have no decision. The Red and Hearts hunts only gained the boop. Folding the hunts into the counting sky as requests, or giving them the basket, is the next step.
- On a 390-wide phone, the basket balloons you tap to let go are about 24 px. The card handler could choose the nearest filled slot to the tap.
- "Which colour has most?" and colour mixing with the rainbow babies.

# Round 3: new kinds of thinking and a picnic to build (2026-10-11)

Review 2 scored 7.7. Its blockers were visible UI bugs in 4 of the 5 modes, card taps popping hidden balloons into the basket, one loop with no payoff, a tier-3 "add" that lost its split, slow teen requests, and a 6–8 tier that only had bigger numbers.

## Design

- **Bugs.**
  - The `counting` class is now a real boolean, so Free popping and the missions keep their level bar and popped pill.
  - `.sky[hidden]` hides the card, which removes the orphan Give card.
  - The card takes every tap (`pointer-events: auto`, and the keyboard pin returns early on it), so nothing behind it is popped.
  - Tapping the friend repeats the request, at most once every 6 s. Otherwise the friend just tilts its head.
- **A two-colour basket (`pair`, tiers 2 and 3).** "Fox wants 3 orange and 1 purple balloons."
  - Each colour gets its own group of slots, and every popped balloon is sorted into its colour's group. Extras in a colour wait past a dashed line.
  - Give checks each colour, and the reminder names the problem: "That's 4 orange and 0 purple. Too many orange! …".
  - The finish names the composition: "3 orange and 1 purple make 4!".
  - The child has to sort and count, and stop on two numbers.
  - Tier 2 meets it at levels 5 and 7 (`OPENING_2`). After that it is part of the mix in tiers 2 and 3.
- **Make them the same (`same`, tier 3).** "Fox has 8 orange balloons. Panda has 6. Give Panda enough to have the same."
  - Panda's ten-frame starts with their 6 on lilac cells (fixed). Fox's 8 sit in a second ten-frame beside it, so the two can be compared row by row.
  - The child gives the difference.
  - The finish: "6 and 2 more make 8, the same as Fox!".
  - This tier now asks for comparison and difference, not only bigger numbers.
- **Tier-3 add keeps its split.** The ten-frame tints the first group's cells butter yellow and the "more" cells with a pink edge, even when they are empty.
- **The picnic (payoff, creation).** After each thank-you, the friend floats down from the card to a gingham picnic blanket at the bottom of the screen. They carry a little bunch of the exact balloons they were given (plus any they already held), in their real colours. Over a visit the child builds the picnic, and the home screen shows every friend with their bunch. Nothing is counted or scored, and the only line is the existing "You helped 3 friends!". Reduced motion skips the flight.
- **Voice.**
  - Tier 1 counts 1, 2 … and lands the target with a stop: "3. That's 3!". Past the target it is silent, apart from the soft tick.
  - Colour and add reminders now name the colour.
- **Waiting.**
  - A matching spawn is now always a plain or smiley balloon in the needed colour. In a two-colour basket it is the colour that is still short.
  - Tier 3 raises the match chance from 0.5 to 0.65 while more than 6 are still needed.
  - In the counting sky the star leaves the balloons the friend wants floating, so it never pops away the child's targets.
  - Teen requests now fill in about 28 s, down from about 55–90 s.
- **Teal** is left out of the counting sky's balloons and rainbow babies (`SKY_PALETTE`).
- **Tier-1 shape slots** show their number as a small purple badge at the foot of the 🐰/💖, clear of the face.

## Changes (under `examples/balloon-pop/public/`)

- `js/sky.js`:
  - `:51` `OPENING_2`, and `MIXED` with `pair` and `same`.
  - `:111` `pair`.
  - `:126` `same`.
  - The colour and add `want` lines now name the colour.
- `js/main.js`:
  - `:171` `counting()` returns a boolean.
  - `:221-233` basket helpers: `ofColour`, `basketParts`, `basketRight`, `basketOver`, `basketWords`.
  - `:236` `skySlot` takes an index.
  - `:260` `frameCell`, with the own/part tints.
  - `:280` `tenFrames`.
  - `:292` multi-colour `colourCaption`.
  - `:347` tier-3 frames: own cells, add tints, and `same` frame first.
  - `:361` the pair render.
  - `:424` `countPop`: a cap per colour, `tint`, and the tier-1 stop line.
  - `:481` `give` uses `basketRight` and `basketOver`.
  - `:556-615` the picnic: `picnicFriend`, `toPicnic`, `showPicnic`.
  - `:701-720` `SKY_PALETTE`, `matchChance`, `skyColourNeeded`.
  - `:741` matching kinds.
  - `:856` the star spares targets.
  - `:1019` `askAgain`, and the card pointer handler.
  - `:1081` the pin ignores the card.
  - The debug hook exposes `newRequest`.
- `style.css`:
  - `:144-146` the card takes taps, and `[hidden]`.
  - `:181` `.sky-them`.
  - `:189-192` part and own cells.
  - `:209` the slot badge.
  - `:232-252` the picnic.
- `index.html`: `#picnic` in the HUD and `#title-picnic` on the title card.

## Evidence (scratchpad `polish/balloon-pop/r3/`)

- `browser.mjs --ids balloon-pop --run balloon-pop-r3`: BOOT + PLAY ready, 0 errors. `node --check` passes on `main.js` and `sky.js`.
- `modes.mjs` at 834×1194: Counting sky shows the card, with the bar and pill hidden. Count three, Hearts, Red and Free show no card (`display:none`), the level bar (`flex`) and the pill. 0 errors.
- `flow.mjs` at 834×1194, 1194×834 and 390×844, 0 errors each:
  - The tier-1 voice for 3 blue with 4 popped is `1, 2, "3. That's 3!"`, then nothing.
  - A matching balloon placed under the friend face, then a tap on the face and on the caption, leaves the count 0→0. The face tap repeats the request once, and 4 face taps give one line.
  - Pair: "That's 4 red and 1 green. Too many red! Pig wants 3 red and 2 green balloons." The finger points at the extra. A release, a pop and a Give end with "3 orange and 1 purple make 4!".
  - Add in tier 3: yellow and pink-edged cells (`834x1194-4-add-t3.png`).
  - Same: "5 and 3 more make 8, the same as Panda! Just right!" (`5-same-*.png`, with two frames stacked on a phone).
  - The picnic has 3 friends, and the home screen shows 3 with their bunches (`7-home.png`).
- `compare.mjs`, 150 s:
  - Careful play at 834×1194 finished 7 skies, all "Just right!", with 25 lines, and reached tier 3.
  - Careful play at 1194×834 finished 7 skies, 6 of them "Just right!", reaching tier 3.
  - Random play at 834×1194 finished 1 sky, 0 of them "Just right!", with 15 lines and a maximum of 3 repeats.
- `teen.mjs` (tier 3, level 9): 14 purple filled in 28.4 s, and 12 green in 27.4 s. The first run, before the matching-kind fix, took 91 s.

## For the coordinator

- Suggested `game.json` `howToPlay`: "A friend asks for balloons: pop the ones they want (4 blue ones, the hearts, 3 then 2 more, 3 red and 2 blue, or the balloons with 5 dots) and tap 🧺 Give when the basket is just right. Too many? Tap a balloon in the basket to let it go. Tap the friend to hear them again. Each friend you help joins your picnic with their balloons. Confident counters move on to plain slots, then ten-frames, the teens, one more / one less and making two bunches the same. Choose 🎈 Free popping to pop everything."

## Remaining ideas

- Count three cannot use the basket, because the shared quality test needs it to finish on any 3 pops. Free popping stays free on purpose. The Hearts and Red hunts remain simple discrimination tasks.
- "Which colour is there most of?" with the rainbow babies.
- The picnic could gain small things to place (a cake, a kite) chosen by the child.

# Round 4: a visit with an ending, a picnic the child makes, help when stuck (2026-10-11)

The round-3 reviews scored 8.5 and 8.4. Their blockers were:

- a stuck child at tier 3 never got easier;
- a saved tier carried over to a sibling;
- an endless loop with no finish;
- a picnic that was collected rather than made;
- passive Hearts and Red hunts;
- stopping was rarely tested in tiers 1–2.

There were also four small bugs.

## Design

- **Bugs.**
  - Teal no longer leaks between requests. The palette rule applies whenever `counting()` is true.
  - The tier-1 "Is it just right?" reminder now plays only when `basketRight` is true, never over an over-full basket.
  - The mid-screen level-intro cards are gone from the counting sky. The new balloon kind is still sent up first.
  - The title card is now solid (`#fffdfa`), so the scene no longer shows through the logo.
- **Help in place for a stuck child (`ease`).** A sky softens to tier-1 help when the child is stuck: numbered slots, the glow and counts aloud to 5, plus one spoken hint. Any of these triggers it:
  - two hand-overs that are not right (from tier 2);
  - three wrong dots;
  - 50 s with no change to the basket.

  The hint teaches the step rather than nagging, for example "Owl has 7. One less than 7 is 6." or "Bear has 4. Count on to 7: one balloon for each slot."

  A softened sky counts as bumpy immediately. Two of them, or the first sky of a visit, drop the tier without waiting for the basket to finish. In tier 1 the finger comes back instead.
- **Shared device.** When a tier above 1 is saved, the home screen shows a quiet "🌱 Start easy" button that resets it. A first sky that has to be softened also steps the tier down.
- **A visit has an arc.** The picnic blanket starts with one empty place per friend: 8 for the Counting sky, 5 for Hearts and Red. Each helped friend takes the next place. When every place is filled:
  - the card leaves;
  - the friends wave three times;
  - one line plays, "Everyone is at the picnic!";
  - after about 7 s the game goes home quietly, with no second summary line.

  The home screen shows the whole picnic.
- **The picnic is made, not collected.** After each hand-over the friend offers two treats (🍓 🧁 🍉 🪁 🌼 …, never repeating one already at the picnic). The child picks one, and it sits beside that friend on the blanket and on the home screen. There is no right answer and nothing is said. The next request waits for the pick, or for about 9 s without one.
- **Stopping is tested in every tier.** Once the basket is just right, the next 2–3 spawns are matching balloons, and the balloon cap rises to 11 while they arrive. A child who keeps popping has to notice and stop.
- **Tier-3 pair.** Each colour gets one open ten-frame tinted in that colour, with no slots or dashed line, the same as the rest of tier 3.
- **Slower promotion.** Tier 2→3 now needs 4 clean baskets (1→2 still needs 3). The spoken tier announcements are removed: the slots show the change.
- **Every menu choice carries the decision.** Hearts and Red are now focused counting skies ("Hearts for friends" and "Red for friends"). They use the same basket, Give, tiers, treats and a 5-friend visit:
  - Hearts asks only for hearts.
  - Red mixes colour, add and pair requests, plus more/less/same in tier 3. Its other balloons are 60% pink, orange or purple, so finding red takes a careful look.
- **Hearts in the counting sky** spawn only in the exact red, pink or purple of the round balloons, so their colour is never in doubt.
- **Less narration.** A goal said when the child chooses it on the menu is not repeated on Play. Count three keeps its raw count, because the shared test needs it. Free popping stays free on purpose.

## Changes (under `examples/balloon-pop/public/`)

- `js/sky.js`:
  - `:55` `FOCUS_RED`.
  - `:74` `makeRequest(…, focus)`.
  - `:83-85`, `:92`, `:113` the focused type, kind and colour.
- `js/main.js`:
  - `:141-151` `choiceSaid` and the `announce` wrapper.
  - `:157-162` the options, with `visit` and `focus`.
  - `:218-258` `adapt` (4 clean baskets for 2→3), `stepDown`, `viewTier`, `ease` and `hintFor`.
  - `:368` the treat choice in the card.
  - `:399` the tier-3 pair frames.
  - `:537` temptation.
  - `:566` easing after 2 slips.
  - `:639-676` treats.
  - `:735-760` `layPicnic` and `endVisit`.
  - `:766` `nextSky` (no intro card).
  - `:851-853` and `:899` heart colours, red distractors and the teal fix.
  - `:937` the cap for temptation.
  - `:1132` `showEasy`.
  - `:1417-1427` the reminder fix, idle easing and the finale.
- `index.html`: `#easy`.
- `style.css`:
  - `.easy-go`.
  - `.picnic-empty`, `.picnic-treat`, `.picnic.wave`.
  - `.sky-treat(s)`, `.sky-pair-frames`.
  - Phone and tablet sizes.
  - The title card is solid.

## Evidence (scratchpad `polish/balloon-pop/r4/`)

- **Checks.** `browser.mjs --ids balloon-pop --run balloon-pop-r4`: BOOT + PLAY ready, 0 errors. `node --check` passes on `main.js` and `sky.js`.
- **`flow.mjs` at 834×1194 and 1194×834, 0 errors.**
  - **Temptation:** after a just-right 3-green basket, the next 3 spawns were green.
  - **Treats:** 2 treat buttons appear. The chosen treat sits on the blanket, with 7 empty places left.
  - **Colours:** 0 teal balloons across the pause between requests. Hearts use only the sky colours.
  - **Over-full basket:** 4 in a basket for 2 with `full` forced to 20 s gave no "Is it just right?" line.
  - **Tier-3 pair:** 2 tinted frames, 0 dashed slots (`4-pair-t3.png`).
  - **Two wrong hand-overs in tier 2:** the sky is eased, followed by "One balloon for each slot, then tap Give." (`5-eased.png`).
  - **Tier-3 "less" left 50 s:** eased, with "Owl has 7. One less than 7 is 6.". It was the second bumpy sky, so the tier went from 3 to 2 (`6-eased-less.png`).
  - **Finale:** the friends wave and "Everyone is at the picnic!" plays, then the game goes home with no extra line (`7-finale.png`, `8-home.png`).
- **`compare.mjs` (speech stubbed).**

| Run | Time | Friends helped | "Just right!" | Spoken lines | Tier |
|---|---|---|---|---|---|
| Careful, 834×1194 | 240 s | 13 | 13 | 36 (2.8 per friend) | reached 3 |
| Careful, 1194×834 | 180 s | 8 | 8 | 27 (3.4 per friend) | reached 3 |
| Random, 834×1194 | 180 s | 5 | 0 | 50, at most 6 of any one line | stayed at 1 |
| Random, 1194×834, saved tier 3 | 180 s | 1 | 0 | 21 | eased to 2 |

  - Careful play at 834×1194 finished one full visit (8 friends and the closing line) and started another.
  - In the round-3 build, the random run from a saved tier 3 helped 0 friends and stayed silent at tier 3.
- **`modes.mjs` at 390×844, 0 errors.**
  - A saved tier 3 shows "🌱 Start easy", which is hidden on Count three.
  - Count three: the goal is said on the choice tap, and nothing more is said on Play.
  - Hearts: "Koala wants 3 hearts.", "Pig wants 2 hearts." and "Fox wants 4 hearts.", with a 5-place blanket (`m1-hearts-done.png`).
  - Red: "Fox wants 4 red balloons." with orange and pink balloons around it.

## For the coordinator

- Suggested `game.json` `howToPlay`: "A friend asks for balloons: pop the ones they want (4 blue ones, the hearts, 3 then 2 more, 3 red and 2 blue, or the balloons with 5 dots) and tap 🧺 Give when the basket is just right. Too many? Tap a balloon in the basket to let it go. Then choose a treat for the picnic. When all eight friends are at the picnic, everyone waves. Stuck? The friend helps with numbered slots. Confident counters move on to plain slots, then ten-frames, the teens, one more / one less and making two bunches the same. 🌱 Start easy goes back to the beginning."
- The menu labels changed: "Hearts for friends" and "Red for friends". The shared quality test only uses "Count three balloons", which is unchanged.

## Remaining ideas

- The treat choice is creative but carries no learning. A later tier could offer "a treat for each balloon" plates (choose the plate with 4 strawberries).
- An occasional "Who has more?" about two bunches on the blanket at the end of a visit.
- Free popping and Count three still have no decision. Count three is held by the shared test.
