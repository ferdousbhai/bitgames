# Agent starting point

Work on `main`, the canonical branch. All work previously on `master` is included in `main`.

The catalogue is the twelve original games in `examples/`. The goal is to make each of them excellent, not to add more games. Read [docs/POLISH_HANDOFF.md](docs/POLISH_HANDOFF.md) before editing examples, and keep it current when handing off. `docs/archive/` and `docs/audit/` are history only. Never recreate or republish retired games.

Games should be calm and gentle and build sustained focus, with learning inside the play. Avoid attention hooks such as flashing, reward spam, frantic timers and noisy feedback.

## Blender assets

Agents must use **Blender CLI**, not the Blender GUI or Blender MCP, for asset generation, inspection renders, and rebuilds. Use Blender 5.2 and edit each original game’s reproducible builder under `examples/<game-id>/blender/`; never hand-edit shipped GLBs or generated runtime files.

Choose assets in this order: reuse an existing suitable asset; check trusted libraries such as Poly Haven; adapt a library asset through Blender CLI; build custom when the educational shape, cohesive style, or browser budget warrants it. CLI use does not imply making everything from scratch. Keep simple adaptive counters, grids, and outlines in runtime geometry. For imported assets, record the source URL, licence, checksum, and reproducible adaptation steps; ship the optimized files locally. A library asset is useful only if adaptation costs less than creating a suitable small model.

```sh
blender --version
node examples/_studio/assets.mjs <game-id>
pnpm examples:build
```

Rebuild only affected games and keep CPU rendering bounded (the builder uses eight threads). Use temporary output directories for exploratory renders. Validate the generated models and cover in the actual game before release.

## Parallel polish

When the owner requests parallel work, give each agent one original game and explicit ownership of its files. One coordinator handles shared code (`examples/_studio/`), catalogue edits, builds, commits, publishing and store seeding. Workers report game-specific evidence and must not overwrite another worker's changes. Record each game's pass in `docs/polish/<game-id>.md`, one living file per game.
