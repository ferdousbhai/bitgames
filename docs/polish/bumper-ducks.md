# Bumper Ducks

## Small post-review fixes (2026-10-16, review 8.5)

- Space never restarts results, including when 🔁 has focus; Enter and deliberate taps retain the 1.5 s guard. Countdown uses small 🐥 (32–64 px) in the top margin above the arena. Replaced the four English `title` tooltips with accessible labels.
- Browser script: `/dev/shm/bitgames-work/codex/bumper-ducks/check.mjs`. Portrait 768×1024 and landscape 1180×820 passed keyboard steering/dashes, 30 Space presses on focused 🔁 through the results guard, guarded Enter/tap and deliberate Enter/tap restart. Each had 0 page errors and 0 speech calls. Reviewed `portrait-countdown.jpg`, `landscape-countdown.jpg` and results screenshots in the same directory.
- `ending.mjs` also passed 24 Space presses across the ending transition followed by 30 more on results, with 0 page errors and 0 speech calls.
- Shared `mash.mjs`: **PASS**, using `mash-low-resolution.mjs` in the same scratch directory (unchanged shared assertions and viewport; 0.25 drawing pixel ratio). Report: `mash-report.json`. The first full-resolution SwiftShader run took several minutes and reached the title, failing the check; lowering drawing cost resolved that timing-sensitive run.
- Environment: prescribed Chromium GL could not create a context (`OES_packed_depth_stencil` unavailable); browser verification used SwiftShader, with 0.5 device scale for bounded rendering. No build or publication.

## Fun pass (2026-10-16)

The owner's direction: the education passes made the games boring. Strip forced learning, text and the voice, and make the toy itself fun and obvious without any instructions.

### Removed
- **Pond helpers** (the shared ten-frame jar and its trips): colour goals, number bonds, place-value rafts, regrouping, frog order, stuck-bubble lines, level adapting and the menu's goal pictures.
- **Bumper play's team goal** (exactly 50 / 70 / 47, tens tally, play tiers).
- **The TTS voice.** `js/speech.js` is no longer imported, and nothing calls `speechSynthesis`.
- **Text on screen.**
  - Menu headings ("Pick your duck", "Where do we splash?") are gone, and GO is now a big ▶.
  - The loading text is now 🫧 per model loaded. The error is 😕 with 🔁.
  - The waiting screen shows ⏳, or 💦⏳ when a round is already on. The "player who started picks" line is gone.
  - Results show 🎉🦆🎉 with 🔁 and 🗺️. The award titles are emoji only (🏆 💥 🌊 ⭐ 🎁 🫧 🤸 💨 😊 🌈 💛 🎉).
  - Banners are 🎉 at the end and 🫧🫧🫧 for the shower. The countdown ends on 💦.
  - The floating words are now pictures: 💥 for a hard bonk, 💛 for mama duck, 🎵 for a frog, 💫 for a splash-out.
- **The numeric clock.** It is now a ring around the place's emoji that slowly empties and turns to 🫧 for the end-of-round bubble shower. It never beeps or turns red.
- **Shield blink.** A running-out shield shrinks smoothly instead of strobing.

### Kept or restored
- The core comes from the pre-education build (`b83dcbd`, the 2026-10-09 calm pass): the 90 s bumper round, bubbles (1), stars (3), 🎁 powers (🍄 giant, ⚡ speedy, 🛡️ shield), splash-outs worth 2, rim boings, robots that nap when children rest, and a medal podium where everyone gets an award.
- The double-squeak bonk, a 3-2-1 countdown where your own duck hops on each beat, and the dragging-finger hint on the first round.
- Multiplayer messages are unchanged from that build. Escape now also works during the ending.
- The upright-screen camera centring from the later passes.

### Added
- **Giant wobbly bubble** (`ITEMS.big`). About every 13–19 s, or every 5 s in the shower, one big jelly-wobbling bubble appears. Bumping it bursts it into a ring of 7 bubbles with a splash, sparkles and a run of notes. Robots leave it for the children.
- **Shake-loose bubbles.** A good bump on mama duck, a frog's lily pad or a paper boat knocks a bubble out of the far side, with a splash and a twinkle (`Sim.shakeLoose`, at most once every 3 s per obstacle).
- **Kinder robots.** They ease off as soon as they draw level with the best child (`(lead + 1) / 4`), and more so in the shower.
- **Quicker idle hint.** The steering finger (or the keys picture) comes back once a round after 10 s without paddling (was 30 s).
- **Fuller confetti.** The podium gets 48 slow-drifting stars (was 24).

### Verified
Chromium headless (`--use-angle=gl`) against `http://localhost:4213/bumper-ducks/?debug`. Scripts and screenshots are under `/tmp/claude-1001/-home-x-github-com-ferdousbhai-bitgames/15b3f60d-f934-46df-bd6d-46889fd68ba3/scratchpad/bumper-ducks/`.
- **`play.mjs`** ran in portrait 768×1024 (touch), landscape 1180×820 (keys) and phone 390×844 (touch).
  - Each run went from the menu through real CDP touch drags or arrow keys with dashes, a giant-bubble burst, the shower, the results and Again.
  - Every run had 0 console errors and 0 `speechSynthesis.speak` calls.
  - The menu, HUD and results contain only emoji, digits and the logo.
- **`multi.mjs`**: a two-page room through a fake BroadcastChannel SDK (`fake-sdk.js`).
  - The guest picked a duck, then the host started. Positions and items matched on both devices.
  - A giant bubble burst on the guest's duck: both devices showed 12 items and the same score.
  - The guest's Again restarted the round. 0 errors and 0 speak calls.
- **`arenas.mjs`**: a bump on mama duck, a lily pad and a paper boat each shook a bubble loose. 0 errors.

### Open
- The shared `js/speech.js` copy is now unused by this game, and `public/bitgames.json` still lists it. The coordinator rebuilds the manifest.
- Old localStorage keys from the education build (`mode`, `level`, `play-tier`, …) are ignored, not cleared.
- Real two-device play through the store's SDK was not run here; only the fake-SDK test was.

### Round 2 (reviewer score 8.0)
- **Hold-to-exit 🏠.** During a round, 🏠 must be held for 1 s while a yellow ring fills round it. A quick tap only wiggles it. On the results it is one tap, and Escape still goes straight home.
- **Kinder robots.** Base skill is down from 0.42 + 0.05·i to 0.32 + 0.04·i, and a friend's duck taken over after they leave is 0.5. Robots start easing off 2 bubbles before they catch the best child (`(lead + 2) / 3`, or `(lead + 3) / 3` in the shower).
  - The 🏆 now always goes to the best-scoring child. Robots get the other awards.
  - In `fair.mjs`, 6 simulated 90 s rounds each: a competent player won 6 of 6 (96–133 against robots' best 62–103), and a sloppy "toddler" player won 6 of 6 (74–107 against 73–80).
- **Results are no longer a ranking.** Your own duck comes first, large on a yellow card with its award popping onto the corner and its bubble count. The other ducks follow as small chips in play order, with no medals.
- **A surprise each round.** The host picks one at random, never the same twice running. It is sent in `setup.surprise`, and the last countdown beat shows its emoji.
  - ⛲ **fountain:** the water gurgles at a spot for 1.2 s, then a tall spout throws nearby ducks outwards and scatters 6 bubbles.
  - 🐥 **ducklings:** they drop from the sky with a plop and are worth 2. Each one caught paddles in a line behind your boat, up to 6, and there is a 🐥 award.
  - 🫧 **giants:** up to 3 giant bubbles at once, about every 4–5 s.
- **Cleanup and layout.**
  - Removed the never-set `game.sitOut`, the unused `by` in the `fly` event, the old medal and `.place` CSS, and the stale 30 s comment.
  - Restored the reduced-motion `animation: none` rule (the first pass dropped it by accident).
  - The `#players` chip is hidden when playing solo.
  - On short landscape phones (740×360) the score pills and clock are smaller, and the results sit side by side.
- **Verified.**
  - `play.mjs` ran in four viewports, including 740×360 touch: a quick tap on 🏠 stayed in play, a 1.3 s hold went to the menu, and ▶ started a new round. 0 errors and 0 speak calls.
  - `surprise.mjs` checked the ducklings line (4 caught, 4 following) and the fountain.
  - `multi.mjs` showed both devices agree on the surprise, items, score and duckling line. 0 errors.

### Round 3 (reviewer score 8.3)
- **Robots follow the child's real catching.** Each robot's share is about 85% of the best child's score. In the bubble shower it is never more than one less than the child's score.
  - At its share a robot only plays: it bumps and drifts, and floats through bubbles without taking them (`d.leave`, skipped in `Sim.pickups`). Its splash-outs score nothing.
  - The `.lead` grow applies only to a child's pill.
  - In `fair.mjs`, 12 simulated rounds, the child won all 12. Competent play scored 72–162 against the best robot's 68–86. Sloppy "toddler" play scored 78–109 against 70–91.
- **Juicier pickups.** Your own catches (🫧 ⭐ 🐥, and 💦 for a splash-out) fly from your duck up into your score pill, which then bumps. In the bubble shower the music lifts (0.18 s a step) and a soft shaker joins in.
- **No rim pinning.** Paddling into the rim for 1.5 s hops the duck out and back in (the 💫 splash-out). A real arrow key held for 12 s gave 2 fly-outs.
- **A happier ending.** Your duck on the results card does three happy hops, and a short bright fanfare plays with a squeak.
- **Surprises take turns.** They rotate fountain → ducklings → giants, and the turn is remembered between visits (`bumper-ducks-surprise` in localStorage).
- **Minor fixes.**
  - Results chips have no numbers, and their thumbnails are 64 px (44 px on short phones). The results title is now 🎉🐥🎉.
  - Removed the dead `lastShake` and `@keyframes pulse`, and `hintHiding` now resets each round.
  - Fixed the `effects.label` comment.
- **Verified.** 0 errors and 0 speak calls in all of these:
  - `rim.mjs`: rim fly-outs and the pickup flight (`fly-pick.png`).
  - `play.mjs`: four viewports, plus the hold-to-exit check.
  - `multi.mjs`: two devices agree.
  - `fair.mjs`: the 12 simulated rounds above.

### Round 4 (reviewer score 8.3)
- **Bowl robots over.** A child's bonk now sends the other duck flipping across the water (`Sim.bowls` / `Sim.launch`) with 💫 and a whee, and the child gets the splash bonus. It takes a dash into it (relative speed over 2.5), a hard bump (over 6), or any bump while 🍄 giant or ⚡ speedy.
  - A duck with a shield or a giant can't be bowled over. Robots never bowl anyone over.
  - The rim fly-out shares the same `launch`.
  - `bowl.mjs`: 20 s of chasing robots with real keys and dashes gave 8 splash-outs from 10 bonks.
- **No numbers.** Each score pill holds a little bubble jar that fills; the fullest jar in the round is full. The results card has a big jar for your duck and small jars on the chips.
  - The 🏆 goes to the fullest jar (a child on a tie), so the award always matches the jars. Everyone still gets an award.
  - The HUD and results contain no digits at all.
- **Honest robots.** `d.leave` (floating through bubbles) and the share cap are gone. Robots play honestly at a lower skill (0.32 + 0.04·i) and ease off when ahead (`(lead + 1) / 5`, or `(lead + 2) / 4` in the shower).
  - In `fair.mjs`, competent play won 6 of 6 rounds.
  - Sloppy "toddler" play won 5 of 6 and tied 1. Its margins were close (79–78, 97–95, 89–89, 102–99).
- **Surprise turns** start at a random one on a new device.
- **The surprise emoji on the last countdown beat** is smaller and pops away in 0.32 s.
- **Steering hint every round.** A child who hasn't paddled 3 s into any round sees the hint, once a round.
- **Verified.** 0 errors and 0 speak calls in all of these:
  - `play.mjs` in four viewports, including the hold-to-exit check.
  - `multi.mjs`.
  - `bowl.mjs`.
  - `fair.mjs`.

### Round 5 (reviewer score 8.2)
- **Sound buttons.** 🔊 and 🎵 are hidden during a round, so a mashing hand can't turn the sound off. The M key still toggles the music.
- **Gentle magnet.** A child's duck reaches 0.9 further for pickups (`MAGNET` in `Sim.pickups`), and nearby pickups visibly lean toward your own duck.
  - Sim ducks now carry `bot`. Before this, `bowls()` wrongly let robots bowl ducks over.
  - A robot more than 3 ahead leaves the bubbles within 3.5 of a child's duck for the child.
- **Rim.** It now takes 2.2 s of pushing into the rim to hop. The hop lands across the middle, and pushing doesn't count again for 5 s.
- **Bowling.** A duck that was just bowled over can't be bowled again for 2.5 s (`BOWL_COOLDOWN`).
- **Results jars** use the play floor of 20 bubbles, so a near-empty round's jars stay low.
- **Robots never get splash points** (`launch` skips the bonus when `by.bot`).
- **Phone landscape menu.** ▶ is centred under the places.
- **`fair.mjs`, 6 rounds per style** (child vs best robot). The first two runs used RIM_PUSH 1.5 and RIM_REST 4 (raised afterwards to 2.2 and 5):
  - Competent: won 6/6 (146–211 vs 53–68).
  - Toddler: won 6/6.
  - Held arrow: 5/6 at least even (53–76 vs 54–71).
  - Masher: 5/6 at least even (62–103 vs 66–81).
- **Verified.** `bowl.mjs`, `rim.mjs`, `play.mjs` in 4 viewports and `multi.mjs` all ran with 0 errors and 0 speak calls.

### Round 6 (reviewer score 8.4)
- **Robots match the child's pace.** The host measures the best child's catch rate over the last 20 s and turns it into `match` (rate ÷ 1.5 per second, clamped to 0.25–1).
  - Robots paddle at `match` × their pace and stop to float more often when it's low.
  - They also start easing off up to 3 bubbles before drawing level (`slack = (1 − match) × 4`).
  - A careful child meets full-speed robots.
- **The flying catch** has a white glow behind it and ends at full size.
- **The 👆 hint** goes away on the first real steer.
- **Help for mashers.** A new press within 0.3 s of letting go (a finger or an arrow key) sets `takeMash`. For 2 s the duck's pickup reach grows by `MASH_MAGNET` 0.6. A guest's device sends it to the host as `m: 1` in its input message.
- **An idle child** gets the 💤 award, and results jars show at least a sliver of bubbles.
- **`fair.mjs`, 6 rounds per style, child vs best robot:**

  | Style | Child won | Child | Best robot |
  | --- | --- | --- | --- |
  | Competent | 6/6 | 161–196 | 46–67 |
  | Toddler | 6/6 | 103–155 | 58–76 |
  | Held arrow | 6/6 | 52–89 | 35–64 |
  | Masher | 6/6 | 92–138 | 53–85 |

- **Verified.** `hint.mjs` (hint hides on the first drag, a quick re-press sets the mash magnet, the glow screenshot is `fly-glow.png`), `play.mjs` in four viewports and `multi.mjs` all ran with 0 errors and 0 speak calls.

### 🏠 multi-touch fix (round 6 add-on)
The old hold had two bugs:
- A second pointerdown overwrote `holdRaf`, so the first loop was orphaned and kept running.
- Once `holdStart` was 0, an orphaned step computed a full ring and went home.

Now the hold:
- tracks its starting `pointerId` and the set of fingers on 🏠;
- cancels the whole hold when a second finger lands, and starts no new hold until every finger has lifted;
- cancels any pending rAF before starting;
- stops in `holdStep` if the hold was cancelled.

`palm.mjs` (CDP `Input.dispatchTouchEvent`), all with 0 errors:
- 12 three-finger palms lifted within 80–300 ms: still in play.
- A three-finger palm left down for 1.5 s: still in play.
- One finger held for 1.3 s: home.

### Round 7 (reviewer score 8.3)
- **Hold-to-press buttons.** One `holdButton()` helper now runs 🏠, 🎵 and 🔊: 1 s with a filling ring, a quick tap only wiggles, and a palm cancels until every finger lifts.
  - 🏠 is a hold on the results screen too. Escape holds 🏠 (keydown starts it, keyup cancels).
  - M toggles music only between rounds.
  - Mute and music-off are never saved, so every visit starts with sound.
- **Real races for strong players.** `match` now reaches 1.3, and `keen` (from `match` above 0.8) makes robots keener:
  - more collecting, faster thinking, less wander and a harder pace;
  - they go for nearby bubbles and get the same reach as a child.
  - The child's magnet fades for a fast catcher (`sim.magnet`).
  - In `fair.mjs`, competent play now wins 126–140 against 79–106 (was about 2–3×). Toddler, held arrow and masher play still win 6/6, some narrowly (117–107, 71–70, 43–41).
- **Sounds.** Each obstacle sounds at most every 1.5 s (no ribbit spam). Soft bonks in quick succession are quieter.
- **Camera.** Landscape reserves 124 px at the top, so the far rim clears the score pills.
- **Countdown.** It shows 🦆🦆🦆 → 🦆🦆 → 🦆 → the surprise instead of digits.
- **Duck pins** sit a little behind each duck, so from above they don't cover its face.
- **Verified.** 0 errors and 0 speak calls in all of these:
  - `toggles.mjs`: 20 menu taps change nothing, a held 🔊 mutes, a reload restores sound and nothing is stored, M is ignored in a round, a tapped Escape stays and a held one goes home, a tapped results 🏠 stays and a held one goes home.
  - `palm.mjs`, `play.mjs` in 4 viewports, and `multi.mjs`.

### Resting-hand hold rule (2026-10-16)
- `holdButton` now keeps a document-level set of the pointers that are down. A hold starts only when its finger is the only one down; Escape holds only with no finger down.
- Any other `pointerdown` anywhere cancels a running hold and spoils new ones until every pointer lifts.
- The shared `examples/_studio/tests/mash.mjs` passes. `palm.mjs` and `toggles.mjs` still pass: a lone held finger or a held Escape still goes home, and a held 🔊 still mutes.

### Round 8 (reviewer score 8.4) and the ghost-click rule
- **Ghost click.** After a finger hold fires, the next click is swallowed once (it stops 400 ms after the lift, or after at most 5 s). The finger lifting over the new screen can't pick a duck or place, or press ▶.
  - `ghost.mjs`: holding 🏠 1.6 s in a round and on the results goes to the menu, with the duck and place unchanged.
- **Results guard.** For 1.5 s after the results appear, Space/Enter and taps on 🔁/🗺️ are ignored. A tap counts only if its press began after that.
  - A Space press or a 🔁 tap right away stays on the results; Space after 1.7 s starts the next countdown.
- **M shortcut removed.**
- **Closer races for strong players.** `match = rate < 1 ? rate / 1.5 : 0.667 + (rate − 1) × 1.4`, clamped to 0.25–1.6.
  - Keen robots reach further against a really fast child.
  - Robots ease off sooner against a slow child (`slack` ×7).
  - `fair.mjs`, child vs best robot:
    - competent won 5/6, including 110–106, and lost one 129–130;
    - toddler won 6/6 (107–106);
    - held arrow won 6/6;
    - masher won 5/6 (lost 83–88).
- **Results jars** are light glass with a blue sliver of at least 18%. An idle child gets 💤.
- **Puddle props.**
  - The umbrella moved to the front left.
  - The wellies moved from 160° to 200° in `blender/models.py`.
  - Rebuilt with `node examples/_studio/assets.mjs bumper-ducks` (Blender 5.2.2), which rewrote all three GLBs. `ducks.glb` and `items.glb` changed only in bytes.
  - Both props are now clear of 🏠 in portrait (`puddle-portrait.png`).
- **Verified.** `mash.mjs` PASS. `palm.mjs`, `play.mjs` in 4 viewports and `multi.mjs` all ran with 0 errors and 0 speak calls.

## Earlier history (short)
- 2026-10-04: first build, with rubber-duck bumper boats for up to 4 players, three arenas, powers and a podium.
- 2026-10-05: ducks face the camera at the start, robots nap when children rest, friends can tap Again, and an optional counting mission (removed now).
- 2026-10-09, Phase 1 calm pass: no hurry clock or score shouting, softer audio and camera shake, a reduced-motion block. Most of it is kept.
- 2026-10-09 to 10-12, Phase 2 and the re-audits: Pond helpers, Bumper play goals, the voice, adaptive levels. All removed in this fun pass. The full text is in git history (`git log -- docs/polish/bumper-ducks.md`).
