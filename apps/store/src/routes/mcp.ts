import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { authenticate } from '#/server/creators'
import { createMcpServer } from '#/server/mcp'
import { serveMcp } from '#/server/mcp-http'

const unauthorized = () =>
  Response.json(
    { error: 'A creator key is required. A grown-up can get one at /make and pass it as "Authorization: Bearer bg_...".' },
    { status: 401, headers: { 'www-authenticate': 'Bearer realm="bitgames"' } },
  )

async function handle(request: Request) {
  const creatorId = await authenticate(request)
  if (!creatorId) return unauthorized()
  if (!(await env.MCP_LIMITER.limit({ key: creatorId })).success) {
    return Response.json({ error: 'Too many requests. Wait a minute and try again.' }, { status: 429 })
  }

  return serveMcp(createMcpServer(creatorId, new URL(request.url).origin), request)
}

/** Remote MCP endpoint (streamable HTTP) that creators' local agents connect to. */
export const Route = createFileRoute('/mcp')({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      GET: ({ request }) => handle(request),
      DELETE: ({ request }) => handle(request),
    },
  },
})
