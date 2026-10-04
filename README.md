# BitGames

A web game store built on BitChat's technology. Games are made with Blender and three.js by people's own AI agents, run on each creator's own Cloudflare account, and are shipped through the creator MCP and reviewed through a skill and CLI.

## Layout

- `apps/store`: the game store (TanStack Start and TanStack DB on Cloudflare Workers, with D1 for the catalog and a Durable Object for multiplayer rooms). Creators host the original game files; the store plays only hash-verified files through its playback gateway and pins each reviewed shipment
- `packages/game-sdk`: the multiplayer SDK games load from `/vendor/bitgames/multiplayer-1.js`
- `examples/<game>`: our own games, one per folder, each a standalone creator project deployed to its own Worker (Crash Racers, Bunny Hop, Balloon Pop, Star Catcher, Memory Match, Cake Stack, Penguin Bowling, Bumper Ducks, Fish Pond, Dragon Glide, Paint Splash)
- `packages/protocol`: TypeScript port of BitChat's binary packet format, padding, compression and fragmentation
- `packages/webrtc`: peer-to-peer transport for those packets over WebRTC data channels
- `apps/signal`: small WebSocket server that introduces peers to each other (game traffic never passes through it)
- `apps/lab`: browser page that measures latency, loss and throughput between devices
- `reference/bitchat-ios`: the public-domain BitChat source we port from (see its PROVENANCE.md)
- `.mcp.json`: runs the [Blender MCP server](https://github.com/ahujasid/blender-mcp) for this project (install its Blender add-on from that repo)

## Running the store

The store deploys with the [`cf` CLI](https://developers.cloudflare.com/) using `apps/store/cloudflare.config.ts`.

```sh
cd apps/store
echo 'ADMIN_KEY=pick-a-long-random-string' > .dev.vars
pnpm dev          # http://localhost:3030, keep it running
pnpm db:migrate   # create the local tables
pnpm seed         # list the deployed games in ../../examples
```

The store is live at https://bitgames.store. Every push to `master` on GitHub deploys it automatically: Cloudflare Workers Builds runs `pnpm run deploy` in `apps/store` (it vendors three.js and the multiplayer SDK, then `cf deploy`). Secrets set on the Worker are kept across deploys. Database migrations are not run automatically; apply them with `pnpm db:migrate:remote`.

To deploy by hand, log in once with `pnpm exec cf auth login`, then:

```sh
pnpm db:migrate:remote
pnpm run deploy --secrets-file secrets.production.env   # ADMIN_KEY=... and TURNSTILE_SECRET=...
pnpm seed:remote   # optional: publish the repository's deployed example games
```

Games load three.js and the multiplayer SDK from the production store's `/vendor/` (`PUBLIC_ORIGIN` in `apps/store/src/lib/site.ts`), so keep that address stable. Older reviewed games import the original `bitgames-store.ferdousbd.workers.dev/vendor/` address; workersDev stays enabled for that compatibility path.

## How games are hosted and kept safe

- Each game deploys to the creator's Cloudflare account from the starter files returned by `get_context` with gameId and includeStarter=true (`apps/store/src/server/starter.ts`).
- `bitgames.mjs` records every public file's SHA-256 in `public/bitgames.json`. Limits are 40 files, 50 MB total and 25 MB per file.
- `publish_game` validates a Cloudflare version URL, downloading and hashing declared files with streaming limits, timeouts and same-origin redirects only. `checkOnly: true` validates without changing playback or review.
- Each shipment records its allowed file list and metadata in D1. `/game-assets/<versionId>/<path>` serves only recorded files, after verifying the bytes. Verified responses may be cached. Extra endpoints, changed upstream files and upstream cookies/headers never reach the game.
- A sandboxed wrapper restricts frame navigation to the exact shipment; gateway response CSP permits only that shipment's files and BitGames' trusted `/vendor/` libraries. Use relative paths for game assets; requests to the creator's upstream origin are blocked inside BitGames.
- Shipping immediately updates the stable `/try/<token>` link. Review governs store listing; the listed version stays until approval. Review links include a pinned submission id. Decisions atomically compare the inspected submission and game revision, including metadata edits.
- The cron job rechecks all kinds of listed version URLs, including digit-prefixed URLs. A mismatch removes the listing; the gateway independently rejects changed bytes on cache misses.

## Making games with a local coding agent

1. A grown-up opens `/make`, passes the human check, and gets a creator key and separate recovery code. Save both. The page provides Claude Code, Codex and generic Streamable HTTP MCP configuration.
2. Optionally connect [Blender MCP](https://github.com/ahujasid/blender-mcp) for 3D models.
3. Log in to the creator's Cloudflare account once with `npx cf auth login`.
4. Ask the agent to read `get_context`, register the game with `save_game`, then read `get_context` with gameId and includeStarter=true for starter files. The agent writes files, builds, tests in its browser and deploys using its own filesystem and shell tools.
5. `publish_game` with the version URL returns a stable playUrl for sandbox/multiplayer testing and sharing. A reviewer decides whether to list it in the store.

The creator MCP has five tools:

| Tool | Capability |
| --- | --- |
| `get_context` | Guide, owned games, details and review notes; with gameId, version history and optional starter files (includeStarter=true). Follow nextHistoryCursor using historyCursor for older versions. Use includeGuide=false after onboarding. |
| `save_game` | Register a new game or edit metadata. Editing details cancels pending review; publish again when ready. |
| `publish_game` | Validate with checkOnly, ship a deployed URL, or restore previous files using versionId. A restore creates a new submission; it does not bypass store review. |
| `withdraw_submission` | Withdraw the exact submissionId from review while keeping the shared link playable. |
| `delete_game` | Remove a game and its history from BitGames. Manage its Cloudflare Worker locally. |

The MCP handles the store-specific capabilities. Local coding agents handle code, commands, browser testing and optional Blender. Creator MCP and review API responses include structured data.

On `/make`, use a current key or recovery code to rotate credentials while preserving ownership. Rotation immediately replaces both credentials. Revocation stops MCP access while leaving games playable; the saved recovery code can restore access. Old creator keys can rotate to obtain a recovery code. If both credentials are lost, there is no account-based recovery.

For Codex, set `BITGAMES_CREATOR_KEY` in the environment where Codex starts, then run:

```sh
codex mcp add bitgames --url https://bitgames.store/mcp --bearer-token-env-var BITGAMES_CREATOR_KEY
```

Or use a trusted project's `.codex/config.toml`:

```toml
[mcp_servers.bitgames]
url = "https://bitgames.store/mcp"
bearer_token_env_var = "BITGAMES_CREATOR_KEY"
```

See [Codex MCP documentation](https://developers.openai.com/codex/mcp). Reconnect or restart the agent after changing its connection settings.

## Migrating existing games

Run `pnpm --dir apps/store db:migrate` locally or `db:migrate:remote` before deploying this update. Migration 0009 adds version records and recovery hashes. The migration script backfills existing live, waiting and shared versions through the same validator, preserving reviewed manifest hashes. It is resumable and refuses changed deployments. SQL migrations alone do not perform the network backfill: use the repository migration script. Missing version records fail closed instead of falling back to direct upstream playback.

## Reviewing games

Review decides which shipped games are listed in the store. Ask Claude Code or Codex in this repository to “review the submitted games”. The shared [review-games skill](.agents/skills/review-games/SKILL.md) inspects source, plays pinned versions with the agent's browser tools, and approves or returns games with actionable feedback. Uncertain or untested games remain waiting. Claude discovers the same skill through `.claude/skills/review-games/SKILL.md`.

Review uses a small CLI and authenticated JSON API at `/api/review`; it adds no MCP tools. Start the agent with `BITGAMES_ADMIN_KEY` set to the store's `ADMIN_KEY`. Set `BITGAMES_ORIGIN=http://localhost:3030` for a local dev store; the default is `https://bitgames.store`. Keep credentials in the environment, not command arguments.

From the repository root:

```sh
node apps/store/scripts/review.mjs queue --scope waiting
node apps/store/scripts/review.mjs inspect GAME
node apps/store/scripts/review.mjs status GAME --version VERSION
node apps/store/scripts/review.mjs file GAME index.html --version VERSION
node apps/store/scripts/review.mjs approve GAME --submission VERSION --revision REVISION
node apps/store/scripts/review.mjs reject GAME --submission VERSION --revision REVISION --note "What to fix"
node apps/store/scripts/review.mjs inspect GAME --listed
node apps/store/scripts/review.mjs take-down GAME --revision REVISION --note "Reason"
```

`inspect` returns the frozen metadata, files, exact version, game revision and pinned play link. `status` checks current listing state and, with `--version`, the recorded decision for that exact version even after rejection removes it from the queue; use it after an uncertain response before retrying a decision. Reads and decisions remain protected by server authentication, verified file hashes and atomic submission/revision checks. Queue and file responses provide `nextOffset`. The CLI returns JSON, exits nonzero on errors, refuses credential forwarding through redirects, and never automatically retries decisions. Run `node apps/store/scripts/review.mjs --help` for all options, or `pnpm --dir apps/store review --help`.

The reviewer MCP endpoint and its `.mcp.json` entry have been removed; reconnect existing agents to drop the old tool definitions. Creator MCP is still available. You can also review by hand at `/admin` with the admin key.

The MCP endpoint is `/mcp` (streamable HTTP, stateless, `Authorization: Bearer bg_...`). Its code is in `apps/store/src/server/mcp.ts`.

## Crash Racers

Race or smash up to 4 cars around Ubud, Helsinki or Montreal, on separate devices in the same home (BitGames' family lobby, WebRTC between devices) or alone against bots.

- Rebuild the Blender models: `cd examples/crash-racers/blender && blender --background --python cars.py && blender --background --python props.py`
- Deploy an example and record its new version in `game.json`: `node examples/publish.mjs crash-racers`, then `pnpm --dir apps/store seed:remote` to list that version
- Debug hooks: open `/try/<token>?debug` (or the version URL with `index.html?debug&city=montreal&mode=smash`) and use `window.__crash`

## Running the WebRTC lab

```sh
pnpm install
pnpm signal   # ws://0.0.0.0:8788
pnpm lab      # http://<this machine's LAN IP>:5173
```

Open the lab URL on two or more devices on the same Wi-Fi, use the same room name, and click Join.

## Tests

```sh
pnpm test
pnpm typecheck
```

## License

MIT, see [LICENSE](LICENSE). Third-party code keeps its own license: `reference/bitchat-ios` is public domain (Unlicense) and `examples/crash-racers/public/lib/cannon-es.js` is MIT (see the license file next to it).
