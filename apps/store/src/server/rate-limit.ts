import { getRequestHeader } from '@tanstack/react-start/server'

/** True while the caller's IP is within `limiter`'s budget. Pass `ip` outside TanStack request handling. */
export async function allowedByIp(limiter: RateLimit, ip = getRequestHeader('cf-connecting-ip') ?? 'unknown') {
  return (await limiter.limit({ key: ip })).success
}
