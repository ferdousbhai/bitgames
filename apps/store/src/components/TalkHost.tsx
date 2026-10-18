import {
  cleanEvent,
  isTalkMessage,
  TALK_LIMITS,
  TALK_PASS_HOURS,
  TALK_BRIDGE,
  type GameToPageTalk,
  type PageToGameTalk,
  type TalkEvent,
  type TalkProfile,
  type TalkState,
  type TalkMemory,
  type TalkTurn,
  type TalkUnansweredReason,
  type TalkUnbridged,
} from '@bitgames/game-sdk/talk-bridge'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { Turnstile } from './Turnstile'

/**
 * Talking characters, page side: for a game that uses /vendor/bitgames/talk-1.js,
 * the page listens with this device's speech recognition (on an iPad, Apple's),
 * asks /api/talk for the character's answer and hands it to the game one
 * sentence at a time, as it streams in. The game speaks it with the device's
 * voices. The game never gets the microphone or the network.
 *
 * No accounts: the device gets a talk pass after an (invisible, unless it needs
 * a tap) Turnstile check, and what the characters remember about the child is
 * kept here, in this device's storage, per game.
 */

interface Recognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
  start(): void
  abort(): void
}
type RecognitionClass = new () => Recognition

function recognitionClass(): RecognitionClass | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** Where the latest answer came from, for the grown-ups' note next to the 🎤. */
type Source = { kind: 'ai'; model: string } | { kind: 'scripted'; reason: TalkUnansweredReason }

const SCRIPTED_WHY = { limit: "today's free AI is used up", busy: 'too many in a row', failed: 'AI unavailable' } as const

/** Small and quiet: children shouldn't notice it; a grown-up looking for it can read it. */
function sourceNote(source: Source): string {
  if (source.kind === 'ai') return `AI · ${source.model.split('/').pop()}`
  return `Scripted lines · ${SCRIPTED_WHY[source.reason]}`
}

const memoryKey = (gameId: string) => `bitgames:talk-memory:${gameId}`
/** Until when this device's talk pass (an HttpOnly cookie) should still be good, so the check runs ahead of time. */
const PASS_KEY = 'bitgames:talk-pass-until'
/** How long an answer waits for the Turnstile check before the game answers by itself. */
const PASS_WAIT_MS = 6000
/** Check again an hour before the pass runs out, so it never runs out mid-conversation. */
const PASS_MS = (TALK_PASS_HOURS - 1) * 3600_000

function loadMemory(gameId: string): TalkMemory {
  try {
    const m = JSON.parse(localStorage.getItem(memoryKey(gameId)) ?? 'null') as Partial<TalkMemory> | null
    if (m && Array.isArray(m.facts)) return { facts: m.facts.filter((f) => typeof f === 'string'), last: typeof m.last === 'string' ? m.last : '' }
  } catch {
    // Storage blocked: the characters just don't remember.
  }
  return { facts: [], last: '' }
}

function saveMemory(gameId: string, memory: TalkMemory) {
  try {
    localStorage.setItem(memoryKey(gameId), JSON.stringify(memory))
  } catch {
    // Storage blocked.
  }
}

function passLooksValid(): boolean {
  try {
    return Number(localStorage.getItem(PASS_KEY)) > Date.now()
  } catch {
    return false
  }
}

export function TalkHost({ frame, gameId, crowded }: { frame: RefObject<HTMLIFrameElement | null>; gameId: string; crowded: boolean }) {
  const [active, setActive] = useState(false)
  const [mic, setMic] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const profile = useRef<TalkProfile | null>(null)
  const character = useRef('')
  const turns = useRef<TalkTurn[]>([])
  /** Touches since the child last spoke, sent along as context. */
  const touches = useRef<Extract<TalkEvent, { kind: 'touch' }>[]>([])
  const recognition = useRef<Recognition | null>(null)
  const micWanted = useRef(false)
  const gameSpeaking = useRef(false)
  const inFlight = useRef<AbortController | null>(null)
  const [checking, setChecking] = useState(false)
  const [source, setSource] = useState<Source | null>(null)
  const passWaiters = useRef<((ok: boolean) => void)[]>([])

  /** Runs the Turnstile check and trades its token for a talk pass. */
  const getPass = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        passWaiters.current.push(resolve)
        setChecking(true)
      }),
    [],
  )
  const passChecked = useCallback(async (token: string | null) => {
    const res = token
      ? await fetch('/api/talk/pass', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
        }).catch(() => null)
      : null
    const ok = Boolean(res?.ok)
    if (ok) {
      try {
        localStorage.setItem(PASS_KEY, String(Date.now() + PASS_MS))
      } catch {
        // Storage blocked: the pass is still in its cookie.
      }
    }
    setChecking(false)
    const waiters = passWaiters.current
    passWaiters.current = []
    for (const resolve of waiters) resolve(ok)
  }, [])

  const toGame = useCallback(
    (message: TalkUnbridged<PageToGameTalk>) => frame.current?.contentWindow?.postMessage({ bridge: TALK_BRIDGE, ...message }, '*'),
    [frame],
  )
  const show = useCallback((state: TalkState) => toGame({ type: 'state', state }), [toGame])
  const idle = useCallback(() => show(micWanted.current ? 'listening' : 'off'), [show])

  /** Asks for the character's answer and streams it to the game. */
  const reply = useCallback(
    async (events: TalkEvent[]) => {
      if (!profile.current || !character.current) return
      inFlight.current?.abort()
      const abort = new AbortController()
      inFlight.current = abort
      show('thinking')
      let said = ''
      let finished = false
      /** The answer is over (the memory may still follow): the next one can start. */
      const finish = () => {
        if (finished) return
        finished = true
        // What was said joins the history now, so the next request doesn't send the child's words twice.
        const child = events.flatMap((e): TalkTurn[] => (e.kind === 'speech' ? [{ from: 'child', text: e.text }] : []))
        // Only for an answer that came (not one cut short by a switch of pal, nor scripted lines from the game).
        if (said && !abort.signal.aborted) turns.current = [...turns.current, ...child, { from: 'character', text: said } satisfies TalkTurn].slice(-TALK_LIMITS.turns)
        if (inFlight.current === abort) inFlight.current = null
        if (!inFlight.current) idle()
      }
      /** No answer is coming (see TalkUnansweredReason): the game answers by itself. */
      const unanswered = (reason: TalkUnansweredReason) => {
        toGame({ type: 'unanswered', events, reason })
        setSource({ kind: 'scripted', reason })
      }
      try {
        const post = () =>
          fetch('/api/talk', {
            method: 'POST',
            credentials: 'same-origin',
            signal: abort.signal,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              gameId,
              profile: profile.current,
              character: character.current,
              turns: turns.current,
              events,
              memory: loadMemory(gameId),
            }),
          })
        let res = await post()
        // No talk pass yet, or it ran out: get one, then ask again. If the check needs a tap (it shows
        // then), the game answers by itself meanwhile, and the pass is there for the next turn.
        if (res.status === 401) {
          const waited = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), PASS_WAIT_MS))
          if (await Promise.race([getPass(), waited])) res = await post()
        }
        if (!res.ok || !res.body) throw new Error(`talk ${res.status}`)
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
        let buffer = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += value
          let nl: number
          while ((nl = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, nl)
            buffer = buffer.slice(nl + 1)
            let msg: { t?: string; text?: string; mood?: string; name?: string; reason?: string; facts?: string[]; last?: string; model?: string }
            try {
              msg = JSON.parse(line)
            } catch {
              continue
            }
            if (msg.t === 'say' && msg.text) {
              said += (said ? ' ' : '') + msg.text
              toGame({ type: 'say', text: msg.text, mood: msg.mood ?? '' })
            } else if (msg.t === 'act' && msg.name) toGame({ type: 'action', name: msg.name })
            else if (msg.t === 'source') setSource({ kind: 'ai', model: msg.model ?? '' })
            else if (msg.t === 'done') finish()
            else if (msg.t === 'memory') saveMemory(gameId, { facts: msg.facts ?? [], last: msg.last ?? '' })
            else if (msg.t === 'error') {
              unanswered(msg.reason === 'limit' || msg.reason === 'busy' ? msg.reason : 'failed')
              finish()
            }
          }
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') return
        if (!finished) unanswered('failed')
      } finally {
        finish()
      }
    },
    [gameId, toGame, show, idle, getPass],
  )

  const heard = useCallback(
    (text: string) => {
      toGame({ type: 'hearing', text, final: true })
      const events = [...touches.current, { kind: 'speech', text } as TalkEvent]
      touches.current = []
      void reply(events)
    },
    [toGame, reply],
  )

  const listenNow = useCallback(() => {
    const rec = recognition.current
    if (!rec || !micWanted.current || gameSpeaking.current) return
    try {
      rec.start()
    } catch {
      // Already listening.
    }
  }, [])

  const stopMic = useCallback(() => {
    micWanted.current = false
    recognition.current?.abort()
    recognition.current = null
    setMic(false)
    if (!inFlight.current) idle()
  }, [idle])

  /** Must run inside a tap: browsers only allow the microphone after one. */
  const startMic = useCallback(() => {
    const Recognition = recognitionClass()
    if (!Recognition) {
      setBlocked(true)
      return
    }
    const rec = new Recognition()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = navigator.language || 'en-US'
    rec.onresult = (event) => {
      let partial = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]!
        const text = result[0].transcript.trim()
        if (!text) continue
        if (result.isFinal) heard(text)
        else partial += `${text} `
      }
      if (partial && !inFlight.current) {
        show('hearing')
        toGame({ type: 'hearing', text: partial.trim(), final: false })
      }
    }
    rec.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setBlocked(true)
        stopMic()
      }
    }
    // Recognition stops by itself after a pause; start it again while the mic is wanted.
    rec.onend = () => {
      if (recognition.current === rec) setTimeout(listenNow, 200)
    }
    recognition.current = rec
    micWanted.current = true
    setBlocked(false)
    setMic(true)
    if (!inFlight.current) show('listening')
    listenNow()
  }, [heard, show, toGame, stopMic, listenNow])

  // Messages from the game.
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || !isTalkMessage<GameToPageTalk>(event.data)) return
      const msg = event.data
      if (msg.type === 'hello') toGame({ type: 'hello' })
      else if (msg.type === 'open') {
        profile.current = msg.profile
        character.current = msg.character
        setActive(true)
        idle()
        // Check ahead, so the first answer doesn't wait for it.
        if (!passLooksValid()) void getPass()
      } else if (msg.type === 'event') {
        const clean = cleanEvent(msg.event)
        if (!clean) return
        if (clean.kind === 'character') {
          character.current = clean.id
          turns.current = []
          touches.current = []
          // The new character says hello.
          void reply([clean])
        } else if (clean.kind === 'touch') {
          // A tickle arrives after its first taps: keep the latest touch per part.
          touches.current = [...touches.current.filter((t) => t.part !== clean.part), clean].slice(-4)
        }
      } else if (msg.type === 'speaking') {
        // Don't let the microphone hear the character talking.
        gameSpeaking.current = msg.on
        if (msg.on) recognition.current?.abort()
        else setTimeout(listenNow, 250)
      } else if (msg.type === 'listen' && !micWanted.current) startMic()
    }
    window.addEventListener('message', listener)
    return () => window.removeEventListener('message', listener)
  }, [frame, toGame, idle, reply, listenNow, startMic, getPass])

  useEffect(
    () => () => {
      micWanted.current = false
      recognition.current?.abort()
      inFlight.current?.abort()
    },
    [],
  )

  if (!active) return null
  return (
    <>
      {checking && (
        <div className="absolute inset-x-0 top-16 z-20 flex justify-center">
          <Turnstile action="talk" appearance="interaction-only" onToken={(token) => void passChecked(token)} />
        </div>
      )}
      <button
        type="button"
        onClick={mic ? stopMic : startMic}
        className={`absolute top-2.5 ${crowded ? 'right-[110px]' : 'right-[58px]'} z-10 flex min-h-11 min-w-11 items-center justify-center rounded-full px-2 shadow-lg ${
          mic ? 'bg-mint' : blocked ? 'bg-berry' : 'bg-white/85'
        } ${!mic && !blocked ? 'animate-pulse' : ''}`}
        aria-label={mic ? 'Microphone on. Tap to turn it off.' : blocked ? 'The microphone is blocked in this browser.' : 'Tap to talk'}
        aria-pressed={mic}
      >
        <span className="text-xl leading-none">{blocked ? '🚫' : '🎤'}</span>
      </button>
      {source && (
        <span
          className={`pointer-events-none absolute top-[58px] ${crowded ? 'right-[104px]' : 'right-[52px]'} z-10 select-none rounded bg-black/15 px-1 text-[9px] leading-[12px] text-white/55`}
        >
          {sourceNote(source)}
        </span>
      )}
    </>
  )
}
