# Memory Match: polish log

## Phase 1 calm pass (2026-10-09)

The audit is in [AUDIT_2026-10-09.md](AUDIT_2026-10-09.md). The core memory loop, the six levels, the 👀 one-pair peek and the animal voices are unchanged.

### What changed and why

| Change | Where | Why |
| --- | --- | --- |
| The idle "tap me" card knock is removed: before, a random face-down card hopped and knocked after 7 s, then every 5 s. `Card.nudge` and `sound.nudge` are removed too. | `public/js/main.js:1208`, `public/js/audio.js` | It interrupted a thinking child, and the random card looked like a hint. |
| The random praise banner after each match is gone. The pair simply joins the found-animal row at the top. Sparkle per card drops from 26 to 8, slower. | `main.js:921-925` | Removes praise spam; shows what was found instead. |
| **Calm win:** no confetti rain of 160–360, no two confetti cannons, no 20-voice chorus. Now there is one soft chord and 24 slow pieces drifting down. Then each animal (both twins) does a small dance and calls **one at a time**, `WIN_CALL_GAP = 0.9 s` apart. | `main.js:30`, `winLevel()` at `:953` | One soft moment, one voice at a time. |
| **No turn-graded stars:** the win card says "You found them all!" and "N pairs of animal twins", then shows the found animals' emoji fading in, in the order they call. "N tries" and "New best!" are gone. | `main.js:953-990`, `public/index.html` `#win-stars` | Removes grading; shows what the child found. |
| A finished level shows a 🐾 on the menu instead of 1–3 stars. Old saves with 2 or 3 still read as done. `nextLevel()` is unchanged. | `main.js:731` | Same reason. |
| The fanfare is now a soft rolled sine chord (it was a square-wave tune with a 10-note sparkle tail). The match jingle is 3 triangle notes at lower gain. | `audio.js:209`, `:227` | No square-wave fanfare. |
| Matched and menu animals hop less often (won: 0.35 to 0.08/s; play: 0.06 to 0.04/s; menu: 0.25 to 0.08/s). | `main.js` `frameLoop` | Calmer idle motion. |
| These infinite CSS animations are removed: logo bob and Play-button pulse. The loading paws are slowed. The win-star pop is replaced by a gentle fade. A `prefers-reduced-motion` block is added. | `public/style.css` | No pulses; reduced motion is honoured. |

### Verification

- `node examples/_studio/tests/browser.mjs --browser chromium --ids memory-match --run calm`: BOOT + PLAY ready, 0 errors.
- Scratch replica of the memory-match part of `original-quality.mjs` passed:
  - the peek reveals and returns a pair with no turn used
  - after 12 s idle, no card wobbles

  The full script stops earlier, at another worker's bunny-hop.
- Played levels 1 and 6 in Chromium at 834×1194 and 1194×834, with one deliberate mismatch, then the win. 0 console errors.
- Screenshots: `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/183efacb-62c2-4cf6-9680-a97f4bb0fb5f/scratchpad/audit/memory-match/before/` and `.../after/`. Compare `*-L5-5-party` and `*-L5-6-win`; `after/portrait-menu-done-levels.png` shows the 🐾 marks.
- `public/bitgames.json` is now stale until the coordinator's rebuild.

### Remaining (Phase 2)

- Speak the animal's name on reveal and on the win card.
- Add animal↔sound and animal↔baby matching modes.
- Add a quiet ambient bed. Soften the sawtooth and square animal voices with lowpass filtering (left as they are in this pass: they are character sounds, not fanfares).

## Phase 2: vocabulary and deeper matching (2026-10-09)

### Design

There are now three kinds of pair, each chosen with a picture button on the menu. Twins (🐶🐶) stays the default.

- **Twins:** two of the same animal, as before.
- **Sounds (🐮🔊):** each animal has a partner card that shows only a purple loudspeaker. Flipping it plays the call, and its three waves glow while the call sounds. The child has to remember the sound and find the animal that makes it, which trains auditory memory. The speaker card's spot stays plain lavender until it is matched, because its colour would give the animal away. On a match the speaker shrinks away, the animal that made the sound pops out, and the spot takes on the animal's colour.
- **Babies (🐮 + small 🐮):** each animal is paired with its baby. The baby is the same model, made at runtime: 0.6× size, 1.1× wider, with a 1.3× head (the head's origin is at the neck). Its call is the same voice pitched up 1.45× and a little softer. No new Blender model was needed; the calf, cub and piglet read clearly as babies next to their parents. Frog (a tadpole looks nothing like a small frog) and chick (already a baby) are left out of this mode, which leaves exactly 10 animals for the 10-pair level.

**Names are spoken** through a new one-voice-at-a-time queue (`public/js/talk.js`). An animal's call always plays first, then its name ("Cow!", or "Calf!" for a baby), so speech never talks over a moo. The queue is silent and instant while muted, and when taps pile up it drops the oldest names first.

- **Round goal:** the goal is spoken at the start of every round, and again when a mode is chosen: "Find the animal twins!", "Listen! Find the animal that makes each sound.", "Find each animal's baby!".
- **On a match**, one small phrase names what was learned: "Two cows!", "The cow moos!", "A cow's baby is a calf!" (or "An elephant's…").
- **On a mismatch**, the two cards stay open until their names or sounds have been heard (at least 1.25 s, at most 4 s), then turn back. A third tap still closes them at once.
- **At the win**, the Phase 1 calm party is unchanged: one soft chord, then one call at a time. After the last call the game names everything that was found: "Bunny, chick and penguin. You found all the twins!", "Lion, pig and frog. You know all their sounds!" or "Calf, kit and piglet. You found every baby!". Each emoji on the win card is now a button, so tapping it makes those animals hop and say their name again. In Babies the emoji are shown as a parent and a small baby.
- Tapping animals on the menu or on a finished board also says their names.

**Softer voices.** dog, cat, pig, elephant and penguin now use triangle waves. The squeaky toy bear does too. frog, lion and cow keep their growl, but behind a lower lowpass filter (≤ 850 Hz) and at lower gain.

Progress is kept per mode: Twins keeps the existing `progress.stars`, and Sounds and Babies use `progress.modeDone`. The 🐾 marks, the six levels, the 👀 peek and the calm win are all unchanged. The peek now speaks after the two cards' names, and turns them back once that speech has finished.

### Where

| Change | Where |
| --- | --- |
| Words (plurals, call verbs, baby names), `MODES`, `MATCH_WORDS` | `public/js/main.js:30-63` |
| Progress for each mode | `main.js:99` (`doneLevels`) |
| Baby transform and spoken name | `main.js:432` (`babyfy`), `:441` (`callAndName`) |
| Runtime loudspeaker | `main.js:503` (`makeSpeaker`) |
| Card kinds, plain sound spot, `popOut`/`playCall`/`becomeAnimal`/`poseSpeaker` | `main.js:529-710` |
| Mode menu | `main.js:916-933`; buttons in `public/index.html:33-37`; styles in `public/style.css:50-64` (beside Play in landscape and on short phones) |
| Mixed deck | `main.js:1042`; the goal is spoken at `:1070` |
| Match phrase, mismatch waits for speech, win waits for the last phrase | `main.js:1114-1150` |
| Win recap and tappable found animals | `main.js:1186-1215` |
| Peek goes through the speech queue | `main.js` `$('peek').onclick` |
| Speech queue | `public/js/talk.js` (new) |
| Softer voices, `VOICE_LENGTH`, baby pitch | `public/js/audio.js:1-51`, `:164` |

### Evidence

- `browser.mjs --ids memory-match --run p2`: chromium and webkit both reported BOOT + PLAY ready, 0 errors.
- `node --test examples/_studio/tests/*.test.mjs`: 10 of 11 pass. The one failure is the manifest-hash test, which is expected until the coordinator rebuilds: `public/js/talk.js` is new and other files changed.
- `original-quality.mjs`: every check passes, including "The pair hint reveals two matching cards, returns them, and consumes no turn."
- Full play-through script (`scratchpad/p2/memory-match/play.mjs`). Each round makes one deliberate mismatch, then solves the board and waits for the win.
  - Chromium portrait 834×1194: all three modes.
  - Chromium landscape 1194×834: all three modes.
  - Chromium phone 667×375: Sounds.
  - WebKit landscape: all three modes.
  - 0 console errors throughout.
- The recorded speech shows the order working. For example, in Sounds: "Pig!", "Lion!" (the sound card is not named), "The lion roars!", …, "Lion, pig and frog. You know all their sounds!".
- WebKit headless has no speech, and the game still completes because of the fallback timers.
- Screenshots are in `scratchpad/p2/memory-match/`:
  - `chromium-portrait-sound-mismatch.png`: the loudspeaker card next to the pig.
  - `chromium-portrait-sound-match.png`: the sound card turned into the lion.
  - `chromium-portrait-baby-match.png`: cow and calf.
  - `chromium-portrait-baby-win.png`
  - `menu-chromium-{portrait,landscape,phone,phone-portrait}.png`
- The test machine was very loaded (load average 25, about 5 fps), so the scripts wait on game time rather than wall-clock time.

### Left

- A quiet ambient bed, which Phase 1 listed, is still not done. It is outside this core-loop change.
- Speech uses the device voice. On iPad that is the system en-US voice, so it is worth a listen on a real device.
- `public/bitgames.json` is stale until the coordinator rebuilds.

### Follow-up: Sounds stops at 8 pairs (2026-10-09)

Sounds now offers 5 levels, up to 8 pairs (16 cards); Twins and Babies keep all 6. `levelsFor(mode)` (`public/js/main.js:70`) drives the level menu, `nextLevel()`, the win card's Next button and `startLevel()`, which also clamps the level, so no path can start a 10-pair Sounds round. An old save that marks the 10-pair Sounds level done is ignored. Checked: an old Sounds save with all 6 levels done shows 5 levels with 🐾 marks, and Play starts the 8-pair level; Twins still shows 6 (`scratchpad/p2/memory-match/soundcap.mjs` and `soundcap-{portrait,phone}-menu.png`). `browser.mjs --browser chromium --ids memory-match`: BOOT + PLAY ready, 0 errors.

### Simplify pass (2026-10-09)

Quality cleanup only; play is unchanged.
- `talk.js` keeps its queue (animal calls interleave with words) but speaks through the shared `speech.js` voice (`voice.say(text, { onend })`, `clear()` → `voice.hush()`). `stopPeekSpeech` also runs on `pagehide`.
- Loudspeaker wave materials (three per sound card, animated per card) are disposed in `resetScene`.
- Saves: `progress.stars` is moved into `modeDone.twins` once at load and `best` dropped, so `doneLevels()` is just `progress.modeDone[progress.mode]`. Checked with an old save: paw marks kept, and the next save writes the new shape.
- Removed dead `effects.cannon()`, `audio.star()` and the always-zero `Card.wiggle`/`Card.bob`.
- Checked: `browser.mjs --run simp` Chromium and WebKit 0 errors; a scripted Twins and Sounds round records the expected spoken order with no console errors.
- Iteration 2: removed the orphaned `.logo span` `animation-delay`s and the unused `@keyframes bob`.
- Third pass: the voice is created with `muted: progress.muted` and the 🔊 toggle calls `voice.setMuted` (Talk's `clear()` still empties the queue and hushes). The "A, B and C" join is a module `Intl.ListFormat('en-GB')`; the spoken win lines are unchanged. Checked: `browser.mjs --run simp3` Chromium and WebKit 0 errors, `original-quality.mjs` pass, and a speech-stubbed run (peek names spoken, mute hushes, muted and saved-mute silent, unmute speaks, no console errors) in both engines.

### Exit paths (2026-10-09)

The win hellos now wait on the game clock (`wait(delay).then(() => round === game.round && sound.voice(animal))`) instead of being booked up to about 9 s ahead on the AudioContext, so `resetScene()` (🏠, Escape, 🔁, Next) strands them. Escape now goes to `enterMenu()` from any screen except the menu and loading. Checked: `browser.mjs --run exits-fmp` Chromium and WebKit 0 errors, `original-quality.mjs` pass, and a speech-stubbed run (Escape and win-🏠 during the hellos: hushed, back on the menu, no oscillator starts after the exit, no console errors) in both engines.

Open bug, not fixed in this pass: in `winLevel` the `recap` object builds all three lines, so in Twins or Sounds mode an animal without a `WORDS[name].baby` (the frog or the chick) makes `listWords.format` throw. The win card then never shows. The cause is fa3f74d.

## Round 1 of the re-audit pass (2026-10-11)

Starting point: [AUDIT_2026-10-10.md](AUDIT_2026-10-10.md) scored Memory Match 8 (Fun/Depth 7). It found two bugs (the goal is spoken twice; after a win the menu re-selects the level just played) and asked for a category mode for ages 6–8, auto-advance, a goal said once, babies that differ by more than size, and a shorter mismatch hold on big boards.

### Design

- **🐮🐷🐥 Homes, a new mode for ages 6–8 (sorting by knowledge).** No two cards are the same. Each animal belongs to a group: farm (cow, pig, chick), pets at home (dog, cat, bunny) or wild (lion, elephant, fox, panda). A turn keeps going while every card belongs with the first one. A card that does not belong ends the turn, and the cards turn back. So a child who knows "a pig lives on a farm, a dog is a pet" keeps turning, and random tapping ends at once. When a group is complete, the game says it: "Cow, pig and chick live on the farm!". When the child picks a card that does not belong, the game says where that animal lives, once per animal per round: "An elephant is a wild animal." The HUD shows each group's sign (🌾 🏡 🌳) faded, with how many animals it holds (3 or 4), and lights it when the group is found. Levels: 2 groups of 3 (6 cards), 3 of 3 (9), and 3+3+4 (10, with all four wild animals). Frog and penguin are left out, because they would make groups of one.
- **The next board adapts to how the child is doing, without locking anything.** A slip is a missed turn when a partner of the first card had already been seen. After a win, the next board depends on the slips:
  - Careful board (≤1 slip, or ≤ sets/4): skips a size, from level 2 upwards. The win card says "You remembered where they were! Next is a bigger board."
  - Hard board (slips ≥ half the sets + 1): the same size with new animals.
  - Otherwise: one step up.

  The suggestion is saved per mode, so the menu's ▶ Play and its highlighted level move on too. This fixes the "re-selects the level just played" bug. Every level stays tappable.
- **Thinner voice:**
  - The goal is said once: when a mode is chosen, or on the first round after the menu. It is never said again on Next or 🔁.
  - Each name is said on its first reveal in a round. Later reveals play only the call.
  - The win recap lists names only for boards of 4 or fewer. Larger boards get only the closing line.
  - Measured rounds now speak 6–15 lines, including a deliberate miss: Twins with 2 pairs 6, Twins with 4 pairs 10, Babies with 3 pairs 11, Sounds with 6 pairs 13, Homes with 10 cards 15. Before, every reveal spoke a name.
- **Babies look like babies:** a smaller body under a 1.35× head that tips up to look at the child, a little rounder, and slightly paler (a soft cream emissive). Size alone was ambiguous, because far cards look small too.
- **Pacing:**
  - The mismatch hold is 0.8 s on boards of 12 or more cards (it was 1.25 s).
  - The last match line is no longer cut off by the win: the win now waits up to 9 s for speech to finish. Before, it waited 4 s, and in Homes the "…are pets" line was lost.
- **The 👀 peek** in Homes shows two animals of one group ("These two live together"), not the whole group.

### Where

| Change | Where |
| --- | --- |
| `GROUPS`, `GROUP_OF`, Homes `MODES`/`MATCH_WORDS`, `GROUP_LEVELS`, `levelsFor` returns card counts | `public/js/main.js:49-89` |
| Save: `modeDone.groups`, `progress.next` | `main.js` saved-progress block |
| Babies: `babyMaterials`, `LOOK_UP`, `babyfy`; `poseAnimal` head tilt | `main.js:466-495`, `:514` |
| Name once per round (`callAndName({ once })`, `game.named`) | `main.js:499`; reveal in `Card.popOut` |
| Cards carry `set` and `seen` | `Card` constructor, `flipUp` |
| `nextLevel` uses the suggestion; `sayGoal` once; Homes HUD chips | `main.js:961`, `:1007`, `:1013` |
| Deck by sets (pairs or groups), turn = pair or whole group, slip count | `startLevel` `:1112`, `tapCard` `:1177` |
| Group match line, once-per-round "is a pet" fact, shorter hold, win waits for speech | `onMatch` `:1221`, `onMismatch` `:1244` |
| Adaptive next board | `adaptNext` `:1283`; win note and `#next` `dataset.level` in `winLevel` `:1293` |
| Peek generalised to sets | `$('peek').onclick` `:1641` |
| `Talk.sayOnce` / `newRound` (game-local; the queue keeps calls and words apart) | `public/js/talk.js:29-40` |
| Homes button, `#win-next` note | `public/index.html` |
| Trio picture, group chips, grouped win entries, phone-width modes | `public/style.css` |
| How to play and learning text | `game.json` |

### Evidence

Scripts and screenshots are in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/264c5237-472d-4187-be3f-45d364aa4d2a/scratchpad/polish/memory-match/` (`play.mjs`, `peek.mjs`, `babies.mjs`, `phone.mjs`). Speech was stubbed, and every run had 0 console or page errors.

- **Homes, portrait 834×1194, level 2, one miss:** "Chick!", "Elephant!", "An elephant is a wild animal.", "Pig!", "Cow!", "Chick, pig and cow live on the farm!", … The HUD chips light up, and the win card groups the animals by home (`portrait-groups-L1-*.png`).
- **Homes, landscape 1194×834, level 3 (10 cards, wild ×4):** "Elephant, panda, lion and fox are wild animals!" (`landscape-groups-L2-*.png`).
- **Adaptive next board:**
  - Babies, level 2, careful: Next = level 4, and the note shows.
  - Twins, level 3, with 4 forgetful turns (`FORGET=4`): slips 4, so Next stays at level 3, with the note "the same size, with new animals". After 🏠 the menu highlights that level.
  - Twins, level 1, landscape: Next = level 2.
  - Sounds, 6 pairs: Next is clamped to the 8-pair level.
- **Babies:** `babies-v3.png` (before the head tilt) and `lu-neg.png` (final): the piglet, calf and penguin chick have big heads, look up and are paler.
- **Peek:** Twins opens 2 cards and Homes opens 2 cards. In both, turns stay 0 and every card is back down afterwards.
- **Layouts:** 375×667, 667×375 and 1194×834 menus with four mode buttons show no horizontal overflow (`menu-*.png`, `play-groups-*.png`).
- **Tests:**
  - `EXAMPLES_ORIGIN=http://localhost:4213 node examples/_studio/tests/browser.mjs --ids memory-match --run memory-match-r1` (and `-r1b`): BOOT + PLAY ready, 0 errors.
  - `node --check` passes on `main.js` and `talk.js`.
- `public/bitgames.json` is stale until the coordinator rebuilds.

### Remaining ideas

- In Homes, a hard board could hand out a gentle hint, such as fading the sign of the group the first card belongs to.
- A fourth home, "in the water" (frog and penguin, plus a duck or fish model through the Blender builder), would allow a 12-card Homes board.
- Food pairs (animal ↔ what it eats) were not built, because they need new models.
- Check the device voice on a real iPad.

## Round 2 of the re-audit pass (2026-10-11)

Starting point: independent review 1 scored 7.9 (calm 8.5, focus 8, learning 7.5, fun/depth 7.5, visual 9, voice 7, polish 8). Its blockers were speech lagging up to 10 s behind play (and the last group line cut at the win), Homes stopping at 10 cards, Babies being Twins with a smaller model, no help inside a round, and a lone orphan card in portrait.

### Design

- **Voice keeps pace with play.** A queued step can now go stale and is skipped, never said late. A reveal name goes stale once its card turns back or is matched (the match line names it anyway), and a reveal call once its card turns back. A name is marked as said only when it is actually spoken, so a skipped name is said on the next reveal. Reveal names are droppable. Match lines are not, and the win waits for them (cap 20 s, only for a voice that never reports the end), then trims only droppable steps instead of clearing. Clue cards (the loudspeaker's call, a sleeping baby's word) call `talk.hurry()`: droppable steps waiting are dropped and a droppable line being said (a goal) is cut, so the clue is heard next.
- **Homes gets a fourth home and two harder boards.** A new clownfish (Blender builder) joins the frog and the penguin as 🌊 water animals ("Frog, fish and penguin live in the water!"). The levels are now 6, 9, 10, 12 and 13 cards; the top two use all four homes, so a 6–8 year old holds four categories at once, and adaptNext skips ahead here as in the other modes. The fish makes three soft rising bubbles instead of a call and is left out of Sounds and Babies; it also appears in Twins.
- **Babies becomes a knowledge decision from 12 cards on (🧺 levels 4–6).** The baby is asleep in a basket under a pink blanket, and the card only says its word ("Cub!"); its spot stays plain. The child must know whose baby a cub is. Any parent with that word matches (a cub is a lion's or a panda's), and the baby that wakes up is that parent's: an unseen sleeping baby with the same word swaps places invisibly. A missed sleeping baby says, once a round, whose it can be from the parents on the board: "A calf is an elephant's or a cow's baby." These levels have their own one-line goal: "Sleeping babies! Listen to the baby's name, then find its mum or dad." On the smaller boards every baby now sits in a little wicker basket, which reads as a baby from above, not just by size.
- **Gentle help inside a round.** Once a set has two slips (missed turns although a partner had been seen), opening its first card makes that seen partner rise a little and settle once (1.6 s, no glow). The menu's next board still adapts between rounds.
- **Homes signs can be tapped** ("Water animals: 3", or who lives there once found).
- **Layout.** The gaps in a grid are shared over the last rows (3+3+2+2 or 4+3+3, not 3+3+3+1), and a grid that would still leave a lone card scores lower. The win card keeps a 24 px margin above it.

### Where

| Change | Where |
| --- | --- |
| Stale and droppable steps, `trim`, `hurry`, `has` | `public/js/talk.js:44-82`, `run()` |
| Reveal call/name with stale checks, name marked on speaking | `public/js/main.js:519` (`callAndName`), `Card.popOut` |
| Fish data, `WITH_CALLS`, water home, levels, `CRADLE_LEVEL`, cradle goal | `main.js:14-99` |
| Basket and blanket (runtime geometry), `wake()`, `hint()` | `main.js:617-640`, `:766`, `:840` |
| Plain spot for sleeping babies | `Card` constructor |
| `rowSizes`, lone-card score, win margin | `main.js:908`, `chooseGrid`, `freeRegion` |
| Cradle goal said once | `sayGoal` `:1124` |
| Deck: four homes, wild ×4, call pool, cradle partner | `startLevel` `:1261` |
| `belongs`, per-set slips and partner hint | `tapCard` `:1303`, `belongs` `:1358` |
| Swap so the woken baby is the parent's own | `settleCradle` `:1368` |
| Win waits for the last match line; trim not clear | `onMatch` `:1402`, `winLevel` `:1484` |
| Whose baby fact on a miss | `onMismatch` `:1406` |
| Tappable Homes signs | `main.js:1727`, `renderPairs`, `public/style.css` (`.pairs .group`) |
| 🧺 on cradle levels in the menu | `renderLevels`, `style.css` `.level .cradle` |
| Fish bubbles | `public/js/audio.js:45` |
| Clownfish model (side on, turned 28° to the child, on a splash) | `blender/models.py:647` (`fish`); preview rows of 7 |
| How to play and learning text | `game.json` |

`public/models/animals.glb` was rebuilt with `node examples/_studio/assets.mjs memory-match` (Blender 5.2.2, 8 threads): 24,616 faces, 864 KB. `card.glb` and `setting.glb` were rebuilt too but restored from git, as their builder did not change. The second builder, `mat_texture.py`, stops on `ModuleNotFoundError: No module named 'PIL'` in Blender's Python on this machine; `mat_felt.jpg` is unchanged.

### Evidence

Scripts and screenshots are in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/264c5237-472d-4187-be3f-45d364aa4d2a/scratchpad/polish/memory-match/r2/`. `bot.mjs` plays with a perfect-memory or random bot, a tap every 0.75 s, and pessimistic speech timing (0.45 s + 75 ms a character). Every run had 0 console or page errors.

- **Voice in sync:** the largest queue was 4–5 steps (it was 9–10). Homes 13 cards, careful: 12 lines; the last group line ("Elephant, lion, panda and fox are wild animals!") came at 31.1 s, before the win at 35.4 s. Twins 16 cards: 15 lines, and each "Two …!" follows its match within about 2 s.
- **Homes:** 10 cards careful, 0 slips, Next jumps to 13 cards with "You remembered where they were!" (`portrait-groups-L2-*`, `landscape-groups-L4-*`, the fish on the board and in the 🌊 row of the win card).
- **Babies, sleeping babies:** careful bot on 12 cards in 9 turns; random bot 29 turns with 19 slips, and Next stays at the same size. `swap.mjs`: a sleeping baby dealt as the bunny's, matched with the fox, wakes as a fox kit, and the bunny's own stays asleep. Spoken: "Kit!", "A fox's baby is a kit!" (`swap-match.png`, `cradle-*-miss.png`, `cradle-*-match.png`, `cradle-landscape-menu.png` with 🧺 on levels 4–6).
- **Hint:** `hint.mjs`: after the slips on one pair, opening its first card lifts only its seen partner, by 0.146 (`hint-lift.png`).
- **Layout:** 10-card Homes in portrait lays out 3+3+2+2 (`portrait-groups-L2-careful-2-mid.png`); the 12- and 16-card portrait wins show every card above the win card. 375×667 and 667×375 show no horizontal overflow, and a tapped 🌊 sign says "Water animals: 3".
- **Peek:** Twins, Homes 13, Babies 12 (sleeping) and Sounds each open 2 cards, use no turn, and turn everything back (`peek2.mjs`).
- `EXAMPLES_ORIGIN=http://localhost:4213 node examples/_studio/tests/browser.mjs --ids memory-match --run memory-match-r2`: BOOT + PLAY ready, 0 errors. `node --check` passes on `main.js`, `talk.js` and `audio.js`.
- `public/bitgames.json` is stale until the coordinator rebuilds.

### Remaining ideas

- A harder Sounds tier: a call card and a spoken-name card, with no picture on either.
- Twins is still pure memory. That is right for 3–5, but it is the default mode.
- A child who is coasting gets nothing harder inside a round, only a bigger next board.
- `mat_texture.py` needs Pillow in Blender's Python (a machine set-up issue, not a game one).
- Check the device voice and the pacing of the sleeping-baby words on a real iPad.

## Round 3 of the re-audit pass (2026-10-11)

Starting point: independent review 1 scored 8.2 (calm 9, focus 8.5, learning 7.8, fun/depth 7.8, visual 9, voice 8, polish 7.8). Its blockers were: the Homes categories overlap, so a child who knows that a penguin is wild was corrected; Sounds teaches beeps; Twins, the default, has no step up; muted Sounds and sleeping-baby boards cannot be won; random tapping on clue boards makes a stream of words; and there is nothing to collect.

### Design

- **Homes no longer marks true knowledge wrong.** The wild home is now "wild animals on land". The frog, the penguin and the fish go with the water animals. Where a child's own knowledge is also right (`ALSO`: a penguin or a frog is wild, a fish can be a pet, a bunny can live in the wild), the turn still ends, but the game agrees and then explains: "A penguin is wild too! In this game, it goes with the water animals." The animal nods instead of shaking its head, and the miss never counts as a slip. Ordinary misses say where the animal lives, sometimes more precisely: "A penguin swims in the cold sea.", "A frog lives in a pond."
- **Sounds uses real call words.** A sound card plays the voice and then says the call as children say it ("Moo!", "Woof woof!", "Ribbit!", "Toot toot!"). The call is also written on a paper tag on the card. So the decision is "who says moo?", knowledge that works outside the game, not memory for an arbitrary tone. The panda and the bunny (no call a child knows, and both used to "squeak") are left out of Sounds. That leaves 10 animals for the 8-pair top level.
- **Clue cards can be played with the sound off.** A sleeping baby's blanket carries its word ("kit") and a sound card carries its call ("Oink oink!"), on a canvas tag that pops up with the card. Muted Sounds and muted sleeping-baby boards can now be won.
- **Twins gets a harder tier for ages 6–8: look-alikes** (🎀 on levels 4–6 in the menu). From 12 cards, some animals come twice: one pair wears a pink bow and one pair a blue woolly hat (runtime geometry on the head, so it moves with the head). There is one look-alike animal at 12 cards, two at 16 and three at 20. A dog with a bow does not match a dog with a hat. That is a perception decision inside every flip. The name says the look ("Lion with a hat!"), a look-alike miss says once "Look closely! One lion has a bow, and one has a hat.", and a match says "Two lions with hats!". The board has its own one goal: "Look closely! Some twins wear a bow, and some wear a hat."
- **📖 My animals (a collection that adds up).** Each animal has a page. It fills in as the child meets the animal in any mode, learns its call in Sounds, its baby in Babies and its home in Homes. Dashed `🔊 ?` `🍼 ?` `🌾 ?` spaces show what is still to find, which is a quiet reason to try the other modes. Tapping a page plays the call and reads what is known: "Cow! It says Moo! Its baby is a calf. It lives on a farm." There are no counts, badges or "new!" marks. It is saved in `progress.book`.
- **Careful means remembering, not luck.** `adaptNext` now also needs cards found again from memory (`game.recalled`: a card turned up as the match after it had been seen). A small board matched first time by chance has `recalled = 0`, so it only steps up one, with no "You remembered…" line.
- **One goal before the first flip.** Choosing a mode on the menu says only its word ("Babies!", "Homes! Who lives together?"). The round says its one goal, chosen by `goalKey`: the sleeping-baby and look-alike boards say their own goal instead of the mode's. A goal still being said stops when the child turns the first card (`talk.cutGoal`).
- **Quick tappers are not answered with a stream of words.** Each clue card says its word on its first two reveals of a round. After that the tag carries it, and tapping the open card says it again.
- **Bugs fixed:**
  - Re-tapping an open sleeping baby says only its word, with no call and no hop under the blanket.
  - In landscape, the menu hint is shorter and narrower ("Farm, home, wild or water? Find who lives together."), and choosing a mode re-settles the toys around it.

### Where

| Change | Where |
| --- | --- |
| Call words; panda and bunny out of Sounds (`WITH_CALLS`) | `public/js/main.js:31-52` |
| Exclusive homes, `LIVES`, `ALSO` | `main.js:54-82` |
| Mode words, `LEVEL_GOALS`, `LOOK_LEVEL`, `LOOKS`, look match line | `main.js:88-118` |
| `progress.book` | saved-progress block, `main.js:~162` |
| Bow and hat (`headTop`, `dressUp`), paper tag (`makeTag`) | `main.js:549-620` |
| Card: `look`, tag, `clues`; `sayClue`, `showTag`, `playCall(again)` | `Card` constructor, `popOut`, `main.js:892-930` |
| `goalKey`, single round goal; mode word on the menu; toys re-settled | `main.js:1279`, `sayGoal`, `chooseMode` |
| Look-alike deck; `game.recalled` | `startLevel` `main.js:~1440` |
| Re-tap of an open clue card; `cutGoal`; kind miss; `overlap` | `tapCard` `main.js:1480-1540` |
| `learn` (book) | `main.js:1595`, called from `onMatch` |
| Kind miss nod and line, look-alike miss line, `LIVES` | `onMismatch` |
| Careful also needs recall | `adaptNext` `main.js:1668` |
| Look icons on the win card, HUD and menu (🎀) | `winLevel`, `renderPairs`, `renderLevels` |
| Animal book | `openBook`, `pageWords`, `main.js:1950-2010`; `#book` and `#book-page` in `public/index.html`; `.book*` and `.page` in `public/style.css` |
| `say({ goal })`, `cutGoal()` | `public/js/talk.js:31-41` |
| How to play and learning text | `game.json` |

There are no Blender changes. The bow, the hat and the tags are small runtime geometry.

### Evidence

Scripts and screenshots are in `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/264c5237-472d-4187-be3f-45d364aa4d2a/scratchpad/polish/memory-match/r3/`. Speech was stubbed with pessimistic timing. The bots are `bot.mjs` (careful = perfect memory, random), `cases.mjs` and `book.mjs`. Every run had 0 console or page errors.

| Board | Turns | Slips | Recalled | Next | Lines |
| --- | --- | --- | --- | --- | --- |
| Twins 12 look-alikes, careful | 9 | 0 | 6 | +2 sizes | 10 |
| Twins 16 look-alikes, random | 41 | 26 | 7 | same size | 21 |
| Twins 20, landscape, careful | 15 | 0 | 8 | top level | 17 |
| Twins 6, careful | 5 | 0 | 3 | +2 sizes | 8 |
| Sounds 12, careful | 9 | 0 | 6 | +1 | 13 |
| Sounds 16, random | 46 | 26 | 7 | same size | 25 |
| Babies 12, sleeping, careful | 12 | 0 | 7 | +1 (top) | 16 |
| Babies 12, sleeping, random | 45 | 35 | 6 | same size | 30 (it was 94) |
| Homes 13, landscape, careful | 10 | 0 | 11 | top level | 12 |
| Homes 10, landscape, random | 38 | 11 | 19 | same size | 22 |

- **Kind miss** (`cases.mjs`, Homes 13, lion then penguin): "Lion!", "Penguin!", "A penguin is wild too! In this game, it goes with the water animals."; slips 0 (`kind-miss.png`).
- **Muted:** sleeping babies (`muted-cradle.png`, tags "cub" and "calf") and Sounds in landscape (`muted-sound.png`, "Oink oink!" and "Ribbit!"). Nothing was spoken.
- **Rate limit and re-tap:** one sleeping baby opened 4 times said "Cub!" twice. Re-tapping it while open said "Cub!" again, and its critter did not hop.
- **Look-alikes:** in `portrait-twins-L4-random-3-win.png` and `landscape-twins-L5-careful-3-win.png` the bows and hats read clearly at 16 and 20 cards. The win card shows 🦁🧢 and 🦁🎀 as separate twins.
- **Book:** `book-{834x1194,1194x834,375x667,667x375}.png`, with no overflow; the grid scrolls on a phone in landscape. Tapping a page says, for example, "Penguin! It swims in the cold sea.", and Escape closes the book.
- **Menu:** `landscape-groups-L4-careful-0-menu.png`: the hint clears the ring toy.
- `EXAMPLES_ORIGIN=http://localhost:4213 node examples/_studio/tests/browser.mjs --ids memory-match --run memory-match-r3`: BOOT + PLAY ready, 0 errors. `node --check` passes on `main.js` and `talk.js`.
- `public/bitgames.json` is stale until the coordinator rebuilds.

### Remaining ideas

- Use recorded CC0 animal calls, with the source and licence recorded, in place of the synthesized voices. The spoken call word carries the learning for now.
- On harder Sounds levels, add a "name card" (a word without a picture) to pair with a call card.
- Babies boards 1–3 are still visual size matching (a baby in a basket).
- The book has no page for babies or looks. It could show the baby's picture once found.
- Check the device voice saying "Toot toot!" and "Ribbit!" on a real iPad.
