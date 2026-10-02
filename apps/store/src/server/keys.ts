import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import { z } from 'zod'
import { createCreator } from './creators'

/** Issues a creator key. Shown once; only its hash is stored. */
export const createCreatorKey = createServerFn({ method: 'POST' })
  .validator(z.object({ grownUp: z.literal(true) }))
  .handler(async () => {
    const ip = getRequestHeader('cf-connecting-ip') ?? 'unknown'
    if (!(await env.KEY_LIMITER.limit({ key: ip })).success) {
      throw new Error('Too many keys from this network. Please wait a minute.')
    }
    return { key: await createCreator() }
  })
