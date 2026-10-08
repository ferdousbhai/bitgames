# tool-twins polish — 2026-10-07

## Pass 1: source and puzzle review

Source review covers mismatch hide, matched-pair retention, Show a pair and Reset. Turning another card clears stale mismatch guidance.

Pairs include a seedling and vehicles, so the old strict tool-only objective was inaccurate. Coordinator is correcting jobs/items wording; completion now says different things for different jobs.

All three difficulties, five steps and 100 seeds per step passed source puzzle invariants: **1,500 puzzles**. Evidence: `/tmp/discovery-source-review.json`. Direct curriculum suite passed 103 tests at this checkpoint (`/tmp/discovery-curriculum-direct.log`); this is source/packaging evidence, not browser evidence.

## Pending gate

The fresh browser matrix is prepared in `/tmp/discovery-matrix.mjs`: all three difficulties × five steps, wrong answer and recovery, and 320×568, 667×283, 834×1194 and 1194×834 layouts before and after success. Source fixes require the coordinator’s build first. The current sandbox denies local HTTP binding (`EPERM`) and cannot reach the previous preview. No fresh rendered visual pass, trusted gesture pass or scoped NOTHING LEFT TO IMPROVE claim is made here. Complete these gates before release; add subsequent pass evidence here.

Child playtests, educator assessment and physical iPad performance remain unassessed.

## Standalone cover visual pass

Viewed the actual shipped `examples/tool-twins/public/cover.jpg` individually after the coordinator’s full Blender CLI rebuild. Title and corrected Jobs and what helpers use subtitle are readable. Workshop robots and bowl-like props fit the frame. This is a workshop motif rather than the human-helper/card-pair art; no crop or definitely incorrect pictured object found.

This is direct raster-cover inspection only. It does not establish browser gameplay, trusted touch, physical iPad performance or release verification. Reported text collisions need coordinator correction and a fresh image pass before closing the cover gate.

## Corrected standalone cover pass

Individually viewed the camera-facing-lettering Blender CLI rerender. Cover SHA-256: `f179f6f96d121742a11aa54273efb2a8a1aff9c7024736c18bb40f092e608197`. Title and subtitle now face the camera and fit completely inside the upper image area. Both remain visible without an object crossing the letters. Main models and platform are intact; no newly observed cropped or incorrect cover object.

This remains cover-only visual evidence, with browser/touch/release gates pending.

## Final opaque-header cover pass

Individually viewed the final shipped image after its `BUILT tool-twins` marker in `/tmp/bitgames-queue-blender-header-final.log`. SHA-256: `606058901f8518037cab439cb4de2280d252de97f5ea567bd8f9d44ef5c1fd22`. Title and subtitle are readable on a uniform opaque header; no scenery crosses their lettering. The main cover hero is completely visible. The header intentionally masks parts of decorative rear scenery; this is not a cropped main hero. Earlier text/background collisions are resolved in this exact raster.

Fresh final cover scan found no further issue within the title/subtitle and main-hero framing scope. Gameplay browser review and release verification remain pending; this is not child, educator or physical iPad evidence.
