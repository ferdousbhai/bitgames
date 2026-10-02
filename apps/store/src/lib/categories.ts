export interface Category {
  slug: string
  name: string
  emoji: string
  color: string
}

export const CATEGORIES: Category[] = [
  { slug: 'pop', name: 'Tap & Pop', emoji: '🎈', color: '#ff6b9d' },
  { slug: 'jump', name: 'Run & Jump', emoji: '🏃', color: '#ff9f1c' },
  { slug: 'space', name: 'Space', emoji: '🚀', color: '#6c63ff' },
  { slug: 'puzzle', name: 'Puzzles', emoji: '🧩', color: '#2ec4b6' },
  { slug: 'animals', name: 'Animals', emoji: '🐾', color: '#8ac926' },
]

/** Not a stored category: every game that can be played with others. */
export const TOGETHER: Category = { slug: 'together', name: 'Play Together', emoji: '👫', color: '#ffbe0b' }

export function findCategory(slug: string): Category | undefined {
  return slug === TOGETHER.slug ? TOGETHER : CATEGORIES.find((c) => c.slug === slug)
}
