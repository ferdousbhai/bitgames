import { env } from 'cloudflare:workers'

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** Checks a Turnstile token with Cloudflare; a token works once, and only for the widget action it was made for. */
export async function passedTurnstile(token: string, ip: string, action: string): Promise<boolean> {
  const body = new FormData()
  body.append('secret', env.TURNSTILE_SECRET)
  body.append('response', token)
  body.append('remoteip', ip)
  body.append('idempotency_key', crypto.randomUUID())
  const response = await fetch(SITEVERIFY, { method: 'POST', body })
  if (!response.ok) return false
  const result = (await response.json()) as { success: boolean; action?: string }
  return result.success && (result.action === undefined || result.action === action)
}
