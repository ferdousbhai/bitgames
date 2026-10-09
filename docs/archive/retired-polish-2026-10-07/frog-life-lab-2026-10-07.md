# frog-life-lab polish — 2026-10-07

## Pass 1: source and puzzle review

Source review covers stage ordering, rejection of a later stage, model movement, spoken stage facts and Reset. Accepted next stages clear stale retry guidance.

The game-specific tokens, names and story were inspected against the implemented activity. Rendered art and interaction remain unverified in the current sandbox.

All three difficulties, five steps and 100 seeds per step passed source puzzle invariants: **1,500 puzzles**. Evidence: `/tmp/discovery-source-review.json`. Direct curriculum suite passed 103 tests at this checkpoint (`/tmp/discovery-curriculum-direct.log`); this is source/packaging evidence, not browser evidence.

## Pending gate

The fresh browser matrix is prepared in `/tmp/discovery-matrix.mjs`: all three difficulties × five steps, wrong answer and recovery, and 320×568, 667×283, 834×1194 and 1194×834 layouts before and after success. Source fixes require the coordinator’s build first. The current sandbox denies local HTTP binding (`EPERM`) and cannot reach the previous preview. No fresh rendered visual pass, trusted gesture pass or scoped NOTHING LEFT TO IMPROVE claim is made here. Complete these gates before release; add subsequent pass evidence here.

Child playtests, educator assessment and physical iPad performance remain unassessed.

## Standalone cover visual pass

Viewed the actual shipped `examples/frog-life-lab/public/cover.jpg` individually after the coordinator’s full Blender CLI rebuild. Title/subtitle are readable with dark-on-pale contrast. Whole frog silhouettes fit the pond image; the cover depicts adult frogs, so eggs/tadpole/froglet still require separate gameplay inspection.

This is direct raster-cover inspection only. It does not establish browser gameplay, trusted touch, physical iPad performance or release verification. Reported text collisions need coordinator correction and a fresh image pass before closing the cover gate.

## Corrected standalone cover pass

Individually viewed the camera-facing-lettering Blender CLI rerender. Cover SHA-256: `f0857be8f9df8c39d7f6d4d45f3c1be467328cc79bbab45788ffc59bb09e4fab`. Title and subtitle now face the camera and fit completely inside the upper image area. Both remain visible without an object crossing the letters. Main models and platform are intact; no newly observed cropped or incorrect cover object.

This remains cover-only visual evidence, with browser/touch/release gates pending.

## Final opaque-header cover pass

Individually viewed the final shipped image after its `BUILT frog-life-lab` marker in `/tmp/bitgames-queue-blender-header-final.log`. SHA-256: `83c5a00a9c7dabe30d9656b678342cc9847341daa4a895dd52632eec31fd5cfc`. Title and subtitle are readable on a uniform opaque header; no scenery crosses their lettering. The main cover hero is completely visible. The header intentionally masks parts of decorative rear scenery; this is not a cropped main hero. Earlier text/background collisions are resolved in this exact raster.

Fresh final cover scan found no further issue within the title/subtitle and main-hero framing scope. Gameplay browser review and release verification remain pending; this is not child, educator or physical iPad evidence.
