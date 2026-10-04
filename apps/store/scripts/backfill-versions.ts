import { randomUUID } from 'node:crypto'
import { checkVersion } from '../src/server/versions.ts'

export const literal = (value: string | number | boolean | null) =>
  value === null ? 'NULL' : typeof value === 'string' ? `'${value.replaceAll("'", "''")}'` : String(Number(value))

type Sql = (query: string) => Promise<Record<string, unknown>[]>

/** Resume safely if an earlier migration stopped partway through network validation. */
export async function backfillVersions(sql: Sql, log: (message: string) => void = console.log) {
  const games = await sql(`SELECT * FROM games WHERE (live_url IS NOT NULL AND live_version IS NULL)
    OR (play_url IS NOT NULL AND play_version IS NULL) OR (status = 'review' AND review_url IS NOT NULL AND review_version IS NULL)`)
  for (const game of games) {
    const info = { title: game.title, tagline: game.tagline, howToPlay: game.how_to_play, emoji: game.emoji, color: game.color, category: game.category, together: Boolean(game.together) }
    for (const role of ['live', 'review', 'play'] as const) {
      if (!game[`${role}_url`] || game[`${role}_version`] || (role === 'review' && game.status !== 'review')) continue
      const url = String(game[`${role}_url`])
      const reviewedRole = role === 'play' ? (url === game.review_url && game.status === 'review' ? 'review' : url === game.live_url ? 'live' : null) : role
      const expected = reviewedRole ? game[`${reviewedRole}_manifest`] : null
      if (reviewedRole && !expected) throw new Error(`${game.id}: ${reviewedRole} deployment has no recorded manifest; fix or resubmit before retrying.`)
      const checked = await checkVersion(url)
      if (expected && checked.manifest !== expected) throw new Error(`${game.id}: ${role} deployment changed; migration refuses to trust it. Fix or resubmit before retrying.`)
      const id = randomUUID()
      const details = (role === 'review' || (role === 'play' && url !== game.live_url)) && game.pending_info ? { ...info, ...JSON.parse(String(game.pending_info)) } : info
      const decision = role === 'live' || (role === 'play' && reviewedRole === 'live') ? 'approved'
        : role === 'review' || reviewedRole === 'review' ? 'pending' : game.review_note ? 'rejected' : 'withdrawn'
      const note = decision === 'rejected' ? String(game.review_note) : null
      const unchanged = `id = ${literal(String(game.id))} AND revision = ${literal(String(game.revision))} AND updated_at = ${Number(game.updated_at)} AND ${role}_url = ${literal(url)} AND ${role}_version IS NULL`
      await sql(`INSERT INTO game_versions (id, game_id, upstream_url, manifest_hash, manifest_json, info_json, cover, file_count, bytes, created_at, decision, review_note)
        SELECT ${[id, String(game.id), checked.url, checked.manifest, checked.manifestJson, JSON.stringify(details), checked.cover, checked.files, checked.bytes, Date.now(), decision, note].map(literal).join(', ')}
        WHERE EXISTS (SELECT 1 FROM games WHERE ${unchanged})`)
      const updated = await sql(`UPDATE games SET ${role}_version = ${literal(id)} WHERE ${unchanged}
        AND EXISTS (SELECT 1 FROM game_versions WHERE id = ${literal(id)}) RETURNING ${role}_version AS versionId`)
      if (updated[0]?.versionId !== id) {
        await sql(`DELETE FROM game_versions WHERE id = ${literal(id)}
          AND NOT EXISTS (SELECT 1 FROM games WHERE live_version = ${literal(id)} OR review_version = ${literal(id)} OR play_version = ${literal(id)})`)
        throw new Error(`${game.id}: changed during ${role} migration; rerun the migration to use the current game.`)
      }
      log(`recorded ${game.id} ${role} version`)
    }
  }
}
