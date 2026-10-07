export const PREFERENCES_KEY = 'bitgames:game-preferences'
export type GamePreferences = { favorites: string[]; hidden: string[] }
export const emptyPreferences: GamePreferences = { favorites: [], hidden: [] }

export function parsePreferences(value: string | null): GamePreferences {
  try {
    const data = JSON.parse(value ?? '{}')
    const ids = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string'))] : []
    const hidden = ids(data.hidden)
    return { favorites: ids(data.favorites).filter((id) => !hidden.includes(id)), hidden }
  } catch {
    return emptyPreferences
  }
}

export function changePreference(current: GamePreferences, id: string, action: 'favorite' | 'hide' | 'restore'): GamePreferences {
  if (action === 'restore') return { ...current, hidden: current.hidden.filter((key) => key !== id) }
  if (action === 'hide') return { favorites: current.favorites.filter((key) => key !== id), hidden: [...new Set([...current.hidden, id])] }
  if (current.hidden.includes(id)) return current
  return { ...current, favorites: current.favorites.includes(id) ? current.favorites.filter((key) => key !== id) : [...current.favorites, id] }
}
