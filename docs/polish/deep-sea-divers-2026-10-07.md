# deep-sea-divers polish — 2026-10-07

## Pass 1: source and puzzle review

Source review covers common-reference geometry and a unique extreme value; wrong choice leaves the round available.

Shared surface line gives a consistent reference for nearest/farthest fish; actual scene legibility remains part of the visual gate.

All three difficulties, five steps and 100 seeds per step passed source puzzle invariants: **1,500 puzzles**. Evidence: `/tmp/discovery-source-review.json`. Direct curriculum suite passed 103 tests at this checkpoint (`/tmp/discovery-curriculum-direct.log`); this is source/packaging evidence, not browser evidence.

## Pending gate

The fresh browser matrix is prepared in `/tmp/discovery-matrix.mjs`: all three difficulties × five steps, wrong answer and recovery, and 320×568, 667×283, 834×1194 and 1194×834 layouts before and after success. Source fixes require the coordinator’s build first. The current sandbox denies local HTTP binding (`EPERM`) and cannot reach the previous preview. No fresh rendered visual pass, trusted gesture pass or scoped NOTHING LEFT TO IMPROVE claim is made here. Complete these gates before release; add subsequent pass evidence here.

Child playtests, educator assessment and physical iPad performance remain unassessed.

## Standalone cover visual pass

Viewed the actual shipped `examples/deep-sea-divers/public/cover.jpg` individually after the coordinator’s full Blender CLI rebuild. Title and Spatial vocabulary and depth subtitle are readable. Fish, turtles, shells and whole sea board fit inside the frame. No cropped main model; the runtime surface reference and depth comparisons remain unreviewed visually.

This is direct raster-cover inspection only. It does not establish browser gameplay, trusted touch, physical iPad performance or release verification. Reported text collisions need coordinator correction and a fresh image pass before closing the cover gate.

## Corrected standalone cover pass

Individually viewed the camera-facing-lettering Blender CLI rerender. Cover SHA-256: `d4e095d91cbfd070f66dc0dcbfceb37081e152caa8aa6483c94181a3035b04af`. Title and subtitle now face the camera and fit completely inside the upper image area. Both remain visible without an object crossing the letters. Main models and platform are intact; no newly observed cropped or incorrect cover object.

This remains cover-only visual evidence, with browser/touch/release gates pending.

## Final opaque-header cover pass

Individually viewed the final shipped image after its `BUILT deep-sea-divers` marker in `/tmp/bitgames-queue-blender-header-final.log`. SHA-256: `bcd3beb2f36b5ade5293e8bea8a1d12e1af7b9ddffac61590c8f7c49c78cabbb`. Title and subtitle are readable on a uniform opaque header; no scenery crosses their lettering. The main cover hero is completely visible. The header intentionally masks parts of decorative rear scenery; this is not a cropped main hero. Earlier text/background collisions are resolved in this exact raster.

Fresh final cover scan found no further issue within the title/subtitle and main-hero framing scope. Gameplay browser review and release verification remain pending; this is not child, educator or physical iPad evidence.
