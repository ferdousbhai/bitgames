# watermelon-picnic: polish record, 2026-10-07

Status: source/API review complete; fresh rendered browser/device review and release remain pending. This game has not reached a final browser-scoped NOTHING LEFT TO IMPROVE verdict.

## Pass 1: source and educational semantics

Reviewed equal circular sectors, green rind and seed cues, numerator selection and tap-again undo. Colour changes preserve geometric size; simplified fractions follow exact gcd.

Confirmed shared defect: editing after a rejected answer left old retry feedback visible. Corrected in the owned reproducible source `examples/_studio/runtime/spatial.js`; fraction, clock, mirror, snowflake and rotation edits now clear retry text. Tangram selection and turns also clear stale retry text.

## Pass 2: independent API verification

A temporary Node harness imported the actual edited spatial source with Three.js and exercised generated challenges through mocked rendering APIs. All three difficulty levels and all five adventure steps passed incorrect-answer rejection, recovery and completion: fifteen steps for this game, 210 across fourteen spatial games. It also exercised all 48 hour-hand trace cases (twelve hours × 0/15/30/45 minutes), preserving minutes and agreeing with the displayed hour. These are actual runtime callback checks, not trusted browser gestures or visual assertions.

Evidence: `/tmp/spatial-api-review.mjs` and `/tmp/spatial-api-review-report.json`. Command: `node /tmp/spatial-api-review.mjs`. All cases passed on 2026-10-07. Existing runtime geometry is suitable for the educational shapes; no imported asset, Blender rebuild or new model was needed.

## Pending gates

The intended browser matrix is `/tmp/spatial-matrix.mjs`: fourteen games × three levels × five steps, puzzle/retry/success controls at 320×568, 667×283, 834×1194 and 1194×834, screenshots and checkpointed JSON. Its launch was attempted but Chromium terminated before creating a page: `setsockopt: Operation not permitted`, then SIGTRAP, under the new restricted network sandbox. Localhost 4213 was also inaccessible. This is an environment blocker; no browser assertions passed in this attempt. The coordinator must rebuild generated outputs and run that matrix plus real trusted clock/tangram gestures when the environment permits. Do not infer rendered correctness or release readiness from the API test.

Fresh screenshot review, WebKit, shared regressions, live release/store playback, real child/educator assessment and physical iPad measurements remain outstanding. The last three are not established by automation.

## Standalone Blender cover review: initial CLI rebuild

Individually opened and visually inspected `examples/watermelon-picnic/public/cover.jpg` through `view_image` on 2026-10-07 (720×480; SHA-256 `94265f02a0343b47c1c1c46d3beb48de687240be4994fed3674dd8edcbafe861`). Title and subtitle are legible against the background; seeded watermelon with green rind is fully framed. No title glyph is cropped by the image edge. The island and intended foreground hero fit the image. Pale clay surfaces are consistent with the shared visual style; subtitle text is small at this full resolution, so storefront thumbnail readability still requires browser review.

The coordinator is correcting common text/scenery collisions with camera-facing foreground title/subtitle placement and rerendering covers. This entry records the initial render, not verification of that correction. This is standalone art evidence only: it does not validate runtime models, gameplay, WebKit, devices or store playback.

## Camera-facing cover reinspection

Individually reopened the completed CLI camera-facing render through `view_image`. SHA-256 `16acae67b567079f52fdabaf52a4a16ea872f22e1219e4cefdb9ce949de6e487`. Both camera-facing horizontal text lines are legible and free of scenery collisions; the complete title fits with margins, and no hero or island is clipped. This is art-only evidence; browser/store thumbnail and gameplay gates remain pending. The coordinator is adding a solid sky-coloured foreground header backing to remove residual scenery intersections, so this record is not yet the final header inspection.

## Final uniform-header standalone art pass

After `BUILT watermelon-picnic` appeared in `/tmp/bitgames-queue-blender-header-final.log`, individually opened the actual final `cover.jpg` with `view_image`. SHA-256 `8291933cf3631d7b528b9c226c0221aa57fd6ce683c12daf9fa04879bdec6833`. Title and subtitle are horizontal, readable at the 720×480 source resolution, fully inside the frame, and separated from scenery by the uniform header. Previous subtitle/background collisions are resolved. The intended main hero is recognizable and uncropped; the header may hide decorative background tips, but does not cut the main model. Snowflake Studio specifically shows the correct six-arm branched motif. No further defect found within this standalone cover-art scope. Store thumbnail readability, runtime graphics, gameplay, browsers and physical devices remain separate pending gates.
