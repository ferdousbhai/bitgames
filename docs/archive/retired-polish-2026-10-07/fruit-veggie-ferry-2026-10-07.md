# fruit-veggie-ferry polish — 2026-10-07

## Pass 1: source and puzzle review

Source review covers tap selection, wrong-bin rejection, trusted-drag drop/cancel code, Undo delivery and Reset. New selection and Undo clear stale feedback.

Apple/pear/strawberry versus carrot/broccoli/cabbage is an unambiguous culinary grouping. Coordinator corrected the reused Blender carrot through its builder and rebuilt this game with Blender 5.2.2 CLI. A separate CLI inspection render of the shipped GLB confirms the point faces down and greens sit above the broad root (`/tmp/bitgames-carrot-inspection.png`). Actual game browser inspection remains pending.

All three difficulties, five steps and 100 seeds per step passed source puzzle invariants: **1,500 puzzles**. Evidence: `/tmp/discovery-source-review.json`. Direct curriculum suite passed 103 tests at this checkpoint (`/tmp/discovery-curriculum-direct.log`); this is source/packaging evidence, not browser evidence.

## Pending gate

The fresh browser matrix is prepared in `/tmp/discovery-matrix.mjs`: all three difficulties × five steps, wrong answer and recovery, and 320×568, 667×283, 834×1194 and 1194×834 layouts before and after success. Source fixes require the coordinator’s build first. The current sandbox denies local HTTP binding (`EPERM`) and cannot reach the previous preview. No fresh rendered visual pass, trusted gesture pass or scoped NOTHING LEFT TO IMPROVE claim is made here. Complete these gates before release; add subsequent pass evidence here.

Child playtests, educator assessment and physical iPad performance remain unassessed.

## Standalone cover visual pass

Viewed the actual shipped `examples/fruit-veggie-ferry/public/cover.jpg` individually after the coordinator’s full Blender CLI rebuild. Title and Food classification subtitle are readable. The sailboats, dock and whole platform fit inside the frame. The cover contains boats rather than vegetables; the fixed carrot needs its own gameplay/render inspection.

This is direct raster-cover inspection only. It does not establish browser gameplay, trusted touch, physical iPad performance or release verification. Reported text collisions need coordinator correction and a fresh image pass before closing the cover gate.

## Corrected standalone cover pass

Individually viewed the camera-facing-lettering Blender CLI rerender. Cover SHA-256: `de41f8878902a3aa375b498285d7b9fe5548d9d1483f9539ec80c7a35fc9f075`. Title and subtitle now face the camera and fit completely inside the upper image area. Both remain visible without an object crossing the letters. Main models and platform are intact; no newly observed cropped or incorrect cover object.

This remains cover-only visual evidence, with browser/touch/release gates pending.

## Final opaque-header cover pass

Individually viewed the final shipped image after its `BUILT fruit-veggie-ferry` marker in `/tmp/bitgames-queue-blender-header-final.log`. SHA-256: `d6c2ec90a0544ee9d89a27dd826808bd6bb347a2b404607ae138c146b7ebb22d`. Title and subtitle are readable on a uniform opaque header; no scenery crosses their lettering. The main cover hero is completely visible. The header intentionally masks parts of decorative rear scenery; this is not a cropped main hero. Earlier text/background collisions are resolved in this exact raster.

Fresh final cover scan found no further issue within the title/subtitle and main-hero framing scope. Gameplay browser review and release verification remain pending; this is not child, educator or physical iPad evidence.
