# Footprint Detective polish

Date: 2026-10-07. The reviewer owns this record only. The collecting-game agent owns `runtime/discovery.js`; the coordinator owns curriculum, catalogue, Blender builder, generated outputs and releases. Read the current handoff and studio guide before review. Existing fox/snail assets are reused; any bird adaptation goes through Blender CLI.

## Pass 1: curriculum, marks and baseline interactions

Reviewed the catalogue, shipment, deterministic challenges, matching interaction, runtime track silhouettes and animal builder. All three difficulties previously showed the same four choices. The prompt included duck, bird and snail emojis which directly revealed the animal.

The baseline 60-round matrix covered all three difficulties, all five steps, wrong answer and recovery, at 320×568, 667×283, 834×1194 and 1194×834. Puzzle, wrong-feedback and success controls passed target-size, centre-touch and bounds checks with zero page errors or layout failures. These are interaction checks, not proof that the educational artwork is correct.

Confirmed child-noticeable findings:

- Fox prints had three toe pads; fox tracks should show four. The [NPS carnivore tracking guide](https://www.nps.gov/mora/planyourvisit/upload/Carnivore-Tracks-12-20-21_508.pdf) and [Mississippi State University Extension](https://extension.msstate.edu/blogs/extension-for-real-life/how-identify-eastern-gray-squirrel-and-red-fox-tracks) support the correction. Requested four separated pads with the inner pair forward.
- A generic “bird” choice beside “duck” is imprecise because ducks are birds. Requested “songbird” for the blue perching bird, with three toes forward and one back. The [USFWS wetland field journal](https://www.fws.gov/sites/default/files/documents/2024-08/sacramento_nwr_wetland_walk_field_journal_all-ages_508.pdf) illustrates this toe arrangement versus webbed duck prints.
- Duck and bird assets had identical geometry, differing only in colour. The phone view confirms two similar round chicks. Requested a bounded Blender CLI adaptation of the existing songbird with a pointed beak/perching feet so colour is not the sole difference from duck.
- The snail trail is a barely visible one-pixel line on phone. Requested a genuine thick ribbon/tube, rather than relying on unsupported WebGL line widths.
- Requested answer-emoji removal, track-specific catalogue instructions, explanatory facts, and two/three/four choices for distinct difficulty settings.

Baseline screenshots for all four clues and viewports, the matrix report and trusted-drag results are under `/tmp/footprint-detective/`. The initial fox-only screenshots and clue screenshots show the old art/copy and do not establish final readiness.

## Pass 2: corrections and fresh visual scan

Coordinator rebuilt initial curriculum/runtime corrections: answer emojis removed; two/three/four choices; observation facts naming the songbird; fox four pads; songbird rear toe; visible and accessible songbird labels. Official solver now uses the matching challenge index so accurate labels do not depend on internal asset names.

Fresh phone review confirms all four fox toe pads and the songbird rear toe now show. The first revised duck fan still read as a star: old toe bars protruded behind its webbing and the heel formed another point. Reported the visual defect and requested a fan-only silhouette with a short flat heel. The collecting agent implemented it.

The thicker pale-green snail tube is clearly visible on phone. Blender CLI adapted the existing songbird/duck toys; they now differ in beak and foot shapes, with stronger distinctions at iPad size.

## Pass 3: candidate matrix and word-fit proof

The candidate completed another **60 rounds with zero page errors and zero control-layout failures** across all difficulties, steps and required sizes. All four clues were captured independently for visual review. This matrix preceded the final duck fan-only shape and narrow-label fix; its mechanics results do not excuse those visual problems.

The initial songbird label lost its final letter on four-choice phone layouts. Padding was narrowed to two pixels, but an exact text Range still proved overflow: text width 47.0625px; label/button width 48px; text right edge 96.25px versus label/button right edge 95.1875px. `scrollWidth` was 49px versus `clientWidth` 48px. Requested a slightly wider Footprint card or another bounded label fix, retaining accurate visible and accessible “songbird”. Evidence: `/tmp/footprint-detective/label-proof.json` and `final-label-phone.png`.

The activity hint was also updated to explain tapping or carrying the animal to the tracks, rather than overriding catalogue instructions with another question.

## Pass 4: final fresh scan

The final build has rounded three-tip duck webbing with a short flat heel and no old toe bars. All four track clues were independently inspected on phone portrait, short landscape and both iPad orientations. The duck prints now read as webbed footprints, fox toes are individually visible, the songbird shows its rear toe, and the winding slime trail is clear. The CLI-adapted songbird has a pointed beak and perching toes; the duck has a broader bill and webbed feet. At phone size, the models remain small but the distinct silhouettes, readable labels and spoken observations supply the clue together.

Footprint cards were widened to 1.7 world units while keeping 1.85 spacing. Exact four-choice phone proof passed: the full “songbird” text is 47.0625px, its label is 51.0625px, and its button is 54.390625px. Text bounds fit both label and button; client and scroll widths both equal 51px, with no adjacent overlap. Font remains 11px.

The latest Chromium build completed **15 rounds (all three difficulties × five steps)**. Every round was checked at all four sizes in puzzle, wrong-answer and success states: **180 layout-state checks**, with zero page errors, network errors or target-size/bounds/touch failures. Correct answers were entered through trusted touch taps, with the completing viewport varied. Evidence: `/tmp/footprint-detective/latest-chromium-report.json` and `latest-chromium-clue-<animal>-<size>.png`.

Final trusted touch drags covered all four clue types across the four sizes: phone fox, short-landscape songbird, portrait iPad duck and landscape iPad snail. Every flow rejected a wrong drop, restored a cancelled drag without completing, and accepted the correct animal: **12 gestures, zero page errors**. Evidence: `latest-gestures-report.json`. Independent latest-candidate WebKit checks by the art reviewer passed five Explorer steps with trusted wrong-answer/correct recovery, all four clue types/sizes and full label text fitting. Evidence: `/tmp/bitgames-foot-final-webkit/report.json` (five steps, twenty screenshots) and `label-range.json` (explicit text Range checks at four sizes). Earlier three-level WebKit evidence includes pre-final fan/grid source and is not used as final visual proof.

Fresh final scan: **NOTHING LEFT TO IMPROVE within the reviewed scope**. This is the fourth documented pass, not a child or physical-device quality score.

## Release status

Ready for the coordinator’s release gate. Final visual, interaction, gesture and label-fit checks passed; the coordinator reports the shared regression gate passed. Deployment and live/store smoke remain coordinator-owned. Browser emulation cannot establish real child comprehension, educator approval or physical iPad performance.


## Completed release

Published and listed on 2026-10-07 at <https://adeb9e6b-bitgames-footprint-detective.ferdousbd.workers.dev/>. Source `e2b9809` and recorded deployment `50df4e5` are pushed on `main`. Remote seeding listed all 26 examples; the live version and [store Play link](https://bitgames.store/game/footprint-detective) passed. Exact shipped-file hashes and phone/iPad touch completions are recorded in `/tmp/bitgames-live-shape-three/report.json`; store playback checks are `/tmp/bitgames-playtest/store-live-shape-release/report.json`.
