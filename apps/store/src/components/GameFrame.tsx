import { BRIDGE, isBridgeMessage, newPeerId, type GameToPage, type PageToGame, type Unbridged } from '@bitgames/game-sdk/bridge'
import { useCallback, useEffect, useRef, useState } from 'react'
import { gameFrameDocument } from '#/lib/game-frame'
import { toy } from '#/lib/ui'

/** Room codes are three of these animals, so children can share them without reading. */
const ROOM_ANIMALS = ['🐶', '🐱', '🐸', '🦁', '🐼', '🐵', '🐷', '🦊', '🐰', '🐻', '🐯', '🐨']

type Lobby =
  | { step: 'closed' }
  | { step: 'choose'; note?: string }
  | { step: 'far' }
  | { step: 'pick'; picked: number[]; error?: string }
  | { step: 'connecting' }
  | { step: 'waiting'; animal: string }
  /** code is null for the room shared by devices on the same internet connection. */
  | { step: 'in-room'; code: number[] | null; isHost: boolean; showCode: boolean }

const emojiCode = (code: number[]) => code.map((i) => ROOM_ANIMALS[i]).join('')
/** Each device's animal, so a grown-up can see who is asking to join. */
const peerAnimal = (peer: string) => ROOM_ANIMALS[parseInt(peer.slice(0, 4), 16) % ROOM_ANIMALS.length]!

/**
 * A sandboxed game plus the "play together" lobby for games that use the
 * multiplayer SDK. The game asks for a room; this page connects to the
 * room's signaling WebSocket and relays connection setup to the game.
 *
 * `src` is the exact shipped gateway page. A sandboxed wrapper relays the
 * bridge and restricts child navigation to this shipment with frame-src CSP;
 * the gateway's response policy constrains the game's own resource loads.
 */
export function GameFrame({ gameId, src, title, className }: { gameId: string; src: string; title: string; className?: string }) {
    const frame = useRef<HTMLIFrameElement | null>(null)
    const maxPlayers = useRef(4)
    const socket = useRef<WebSocket | null>(null)
    const [lobby, setLobby] = useState<Lobby>({ step: 'closed' })
    /** Devices on the same network waiting for this one to let them in. */
    const [knocks, setKnocks] = useState<string[]>([])

    const toGame = useCallback((message: Unbridged<PageToGame>) => {
      frame.current?.contentWindow?.postMessage({ bridge: BRIDGE, ...message }, '*')
    }, [])

    const closeSocket = useCallback(() => {
      if (socket.current) {
        socket.current.onclose = null
        socket.current.close()
        socket.current = null
      }
      setKnocks([])
    }, [])

    /** Joins a room by animal code, or with code null the room for this network. */
    const connect = useCallback(
      (code: number[] | null, hosting: boolean) => {
        closeSocket()
        setLobby({ step: 'connecting' })
        const selfId = newPeerId()
        const url = new URL(`/rooms/${gameId}/${code ? code.join('-') : 'near'}`, window.location.href)
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
        url.searchParams.set('peer', selfId)
        url.searchParams.set('max', String(maxPlayers.current))
        const ws = new WebSocket(url)
        socket.current = ws

        ws.onmessage = (event) => {
          const msg = JSON.parse(String(event.data)) as { t: string; peers?: string[]; peer?: string; from?: string; data?: unknown }
          if (msg.t === 'peers') {
            const peers = msg.peers ?? []
            if (code && !hosting && peers.length === 0) {
              closeSocket()
              setLobby({ step: 'pick', picked: code, error: `Nobody is playing in ${emojiCode(code)} yet. Check the animals!` })
              return
            }
            // In the network room, whoever is first in hosts.
            const isHost = code ? hosting : peers.length === 0
            // The game creates its connection handler on "ready", before it sees the peer list.
            toGame({ type: 'ready', selfId, isHost, code: code ? emojiCode(code) : '🏠' })
            toGame({ type: 'peers', peers })
            setLobby({ step: 'in-room', code, isHost, showCode: true })
            // Collapse the hint to just the animals after a few seconds.
            setTimeout(() => setLobby((l) => (l.step === 'in-room' ? { ...l, showCode: false } : l)), 8000)
          } else if (msg.t === 'denied') {
            closeSocket()
            setLobby({ step: 'choose', note: 'Not this time 🙈' })
          } else if (msg.t === 'waiting') {
            setLobby({ step: 'waiting', animal: peerAnimal(selfId) })
          } else if (msg.t === 'knock' && msg.peer) {
            const peer = msg.peer
            setKnocks((k) => (k.includes(peer) ? k : [...k, peer]))
          } else if (msg.t === 'gone' && msg.peer) {
            setKnocks((k) => k.filter((p) => p !== msg.peer))
          } else if (msg.t === 'left' && msg.peer) {
            toGame({ type: 'left', peer: msg.peer })
          } else if (msg.t === 'signal' && msg.from) {
            toGame({ type: 'signal', from: msg.from, data: msg.data as never })
          }
        }
        ws.onclose = (event) => {
          socket.current = null
          setKnocks([])
          // Losing the room mid-game leaves the game running with the players it has.
          setLobby((l) => {
            if (l.step === 'in-room') return l
            if (!code) return { step: 'choose', note: event.code === 4003 ? 'Not this time 🙈' : 'That game is full or could not be reached.' }
            return hosting ? { step: 'far' } : { step: 'pick', picked: code, error: 'That room is full or could not be reached.' }
          })
        }
      },
      [gameId, toGame, closeSocket],
    )

    useEffect(() => {
      const listener = (event: MessageEvent) => {
        if (event.source !== frame.current?.contentWindow || !isBridgeMessage<GameToPage>(event.data)) return
        const msg = event.data
        if (msg.type === 'hello') toGame({ type: 'hello' })
        // Ignore a repeated or late "open" so it can't undo what the player already picked.
        else if (msg.type === 'open') {
          maxPlayers.current = msg.maxPlayers
          setLobby((current) => (current.step === 'closed' ? { step: 'choose' } : current))
        }
        else if (msg.type === 'signal') socket.current?.send(JSON.stringify({ t: 'signal', to: msg.to, data: msg.data }))
        else if (msg.type === 'leave') {
          closeSocket()
          setLobby({ step: 'closed' })
        }
      }
      window.addEventListener('message', listener)
      return () => {
        window.removeEventListener('message', listener)
        closeSocket()
      }
    }, [toGame, closeSocket])

    const answer = (peer: string, admit: boolean) => {
      socket.current?.send(JSON.stringify({ t: admit ? 'admit' : 'deny', peer }))
      setKnocks((k) => k.filter((p) => p !== peer))
    }

    return (
      <div className={`relative ${className ?? ''}`}>
        <iframe
          ref={(el) => {
            frame.current = el
            el?.focus()
          }}
          title={title}
          srcDoc={gameFrameDocument(src, window.location.origin)}
          // The wrapper is trusted app code. Its child has the opaque-origin sandbox.
          referrerPolicy="no-referrer"
          allow="autoplay; gamepad"
          className="h-full w-full"
        />
        {lobby.step !== 'closed' && lobby.step !== 'in-room' && (
          <LobbyOverlay
            lobby={lobby}
            onNear={() => connect(null, false)}
            onFar={() => setLobby({ step: 'far' })}
            onHost={() => connect(Array.from({ length: 3 }, () => Math.floor(Math.random() * ROOM_ANIMALS.length)), true)}
            onJoin={() => setLobby({ step: 'pick', picked: [] })}
            onSolo={() => {
              closeSocket()
              setLobby({ step: 'closed' })
              toGame({ type: 'solo' })
            }}
            onPick={(picked) => (picked.length === 3 ? connect(picked, false) : setLobby({ step: 'pick', picked }))}
            onBack={(step) => {
              closeSocket()
              setLobby({ step })
            }}
          />
        )}
        {knocks[0] && (
          <div className="absolute inset-x-0 top-3 z-10 flex justify-center px-3">
            <div className="flex items-center gap-2 rounded-[28px] bg-white px-3 py-2 text-ink shadow-2xl sm:gap-3 sm:px-5 sm:py-3">
              <span className="text-4xl sm:text-5xl">{peerAnimal(knocks[0])}</span>
              <span className="text-lg font-bold whitespace-nowrap sm:text-xl">wants to play!</span>
              <button type="button" onClick={() => answer(knocks[0]!, true)} className="toy rounded-2xl px-3 py-2 text-lg font-bold whitespace-nowrap text-white sm:px-5 sm:text-xl" style={toy('var(--color-mint)')}>
                ✓ Let in
              </button>
              <button type="button" onClick={() => answer(knocks[0]!, false)} className="toy rounded-2xl px-3 py-2 text-lg font-bold text-white sm:px-4 sm:text-xl" style={toy('var(--color-berry)')}>
                ✗
              </button>
            </div>
          </div>
        )}
        {lobby.step === 'in-room' && (
          <button
            type="button"
            onClick={() => setLobby({ ...lobby, showCode: !lobby.showCode })}
            // Bottom centre: the space games usually leave free between their touch controls.
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white/85 px-3 py-1 text-base font-semibold text-ink shadow-lg"
            title="Room code"
          >
            {!lobby.code ? (
              lobby.showCode ? (
                <>
                  <span className="text-xl">🏠</span> Family game
                  <span className="ml-2 hidden text-sm text-ink-soft sm:inline">Other screens at home: tap “Play together”</span>
                </>
              ) : (
                <span className="text-xl">🏠</span>
              )
            ) : lobby.showCode ? (
              <>
                Room <span className="text-xl">{emojiCode(lobby.code)}</span>
                <span className="ml-2 hidden text-sm text-ink-soft sm:inline">On the other screen: “Somewhere else?” → “Enter a code”</span>
              </>
            ) : (
              <span className="text-xl">{emojiCode(lobby.code)}</span>
            )}
          </button>
        )}
      </div>
    )
}

function LobbyOverlay({
  lobby,
  onNear,
  onFar,
  onHost,
  onJoin,
  onSolo,
  onPick,
  onBack,
}: {
  lobby: Exclude<Lobby, { step: 'closed' } | { step: 'in-room' }>
  onNear: () => void
  onFar: () => void
  onHost: () => void
  onJoin: () => void
  onSolo: () => void
  onPick: (picked: number[]) => void
  onBack: (step: 'choose' | 'far') => void
}) {
  const bigButton = 'toy flex flex-col items-center gap-1 rounded-[28px] px-6 py-5 text-xl font-bold text-white sm:text-2xl'
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 overflow-y-auto bg-ink/80 p-4 text-white backdrop-blur-sm">
      {lobby.step === 'choose' && (
        <>
          <h2 className="text-center text-3xl font-bold sm:text-4xl">Who's playing? 🎮</h2>
          {lobby.note && <p className="rounded-2xl bg-berry px-4 py-2 text-center text-lg font-semibold">{lobby.note}</p>}
          <div className="flex flex-wrap justify-center gap-4">
            <button type="button" onClick={onNear} className={bigButton} style={toy('var(--color-berry)')}>
              <span className="text-5xl">🏠</span>Play together
            </button>
            <button type="button" onClick={onSolo} className={bigButton} style={toy('var(--color-mint)')}>
              <span className="text-5xl">🙋</span>Just me
            </button>
          </div>
          <p className="max-w-md text-center text-base text-white/80">Every screen at home taps “Play together” and joins the same game.</p>
          <button type="button" onClick={onFar} className="text-lg underline">
            🌍 Somewhere else? Use an animal code
          </button>
        </>
      )}
      {lobby.step === 'far' && (
        <>
          <h2 className="text-center text-3xl font-bold sm:text-4xl">Play from far away 🌍</h2>
          <div className="flex flex-wrap justify-center gap-4">
            <button type="button" onClick={onHost} className={bigButton} style={toy('var(--color-berry)')}>
              <span className="text-5xl">🎲</span>Make a code
            </button>
            <button type="button" onClick={onJoin} className={bigButton} style={toy('var(--color-grape)')}>
              <span className="text-5xl">🤝</span>Enter a code
            </button>
          </div>
          <button type="button" onClick={() => onBack('choose')} className="text-lg underline">
            ← Back
          </button>
        </>
      )}
      {lobby.step === 'waiting' && (
        <>
          <span className="float text-8xl">{lobby.animal}</span>
          <h2 className="text-center text-3xl font-bold sm:text-4xl">Knock knock! 🚪</h2>
          <p className="max-w-md text-center text-lg">The first screen shows {lobby.animal}. Tap ✓ there to let this one in.</p>
          <button type="button" onClick={() => onBack('choose')} className="text-lg underline">
            ← Back
          </button>
        </>
      )}
      {lobby.step === 'pick' && (
        <>
          <h2 className="text-center text-2xl font-bold sm:text-3xl">Tap the 3 animals from the other screen</h2>
          <div className="flex gap-3">
            {[0, 1, 2].map((slot) => (
              <span key={slot} className="flex h-16 w-16 items-center justify-center rounded-2xl border-4 border-white/60 bg-white/15 text-5xl">
                {lobby.picked[slot] !== undefined ? ROOM_ANIMALS[lobby.picked[slot]!] : ''}
              </span>
            ))}
          </div>
          {lobby.error && <p className="rounded-2xl bg-berry px-4 py-2 text-center text-lg font-semibold">{lobby.error}</p>}
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
            {ROOM_ANIMALS.map((animal, i) => (
              <button
                key={animal}
                type="button"
                aria-label={`Animal ${i + 1}`}
                onClick={() => onPick([...(lobby.picked.length === 3 ? [] : lobby.picked), i])}
                className="h-16 w-16 rounded-2xl bg-white text-5xl shadow-lg transition hover:scale-110 active:scale-95"
              >
                {animal}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => onBack('far')} className="text-lg underline">
            ← Back
          </button>
        </>
      )}
      {lobby.step === 'connecting' && <p className="float text-3xl font-bold">Connecting… 🔌</p>}
    </div>
  )
}
