# butterfly-patterns polish — 2026-10-07

## Pass 1: source and puzzle review

Source review covers the visible gap, wrong answer, unique correct choice, adaptive numeric labels and completion. Reef fish/shell/turtle mappings reuse existing models.

Existing tokens are butterfly/flower/leaf object patterns, rather than colour patterns. Coordinator is correcting the learning objective.

All three difficulties, five steps and 100 seeds per step passed source puzzle invariants: **1,500 puzzles**. Evidence: `/tmp/discovery-source-review.json`. Direct curriculum suite passed 103 tests at this checkpoint (`/tmp/discovery-curriculum-direct.log`); this is source/packaging evidence, not browser evidence.

## Pending gate

The fresh browser matrix is prepared in `/tmp/discovery-matrix.mjs`: all three difficulties × five steps, wrong answer and recovery, and 320×568, 667×283, 834×1194 and 1194×834 layouts before and after success. Source fixes require the coordinator’s build first. The current sandbox denies local HTTP binding (`EPERM`) and cannot reach the previous preview. No fresh rendered visual pass, trusted gesture pass or scoped NOTHING LEFT TO IMPROVE claim is made here. Complete these gates before release; add subsequent pass evidence here.

Child playtests, educator assessment and physical iPad performance remain unassessed.

## Standalone cover visual pass

Viewed the actual shipped `examples/butterfly-patterns/public/cover.jpg` individually after the coordinator’s full Blender CLI rebuild. Title and corrected Repeating picture patterns subtitle are readable. Both large butterflies have distinct wings/body and fit entirely within the frame; no wrong-object or cropped-model issue observed in this cover.

This is direct raster-cover inspection only. It does not establish browser gameplay, trusted touch, physical iPad performance or release verification. Reported text collisions need coordinator correction and a fresh image pass before closing the cover gate.

## Corrected standalone cover pass

Individually viewed the camera-facing-lettering Blender CLI rerender. Cover SHA-256: `cf8b9dd49b572cb1f871f11d9db1d2c89acefb8a3af25640b6eb9f106c6cb7bf`. Title and subtitle now face the camera and fit completely inside the upper image area. Both remain visible without an object crossing the letters. Main models and platform are intact; no newly observed cropped or incorrect cover object.

This remains cover-only visual evidence, with browser/touch/release gates pending.

## Final opaque-header cover pass

Individually viewed the final shipped image after its `BUILT butterfly-patterns` marker in `/tmp/bitgames-queue-blender-header-final.log`. SHA-256: `856abd8636f4de8dc5053a1d9f1593fbb3417a37321c0489f9270ff145d74b59`. Title and subtitle are readable on a uniform opaque header; no scenery crosses their lettering. The main cover hero is completely visible. The header intentionally masks parts of decorative rear scenery; this is not a cropped main hero. Earlier text/background collisions are resolved in this exact raster.

Fresh final cover scan found no further issue within the title/subtitle and main-hero framing scope. Gameplay browser review and release verification remain pending; this is not child, educator or physical iPad evidence.
