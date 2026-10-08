# butterfly-mirrors: polish record, 2026-10-07

Status: source/API review complete; fresh rendered browser/device review and release remain pending. This game has not reached a final browser-scoped NOTHING LEFT TO IMPROVE verdict.

## Pass 1: source and educational semantics

Reviewed index reversal across the central vertical line, wing/body silhouette geometry, reversible cell editing and flight reward. Reflection preserves row and reverses column.

Confirmed shared defect: editing after a rejected answer left old retry feedback visible. Corrected in the owned reproducible source `examples/_studio/runtime/spatial.js`; fraction, clock, mirror, snowflake and rotation edits now clear retry text. Tangram selection and turns also clear stale retry text.

## Pass 2: independent API verification

A temporary Node harness imported the actual edited spatial source with Three.js and exercised generated challenges through mocked rendering APIs. All three difficulty levels and all five adventure steps passed incorrect-answer rejection, recovery and completion: fifteen steps for this game, 210 across fourteen spatial games. It also exercised all 48 hour-hand trace cases (twelve hours × 0/15/30/45 minutes), preserving minutes and agreeing with the displayed hour. These are actual runtime callback checks, not trusted browser gestures or visual assertions.

Evidence: `/tmp/spatial-api-review.mjs` and `/tmp/spatial-api-review-report.json`. Command: `node /tmp/spatial-api-review.mjs`. All cases passed on 2026-10-07. Existing runtime geometry is suitable for the educational shapes; no imported asset, Blender rebuild or new model was needed.

## Pending gates

The intended browser matrix is `/tmp/spatial-matrix.mjs`: fourteen games × three levels × five steps, puzzle/retry/success controls at 320×568, 667×283, 834×1194 and 1194×834, screenshots and checkpointed JSON. Its launch was attempted but Chromium terminated before creating a page: `setsockopt: Operation not permitted`, then SIGTRAP, under the new restricted network sandbox. Localhost 4213 was also inaccessible. This is an environment blocker; no browser assertions passed in this attempt. The coordinator must rebuild generated outputs and run that matrix plus real trusted clock/tangram gestures when the environment permits. Do not infer rendered correctness or release readiness from the API test.

Fresh screenshot review, WebKit, shared regressions, live release/store playback, real child/educator assessment and physical iPad measurements remain outstanding. The last three are not established by automation.

## Standalone Blender cover review: initial CLI rebuild

Individually opened and visually inspected `examples/butterfly-mirrors/public/cover.jpg` through `view_image` on 2026-10-07 (720×480; SHA-256 `29d4642572c3187d83fa77193965380cbbc5b731939cca08ef31ec45ba8c0779`). Readable title/subtitle and a recognizable symmetric butterfly hero; full wings remain within the image. No title glyph is cropped by the image edge. The island and intended foreground hero fit the image. Pale clay surfaces are consistent with the shared visual style; subtitle text is small at this full resolution, so storefront thumbnail readability still requires browser review.

The coordinator is correcting common text/scenery collisions with camera-facing foreground title/subtitle placement and rerendering covers. This entry records the initial render, not verification of that correction. This is standalone art evidence only: it does not validate runtime models, gameplay, WebKit, devices or store playback.

## Camera-facing cover reinspection

Individually reopened the completed CLI camera-facing render through `view_image`. SHA-256 `2ed668336a0a5655b5cab672856d968a96bf0866eb5479a2348c450c6a16d04d`. Both camera-facing horizontal text lines are legible and free of scenery collisions; the complete title fits with margins, and no hero or island is clipped. This is art-only evidence; browser/store thumbnail and gameplay gates remain pending. The coordinator is adding a solid sky-coloured foreground header backing to remove residual scenery intersections, so this record is not yet the final header inspection.

## Final uniform-header standalone art pass

After `BUILT butterfly-mirrors` appeared in `/tmp/bitgames-queue-blender-header-final.log`, individually opened the actual final `cover.jpg` with `view_image`. SHA-256 `5f84e4e2afcb1a431d7761dab2ac13d4f6dfd655a0735aa7a9d71f644a5c6b43`. Title and subtitle are horizontal, readable at the 720×480 source resolution, fully inside the frame, and separated from scenery by the uniform header. Previous subtitle/background collisions are resolved. The intended main hero is recognizable and uncropped; the header may hide decorative background tips, but does not cut the main model. Snowflake Studio specifically shows the correct six-arm branched motif. No further defect found within this standalone cover-art scope. Store thumbnail readability, runtime graphics, gameplay, browsers and physical devices remain separate pending gates.
