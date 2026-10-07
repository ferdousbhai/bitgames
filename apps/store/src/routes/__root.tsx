import { HeadContent, Link, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { Header } from '#/components/Header'
import { SITE_NAME, SITE_TITLE, absoluteUrl, shareMeta } from '#/lib/share'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  // Pages render in the browser (defaultSsr: false in start.ts). The root allows routes to opt in to
  // server-side loaders and head tags ('data-only'), so shared links get the right preview.
  ssr: 'data-only',
  head: ({ matches }) => {
    // The page's own address, never its query: /game/x?play=true previews and indexes as /game/x.
    const canonical = absoluteUrl(matches.at(-1)?.pathname ?? '/')
    return {
      meta: [
        { charSet: 'utf-8' },
        // viewport-fit=cover: use the whole screen, edge to edge; the layout keeps clear of notches and the home bar.
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#e8f4ff' },
        // How a shared link looks in Messages, WhatsApp, Facebook, X and Slack. Pages replace these by name.
        ...shareMeta({ title: SITE_TITLE }),
        { property: 'og:site_name', content: SITE_NAME },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: canonical },
        { name: 'twitter:card', content: 'summary_large_image' },
        // Added to an iPad or phone home screen, BitGames opens like an app, without the browser's bars.
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'apple-mobile-web-app-title', content: 'BitGames' },
      ],
      links: [
        { rel: 'stylesheet', href: appCss },
        { rel: 'canonical', href: canonical },
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
        {
          rel: 'icon',
          href: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎮</text></svg>",
        },
      ],
    }
  },
  shellComponent: RootDocument,
  component: () => <Outlet />,
  notFoundComponent: NotFound,
  errorComponent: Oops,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased">
        <Header />
        <main className="mx-auto max-w-7xl px-4 pb-20 pt-4">{children}</main>
        <footer className="pb-10 text-center text-ink-soft">
          Made with <span aria-label="love">💜</span> · No ads, just play
        </footer>
        <Scripts />
      </body>
    </html>
  )
}

function Oops({ reset }: { reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <span aria-hidden className="float text-8xl">🙃</span>
      <h1 className="text-3xl font-bold">Whoops! Something went wobbly.</h1>
      <button type="button" onClick={reset} className="toy rounded-full px-6 py-3 text-xl font-semibold text-white">
        🔄 Try again
      </button>
    </div>
  )
}

function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <span aria-hidden className="float text-8xl">🙈</span>
      <h1 className="text-3xl font-bold">Oops! We can't find that.</h1>
      <Link to="/" className="toy rounded-full px-6 py-3 text-xl font-semibold text-white">
        🏠 Go home
      </Link>
    </div>
  )
}
