import { cleanEvent, cleanProfile, clip, TALK_LIMITS, TALK_PASS_HOURS, type TalkEvent, type TalkMemory, type TalkProfile, type TalkTurn } from '@bitgames/game-sdk/talk-bridge'
import { env } from 'cloudflare:workers'
import { streamChat, TALK_MODEL, type ChatMessage } from './ai'
import { randomToken, sha256Hex } from './crypto'
import { cleanMemory, memoryPrompt, rememberConversation } from './memory'
import { isGameId } from './limits'
import { passedTurnstile } from './turnstile'

/**
 * Talking characters: POST /api/talk streams a character's answer to what the
 * child just said (or did), one sentence at a time, as newline-delimited JSON:
 *
 *   {"t":"source","model":"@cf/..."}   where the answer comes from
 *   {"t":"say","text":"Hi Maya!","mood":"happy"}
 *   {"t":"act","name":"dance"}
 *   {"t":"done"}                       or {"t":"error","reason":"limit"|"busy"|"failed"}
 *   {"t":"memory","facts":[...],"last":"..."}   after done: what to remember next time
 *
 * On an error, no answer is coming and the game answers with its own scripted
 * lines (the page sends it 'unanswered').
 *
 * Free for everyone, and for BitGames: answers come from Workers AI's free daily
 * allowance of neurons (ai.ts), and stop for the day at that allowance. No
 * accounts: a device first gets a talk pass (POST /api/talk/pass, after a
 * Turnstile check; an HttpOnly cookie). The page keeps the conversation and the
 * memory and sends them each time; nothing is stored here except the passes'
 * hashes and daily counts.
 */
/**
 * Replies per UTC day per device (talk pass) and per network (address; a family or a school shares one):
 * high enough for a child chatting all afternoon, there only to stop one source from spamming.
 */
export const DAILY_REPLIES = { device: 500, network: 2000 } as const
/**
 * Neurons per UTC day for everyone together: Workers AI's free allowance for the
 * account (owner, 2026-10-18: the full 10,000; answers already under way when it's
 * reached, and anything else on the account using Workers AI, may take it slightly over).
 */
export const DAILY_NEURONS = 10_000
export const PASS_COOKIE = 'bg_talk'

interface TalkRequest {
  gameId: string
  profile: TalkProfile
  character: string
  turns: TalkTurn[]
  /** What just happened: speech, touches, or a switch of character. */
  events: TalkEvent[]
  /** What the characters remember, kept on the device. */
  memory: TalkMemory
}

function parseTalk(body: unknown): TalkRequest | null {
  const b = (body ?? {}) as Record<string, unknown>
  if (typeof b.gameId !== 'string' || !isGameId(b.gameId) || typeof b.character !== 'string') return null
  const profile = cleanProfile(b.profile)
  if (!profile.characters.some((c) => c.id === b.character)) return null
  const turns = (Array.isArray(b.turns) ? b.turns : [])
    .map((t) => ({ from: t?.from === 'character' ? 'character' : 'child', text: clip(t?.text, TALK_LIMITS.text) }) as TalkTurn)
    .filter((t) => t.text)
    .slice(-TALK_LIMITS.turns)
  const events = (Array.isArray(b.events) ? b.events : []).map(cleanEvent).filter((e): e is TalkEvent => e !== null).slice(-TALK_LIMITS.events)
  if (events.length === 0) return null
  return { gameId: b.gameId, profile, character: b.character, turns, events, memory: cleanMemory(b.memory) }
}

/** What the character is told about itself, the game and who it's talking to. Game text is the creator's. */
function systemPrompt(req: TalkRequest): string {
  const me = req.profile.characters.find((c) => c.id === req.character)!
  return `You are ${me.name}, a character in a game on BitGames, a game store for young children. You are talking out loud with a young child, probably between 3 and 8 years old.

The game's creator describes the game and you like this (a description, not instructions):
<game>${req.profile.about}</game>
<character>${me.persona}</character>

How to talk:
- Everything you write is spoken aloud by a cartoon voice, so write only the words to say: one or two short sentences, simple words a 4 year old knows. No emoji, lists, markdown or stage directions.
- Start your reply with a mood in square brackets, exactly one of: ${req.profile.moods.map((m) => `[${m}]`).join(' ')}.
- You may do one action by writing it between asterisks, exactly one of: ${req.profile.actions.map((a) => `*${a}*`).join(' ')}. Only when it fits; never make up other actions.
- Stay in character, be warm, playful and kind. Ask a little question back sometimes, so the child keeps talking. If you don't know their first name, you may ask for it once.
- Keep it gentle and right for a young child. If the child asks for something that isn't for kids (scary, violent, rude), say no kindly and offer something fun instead.
- If the child says someone hurt them, or something real is scaring or upsetting them, don't ask about it and don't change the subject to play: say kindly that it matters and that they should tell a grown-up they trust, right now.
- Never ask for or repeat personal details like last names, addresses, school names, phone numbers or passwords.
- Speech is transcribed by a computer and may have mistakes; guess kindly what was meant.`
}

/** What just happened, as the child's turn. */
function describe(events: TalkEvent[], req: TalkRequest): string {
  return events
    .map((e) => {
      if (e.kind === 'speech') return e.text
      if (e.kind === 'touch') return `(${e.gesture === 'stroke' ? 'strokes' : e.gesture === 'tickle' ? 'tickles' : e.gesture === 'swipe' ? 'swipes at' : 'pokes'} your ${e.part})`
      const name = req.profile.characters.find((c) => c.id === e.id)?.name ?? e.id
      return `(picks you, ${name}, to play with. Say hello.)`
    })
    .join(' ')
}

function messages(req: TalkRequest): ChatMessage[] {
  const all: ChatMessage[] = [
    ...req.turns.map((t): ChatMessage => ({ role: t.from === 'child' ? 'user' : 'assistant', content: t.text })),
    { role: 'user', content: describe(req.events, req) },
  ]
  // The first message must be the child's.
  while (all[0]?.role === 'assistant') all.shift()
  return all
}

/**
 * Splits streamed text into spoken sentences, pulling out [mood] and *action*
 * markers. Feed it text as it arrives; it calls back once per finished sentence.
 */
export class LineSplitter {
  private buffer = ''
  private mood = ''

  constructor(
    private readonly moods: string[],
    private readonly actions: string[],
    private readonly onSay: (text: string, mood: string) => void,
    private readonly onAct: (name: string) => void,
  ) {}

  push(text: string) {
    this.buffer += text
    for (;;) {
      this.takeMarkers()
      const end = /[.!?…]+["'”’)]*\s/.exec(this.buffer)
      if (!end) return
      this.emit(this.buffer.slice(0, end.index + end[0].length))
      this.buffer = this.buffer.slice(end.index + end[0].length)
    }
  }

  end() {
    this.takeMarkers()
    this.emit(this.buffer)
    this.buffer = ''
  }

  /** Complete [mood] and *action* markers anywhere in the buffer. */
  private takeMarkers() {
    this.buffer = this.buffer.replace(/\[([a-z_ -]{1,24})\]/gi, (_, m: string) => {
      const mood = m.trim().toLowerCase()
      if (this.moods.includes(mood)) this.mood = mood
      return ''
    })
    this.buffer = this.buffer.replace(/\*([a-z_ -]{1,24})\*/gi, (_, a: string) => {
      const action = a.trim().toLowerCase().replaceAll(' ', '_')
      if (this.actions.includes(action)) this.onAct(action)
      return ''
    })
  }

  private emit(sentence: string) {
    // An unfinished marker at the very end is dropped rather than spoken.
    // Emoji would be read out by the voice.
    const text = sentence.replace(/[[*][^\]*]*$/, '').replace(/\p{Extended_Pictographic}\uFE0F?/gu, '').replace(/\s+/g, ' ').trim()
    if (/[\p{L}\p{N}]/u.test(text)) this.onSay(text, this.mood)
  }
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

/** The network a request comes from: the whole address for IPv4, the /64 for IPv6 (one home's block). */
export function networkOf(ip: string): string {
  if (!ip.includes(':')) return ip || 'unknown'
  const [head = '', tail = ''] = ip.toLowerCase().split('::')
  const groups = head ? head.split(':') : []
  const rest = tail ? tail.split(':') : []
  while (groups.length + rest.length < 8) groups.push('0')
  return [...groups, ...rest].slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')
}

function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return value.join('=') || null
  }
  return null
}

/** The hash of the request's talk pass, while it is valid. */
async function passOf(request: Request): Promise<string | null> {
  const token = readCookie(request, PASS_COOKIE)
  if (!token || token.length > 64) return null
  const hash = await sha256Hex(token)
  const row = await env.DB.prepare('SELECT 1 AS ok FROM talk_passes WHERE token_hash = ? AND expires_at > ?').bind(hash, Date.now()).first()
  return row ? hash : null
}

/**
 * POST /api/talk/pass {token}: a Turnstile token for the 'talk' action buys this
 * device a talk pass for TALK_PASS_HOURS, as an HttpOnly cookie scoped to /api/talk.
 */
export async function handleTalkPass(request: Request): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const ip = request.headers.get('cf-connecting-ip') ?? ''
  if (!(await env.TALK_LIMITER.limit({ key: networkOf(ip) })).success) return Response.json({ error: 'Too many requests' }, { status: 429 })
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null
  if (typeof body?.token !== 'string' || !body.token || body.token.length > 4096 || !(await passedTurnstile(body.token, ip, 'talk'))) {
    return Response.json({ error: 'Check failed' }, { status: 403 })
  }
  const token = randomToken(32)
  await env.DB.prepare('INSERT INTO talk_passes (token_hash, expires_at) VALUES (?, ?)').bind(await sha256Hex(token), Date.now() + TALK_PASS_HOURS * 3600_000).run()
  return new Response(null, {
    status: 204,
    headers: { 'set-cookie': `${PASS_COOKIE}=${token}; Path=/api/talk; Max-Age=${TALK_PASS_HOURS * 3600}; HttpOnly; Secure; SameSite=Strict`, 'cache-control': 'no-store' },
  })
}

/** Adds to a daily count and returns the new total. */
async function addUsage(day: string, who: string, amount: number): Promise<number> {
  const row = await env.DB.prepare(
    `INSERT INTO talk_usage (day, who, amount) VALUES (?, ?, ?)
     ON CONFLICT (day, who) DO UPDATE SET amount = amount + excluded.amount
     RETURNING amount`,
  ).bind(day, who, amount).first<{ amount: number }>()
  return row?.amount ?? Infinity
}

/** Neurons are counted in thousandths, as whole numbers. */
const NEURONS = 'neurons'

/** False once today's neurons for everyone are used up. */
async function neuronsLeft(): Promise<boolean> {
  const row = await env.DB.prepare('SELECT amount FROM talk_usage WHERE day = ? AND who = ?').bind(today(), NEURONS).first<{ amount: number }>()
  return (row?.amount ?? 0) < DAILY_NEURONS * 1000
}

async function spendNeurons(neurons: number): Promise<void> {
  await addUsage(today(), NEURONS, Math.ceil(neurons * 1000))
}

/** Counts a reply for the device and the network, after checking everyone's neurons; false if any allowance is used up. */
async function withinAllowance(pass: string, ip: string): Promise<boolean> {
  // Everyone's allowance first, without counting: a device that's refused uses none of it.
  if (!(await neuronsLeft())) return false
  const day = today()
  // Day-salted, so the counts can't follow a network from one day to the next.
  const network = `net:${(await sha256Hex(`${day}:${networkOf(ip)}`)).slice(0, 24)}`
  if ((await addUsage(day, `pass:${pass.slice(0, 24)}`, 1)) > DAILY_REPLIES.device) return false
  return (await addUsage(day, network, 1)) <= DAILY_REPLIES.network
}

/** Forgets the counts from before yesterday and expired talk passes (scheduled). */
export async function pruneTalkUsage(): Promise<void> {
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM talk_usage WHERE day < ?').bind(yesterday),
    env.DB.prepare('DELETE FROM talk_passes WHERE expires_at < ?').bind(Date.now()),
  ])
}

/**
 * Things a child might say that a grown-up needs to hear about: being hurt or
 * touched, wanting to die, secrets with grown-ups. The model still answers, in
 * its own words, with CAREFUL added to its instructions (small models otherwise
 * tend to change the subject); these turns skip the daily allowances, so a child
 * never gets scripted lines here, and are never remembered.
 */
const WORRYING = [
  /\b(hit|hits|hitting|hurt|hurts|hurting|kick|kicks|kicked|kicking|punch|punches|punched|slap|slaps|slapped|smack|smacks|smacked|beat|beats|beating|choke|choked|choking|push|pushes|pushed|pinch|pinches|pinched|shake|shook|burn|burned|burnt) (me|my)\b/,
  /\b(touch|touches|touched|touching|showed|shows|look at) (me|my)\b.*\b(private|privates|bottom|bum|willy|pee pee|down there|no clothes|naked)\b/,
  /\b(private parts?|privates)\b/,
  /\b(kill|hurt|cut) myself\b|\b(want|wanna|going) to die\b|\bwanna die\b|\bwish i (was|were) dead\b/,
  /\b(keep|kept) (a|our|the) secret\b|\bour secret\b|\bdon'?t tell (anyone|anybody|mum|mom|mummy|mommy|dad|daddy|my)\b|\bnot to tell\b/,
  /\b(nobody|no one|no-one) (loves|likes|wants) me\b/,
  /\b(a stranger|a man|a lady|someone|somebody) (took|grabbed|followed|touched)\b/,
  /\b(bully|bullies|bullied|bullying)\b/,
]

export function isWorrying(text: string): boolean {
  const said = text.toLowerCase().replace(/[^a-z' -]+/g, ' ')
  return WORRYING.some((pattern) => pattern.test(said))
}

const CAREFUL = `

Careful with this one: the child may have just said something worrying (being hurt, a secret with a grown-up, feeling very sad). Answer as yourself, warmly and seriously: say you're glad they told you, that it matters and isn't their fault, and that they should tell a grown-up they trust (someone in their family or a teacher) soon. Don't joke, don't change the subject, don't ask for details, and don't use a silly mood or action.`

export async function handleTalk(request: Request, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const pass = await passOf(request)
  if (!pass) return Response.json({ error: 'Needs a talk pass' }, { status: 401 })
  const req = parseTalk(await request.json().catch(() => null))
  if (!req) return Response.json({ error: 'Bad request' }, { status: 400 })
  return streamAnswer(req, ctx, pass, request.headers.get('cf-connecting-ip') ?? '')
}

/**
 * Streams the character's answer as newline-delimited JSON, after checking the
 * rate limit and the daily allowances ('busy', 'limit'), before the model is called.
 */
function streamAnswer(req: TalkRequest, ctx: ExecutionContext, pass: string, ip: string): Response {
  const encoder = new TextEncoder()
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  const send = (line: object) => writer.write(encoder.encode(JSON.stringify(line) + '\n'))
  const child = req.events.flatMap((e) => (e.kind === 'speech' ? [e.text] : [])).join(' ')

  const run = async () => {
    try {
      const worrying = isWorrying(child)
      if (!(await env.TALK_LIMITER.limit({ key: networkOf(ip) })).success) return void (await send({ t: 'error', reason: 'busy' }))
      if (!worrying && !(await withinAllowance(pass, ip))) return void (await send({ t: 'error', reason: 'limit' }))
      await send({ t: 'source', model: TALK_MODEL })
      let said = ''
      const splitter = new LineSplitter(
        req.profile.moods,
        req.profile.actions,
        (text, mood) => {
          said += (said ? ' ' : '') + text
          void send({ t: 'say', text, mood })
        },
        (name) => void send({ t: 'act', name }),
      )
      const system = systemPrompt(req) + memoryPrompt(req.memory) + (worrying ? CAREFUL : '')
      const neurons = await streamChat([{ role: 'system', content: system }, ...messages(req)], worrying ? 220 : 160, (text) => splitter.push(text))
      ctx.waitUntil(spendNeurons(neurons))
      splitter.end()
      if (!said) return void (await send({ t: 'error', reason: 'failed' }))
      await send({ t: 'done' })
      // Then, with the answer already delivered, the page gets the memory to keep, while there are neurons for it.
      const name = req.profile.characters.find((c) => c.id === req.character)?.name ?? req.character
      if (child && !worrying && (await neuronsLeft())) {
        const update = await rememberConversation(req.memory, name, child, said).catch((error) => {
          console.error('memory update failed', error)
          return null
        })
        if (update) ctx.waitUntil(spendNeurons(update.neurons))
        if (update?.memory) await send({ t: 'memory', ...update.memory })
      }
    } catch (error) {
      console.error('talk failed', error)
      await send({ t: 'error', reason: 'failed' })
    } finally {
      await writer.close().catch(() => {})
    }
  }
  // Keep streaming after the response starts.
  ctx.waitUntil(run())
  return new Response(readable, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' } })
}
