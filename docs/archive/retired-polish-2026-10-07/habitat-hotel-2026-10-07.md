# habitat-hotel polish — 2026-10-07

## Pass 1: source and puzzle review

Source review covers tap selection, wrong-bin rejection, trusted-drag drop/cancel code, Undo delivery and Reset. New selection and Undo clear stale feedback.

Generic fish/turtle names do not establish ocean species; coordinator is correcting them to sea fish/sea turtle. Animals may occur in several habitats; the activity represents the pictured animal’s selected home.

All three difficulties, five steps and 100 seeds per step passed source puzzle invariants: **1,500 puzzles**. Evidence: `/tmp/discovery-source-review.json`. Direct curriculum suite passed 103 tests at this checkpoint (`/tmp/discovery-curriculum-direct.log`); this is source/packaging evidence, not browser evidence.

## Pending gate

The fresh browser matrix is prepared in `/tmp/discovery-matrix.mjs`: all three difficulties × five steps, wrong answer and recovery, and 320×568, 667×283, 834×1194 and 1194×834 layouts before and after success. Source fixes require the coordinator’s build first. The current sandbox denies local HTTP binding (`EPERM`) and cannot reach the previous preview. No fresh rendered visual pass, trusted gesture pass or scoped NOTHING LEFT TO IMPROVE claim is made here. Complete these gates before release; add subsequent pass evidence here.

Child playtests, educator assessment and physical iPad performance remain unassessed.

## Standalone cover visual pass

Viewed the actual shipped `examples/habitat-hotel/public/cover.jpg` individually after the coordinator’s full Blender CLI rebuild. Dark title and small subtitle remain readable against the pale background. The whole village platform, houses and trees fit within the image; no cropped model. This is a village-themed cover rather than a rendered habitat-sorting board; it does not verify the sea-fish/sea-turtle gameplay models.

This is direct raster-cover inspection only. It does not establish browser gameplay, trusted touch, physical iPad performance or release verification. Reported text collisions need coordinator correction and a fresh image pass before closing the cover gate.

## Corrected standalone cover pass

Individually viewed the camera-facing-lettering Blender CLI rerender. Cover SHA-256: `a69093e015f4fddbecb4c7b65a8ccfd2668130ad7f52385acdaacef3135dae8b`. Title and subtitle now face the camera and fit completely inside the upper image area. Both remain visible without an object crossing the letters. Main models and platform are intact; no newly observed cropped or incorrect cover object.

This remains cover-only visual evidence, with browser/touch/release gates pending.

## Final opaque-header cover pass

Individually viewed the final shipped image after its `BUILT habitat-hotel` marker in `/tmp/bitgames-queue-blender-header-final.log`. SHA-256: `db371e10a2891581f98ef84d73b9f8f04597ffc4188aa7e7eb481bab3bed8bbe`. Title and subtitle are readable on a uniform opaque header; no scenery crosses their lettering. The main cover hero is completely visible. The header intentionally masks parts of decorative rear scenery; this is not a cropped main hero. Earlier text/background collisions are resolved in this exact raster.

Fresh final cover scan found no further issue within the title/subtitle and main-hero framing scope. Gameplay browser review and release verification remain pending; this is not child, educator or physical iPad evidence.
