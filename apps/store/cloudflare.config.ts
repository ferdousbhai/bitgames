import { bindings, defineConfig } from "cf/config";

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
		entrypoint: "@tanstack/react-start/server-entry",
		observability: {
			enabled: true,
			traces: {
				enabled: true,
			},
		},
		env: {
			// Admin key for /admin. Locally it comes from .dev.vars.
			ADMIN_KEY: bindings.secret(),
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
		},
	},
});
