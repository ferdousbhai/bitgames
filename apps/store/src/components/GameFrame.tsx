import { BRIDGE, isBridgeMessage, type GameToPage, type PageToGame } from '@bitgames/game-sdk/bridge'
import { forwardRef, useCallback, useEffect, useRef, useState } from 'react'

/** Room codes are three of these animals, so children can share them without reading. */
export const ROOM_ANIMALS = ['🐶', '🐱', '🐸', '🦁', '🐼', '🐵', '🐷', '🦊', '🐰', '🐻', '🐯', '🐨']

type Lobby =
  | { step: 'closed' }
  | { step: 'choose' }
  | { step: 'pick'; picked: number[]; error?: string }
  | { step: 'connecting' }
  | { step: 'in-room'; code: number[]; isHost: boolean; showCode: boolean }

type Distribute<T> = T extends { type: infer K } ? Omit<T, 'bridge'> & { type: K } : never

function randomPeerId() {
  return [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const emojiCode = (code: number[]) => code.map((i) => ROOM_ANIMALS[i]).join('')

/**
 * A sandboxed game plus the "play together" lobby for games that use the
 * multiplayer SDK. The game asks for a room; this page connects to the
 * room's signaling WebSocket and relays connection setup to the game.
 */
export const GameFrame = forwardRef<HTMLIFrameElement, { gameId: string; src: string; title: string; className?: string }>(
  function GameFrame({ gameId, src, title, className }, forwardedRef) {
    const frame = useRef<HTMLIFrameElement | null>(null)
    const socket = useRef<WebSocket | null>(null)
    const [lobby, setLobby] = useState<Lobby>({ step: 'closed' })

    const toGame = useCallback((message: Distribute<PageToGame>) => {
      frame.current?.contentWindow?.postMessage({ bridge: BRIDGE, ...message }, '*')
    }, [])

    const closeSocket = useCallback(() => {
      if (socket.current) {
        socket.current.onclose = null
        socket.current.close()
        socket.current = null
      }
    }, [])

    const connect = useCallback(
      (code: number[], isHost: boolean) => {
        closeSocket()
        setLobby({ step: 'connecting' })
        const selfId = randomPeerId()
        const url = new URL(`/rooms/${gameId}/${code.join('-')}`, window.location.href)
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
        url.searchParams.set('peer', selfId)
        const ws = new WebSocket(url)
        socket.current = ws
        let ready = false

        ws.onmessage = (event) => {
          const msg = JSON.parse(String(event.data)) as { t: string; peers?: string[]; peer?: string; from?: string; data?: unknown }
          if (msg.t === 'peers') {
            if (!isHost && (msg.peers ?? []).length === 0) {
              closeSocket()
              setLobby({ step: 'pick', picked: code, error: `Nobody is playing in ${emojiCode(code)} yet. Check the animals!` })
              return
            }
            ready = true
            // The game creates its connection handler on "ready", before it sees the peer list.
            toGame({ type: 'ready', selfId, isHost, code: emojiCode(code) })
            toGame({ type: 'peers', peers: msg.peers ?? [] })
            setLobby({ step: 'in-room', code, isHost, showCode: isHost })
          } else if (msg.t === 'joined' && msg.peer) {
            toGame({ type: 'joined', peer: msg.peer })
          } else if (msg.t === 'left' && msg.peer) {
            toGame({ type: 'left', peer: msg.peer })
          } else if (msg.t === 'signal' && msg.from) {
            toGame({ type: 'signal', from: msg.from, data: msg.data as never })
          }
        }
        ws.onclose = () => {
          socket.current = null
          if (ready) toGame({ type: 'closed', reason: 'The connection to the room was lost.' })
          else if (isHost) setLobby({ step: 'choose' })
          else setLobby({ step: 'pick', picked: code, error: 'That room is full or could not be reached.' })
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
        else if (msg.type === 'open') setLobby((current) => (current.step === 'closed' ? { step: 'choose' } : current))
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

    const setFrame = (el: HTMLIFrameElement | null) => {
      frame.current = el
      if (typeof forwardedRef === 'function') forwardedRef(el)
      else if (forwardedRef) forwardedRef.current = el
      el?.focus()
    }

    return (
      <div className={`relative ${className ?? ''}`}>
        <iframe
          ref={setFrame}
          title={title}
          src={src}
          // Games are untrusted: scripts only, no same-origin access to the store.
          sandbox="allow-scripts allow-pointer-lock"
          allow="autoplay; gamepad"
          className="h-full w-full"
        />
        {lobby.step !== 'closed' && lobby.step !== 'in-room' && (
          <LobbyOverlay
            lobby={lobby}
            onHost={() => connect(Array.from({ length: 3 }, () => Math.floor(Math.random() * ROOM_ANIMALS.length)), true)}
            onJoin={() => setLobby({ step: 'pick', picked: [] })}
            onSolo={() => {
              setLobby({ step: 'closed' })
              toGame({ type: 'solo' })
            }}
            onPick={(picked) => (picked.length === 3 ? connect(picked, false) : setLobby({ step: 'pick', picked }))}
            onBack={() => setLobby({ step: 'choose' })}
          />
        )}
        {lobby.step === 'in-room' && (
          <button
            type="button"
            onClick={() => setLobby({ ...lobby, showCode: !lobby.showCode })}
            className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-white/90 px-4 py-1.5 text-lg font-semibold text-ink shadow-lg"
            title="Room code"
          >
            {lobby.showCode ? (
              <>
                Room <span className="text-2xl">{emojiCode(lobby.code)}</span>
                <span className="ml-2 hidden text-sm text-ink-soft sm:inline">Tap “Join” on another device and pick these</span>
              </>
            ) : (
              <span className="text-2xl">{emojiCode(lobby.code)}</span>
            )}
          </button>
        )}
      </div>
    )
  },
)

function LobbyOverlay({
  lobby,
  onHost,
  onJoin,
  onSolo,
  onPick,
  onBack,
}: {
  lobby: Exclude<Lobby, { step: 'closed' } | { step: 'in-room' }>
  onHost: () => void
  onJoin: () => void
  onSolo: () => void
  onPick: (picked: number[]) => void
  onBack: () => void
}) {
  const bigButton = 'toy flex flex-col items-center gap-1 rounded-[28px] px-6 py-5 text-xl font-bold text-white sm:text-2xl'
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 overflow-y-auto bg-ink/80 p-4 text-white backdrop-blur-sm">
      {lobby.step === 'choose' && (
        <>
          <h2 className="text-center text-3xl font-bold sm:text-4xl">Who's playing? 🎮</h2>
          <div className="flex flex-wrap justify-center gap-4">
            <button type="button" onClick={onHost} className={bigButton} style={{ '--toy-bg': 'var(--color-berry)' } as React.CSSProperties}>
              <span className="text-5xl">🏠</span>Start a family game
            </button>
            <button type="button" onClick={onJoin} className={bigButton} style={{ '--toy-bg': 'var(--color-grape)' } as React.CSSProperties}>
              <span className="text-5xl">🤝</span>Join a family game
            </button>
            <button type="button" onClick={onSolo} className={bigButton} style={{ '--toy-bg': 'var(--color-mint)' } as React.CSSProperties}>
              <span className="text-5xl">🙋</span>Just me
            </button>
          </div>
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
          <button type="button" onClick={onBack} className="text-lg underline">
            ← Back
          </button>
        </>
      )}
      {lobby.step === 'connecting' && <p className="float text-3xl font-bold">Connecting… 🔌</p>}
    </div>
  )
}
