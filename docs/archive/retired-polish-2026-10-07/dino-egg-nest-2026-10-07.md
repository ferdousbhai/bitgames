# dino-egg-nest: polish record, 2026-10-07

Status: source/API review complete; fresh rendered browser/device review and release remain pending. No final browser-scoped NOTHING LEFT TO IMPROVE verdict is claimed.

## Pass 1: source and educational semantics

The ten-frame keeps two rows of five reversible egg positions, speaks the count and hatches selected eggs only on a correct count. Underfilled retry asks for more; overfilled retry asks to remove. Success no longer falsely claims five eggs occupy one row when the child selected a scattered arrangement.

The owned source is `examples/_studio/runtime/playlab.js`. Editing after retry, clearing/undoing a composition and switching free modes now remove stale feedback. Existing bird/gem/egg/dino/drum/leaf models and small procedural waves, floors and ten-frame spots suit these lessons; no external asset or Blender rebuild was needed.

## Pass 2: real runtime API callbacks

A temporary Node harness imported the edited playlab source and Three.js, instantiated generated challenges at all three levels and all five steps, and invoked the actual callbacks against mocked rendering/audio/timer APIs. Fifteen steps passed for this game, 120 across eight games. Evidence: `/tmp/playlab-api-review.mjs` and `/tmp/playlab-api-review-report.json`; command `node /tmp/playlab-api-review.mjs` exited zero on 2026-10-07.

Pitch cases verify hear-all gating, wrong answer, recovery, twelve-note cap, undo, playback lock, timer completion, clear and final correct answer. Rhythm cases verify beat-only note count, busy-state completion, wrong pattern, labelled editing, free composition without solving, clearing and matching playback. Build cases verify four-floor cap, unchanged fifth tap, undo history restoration, free-mode separation and exact blueprint completion. Ten-frame cases verify undercount, overcount, removal recovery, visible selection count and success arithmetic. These are callback checks; mocked graphics/audio do not establish rendered appearance, real perceived pitch or trusted gesture behavior.

## Pending gates

Browser startup is blocked by the changed restricted sandbox: Chromium failed before page creation with `setsockopt: Operation not permitted` and SIGTRAP; localhost preview was inaccessible. The coordinator must rebuild generated outputs, adapt shared browser checks for Ladybird’s Check spots action, run all-difficulty five-step matrices at 320×568, 667×283, 834×1194 and 1194×834, inspect screenshots and exercise trusted touch/audio interactions. WebKit, shared regressions, live publication/store playback, real children/educators and physical iPad checks remain outstanding. No deployment, commit or generated-output edits were made by this worker.

## Standalone Blender cover review: initial CLI rebuild

Individually opened and visually inspected `examples/dino-egg-nest/public/cover.jpg` through `view_image` on 2026-10-07 (720×480; SHA-256 `3f4d03e91b77a57f132bfe6893110e3d6cdcf3a0f7d18d88cf261d043e201834`). Title/subtitle readable. Egg hero, other eggs and small dinosaurs all fully framed; no wrong object found. No title glyph is cropped by the image edge. The island and intended foreground hero fit the image. Pale clay surfaces are consistent with the shared visual style; subtitle text is small at this full resolution, so storefront thumbnail readability still requires browser review.

The coordinator is correcting common text/scenery collisions with camera-facing foreground title/subtitle placement and rerendering covers. This entry records the initial render, not verification of that correction. This is standalone art evidence only: it does not validate runtime models, gameplay, WebKit, devices or store playback.

## Final uniform-header standalone art pass

After `BUILT dino-egg-nest` appeared in `/tmp/bitgames-queue-blender-header-final.log`, individually opened the actual final `cover.jpg` with `view_image`. SHA-256 `5c7e184880eb00cb686638bffd9530c7da679980b54a286e8e7531a24f7cea0c`. Title and subtitle are horizontal, readable at the 720×480 source resolution, fully inside the frame, and separated from scenery by the uniform header. Previous subtitle/background collisions are resolved. The intended main hero is recognizable and uncropped; the header may hide decorative background tips, but does not cut the main model. Snowflake Studio specifically shows the correct six-arm branched motif. No further defect found within this standalone cover-art scope. Store thumbnail readability, runtime graphics, gameplay, browsers and physical devices remain separate pending gates.
