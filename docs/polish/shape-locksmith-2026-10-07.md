# Shape Locksmith polish, 2026-10-07

Requested parallel continuation. Read `docs/POLISH_HANDOFF.md`, studio guide, catalogue, generated manifest, challenge generator, and matching runtime. Root owns catalogue/challenges, assets, synchronized builds, commits, deployment and store checks. This worker owns shared matching behavior in `runtime/discovery.js`, coordinating Footprint Detective and Shadow Theatre requests; no generated files were hand-edited. Asset workflow remains Blender CLI only; Shape reuses the existing shipped castle and gem, with adaptive key/door geometry in the runtime.

## Pass 1: shipped baseline

Chromium touch review completed all three difficulties and five rounds each (15 rounds), checking 320 × 568, 667 × 283, 834 × 1194 and 1194 × 834 every round; incorrect answer remained unsolved and the correct answer recovered. Controls met 44 px minimum, viewport bounds and touch access checks. Zero page/network errors. Evidence: `/tmp/shape-review/`.

Confirmed child-facing defects: pale cream shapes blend into the pale cream card bases; the game asks for keys, but offers plain shapes; reward says the castle door opens, but only a plain shape travels onto a flat pad and no door moves. All difficulties originally offered the same four choices.

Changes: recognizable identical-stem keys with contrasting purple shape heads; existing castle reused with a working hinged gate and a raised shape lock; a correctly matched key turns into the lock and the gate opens before success. Raised lock drops use screen-space hit testing so a child's finger on the visible lock succeeds even though drag points intersect the board plane. Named lock hints and shape-specific retry guidance replace generic delivery copy. Root changed difficulties to two/three/four choices while retaining the correct answer and aligned instructions.

Shared matching coordination: Footprint Detective now has four fox toe pads, a rear songbird toe, accurate songbird labels, a three-tip filled duck web, and a thicker pale slime trail. Shadow Theatre uses a uniform dark silhouette appearance and explicit silhouette hints/retries. Their game owners validate those changes and record their own pass histories.

## Pending final review

Waiting for synchronized candidate build to run fresh Shape visual/gesture and all-difficulty review, including an actual finger drop on the raised lock. No release-readiness claim yet. Physical iPad, educator and real-child playtests remain outstanding.

## Pass 2: rebuilt castle/key visual review

Rebuilt candidate shows strong purple key heads against cream cards and a dark shape lock on a pale gold mount. The key fits its matching lock and the two gate panels actually swing open. Root's difficulties now offer two, three and four keys.

An early fixed-700-ms rotation check observed stale landscape-size controls immediately after switching to phone during the heavily parallel software-rendered run. Reran with a condition that waits for actual settled button bounds/touch access, as the official harness does. Also replaced fixed animation screenshot timing with checks for the key carrier's final position and key rotation: early screenshots caught the key and doors mid-animation because wall-clock success timing can precede the software-rendered animation's final frame. Settled screenshots confirm the key is mounted and the door is open, rather than treating an intermediate frame as an art defect.

Root approved the Footprint worker's narrow songbird-label padding and explicit tap/drag hint after final candidate review; applied only those shared matching branches and requested coordinator rebuild. Shape behavior remains frozen pending final gesture and matrix completion.

## Pass 3: fresh final Shape scan

All 15 Shape rounds passed on the rebuilt candidate, with two/three/four choices at the three difficulties, incorrect-answer recovery, actual settled controls at all four required layouts, and geometric proof of the final key position/rotation every round. Zero page or missing-asset errors. `/tmp/shape-review/report.json` records the rounds; settled `fit-*` screenshots show mounted keys and open gates.

Independent Chromium trusted touch verification passed at 320 × 568, 667 × 283, 834 × 1194 and 1194 × 834: dropping a wrong key on the visible raised lock retries without solving; cancelling a correct-key drag remains unsolved; dropping the correct key at the actual lock's screen position succeeds exactly once. The final key is mounted and both door hinges reach their open angle. Visually inspected phone and short-landscape key heads and phone/iPad open gates. Evidence: `/tmp/shape-gestures-chromium/report.json` plus `keys-*` and `open-*` captures. The art worker provides separate three-game WebKit coverage rather than duplicating that matrix here.

Fresh final Shape scan finds **NOTHING LEFT TO IMPROVE within the code/art/browser review scope**. Shape source is frozen and ready for coordinator regression/release gates. Real children, educator review and physical iPad performance remain outstanding.

## Shared Footprint final corrections

The Footprint reviewer later confirmed that the first duck web revision appeared as a five-point star because old toe bars extended behind a pointed fan heel. Corrected only Footprint's branch: a filled fan with a short flat heel, three slightly rounded front tips and no underlying three-bar toe drawing. The songbird label still overflowed by 1.06 px after reduced padding, established by a text Range measurement rather than guessing from a screenshot. Under coordinator authorization, Footprint alone now uses 1.7-unit card widths at unchanged 1.85-unit spacing, retaining the full word and existing font size. Footprint owner validates the final rebuild and records its final matrices in that game's history. These changes do not alter Shape or Shadow behavior.
