import { bindings, defineConfig, exports, triggers } from "cf/config";

const perMinute = (namespace: string, limit: number) => bindings.rateLimit({ namespace, simple: { limit, period: 60 } });

/**
 * Cloudflare config for the store Worker, deployed with `cf deploy`.
 * D1 migrations live in ./migrations (the default) and are applied with `cf d1 migrations apply`.
 */
export default defineConfig({
	worker: {
		name: "bitgames-store",
		domains: ["bitgames.store"],
		// Reviewed legacy games import /vendor/ from this Worker's original address.
		workersDev: true,
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
		// Re-checks that approved game versions still serve the files that were reviewed.
		triggers: [triggers.scheduled({ schedule: "*/10 * * * *" })],
		observability: {
			enabled: true,
			traces: {
				enabled: true,
			},
		},
		env: {
			// Admin key for /admin and /api/review. Locally it comes from .dev.vars.
			ADMIN_KEY: bindings.secret(),
			// Turnstile secret for the creator-key form. Locally it's Cloudflare's always-pass test secret.
			TURNSTILE_SECRET: bindings.secret(),
			ROOMS: bindings.durableObject({ worker: "bitgames-store", exportName: "GameRoom" }),
			// Game catalog.
			DB: bindings.d1({
				id: "34eb131f-ba97-412e-ba81-8d1aa5c2c808",
				name: "bitgames",
			}),
			// Per-IP and per-creator rate limits, all per minute.
			KEY_LIMITER: perMinute("4101", 3),
			MCP_LIMITER: perMinute("4102", 120),
			SUBMIT_LIMITER: perMinute("4103", 10),
			ADMIN_LIMITER: perMinute("4104", 30),
			LIKE_LIMITER: perMinute("4105", 30),
			ROOM_LIMITER: perMinute("4106", 30),
			// The review API: an agent reading a game's files makes many calls.
			REVIEW_LIMITER: perMinute("4107", 120),
		},
	},
});
