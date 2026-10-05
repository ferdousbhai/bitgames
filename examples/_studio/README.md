# The learning-game studio

The studio generates 88 educational adventures that sit alongside the original twelve examples, making **100 playable projects**. The new games use 26 interaction types and 18 art settings. Each has three difficulty settings, five steps per adventure, spoken prompts where the browser supports them, synthesised sound and encouraging retries. Ages and learning goals are recorded in each `game.json` and in [the catalogue](../CATALOGUE.md).

## Play and rebuild

From the repository root:

```sh
pnpm install
pnpm examples:serve        # http://localhost:4173, searchable catalogue (EXAMPLES_PORT to change)
pnpm examples:build        # package shared source into each standalone game
pnpm examples:check        # build, then run the curriculum, asset and shipment checks
pnpm examples:assets       # rebuild every GLB and cover with Blender CLI; run examples:build after
```

The committed GLBs and 720 × 480 covers were generated with Blender 5.2; playing needs no Blender. Rebuild one game's art with `pnpm --dir examples/bee-pollen-trail assets`. The builders are reproducible from the seeded designs. Commit the generated `.glb` models and `.jpg` covers; each shipment's `bitgames.json` is generated and ignored, like the original examples'.

Edit `catalogue.mjs` for titles, ages, learning objectives, stories, themes and activity data; `runtime/challenges.js` for the deterministic puzzles; `runtime/activities.js` and its specialised modules for the interactions; and `runtime/engine.js` for the Three.js world and navigation. Then run `examples:build`. Each game's `public/` ships on its own, with its scene, the toys it uses, its configuration and local copies of the runtime. Three.js comes from BitGames' approved vendor path, so the playback gateway needs no other CDN or shared origin.

The original games' shared learning helpers live in `originals/`; `package-originals.mjs` copies them into each original's `public/` during `examples:build` without touching the originals' main game code.

New examples have no deployment URL. To publish one, run `node examples/publish.mjs bee-pollen-trail`, then seed the recorded version after review. Local previews never publish or change the live store.

## iPad design

- Layouts are recalculated from the actual stage size in portrait and landscape, including when the orientation changes mid-puzzle. Controls are native touch buttons anchored to 3D pieces and also work with the keyboard and screen readers.
- Every control is at least 44 × 44 CSS pixels. No activity needs hover, a keyboard, a precise timed gesture or reading alone. Tracing accepts dragging, tapping each glowing dot, or a next-dot button.
- The new games cap rendering at 1.5 device pixels per CSS pixel and use 1024-pixel shadow maps. Puzzles dispose their geometry and materials when they close. The renderer draws on interaction and during short animations, then rests.
- Each game ships only the toys it needs, with no large textures, web fonts, videos, trackers or ads. The original games keep their adaptive quality systems, with a touch-display pixel cap added where one was missing.
- Speech and saved progress are optional: blocked storage, muted sound or missing voices never block play. Pitch activities need sound; sequence and rhythm demonstrations also show visual cues. The learning adventures have no timers, lives or scores that penalise mistakes.

The original games' studio dialogs (child-composed music, sixfold snowflakes, Cake Stack's recipe and equal-portion studio, Paint Splash's colour-mixing workshop) isolate keyboard input, use 48-pixel controls, a 1.25 pixel cap and 512-pixel preview shadows, and redraw only on interaction or resize while the game underneath pauses. The RYB workshop is a labelled toy model, not a pigment simulation. Rebuild its Paint Splash toy kit with `blender --background --python-exit-code 1 --python examples/_studio/blender/build_workshops.py`.

## Browser checks

With the preview server running (set `EXAMPLES_ORIGIN` if it is not at http://localhost:4173):

```sh
pnpm exec playwright install chromium webkit
pnpm examples:playtest -- --browser chromium       # all 88, five steps each
pnpm examples:playtest -- --activities --mini      # all 26 interaction types in WebKit
pnpm examples:playtest -- --browser chromium --originals --mini
pnpm examples:playtest -- --mini --smoke           # all 88 start in WebKit
node examples/_studio/tests/quality.mjs            # causal outcomes and trusted gestures
node examples/_studio/tests/original-quality.mjs   # original-game learning additions
node examples/_studio/tests/second-quality.mjs     # compositions, sixfold design, recipe/share/paint studios
node examples/_studio/tests/second-quality.mjs --webkit
node examples/_studio/tests/workshop-fallback.mjs  # interrupted optional asset and retry
node examples/_studio/tests/navigation.mjs         # trusted drag and lifecycle checks
node examples/_studio/tests/catalogue.mjs          # root catalogue and filters
```

The playtest emulates iPad touch viewports (834 × 1194 and 1194 × 834, or 768 × 1024 and 1024 × 768 with `--mini`) and checks bounds, target sizes, real touch solutions, completion, saved progress, runtime errors and missing assets. Screenshots and JSON results go to `/tmp/bitgames-playtest`. `--offset N` and `--limit N` run part of the catalogue, `--activities` picks one game per interaction type, and `--smoke` only loads each game and its first puzzle. Original-game checks cover menus and controls in both orientations but do not finish the games.

Linux WebKit renders in software, so automated WebKit runs add a debug-only `renderScale=0.6`; layout and touch targets still use the full iPad viewport. These checks cover WebKit compatibility and emulated touch; real iPad performance still needs a device check, and the games still need child playtests and educator review.

## Art and source

All new toys, environments and covers are built procedurally in `blender/build_assets.py` from bevelled clay forms, an illustrated palette and soft lighting, exported as compact glTF. There is no external art or font. Source and generated art use the repository's MIT license; Three.js and Playwright keep their own licenses.
