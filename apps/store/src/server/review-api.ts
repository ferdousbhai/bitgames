import { env } from 'cloudflare:workers'
import { z } from 'zod'
import { isAdminKey } from './admin-key'
import { CreatorError } from './errors'
import { isGameId } from './limits'
import { decide, inspectForReview, listForReview, readReviewFile, reviewStatus } from './review'

const gameId = z.string().refine(isGameId, 'Invalid game id.')
const versionId = z.string().uuid()
const revision = z.string().min(1).max(64)
const note = z.string().trim().min(5).max(500)
const operation = z.discriminatedUnion('action', [
  z.object({ action: z.literal('queue'), offset: z.number().int().min(0).default(0), scope: z.enum(['all', 'waiting', 'listed']).default('all') }).strict(),
  z.object({ action: z.literal('inspect'), gameId, target: z.enum(['submission', 'listed']).default('submission') }).strict(),
  z.object({ action: z.literal('status'), gameId, versionId: versionId.optional() }).strict(),
  z.object({ action: z.literal('file'), gameId, versionId, path: z.string().min(1).max(200), offset: z.number().int().min(0).default(0) }).strict(),
  z.object({ action: z.literal('approve'), gameId, submissionId: versionId, revision }).strict(),
  z.object({ action: z.literal('reject'), gameId, submissionId: versionId, revision, note }).strict(),
  z.object({ action: z.literal('take-down'), gameId, revision, note }).strict(),
])

const MAX_BODY_BYTES = 8192
class BodyError extends Error {}

async function readBody(request: Request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw new BodyError('Request body is too large.')
  const reader = request.body?.getReader()
  if (!reader) throw new BodyError('A JSON request body is required.')
  try {
    const decoder = new TextDecoder()
    let bytes = 0
    let text = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_BODY_BYTES) throw new BodyError('Request body is too large.')
      text += decoder.decode(value, { stream: true })
    }
    return JSON.parse(text + decoder.decode()) as unknown
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

/** The internal reviewer CLI uses JSON over HTTP; all decisions stay on the server. */
export async function handleReviewApi(request: Request) {
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    Response.json(body, { status, headers: { 'cache-control': 'no-store', ...headers } })
  if (request.method !== 'POST') return json({ error: 'Use POST with a JSON operation.' }, 405, { allow: 'POST' })
  const match = /^Bearer\s+(\S{1,200})$/.exec(request.headers.get('authorization') ?? '')
  let allowed = false
  try {
    allowed = !!match && await isAdminKey(match[1]!, env.REVIEW_LIMITER, request.headers.get('cf-connecting-ip') ?? 'unknown')
  } catch {
    return json({ error: 'Too many requests. Wait a minute and try again.' }, 429)
  }
  if (!allowed) return json({ error: 'A valid admin key is required.' }, 401, { 'www-authenticate': 'Bearer realm="bitgames-review"' })
  if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') return json({ error: 'Use Content-Type: application/json.' }, 415)
  let body: unknown
  try {
    body = await readBody(request)
  } catch (error) {
    return json({ error: error instanceof BodyError ? error.message : 'Invalid JSON request body.' }, 400)
  }
  const parsed = operation.safeParse(body)
  if (!parsed.success) return json({ error: 'Invalid review operation.', issues: parsed.error.issues }, 400)
  const data = parsed.data
  try {
    switch (data.action) {
      case 'queue': {
        const games = await listForReview(data.offset, 51, data.scope)
        return json({ games: games.slice(0, 50), nextOffset: games.length > 50 ? data.offset + 50 : null })
      }
      case 'inspect': return json(await inspectForReview(data.gameId, new URL(request.url).origin, data.target))
      case 'status': return json(await reviewStatus(data.gameId, data.versionId))
      case 'file': return json({ file: { versionId: data.versionId, path: data.path, ...await readReviewFile(data.gameId, data.versionId, data.path, data.offset) } })
      case 'approve':
      case 'reject':
        await decide(data.gameId, data.action, data.action === 'reject' ? data.note : null, data.revision, data.submissionId)
        return json({ gameId: data.gameId, submissionId: data.submissionId, decision: data.action })
      case 'take-down':
        await decide(data.gameId, 'unpublish', data.note, data.revision)
        return json({ gameId: data.gameId, listed: false })
    }
  } catch (error) {
    if (error instanceof CreatorError) return json({ error: error.message }, 409)
    console.error('Review API failed', error)
    return json({ error: 'Review request failed. Check the current state before retrying a decision.' }, 500)
  }
}
