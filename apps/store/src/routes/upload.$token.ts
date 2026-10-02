import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { sha256Hex } from '#/server/crypto'
import { MAX_FILE_BYTES, objectKey } from '#/server/limits'
import { checkGameQuota } from '#/server/games-store'
import { CONTENT_TYPES, extensionOf } from '#/server/limits'

const text = (status: number, body: string) =>
  new Response(body + '\n', { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })

/** One-time upload URL handed out by the MCP tool get_upload_url. Use: curl -T file.glb <url> */
export const Route = createFileRoute('/upload/$token')({
  server: {
    handlers: {
      PUT: async ({ params, request }) => {
        const tokenHash = await sha256Hex(params.token)
        // Claim the token atomically so it can only be used once.
        const upload = await env.DB.prepare(
          'DELETE FROM uploads WHERE token_hash = ? AND expires_at > ? RETURNING game_id, path',
        )
          .bind(tokenHash, Date.now())
          .first<{ game_id: string; path: string }>()
        if (!upload) return text(404, 'This upload link is unknown, already used or expired. Ask for a new one with get_upload_url.')

        if (!(await env.UPLOAD_LIMITER.limit({ key: upload.game_id })).success) {
          return text(429, 'Too many uploads. Wait a minute and ask for a new link.')
        }
        const game = await env.DB.prepare(`SELECT status FROM games WHERE id = ?`)
          .bind(upload.game_id)
          .first<{ status: string }>()
        if (!game || (game.status !== 'draft' && game.status !== 'rejected')) {
          return text(409, 'This game is not a draft any more, so its files cannot change.')
        }

        const length = Number(request.headers.get('content-length'))
        if (!request.body || !Number.isInteger(length) || length <= 0) {
          return text(411, 'Send the file with a Content-Length, e.g. curl -T model.glb <url>')
        }
        if (length > MAX_FILE_BYTES) return text(413, `Files can be at most ${MAX_FILE_BYTES / 1024 / 1024} MB.`)
        const quotaError = await checkGameQuota(upload.game_id, upload.path, length)
        if (quotaError) return text(413, quotaError)

        // FixedLengthStream lets R2 accept the body without buffering it, and
        // errors if the client sends more bytes than it declared.
        const { readable, writable } = new FixedLengthStream(length)
        const [, object] = await Promise.all([
          request.body.pipeTo(writable),
          env.GAMES.put(objectKey(upload.game_id, upload.path), readable, {
            httpMetadata: { contentType: CONTENT_TYPES[extensionOf(upload.path)] },
          }),
        ])
        await env.DB.prepare('UPDATE games SET updated_at = ? WHERE id = ?').bind(Date.now(), upload.game_id).run()
        return text(200, `Uploaded ${upload.path} (${object.size} bytes).`)
      },
    },
  },
})
