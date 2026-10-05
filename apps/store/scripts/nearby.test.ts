import assert from 'node:assert/strict'
import { it } from 'node:test'
import { isPublicAddress, publicAddresses } from '../src/lib/network.ts'
import { chosenAddress, codeFor, type Hosted, isRoomCode, listingId, mergeListings, nearbyKey, networkPrefix, openListings } from '../src/server/nearby.ts'

it('devices behind one home connection share a network prefix', () => {
  assert.equal(networkPrefix('203.0.113.7'), '203.0.113.7')
  // IPv6 devices at home share the /64 however the address is written.
  assert.equal(networkPrefix('2001:db8:85a3:12::8a2e:370:7334'), '2001:db8:85a3:12::/64')
  assert.equal(networkPrefix('2001:0db8:85a3:0012:1111:2222:3333:4444'), '2001:db8:85a3:12::/64')
  assert.equal(networkPrefix('2001:db8::1'), '2001:db8:0:0::/64')
  assert.equal(networkPrefix(''), null)
  assert.equal(networkPrefix('not-an-ip'), null)
  assert.equal(networkPrefix('1:2:3'), null)
  assert.equal(networkPrefix('300.1.1.1'), null)
  assert.equal(networkPrefix('1::2::3'), null)
})

it('nearby lists are per game and never reveal the address', async () => {
  const a = await nearbyKey('crash-racers', '203.0.113.7')
  assert.match(a!, /^crash-racers\/nearby\/[0-9a-f]{32}$/)
  assert.ok(!a!.includes('203'))
  assert.equal(await nearbyKey('crash-racers', '203.0.113.7'), a)
  assert.notEqual(await nearbyKey('paint-splash', '203.0.113.7'), a)
  assert.notEqual(await nearbyKey('crash-racers', '203.0.113.8'), a)
  assert.equal(await nearbyKey('crash-racers', ''), null)
})

it('only public addresses can be claimed from STUN', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '81.2.69.160', '2606:4700:4700::1111', '2a01:4f8:1c1c::1']) assert.ok(isPublicAddress(ip), ip)
  for (const ip of [
    '10.0.0.1', '192.168.1.20', '172.16.5.4', '172.31.255.1', '127.0.0.1', '169.254.1.1', '100.64.0.1', '0.0.0.0',
    '224.0.0.1', '255.255.255.255', '192.0.2.1', '203.0.113.7', '::1', 'fe80::1', 'fd00::1', '2001:db8::1', '::ffff:8.8.8.8',
    'abc.local', '4f0e2b6c-1d1a-4f3e-9a0b-1234567890ab.local', '', '8.8.8', '8.8.8.8.8', '1.2.3.4 ',
  ]) assert.ok(!isPublicAddress(ip), ip)
})

it('a device names at most four distinct networks', () => {
  assert.deepEqual(publicAddresses(['10.0.0.2', '8.8.8.8', '8.8.8.8', '2606:4700::1', '2606:4700::2', 'x.local']), ['8.8.8.8', '2606:4700::1'])
  assert.equal(publicAddresses(['1.1.1.1', '1.1.1.2', '1.1.1.3', '1.1.1.4', '1.1.1.5']).length, 4)
})

it('the caller’s own address is trusted; claimed ones must be public', () => {
  assert.equal(chosenAddress('127.0.0.1', null), '127.0.0.1')
  assert.equal(chosenAddress('127.0.0.1', ''), '127.0.0.1')
  assert.equal(chosenAddress('', null), null)
  assert.equal(chosenAddress('127.0.0.1', '8.8.8.8'), '8.8.8.8')
  assert.equal(chosenAddress('127.0.0.1', '192.168.0.4'), null)
  assert.equal(chosenAddress('127.0.0.1', '../../x'), null)
})

it('an IPv4 device and an IPv6 device at home still find each other', async () => {
  // The tablet reaches BitGames over IPv4; the phone over IPv6. The tablet's browser
  // also learns its IPv6 address from STUN, so both are on the IPv6 list.
  const tablet = [await nearbyKey('tank-clash', '81.2.69.160'), await nearbyKey('tank-clash', '2a01:4f8:1c1c:51::1')]
  const phone = [await nearbyKey('tank-clash', '2a01:4f8:1c1c:51:aaaa:bbbb:cccc:dddd')]
  assert.ok(phone.some((key) => tablet.includes(key)))
  // A neighbour on another connection shares neither.
  const neighbour = [await nearbyKey('tank-clash', '81.2.69.161'), await nearbyKey('tank-clash', '2a01:4f8:1c1c:52::1')]
  assert.ok(!neighbour.some((key) => tablet.includes(key)))
})

it('room codes are three animals', () => {
  assert.ok(isRoomCode('0-11-5'))
  assert.ok(!isRoomCode('0-12-5'))
  assert.ok(!isRoomCode('1-2'))
  assert.ok(!isRoomCode('listed/abc'))
  assert.ok(!isRoomCode(7))
})

it('lists show open games once, oldest first, without their codes', async () => {
  const host = async (peer: string, code: string, extra: Partial<Hosted> = {}): Promise<Hosted> => ({
    id: await listingId(peer), peer, code, animal: 3, players: 1, max: 4, created: 10, ...extra,
  })
  const a = await host('aaaaaaaaaaaaaaaa', '1-2-3', { created: 20 })
  const b = await host('bbbbbbbbbbbbbbbb', '4-5-6', { created: 5 })
  const full = await host('cccccccccccccccc', '7-8-9', { players: 4 })
  // The same host reached on two addresses.
  const list = openListings([a, b, full, { ...a }])
  assert.deepEqual(list.map((l) => l.id), [b.id, a.id])
  assert.ok(list.every((l) => !('code' in l) && !('peer' in l)))
  assert.ok(!JSON.stringify(list).includes('aaaaaaaaaaaaaaaa'))
  assert.equal(codeFor([a, b, full], a.id), '1-2-3')
  assert.equal(codeFor([a, b, full], full.id), null)
  assert.equal(codeFor([a, b], 'nope'), null)
  // A device on two networks hears the same host on both lists and shows it once.
  assert.deepEqual(mergeListings([[openListings([a])[0]!], openListings([a, b])]).map((l) => l.id), [b.id, a.id])
})
