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
