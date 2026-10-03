# BitGames

A web game store built on BitChat's technology. Games are made with Blender and three.js by people's own AI agents, run on each creator's own Cloudflare account, and are listed and reviewed in one place through our MCP server.

## Layout

- `apps/store`: the game store (TanStack Start and TanStack DB on Cloudflare Workers, with D1 for the catalog and a Durable Object for multiplayer rooms). It hosts no game files: it plays each game's shipped Worker version in a sandboxed frame, and pins the reviewed version for the store
- `packages/game-sdk`: the multiplayer SDK games load from `/vendor/bitgames/multiplayer-1.js`
- `examples/<game>`: our own games, one per folder, each a standalone creator project deployed to its own Worker (Crash Racers, Bunny Hop, Balloon Pop, Star Catcher, Memory Match)
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
pnpm run deploy --secrets-file secrets.production.env   # ADMIN_KEY=... and TURNSTILE_SECRET=...
pnpm db:migrate:remote
pnpm seed:remote
```

Games load three.js and the multiplayer SDK from the production store's `/vendor/` (`PUBLIC_ORIGIN` in `apps/store/src/lib/site.ts`), so keep that address stable.

## How games are hosted and kept safe

- Each game is static files deployed as a Worker on its creator's Cloudflare account, from the project `get_starter_project` returns (`apps/store/src/server/starter.ts`).
- `bitgames.mjs` lists every file with its SHA-256 in `public/bitgames.json` before each deploy.
- The creator ships the deploy's version preview URL (`https://<version>-<worker>.<account>.workers.dev/`). BitGames downloads and checks every file, and the game plays at once at its own link (`/try/<token>`). Review only decides whether it is listed in the store; on approval the store pins that exact version.
- The store plays games in a frame with `sandbox` and a `csp` attribute, so a game can load only its own files and `/vendor/`. Games opt in with `Allow-CSP-From`; Chrome refuses to show a game that doesn't.
- Version URLs never change, but an alias can look like a version whose id starts with a letter. A cron job re-checks those versions and takes down a game whose files changed.

## Making games with an AI agent

Anyone can build games for the store with a local agent such as Claude Code:

1. A grown-up opens `/make`, ticks "I'm a grown-up", and gets a creator key. The page shows a `claude mcp add` command with the key filled in.
2. Optionally connect the [Blender MCP server](https://github.com/ahujasid/blender-mcp) too, so the agent can model in Blender.
3. The grown-up logs in to their own Cloudflare account once with `npx cf auth login`.
4. Ask the agent for a game. It reads the guide with `get_guide`, then:
   - registers the game with `create_game` and writes the project from `get_starter_project`;
   - builds the three.js game in `public/`, exporting Blender models as `.glb` into `public/models/`;
   - deploys with `npm run deploy` and checks the version URL;
   - calls `ship_version` with that URL and gets back the game's link, which plays it right away and can be shared with anyone.
5. To list it in the store, where other families can find it, a reviewer approves it (see below). Until then it plays only at its link.

## Reviewing games

Review decides which shipped games are listed in the store. Ask Claude Code in this repo to "review the submitted games": the `review-games` skill (`.claude/skills/review-games/SKILL.md`) reads each waiting game's code, plays it with Claude in Chrome, and lists it or sends it back with a note for the creator. Anything it's unsure about is left for you.

It uses the `bitgames-review` MCP server from `.mcp.json` (`/mcp/review`, code in `apps/store/src/server/review-mcp.ts`), which authenticates with the store's admin key. Start Claude Code with:

```sh
BITGAMES_ADMIN_KEY=... claude                                         # the live store
BITGAMES_ADMIN_KEY=... BITGAMES_ORIGIN=http://localhost:3030 claude   # a local dev store
```

You can also review by hand at `/admin` (sign in with `ADMIN_KEY`). Listed games can be taken down there, or by asking the agent.

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
