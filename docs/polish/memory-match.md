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
