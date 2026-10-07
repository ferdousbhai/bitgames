import assert from 'node:assert/strict'
import { it } from 'node:test'
import { changePreference, emptyPreferences, parsePreferences } from '../src/lib/game-preferences.ts'

it('favorites toggle, hiding removes the favorite, and restoring does not favorite it again', () => {
  const favorite = changePreference(emptyPreferences, 'one', 'favorite')
  assert.deepEqual(favorite.favorites, ['one'])
  assert.deepEqual(changePreference(favorite, 'one', 'favorite'), emptyPreferences)
  const hidden = changePreference(favorite, 'one', 'hide')
  assert.deepEqual(hidden, { favorites: [], hidden: ['one'] })
  assert.deepEqual(changePreference(hidden, 'one', 'hide'), hidden)
  assert.deepEqual(changePreference(hidden, 'one', 'favorite'), hidden)
  assert.deepEqual(changePreference(hidden, 'one', 'restore'), emptyPreferences)
})
it('stored preferences reject malformed data, deduplicate IDs and give hiding priority', () => {
  for (const value of [null, '{', 'null', '42']) assert.deepEqual(parsePreferences(value), emptyPreferences)
  assert.deepEqual(parsePreferences('{"favorites":["one","one",4,"two"],"hidden":["two","two",false]}'), { favorites: ['one'], hidden: ['two'] })
  assert.deepEqual(parsePreferences('{"favorites":{},"hidden":true}'), emptyPreferences)
})
