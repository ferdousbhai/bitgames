import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { isAdminKey } from '#/server/admin'
import { serveMcp } from '#/server/mcp-http'
import { createReviewMcpServer } from '#/server/review-mcp'

async function handle(request: Request) {
  const match = /^Bearer\s+(\S{1,200})$/.exec(request.headers.get('authorization') ?? '')
  let allowed = false
  try {
    allowed = !!match && (await isAdminKey(match[1]!, env.REVIEW_LIMITER, request.headers.get('cf-connecting-ip') ?? 'unknown'))
  } catch {
    return Response.json({ error: 'Too many requests. Wait a minute and try again.' }, { status: 429 })
  }
  if (!allowed) {
    return Response.json(
      { error: 'The admin key is required, as "Authorization: Bearer <ADMIN_KEY>".' },
      { status: 401, headers: { 'www-authenticate': 'Bearer realm="bitgames-review"' } },
    )
  }
  return serveMcp(createReviewMcpServer(new URL(request.url).origin), request)
}

/** MCP endpoint for the store's reviewer, so a local agent can review shipped games (see .claude/skills/review-games). */
export const Route = createFileRoute('/mcp_/review')({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      GET: ({ request }) => handle(request),
      DELETE: ({ request }) => handle(request),
    },
  },
})
