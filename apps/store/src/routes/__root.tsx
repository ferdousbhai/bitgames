import { HeadContent, Link, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { Header } from '#/components/Header'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#e8f4ff' },
      { title: 'BitGames: fun games to play' },
      { name: 'description', content: 'Bright, simple games for kids. No ads, just play.' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      {
        rel: 'icon',
        href: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎮</text></svg>",
      },
    ],
  }),
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
