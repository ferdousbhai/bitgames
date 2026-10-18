import assert from 'node:assert/strict'
import { it } from 'node:test'
import { testStore } from './test-store.ts'

const ORIGIN = 'https://bitgames.store'
type Store = Awaited<ReturnType<typeof testStore>>

it('splits a streamed answer into spoken sentences with moods and actions', async () => {
  const s = await testStore()
  try {
    const said: [string, string][] = []
    const acts: string[] = []
    const split = new s.api.LineSplitter(['happy', 'silly'], ['dance'], (text, mood) => said.push([text, mood]), (name) => acts.push(name))
    for (const chunk of ['[hap', 'py] Hi Ma', 'ya! Want to *dan', 'ce* with me? ', '[silly] Wheee', ' *fly* ok'])
      split.push(chunk)
    split.end()
    assert.deepEqual(said, [['Hi Maya!', 'happy'], ['Want to with me?', 'happy'], ['Wheee ok', 'silly']])
    assert.deepEqual(acts, ['dance'])
  } finally {
    s.close()
  }
})

it('counts a network as an IPv4 address or an IPv6 /64', async () => {
  const s = await testStore()
  try {
    assert.equal(s.api.networkOf('203.0.113.7'), '203.0.113.7')
    assert.equal(s.api.networkOf('2001:db8:0:12:aaaa::1'), '2001:db8:0:12')
    assert.equal(s.api.networkOf('2001:DB8::1'), '2001:db8:0:0')
    assert.equal(s.api.networkOf(''), 'unknown')
  } finally {
    s.close()
  }
})

it('cleans a memory sent by the page down to size', async () => {
  const s = await testStore()
  try {
    const m = s.api.cleanMemory({ facts: ['a  dog', 'a dog', 7, 'x'.repeat(500), ...Array.from({ length: 40 }, (_, i) => `fact ${i}`)], last: 3 })
    assert.equal(m.facts[0], 'a dog')
    assert.equal(m.facts[1]!.length, 100)
    assert.equal(m.facts.length, s.api.MAX_FACTS)
    assert.equal(m.last, '')
    assert.deepEqual(s.api.cleanMemory(null), { facts: [], last: '' })
  } finally {
    s.close()
  }
})

/** Gets a talk pass through the real handler, with Turnstile's check mocked. */
async function talkPass(s: Store, ip = '203.0.113.7', verdict = { success: true, action: 'talk' }) {
  let checked: FormData | null = null
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://challenges.cloudflare.com/turnstile/v0/siteverify')
    checked = init?.body as FormData
    return Response.json(verdict)
  }
  try {
    const res = await s.api.handleTalkPass(new Request(`${ORIGIN}/api/talk/pass`, { method: 'POST', headers: { origin: ORIGIN, 'cf-connecting-ip': ip }, body: JSON.stringify({ token: 'turnstile-token' }) }))
    const cookie = res.headers.get('set-cookie')
    return { res, checked: checked as FormData | null, cookie: cookie ? cookie.split(';')[0]! : '' }
  } finally {
    globalThis.fetch = s.fetcher
  }
}

it('a talk pass needs a passed Turnstile check for the talk action, and only its hash is kept', async () => {
  const s = await testStore()
  try {
    const { res, checked, cookie } = await talkPass(s)
    assert.equal(res.status, 204)
    assert.equal(checked?.get('secret'), 'test-turnstile-secret')
    assert.equal(checked?.get('remoteip'), '203.0.113.7')
    assert.match(res.headers.get('set-cookie')!, /^bg_talk=[\w-]{43}; Path=\/api\/talk; Max-Age=43200; HttpOnly; Secure; SameSite=Strict$/)
    const token = cookie.slice('bg_talk='.length)
    const stored = s.db.prepare('SELECT token_hash FROM talk_passes').all().map((r) => r.token_hash)
    assert.equal(stored.length, 1)
    assert.notEqual(stored[0], token)

    assert.equal((await talkPass(s, '203.0.113.7', { success: false, action: 'talk' })).res.status, 403)
    assert.equal((await talkPass(s, '203.0.113.7', { success: true, action: 'creator-key' })).res.status, 403)
    assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM talk_passes').get()!.n, 1)
  } finally {
    s.close()
  }
})

/** A Workers AI chat stream (as Qwen3 sends it) that says `text` in small pieces, then reports `neurons`. */
function aiStream(text: string, neurons: number) {
  const chunks = [
    ...text.match(/.{1,7}/gs)!.map((piece) => ({ choices: [{ index: 0, delta: { content: piece }, finish_reason: null }], response: piece, usage: { prompt_tokens: 0, completion_tokens: 1, neurons: 0.03 } })),
    { choices: [], usage: { prompt_tokens: 0, completion_tokens: 0, neurons: 0 } },
    { response: '', usage: { prompt_tokens: 500, completion_tokens: 30, neurons } },
  ]
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n'
  // Split mid-line, the way a network does.
  const pieces = body.match(/[\s\S]{1,50}/g)!
  return new ReadableStream<Uint8Array>({ start(c) { for (const p of pieces) c.enqueue(new TextEncoder().encode(p)); c.close() } })
}

it('tells worrying words apart from play', async () => {
  const s = await testStore()
  try {
    for (const worrying of ['my daddy hit me', 'A big kid PUSHED ME at school', 'he touched my private parts', 'i want to die', "it's our secret don't tell mummy", 'nobody loves me', 'a man grabbed me', 'they bully me', 'i hurt my knee'])
      assert.equal(s.api.isWorrying(worrying), true, worrying)
    for (const fine of ['can you hit the ball', 'tickle my belly', 'tell me a secret joke', 'push the button', 'what is your favourite colour'])
      assert.equal(s.api.isWorrying(fine), false, fine)
  } finally {
    s.close()
  }
})

it('keeps addresses, schools and numbers out of memory', async () => {
  const s = await testStore()
  try {
    const m = s.api.cleanMemory({ facts: ['Name is Maya', 'Lives at 12 Oak Street', 'Goes to Hill Primary School', 'Phone is 0123 456', 'has a dog called Pip', 'Allergic to nuts'], last: 'Maya told me her address.' })
    assert.deepEqual(m, { facts: ['Name is Maya', 'has a dog called Pip'], last: '' })
  } finally {
    s.close()
  }
})

it('talk needs a pass, streams Workers AI sentence by sentence, hands back the memory, and stops at the daily allowances', async () => {
  const s = await testStore()
  try {
    const profile = { about: 'A pet.', characters: [{ id: 'tom', name: 'Tom', persona: 'A cheeky cat.' }], actions: ['dance'], moods: ['happy', 'sad'] }
    const body = {
      gameId: s.game.id, profile, character: 'tom',
      turns: [{ from: 'character', text: 'Hello!' }, { from: 'child', text: 'Hi Tom' }],
      events: [{ kind: 'touch', part: 'belly', gesture: 'tickle' }, { kind: 'speech', text: 'What do you like?' }] as unknown[],
      memory: { facts: [] as string[], last: '' },
    }
    const waits: Promise<unknown>[] = []
    const ctx = { waitUntil: (p: Promise<unknown>) => void waits.push(p), passThroughOnException() {} } as unknown as ExecutionContext
    const talk = (cookie: string, ip = '203.0.113.7') =>
      s.api.handleTalk(new Request(`${ORIGIN}/api/talk`, { method: 'POST', headers: { cookie, origin: ORIGIN, 'cf-connecting-ip': ip }, body: JSON.stringify(body) }), ctx)
    const lines = async (res: Response) => {
      const text = await res.text()
      while (waits.length) await Promise.all(waits.splice(0))
      return text.trim().split('\n').map((l) => JSON.parse(l))
    }
    const neurons = () => Number(s.db.prepare("SELECT amount FROM talk_usage WHERE who = 'neurons'").get()?.amount ?? 0) / 1000

    assert.equal((await talk('')).status, 401)
    assert.equal((await talk('bg_talk=forged')).status, 401)
    const { cookie } = await talkPass(s)

    let sent: { messages: { role: string; content: string }[]; stream: boolean; max_tokens: number } | null = null
    let memoryRequest: { messages: { role: string; content: string }[]; response_format: { type: string } } | null = null
    s.onAi(async (model, inputs, options) => {
      assert.equal(model, '@cf/qwen/qwen3-30b-a3b-fp8')
      // Through the bitgames AI Gateway, so it's logged; never a cached answer.
      assert.deepEqual(options, { gateway: { id: 'bitgames', skipCache: true } })
      const input = inputs as typeof sent & typeof memoryRequest
      if (!input!.stream) {
        memoryRequest = input
        // The model keeps an address despite being told not to; it's dropped.
        return { response: { facts: ['Name is Maya', 'has a dog called Pip', 'Lives at 12 Oak Street'], last: 'Talked about favourite foods.' }, usage: { neurons: 2.5 } }
      }
      sent = input
      return aiStream('<think>\n\n</think>[happy] Fish! 🐟 Crunchy fish. *dance* What about you, Maya?', 3.5)
    })
    const res = await talk(cookie)
    assert.equal(res.headers.get('content-type'), 'application/x-ndjson; charset=utf-8')
    assert.deepEqual(await lines(res), [
      // Where the answer comes from, for the grown-ups' note on the page.
      { t: 'source', model: '@cf/qwen/qwen3-30b-a3b-fp8' },
      { t: 'say', text: 'Fish!', mood: 'happy' },
      { t: 'say', text: 'Crunchy fish.', mood: 'happy' },
      { t: 'act', name: 'dance' },
      { t: 'say', text: 'What about you, Maya?', mood: 'happy' },
      { t: 'done' },
      // The page keeps this on the device and sends it next time.
      { t: 'memory', facts: ['Name is Maya', 'has a dog called Pip'], last: 'Talked about favourite foods.' },
    ])
    const request = sent!
    assert.equal(request.stream, true)
    assert.equal(request.messages[0]!.role, 'system')
    assert.match(request.messages[0]!.content, /You are Tom/)
    assert.doesNotMatch(request.messages[0]!.content, /What you remember/)
    // The conversation starts with the child; the character's opening line is dropped. No thinking, for fast first words.
    assert.deepEqual(request.messages.map((m) => m.role), ['system', 'user', 'user'])
    assert.equal(request.messages.at(-1)!.content, '(tickles your belly) What do you like? /no_think')
    const mem = memoryRequest!
    assert.equal(mem.response_format.type, 'json_schema')
    assert.match(mem.messages[0]!.content, /Never keep: addresses/)
    assert.match(mem.messages[1]!.content, /Child: What do you like\?\nTom: Fish! Crunchy fish\. What about you, Maya\?/)
    // Both calls' neurons are counted for everyone.
    assert.equal(neurons(), 6)

    // The memory the page sends comes back into the character's instructions.
    body.memory = { facts: ['has a dog called Pip'], last: 'Talked about favourite foods.' }
    await lines(await talk(cookie))
    assert.match(sent!.messages[0]!.content, /What you remember about this child[\s\S]*- has a dog called Pip[\s\S]*Last time: Talked about favourite foods\./)

    // Replies count for the device and the network; nothing names the address.
    const usage = () => Object.fromEntries(s.db.prepare("SELECT who, amount FROM talk_usage WHERE who != 'neurons'").all().map((r) => [String(r.who).split(':')[0], r.amount]))
    assert.deepEqual(usage(), { net: 2, pass: 2 })
    assert.ok(s.db.prepare('SELECT who FROM talk_usage').all().every((r) => !String(r.who).includes('203.0.113')))

    // Worrying words: the model still answers, told to take it seriously; past the daily allowances, and never remembered.
    s.db.prepare("UPDATE talk_usage SET amount = ? WHERE who LIKE 'pass:%'").run(s.api.DAILY_REPLIES.device)
    memoryRequest = null
    body.events = [{ kind: 'speech', text: 'my daddy hit me' }]
    const careful = await lines(await talk(cookie))
    assert.equal(careful[0].t, 'source')
    assert.equal(careful.at(-1).t, 'done')
    assert.match(sent!.messages[0]!.content, /Careful with this one/)
    assert.equal(memoryRequest, null)
    s.db.prepare("UPDATE talk_usage SET amount = 2 WHERE who LIKE 'pass:%'").run()
    body.events = [{ kind: 'speech', text: 'What do you like?' }]
    await lines(await talk(cookie))
    assert.doesNotMatch(sent!.messages[0]!.content, /Careful with this one/)

    // Over an allowance: no call to the model, and the page hands the game its own lines.
    const refusedWhen = async (who: string, amount: number) => {
      s.db.prepare('UPDATE talk_usage SET amount = ? WHERE who LIKE ?').run(amount, `${who}%`)
      assert.deepEqual(await lines(await talk(cookie)), [{ t: 'error', reason: 'limit' }])
      s.db.prepare("UPDATE talk_usage SET amount = 0 WHERE who != 'neurons'").run()
      s.db.prepare("UPDATE talk_usage SET amount = 6000 WHERE who = 'neurons'").run()
    }
    await refusedWhen('pass:', s.api.DAILY_REPLIES.device)
    await refusedWhen('net:', s.api.DAILY_REPLIES.network)
    await refusedWhen('neurons', s.api.DAILY_NEURONS * 1000)
    // A device refused for everyone's neurons isn't counted.
    s.db.prepare("UPDATE talk_usage SET amount = ? WHERE who = 'neurons'").run(s.api.DAILY_NEURONS * 1000)
    await lines(await talk(cookie))
    assert.deepEqual(usage(), { net: 0, pass: 0 })
    // A new pass doesn't escape the network's allowance.
    s.db.prepare("UPDATE talk_usage SET amount = 0 WHERE who = 'neurons'").run()
    s.db.prepare('UPDATE talk_usage SET amount = ? WHERE who LIKE ?').run(s.api.DAILY_REPLIES.network, 'net:%')
    const fresh = await talkPass(s)
    assert.deepEqual(await lines(await talk(fresh.cookie)), [{ t: 'error', reason: 'limit' }])

    // A character the game didn't describe is refused.
    body.character = 'stranger'
    assert.equal((await talk(cookie)).status, 400)
  } finally {
    s.close()
  }
})
