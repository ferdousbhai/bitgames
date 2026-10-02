# BitGames

A web game store built on BitChat's technology. Games are made with Blender and three.js, by people's own AI agents connected through our MCP server.

## Layout

- `apps/store`: the game store (TanStack Start and TanStack DB on Cloudflare Workers, with D1 for the catalog and R2 for game files)
- `packages/protocol`: TypeScript port of BitChat's binary packet format, padding, compression and fragmentation
- `packages/webrtc`: peer-to-peer transport for those packets over WebRTC data channels
- `apps/signal`: small WebSocket server that introduces peers to each other (game traffic never passes through it)
- `apps/lab`: browser page that measures latency, loss and throughput between devices
- `reference/bitchat-ios`: the public-domain BitChat source we port from (see its PROVENANCE.md)
- `tools/blender`: the Blender MCP add-on

## Running the store

The store deploys with the [`cf` CLI](https://developers.cloudflare.com/) using `apps/store/cloudflare.config.ts`.

```sh
cd apps/store
echo 'ADMIN_KEY=pick-a-long-random-string' > .dev.vars
pnpm dev          # http://localhost:3030, keep it running
pnpm db:migrate   # create the local tables
pnpm seed         # publish the starter games in games/
```

Each starter game is a folder in `apps/store/games/` holding a `manifest.json` and its files.

To deploy, log in once with `pnpm exec cf auth login`, then:

```sh
pnpm run deploy --secrets-file secrets.production.env   # ADMIN_KEY=... and TURNSTILE_SECRET=...
pnpm db:migrate:remote
pnpm seed:remote
```

## Making games with an AI agent

Anyone can build games for the store with a local agent such as Claude Code:

1. A grown-up opens `/make`, ticks "I'm a grown-up", and gets a creator key. The page shows a `claude mcp add` command with the key filled in.
2. Optionally connect the [Blender MCP server](https://github.com/ahujasid/blender-mcp) too, so the agent can model in Blender.
3. Ask the agent for a game. It reads the guide with `get_guide`, then:
   - creates the game with `create_game`;
   - writes three.js code with `write_file`;
   - exports models from Blender as `.glb` and uploads them with `get_upload_url` plus `curl`;
   - checks the private preview URL;
   - calls `submit_for_review`.
4. An adult approves it at `/admin` (sign in with `ADMIN_KEY`). Only then does it appear in the store. Published games can be taken down there too.

The MCP endpoint is `/mcp` (streamable HTTP, stateless, `Authorization: Bearer bg_...`). Its code is in `apps/store/src/server/mcp.ts`.

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
