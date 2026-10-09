# Orchard Baskets and Moon Pebbles polish, 2026-10-07

Owner requested parallel game polish and Blender CLI for asset work. Shared generated outputs, release commits, and publishing belong to the root agent. Runtime source owned here: collecting behavior in `examples/_studio/runtime/experiences.js`; Firefly changes remain root-owned.

## Pass 1: existing shipment

Read handoff, studio guide, catalogue, challenge generator, game manifests, runtime, and browser harness. Reviewed screenshots from the shipped local bytes. Orchard's receiver is a closed solid basket; collected apples sit below it in a tiny overlapping spiral. A child cannot count the apples in the basket reliably. Moon's reward says “rover” although the destination and launch animation are a rocket. Generic hints say “collection spot” rather than identifying the basket/rocket. Wrong-count feedback always says “Add one” even for an overcount. Launching the Moon rocket leaves collected gems behind.

Fixes: larger separated cargo for Orchard and Moon, named collection instructions, direction-specific count feedback, Moon cargo moves with its rocket. Coordinated with the art agent for a genuinely open orchard basket and a dedicated recycling bin, built using Blender CLI. Coral shares the collecting code: its receiver now uses the recycling bin labelled Recycle; shells belong in the sea rather than asserting every shell is an animal's home. Removed growth of the receiver on success because the new receiver is a bin.

Catalogue proposals sent to root: named Orchard/Moon instructions and “The moon rocket is ready!” reward. Root owns that shared file.

An early browser check after only 160 ms of layout settling found a blocked fifth apple during rotation. The repeat used 700 ms and passed every layout; this was transient settling, not a persistent blocked control. Both games completed all three difficulties and five rounds per difficulty (30 rounds total), with all four required layouts checked every round, undercount and overcount recovery, minimum 44 px controls, viewport bounds, touch access, and zero page/network errors. Evidence screenshots and browser reports live under `/tmp/collect-review/`. Final readiness remains pending rebuilt-shipment verification.

## Limits

These are Chromium software-rendered touch-emulation checks on this ARM machine. They do not establish real iPad performance or a real-child 10/10 rating. Neither game has a live store version yet; publishing and live-store verification are pending root release steps. WebKit is not claimed without a successful run.

## Pass 2: rebuilt receiver and counting review

Root rebuilt the shared runtime, catalogue, and new Blender CLI assets. Orchard's basket now has an open interior and rear handle; apples appear individually inside it instead of in an overlapping spiral below a closed lid. Moon gems form separate rows beside the rocket. Reviewed selected-count screenshots on phone, short landscape, and iPad both orientations. The art agent independently inspected seven collected apples on all four layouts and confirmed they are visible and countable.

Found an additional child-facing retry defect: after removing an extra object, the readout updates but the old feedback still says the previous wrong count. Added clearing of retry feedback whenever a valid toy is collected or returned. Root owns the next synchronized rebuild. Coral's new bin opening was clipped on landscape; independent art/cleanup reviewers reported that to root, with a smaller receiver scale proposed.

Full rebuilt Chromium matrix passed 30 rounds with all four layouts checked every round, undercount/overcount recovery, and zero page/network errors. Final WebKit passed both games on easy for five rounds each (10 rounds), all four layouts per round and the same controls/error checks. WebKit used local extracted ARM dependencies and renderScale=0.6; no real iPad claim. Evidence: `/tmp/collect-review/final-30-round-report.json`, `/tmp/collect-review-webkit/report.json`.

## Pass 3: final fresh gesture and maximum-count review

Final rebuilt bytes passed real Chromium touch drags into each receiver exactly once, cancelled drags without count changes, reset, tap-to-undo, and mid-round phone-to-short-landscape rotation. Explicitly verified retry text is cleared after a valid change. Independently inspected seven Orchard apples at phone and short landscape; all remain visible and individually countable.

A deterministic Moon seven-gem screenshot exposed a further visual defect: gem rows extend forward into the HTML tick controls when eleven toy cards fill three rows. The seventh gem is partially hidden on phone by the selected-card ticks. Reported this confirmed defect to root despite the source freeze; proposed moving the separate gem rows beside the rocket, away from card controls. Evidence: `/tmp/collect-review/moon-pebbles-high-round0-320.png`. Moon remains pending this fix and a fresh visual/gesture pass.

## Pass 4: final Moon layout correction and fresh review

Root authorized the confirmed-defect exception to the source freeze and one synchronized build. Moon cargo now forms a compact three-column stack beside the rocket: x = (column − 1) × 0.55 − 1.8, y = 0.35 + row × 0.28, z = receiver + 0.5 − row × 0.4. No other collecting source changed in this exception. Ran `pnpm examples:build` with coordinator authorization; all 88 generated adventures repackaged.

A fixed-seed Explorer round with target seven and total eleven passed all four required control layouts and wrong-count recovery. Captured both seven correctly collected gems and all eleven deliberately over-collected gems on every viewport. Visually inspected all four eleven-gem captures: each gem is visible, separated, and clear of the selected-card HTML ticks. The maximum-count screenshots are `/tmp/collect-review/moon-pebbles-all11-{320,667,834,1194}.png`; correct-count captures are `moon-pebbles-high-round0-{320,667,834,1194}.png` in the same folder.

Fresh source and visual review finds **NOTHING LEFT TO IMPROVE** for Orchard Baskets and Moon Pebbles within this code/art/browser review. Real children, educators, and an actual iPad remain untested. Root owns broad final regression, publishing, and live store verification. Final trusted touch gestures passed again for both games after the Moon correction: drag, cancelled drag, reset, undo, mid-round rotation, and retry-feedback clearing. Final WebKit fixed-seed target-seven/total-eleven round also passed every viewport, wrong-count recovery, and zero page/network errors; report and captures are `/tmp/collect-moon-final-webkit/`. No further source edits planned.

## Coordinator final copy check

After the parallel full-catalogue regression, the coordinator corrected the singular retry phrase “There are 1” to “You have 1” by changing only the leading phrase of collecting wrong-count feedback, then rebuilt. This is a copy correction, not another art or gameplay loop.

Fresh WebKit verification passed all four collecting games (Firefly, Orchard, Moon, Coral) on 320 × 568 phone and 667 × 283 short landscape: an undercount of exactly one with a target greater than one says “You have 1.”; the feedback remains inside the viewport; selecting another toy clears stale feedback; deliberate overcount feedback shows the actual count; returning the extra toy clears it and restores the correct readout; Done then succeeds. Eight checks passed, with zero page or missing-asset errors. Evidence: `/tmp/collect-copy-webkit/report.json`. No new persistent issues found. No source edits or builds performed for this check.
