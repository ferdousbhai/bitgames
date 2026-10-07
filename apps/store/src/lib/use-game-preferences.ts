import { useSyncExternalStore } from 'react'
import { changePreference, emptyPreferences, parsePreferences, PREFERENCES_KEY, type GamePreferences } from './game-preferences'

let snapshot: GamePreferences = emptyPreferences
let initialized = false
const listeners = new Set<() => void>()
function read() {
  try { snapshot = parsePreferences(localStorage.getItem(PREFERENCES_KEY)) } catch { /* Keep session preferences when storage is unavailable. */ }
}
function emit() { listeners.forEach((listener) => listener()) }
function getSnapshot() {
  if (!initialized && typeof window !== 'undefined') { initialized = true; read() }
  return snapshot
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === PREFERENCES_KEY || event.key === null) { read(); emit() }
  }
  window.addEventListener('storage', onStorage)
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage) }
}
export function updateGamePreference(id: string, action: 'favorite' | 'hide' | 'restore') {
  // Merge the latest choices from other tabs before writing.
  read()
  snapshot = changePreference(snapshot, id, action)
  try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(snapshot)) } catch { /* Still works for this session. */ }
  emit()
}
export function useGamePreferences() {
  return useSyncExternalStore(subscribe, getSnapshot, () => emptyPreferences)
}
