# BitGames example tooling

The generated 89-game batch was retired with the owner's approval on 2026-10-08. Only the twelve original games remain; Splash Tank lives in a separate repository and is untouched. There is no catalogue-size target. See [the handoff](../../docs/POLISH_HANDOFF.md) and [wipe evidence](../../docs/audit/wipe-execution-2026-10-08.json).

`catalogue.mjs` explicitly names the originals. `build.mjs` copies their maintained learning helpers, refreshes shipment manifests and rebuilds the local catalogue. It no longer generates games. The retired runtime, game designs, assets and generated-game builders are removed. Preserve the originals and start future work with one compelling child-tested prototype, rather than reskins or bulk releases.

```sh
node examples/_studio/build.mjs
node examples/_studio/tests/curriculum.test.mjs
EXAMPLES_PORT=4213 node examples/_studio/serve.mjs
```

Browser checks (require working browser IPC and a running preview):

```sh
EXAMPLES_ORIGIN=http://localhost:4213 EXAMPLES_CHROMIUM_EXECUTABLE=/usr/bin/chromium EXAMPLES_CHROMIUM_ANGLE=swiftshader node examples/_studio/tests/browser.mjs --browser chromium
EXAMPLES_ORIGIN=http://localhost:4213 node examples/_studio/tests/browser.mjs --browser webkit
EXAMPLES_ORIGIN=http://localhost:4213 node examples/_studio/tests/original-quality.mjs
```

Chromium defaults to `EXAMPLES_CHROMIUM_ANGLE=gl` (the real GPU). Vulkan fell back to SwiftShader at 2–5 fps on the owner's machine, which slows game time and breaks timing checks. Use `swiftshader` only where no GPU is available.

Other maintained checks are `tests/catalogue.mjs` and `tests/workshop-fallback.mjs`. Source/shipment tests do not prove child enjoyment or physical-device performance.

Agents must use Blender 5.2 CLI. Edit the reproducible builders under `examples/<game-id>/blender/`, then rebuild only the requested game. Crash Racers uses `cars.py` and `props.py`; the wrapper also runs each game's texture/workshop builders:

```sh
node examples/_studio/assets.mjs balloon-pop
```

The wrapper bounds Blender to eight threads. Reuse existing assets first, consider trusted libraries such as Poly Haven, and adapt/build only when justified. Record provenance for imports and inspect the actual game before release. Do not hand-edit shipped GLBs.

The workspace-pinned Cloudflare CLI is available without pnpm's external engine-store lock:

```sh
./scripts/cf --version
./scripts/cf auth login
./scripts/cf auth whoami
```

Cloudflare authentication and the approved retirement are verified. All 89 target Worker names are absent; fourteen deployed Workers, fourteen store games and 220 versions were removed. See the handoff for evidence. Preserve the store, shared multiplayer resources, originals and unrelated projects.
