import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import { z } from 'zod'
import { createCreator, manageCredentials } from './creators'
import { allowedByIp } from './rate-limit'

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

async function passedTurnstile(token: string, ip: string): Promise<boolean> {
  const body = new FormData()
  body.append('secret', env.TURNSTILE_SECRET)
  body.append('response', token)
  body.append('remoteip', ip)
  body.append('idempotency_key', crypto.randomUUID())
  const response = await fetch(SITEVERIFY, { method: 'POST', body })
  if (!response.ok) return false
  const result = (await response.json()) as { success: boolean; action?: string }
  return result.success && (result.action === undefined || result.action === 'creator-key')
}

/** Issues a creator key after a Turnstile check. Shown once; only its hash is stored. */
export const createCreatorKey = createServerFn({ method: 'POST' })
  .validator(z.object({ grownUp: z.literal(true), turnstileToken: z.string().min(1).max(4096) }))
  .handler(async ({ data }) => {
    const ip = getRequestHeader('cf-connecting-ip') ?? 'unknown'
    if (!(await allowedByIp(env.KEY_LIMITER, ip))) {
      throw new Error('Too many keys from this network. Please wait a minute.')
    }
    if (!(await passedTurnstile(data.turnstileToken, ip))) {
      throw new Error("We couldn't check that you're a person. Please try again.")
    }
    return createCreator()
  })

/** Rotation preserves ownership. Recovery also works after the creator key was revoked. */
export const manageCreatorKey = createServerFn({ method: 'POST' })
  .validator(z.object({ credential: z.string().min(1).max(100), action: z.enum(['rotate', 'revoke']) }))
  .handler(async ({ data }) => {
    const ip = getRequestHeader('cf-connecting-ip') ?? 'unknown'
    if (!(await allowedByIp(env.KEY_LIMITER, ip))) throw new Error('Too many attempts. Wait a minute.')
    return manageCredentials(data.credential, data.action)
  })
