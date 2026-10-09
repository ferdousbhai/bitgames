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
