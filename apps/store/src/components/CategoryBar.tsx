import { Link } from '@tanstack/react-router'
import { CATEGORIES, TOGETHER } from '#/lib/categories'

export function CategoryBar() {
  return (
    <nav aria-label="Kinds of games" className="no-scrollbar -mx-4 overflow-x-auto px-4 py-2">
      <ul className="flex gap-3">
        {[TOGETHER, ...CATEGORIES].map((c) => (
          <li key={c.slug} className="shrink-0">
            <Link
              to="/category/$slug"
              params={{ slug: c.slug }}
              className="toy flex items-center gap-2 rounded-full px-5 py-3 text-lg font-semibold text-white"
              style={{ '--toy-bg': c.color } as React.CSSProperties}
              activeProps={{ className: 'ring-4 ring-white' }}
            >
              <span aria-hidden className="text-2xl">{c.emoji}</span>
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
