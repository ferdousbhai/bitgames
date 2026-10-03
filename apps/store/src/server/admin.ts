import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { z } from 'zod'
import { safeEqual } from './crypto'
import { allowedByIp } from './rate-limit'
import { isGameId } from './limits'
import { decide, listForReview } from './review'

export type { ReviewGame as AdminGame } from './review'

/** Checks the admin key, rate-limiting guesses per IP first. Shared with the reviewer MCP endpoint. */
export async function isAdminKey(adminKey: string, limiter: RateLimit, ip?: string) {
  if (!(await allowedByIp(limiter, ip))) throw new Error('Too many attempts. Wait a minute.')
  return Boolean(env.ADMIN_KEY) && (await safeEqual(adminKey, env.ADMIN_KEY))
}

async function requireAdmin(adminKey: string) {
  if (!(await isAdminKey(adminKey, env.ADMIN_LIMITER))) throw new Error('Wrong admin key.')
}

const auth = z.object({ adminKey: z.string().min(1).max(200) })

export const listForAdmin = createServerFn({ method: 'POST' })
  .validator(auth)
  .handler(async ({ data }) => {
    await requireAdmin(data.adminKey)
    return listForReview()
  })

export const reviewGame = createServerFn({ method: 'POST' })
  .validator(
    auth.extend({
      id: z.string().refine(isGameId),
      decision: z.enum(['approve', 'reject', 'unpublish']),
      note: z.string().max(500).optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.adminKey)
    await decide(data.id, data.decision, data.note?.trim() || null)
  })
