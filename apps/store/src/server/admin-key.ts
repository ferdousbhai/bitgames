import { env } from 'cloudflare:workers'
import { safeEqual } from './crypto'
import { allowedByIp } from './rate-limit'

/**
 * Checks the admin key, rate-limiting guesses per IP first. Used by /admin's
 * server functions and the reviewer MCP endpoint. Kept out of admin.ts, whose
 * route imports it: only server functions may be exported there.
 */
export async function isAdminKey(adminKey: string, limiter: RateLimit, ip?: string) {
  if (!(await allowedByIp(limiter, ip))) throw new Error('Too many attempts. Wait a minute.')
  return Boolean(env.ADMIN_KEY) && (await safeEqual(adminKey, env.ADMIN_KEY))
}
