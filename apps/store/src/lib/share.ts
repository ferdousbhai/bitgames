import { PUBLIC_ORIGIN } from './site'

export const SITE_NAME = 'BitGames'
export const SITE_TITLE = 'BitGames: fun games to play'
export const SITE_DESCRIPTION = 'Bright, simple games for kids. No ads, just play.'
/** 1200×630 picture shown when a BitGames link is shared. */
export const SHARE_IMAGE = `${PUBLIC_ORIGIN}/og.png`

/** An absolute link on the public site, for canonical links and link previews. */
export const absoluteUrl = (path: string) => new URL(path, PUBLIC_ORIGIN).href

/**
 * How a shared link looks in Messages, WhatsApp, Facebook, X and Slack. The
 * root route uses this for the whole site and adds the page's canonical address;
 * a route's own meta replaces the root's by name, so pages only say what differs.
 * Only routes whose loader and head run on the server (`ssr: 'data-only'` or more)
 * reach link previews: crawlers don't run JavaScript.
 */
export function shareMeta({
  title,
  description = SITE_DESCRIPTION,
  image = SHARE_IMAGE,
}: {
  title: string
  description?: string
  image?: string
}) {
  const imageUrl = absoluteUrl(image)
  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:image', content: imageUrl },
    { property: 'og:image:alt', content: title },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: imageUrl },
  ]
}
