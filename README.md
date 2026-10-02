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

```sh
cd apps/store
pnpm db:migrate   # create the local D1 tables
pnpm seed         # publish the starter games in games/ to local D1 and R2
pnpm dev          # http://localhost:3030
```

Each starter game is a folder in `apps/store/games/` holding a `manifest.json` and its files. To deploy, run `pnpm deploy`, then `pnpm db:migrate:remote` and `pnpm seed:remote`.

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
