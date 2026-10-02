import { bindings, defineConfig, exports } from "cf/config";

/**
 * Cloudflare config for the store Worker, deployed with `cf deploy`.
 * D1 migrations live in ./migrations (the default) and are applied with `cf d1 migrations apply`.
 */
export default defineConfig({
	worker: {
		name: "bitgames-store",
		compatibilityDate: "2026-09-30",
		compatibilityFlags: [
			"nodejs_compat",
		],
		// src/server.ts wraps the TanStack Start handler and exports the GameRoom Durable Object.
		entrypoint: "./src/server.ts",
		exports: {
			// One multiplayer signaling room per game and room code.
			GameRoom: exports.durableObject({ storage: "sqlite" }),
		},
		observability: {
			enabled: true,
			traces: {
				enabled: true,
			},
		},
		env: {
			// Admin key for /admin. Locally it comes from .dev.vars.
			ADMIN_KEY: bindings.secret(),
			// Turnstile secret for the creator-key form. Locally it's Cloudflare's always-pass test secret.
			TURNSTILE_SECRET: bindings.secret(),
			ROOMS: bindings.durableObject({ worker: "bitgames-store", exportName: "GameRoom" }),
			// Game catalog.
			DB: bindings.d1({
				id: "34eb131f-ba97-412e-ba81-8d1aa5c2c808",
				name: "bitgames",
			}),
			// Game files, stored under games/<id>/<path>.
			GAMES: bindings.r2({
				name: "bitgames-games",
			}),
			// Per-IP and per-creator rate limits for key creation, MCP calls, uploads and admin sign-in.
			KEY_LIMITER: bindings.rateLimit({
				namespace: "4101",
				simple: {
					limit: 3,
					period: 60,
				},
			}),
			MCP_LIMITER: bindings.rateLimit({
				namespace: "4102",
				simple: {
					limit: 120,
					period: 60,
				},
			}),
			UPLOAD_LIMITER: bindings.rateLimit({
				namespace: "4103",
				simple: {
					limit: 30,
					period: 60,
				},
			}),
			ADMIN_LIMITER: bindings.rateLimit({
				namespace: "4104",
				simple: {
					limit: 30,
					period: 60,
				},
			}),
			ROOM_LIMITER: bindings.rateLimit({
				namespace: "4106",
				simple: {
					limit: 30,
					period: 60,
				},
			}),
			LIKE_LIMITER: bindings.rateLimit({
				namespace: "4105",
				simple: {
					limit: 30,
					period: 60,
				},
			}),
		},
	},
});
