import assert from 'node:assert/strict'
import { it } from 'node:test'
import { nearbyRoomName, networkPrefix } from '../src/server/nearby.ts'

it('devices behind one home connection share a network prefix', () => {
  assert.equal(networkPrefix('203.0.113.7'), '203.0.113.7')
  // IPv6 devices at home share the /64 however the address is written.
  assert.equal(networkPrefix('2001:db8:85a3:12::8a2e:370:7334'), '2001:db8:85a3:12::/64')
  assert.equal(networkPrefix('2001:0db8:85a3:0012:1111:2222:3333:4444'), '2001:db8:85a3:12::/64')
  assert.equal(networkPrefix('2001:db8::1'), '2001:db8:0:0::/64')
  assert.equal(networkPrefix(''), null)
  assert.equal(networkPrefix('not-an-ip'), null)
  assert.equal(networkPrefix('1:2:3'), null)
})

it('nearby rooms are per game and never reveal the address', async () => {
  const a = await nearbyRoomName('crash-racers', '203.0.113.7')
  assert.match(a!, /^crash-racers\/near\/[0-9a-f]{32}$/)
  assert.ok(!a!.includes('203'))
  assert.equal(await nearbyRoomName('crash-racers', '203.0.113.7'), a)
  assert.notEqual(await nearbyRoomName('paint-splash', '203.0.113.7'), a)
  assert.notEqual(await nearbyRoomName('crash-racers', '203.0.113.8'), a)
  assert.equal(await nearbyRoomName('crash-racers', ''), null)
})
