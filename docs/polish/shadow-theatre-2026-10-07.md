# Shadow Theatre — 2026-10-07

Read current handoff, studio guide, generated game metadata, catalogue and match activity source. Reuse-first asset inspection confirms the existing rabbit/fox/boat/tree toys are suitable for visual discrimination; no imported assets or new custom meshes are needed. Coordinated catalogue/runtime changes are owned by root and the collecting-games agent.

## Pass 1 — source/art review

The clue used a physically lit grey copy of the full toy, preserving visible 3D light/shade rather than a uniform silhouette. Requested the runtime owner replace clue material with uniformly dark emissive rendering while retaining the actual matching toy's outline. Requested Shadow-specific silhouette/stage hints and wrong-answer recovery. Root changed choices by difficulty to two, three and four while preserving the target. Runtime owner implemented the requested flat dark material. Validation pending synchronized build.

## Associated batch art inspection

- Shape Locksmith already ships its castle model, verified directly in toybox GLB JSON. No redundant GAME_TOYS addition or Shape art rebuild needed; runtime adapts the existing castle with functional shape keys and door.
- Footprint Detective's songbird and duck were the same body and flat bill geometry with colour differences. Adapted the existing Blender models: songbird gets a pointed beak, narrow separate forward toes/rear toe and tail; duck gets broad flat bill and orange webbed feet. Existing clay library adaptation is cheaper, smaller and more lesson-specific than importing photorealistic library birds.
- Native Blender CLI isolated preview `/tmp/bitgames-art/bird-duck.png` confirms species cues. Root approved **only Footprint Detective** art rebuild, which completed with exit 0 using `~/.local/bin/blender --background --threads 8 --python-exit-code 1 --python examples/_studio/blender/build_assets.py -- footprint-detective`. Only that game's cover/world/toybox were regenerated. No external assets imported. Builder source is reusable for future targeted rebuilds; unrelated shipped toyboxes were not rebuilt.

## Pass 2 — fresh synchronized review

Ran `/tmp/bitgames-art/shadow-matrix.mjs` against the synchronized final candidate at port 4213 using system Chromium/SwiftShader, debug-only render scale .6 and reduced motion. All 15 steps across all three difficulties passed a real touchscreen wrong tap, remained unsolved, then recovered with a correct touchscreen tap and completed the adventure. Every step was checked at 320×568, 667×283, 834×1194 and 1194×834; native targets met 44px bounds checks and stayed inside the viewport. Choice counts were exactly two/three/four by difficulty. Zero page or HTTP errors; exit status 0.

Sixty settled screenshots and the result JSON are under `/tmp/bitgames-shadow-review/`. The seeded adventures cover all four clue toys: boat, rabbit, rocket and tree. Reviewed silhouettes at phone portrait, short landscape and iPad: uniform dark outlines match the same model shapes on the cards, including rabbit ears, rocket fins, tree crown/trunk and boat hull/mast. Distinct colour on candidate toys no longer leaks into the clue. Wrong-answer wording identifies the silhouette and recovery removes the blocking state. No asset rebuild required for Shadow.

**NOTHING LEFT TO IMPROVE within this fresh Shadow code/art/touch/layout review scope.** Real children and physical iPad review remain outside this automated scope. Root owns broader shared-runtime regression and publishing.

## Independent related-game observations

Shape final candidate screenshot `/tmp/shape-review/shape-locksmith-wrong-level0-round0.png` shows a clearly contrasting purple square key head and dark square lock on a pale panel; reused castle reads as castle. Fit screenshot was mid-animation, so it does not establish settled gate behavior and was not treated as a defect. Shape owner handles that final animation check.

Foot pass-2 iPad screenshot confirms the adapted songbird's pointed beak/separate toes and duck's broad bill/webbed orange feet. At phone width 320 and four choices, the visible `songbird` label appears clipped at the right edge. Reported this copy/layout observation to root and Foot owner before any edits; no source change made by this worker. Foot owner handles corrective label review and full gameplay validation.

## WebKit compatibility — final candidate

Reused the matrix script in `/tmp` with Playwright WebKit and the host's local Ubuntu ARM libraries via `LD_LIBRARY_PATH=~/.local/share/bitgames-webkit-libs/usr/lib/aarch64-linux-gnu`. Ran Shape Locksmith, Footprint Detective and Shadow Theatre at all three difficulties, five steps per difficulty, all four required viewports, wrong-tap/correct-tap recovery and 44px target bounds checks. Total 45 completed steps and 180 screenshots. The first managed process received SIGTERM after ten completed Shape steps; this was infrastructure termination, without an assertion failure. Remaining steps were checkpointed and resumed using detached `nohup setsid`; completed steps were preserved and skipped. The detached completion marker reports exit 0; no page/network errors.

Shadow's own **15 WebKit steps** passed wrong/correct trusted touchscreen recovery and all four layouts. Independent screenshots confirm silhouettes stay uniformly dark and distinct in WebKit; phone and short landscape controls remain readable. WebKit result evidence is `/tmp/bitgames-shadow-webkit/resume-report.json`, initial completed-prefix log `/tmp/bitgames-art/batch-webkit.log`, and detached log `/tmp/bitgames-art/batch-webkit-detached.log`. The complete resumed report contains 35 steps including all 15 Shadow steps; the first ten Shape steps are established by the retained initial completion log/screenshots.

No source changes during compatibility checks. **NOTHING LEFT TO IMPROVE within this Shadow browser/art/touch compatibility scope** remains justified; physical iPad and child assessment remain outstanding.

Related-game final follow-up: latest Foot Explorer five steps (seed 1: fox, songbird, duck, snail, fox) passed all four viewports and wrong/correct touchscreen recovery in WebKit, no page/network errors, exit 0. The revised duck print reads as a rounded webbed fan rather than a star. The wider choice grid resolves the earlier clipped `songbird` label; separate explicit DOMRange checks prove the full text lies inside both its label pill and native button in all four layouts. Evidence `/tmp/bitgames-foot-final-webkit/{report,label-range}.json`. Shape's later settled fit screenshot confirms the key head mounted on the lock and both gate panels fully open; the earlier mid-flight capture was not a design defect.
