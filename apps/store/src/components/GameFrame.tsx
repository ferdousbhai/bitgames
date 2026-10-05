import { BRIDGE, isBridgeMessage, newPeerId, type GameToPage, type PageToGame, type Unbridged } from '@bitgames/game-sdk/bridge'
import { useCallback, useEffect, useRef, useState } from 'react'
import { gameFrameDocument } from '#/lib/game-frame'
import { publicAddresses } from '#/lib/network'
import { toy } from '#/lib/ui'
import { type Listing, mergeListings } from '#/server/nearby'

/** Room codes are three of these animals, so children can share them without reading. */
const ROOM_ANIMALS = ['🐶', '🐱', '🐸', '🦁', '🐼', '🐵', '🐷', '🦊', '🐰', '🐻', '🐯', '🐨']

/** How a device enters a room: hosting a new code, typing a code, or tapping a game in the nearby list. */
type Entry = { kind: 'host'; code: number[]; tries: number } | { kind: 'code'; code: number[] } | { kind: 'listed'; listing: Listing; addr: string }

type Lobby =
  | { step: 'closed' }
  | { step: 'choose' }
  /** The family games open on this network, live, with Start and Tap the animals. */
  | { step: 'together'; note?: string }
  | { step: 'pick'; picked: number[]; error?: string }
  | { step: 'connecting' }
  | { step: 'waiting'; animal: string }
  | { step: 'in-room'; code: number[]; isHost: boolean; showCode: boolean }

const emojiCode = (code: number[]) => code.map((i) => ROOM_ANIMALS[i]).join('')
const randomCode = () => Array.from({ length: 3 }, () => Math.floor(Math.random() * ROOM_ANIMALS.length))
/** Each device's animal, so a grown-up can see who is asking to join and whose game is whose. */
const animalIndex = (peer: string) => parseInt(peer.slice(0, 4), 16) % ROOM_ANIMALS.length
const peerAnimal = (peer: string) => ROOM_ANIMALS[animalIndex(peer)]!

let stunLookup: Promise<string[]> | null = null

/**
 * This device's public internet addresses, as a STUN server sees them. A device
 * that reaches BitGames over IPv4 may have an IPv6 address too (or the other way
 * round), and its family's other screens might use either. Only server-reflexive
 * candidates are read; local and mDNS addresses never leave the page.
 */
function stunAddresses(): Promise<string[]> {
  stunLookup ??= new Promise<string[]>((resolve) => {
    const found: string[] = []
    let pc: RTCPeerConnection
    try {
      pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] })
    } catch {
      resolve([])
      return
    }
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        pc.close()
      } catch {}
      resolve(publicAddresses(found))
    }
    const timer = setTimeout(done, 1500)
    pc.onicecandidate = (event) => {
      if (!event.candidate) return done()
      const { type, address, candidate } = event.candidate
      if ((type ?? / typ (\w+)/.exec(candidate)?.[1]) !== 'srflx') return
      const ip = address ?? candidate.split(' ')[4]
      if (ip) found.push(ip)
    }
    pc.createDataChannel('bitgames')
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .catch(done)
  }).then((found) => {
    // Try again next time if nothing came back (offline, or STUN blocked).
    if (found.length === 0) stunLookup = null
    return found
  })
  return stunLookup
}

const socketUrl = (path: string, params: Record<string, string>) => {
  const url = new URL(path, window.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value)
  return url
}

interface HostInfo {
  peer: string
  code: string
  animal: number
  max: number
}

/**
 * The live lists of family games on this device's networks: one WebSocket for
 * the address it connects from, and one per public address STUN reports. A
 * hosting device announces its game on every list it is on.
 */
class NearbyLists {
  private sockets = new Map<string, WebSocket>()
  private lists = new Map<string, Listing[]>()
  private hosting: HostInfo | null = null
  private players = 1
  private closed = false
  private keepAlive: ReturnType<typeof setInterval>

  constructor(
    private gameId: string,
    private onChange: (games: Listing[]) => void,
  ) {
    this.open('')
    void stunAddresses().then((addrs) => {
      if (!this.closed) for (const addr of addrs) this.open(addr)
    })
    this.keepAlive = setInterval(() => this.sendAll('ping'), 30_000)
  }

  /** Which list a game was heard on, so joining it asks the same one. */
  addrFor(id: string): string {
    for (const [addr, games] of this.lists) if (games.some((g) => g.id === id)) return addr
    return ''
  }

  host(info: HostInfo) {
    this.hosting = info
    this.players = 1
    this.sendAll(JSON.stringify({ t: 'host', ...info }))
  }

  setPlayers(players: number) {
    this.players = players
    if (this.hosting) this.sendAll(JSON.stringify({ t: 'players', players }))
  }

  close() {
    this.closed = true
    clearInterval(this.keepAlive)
    for (const ws of this.sockets.values()) {
      ws.onclose = null
      ws.close()
    }
    this.sockets.clear()
  }

  private open(addr: string, attempt = 0) {
    if (this.closed) return
    const ws = new WebSocket(socketUrl(`/nearby/${this.gameId}`, { addr }))
    this.sockets.set(addr, ws)
    ws.onopen = () => {
      attempt = 0
      if (this.hosting) {
        ws.send(JSON.stringify({ t: 'host', ...this.hosting }))
        ws.send(JSON.stringify({ t: 'players', players: this.players }))
      }
    }
    ws.onmessage = (event) => {
      if (event.data === 'pong') return
      const msg = JSON.parse(String(event.data)) as { t: string; games?: Listing[] }
      if (msg.t === 'list') {
        this.lists.set(addr, msg.games ?? [])
        this.changed()
      }
    }
    ws.onclose = () => {
      if (this.sockets.get(addr) !== ws) return
      this.sockets.delete(addr)
      this.lists.delete(addr)
      this.changed()
      // Reconnect, more slowly each time, so a blip doesn't hide games or a hosted listing.
      if (attempt < 5) setTimeout(() => this.open(addr, attempt + 1), 1000 * 2 ** attempt)
    }
  }

  private changed() {
    this.onChange(mergeListings(this.lists.values()))
  }

  private sendAll(text: string) {
    for (const ws of this.sockets.values()) if (ws.readyState === WebSocket.OPEN) ws.send(text)
  }
}

/**
 * A sandboxed game plus the "play together" lobby for games that use the
 * multiplayer SDK. The game asks for a room; this page connects to the
 * room's signaling WebSocket and relays connection setup to the game.
 *
 * Every family game has an animal code. Other screens on the same internet
 * connection see it in their "Play together" list and knock to join; any screen
 * anywhere can type the code instead.
 *
 * `src` is the exact shipped gateway page. A sandboxed wrapper relays the
 * bridge and restricts child navigation to this shipment with frame-src CSP;
 * the gateway's response policy constrains the game's own resource loads.
 */
export function GameFrame({ gameId, src, title, className }: { gameId: string; src: string; title: string; className?: string }) {
    const frame = useRef<HTMLIFrameElement | null>(null)
    const maxPlayers = useRef(4)
    const socket = useRef<WebSocket | null>(null)
    const nearby = useRef<NearbyLists | null>(null)
    const [lobby, setLobby] = useState<Lobby>({ step: 'closed' })
    const [games, setGames] = useState<Listing[]>([])
    /** Devices waiting for this one to let them in. */
    const [knocks, setKnocks] = useState<string[]>([])
    const [selfAnimal, setSelfAnimal] = useState('')

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

    const listen = useCallback(() => {
      nearby.current ??= new NearbyLists(gameId, setGames)
    }, [gameId])

    const stopListening = useCallback(() => {
      nearby.current?.close()
      nearby.current = null
      setGames([])
    }, [])

    const connect = useCallback(
      (entry: Entry) => {
        closeSocket()
        setLobby({ step: 'connecting' })
        const selfId = newPeerId()
        const path = entry.kind === 'listed' ? `listed/${entry.listing.id}` : entry.code.join('-')
        const ws = new WebSocket(
          socketUrl(`/rooms/${gameId}/${path}`, {
            peer: selfId,
            max: String(maxPlayers.current),
            addr: entry.kind === 'listed' ? entry.addr : '',
          }),
        )
        socket.current = ws
        let players = 1

        ws.onmessage = (event) => {
          const msg = JSON.parse(String(event.data)) as { t: string; peers?: string[]; peer?: string; from?: string; data?: unknown; code?: string }
          if (msg.t === 'peers') {
            const peers = msg.peers ?? []
            const code = entry.kind === 'listed' ? (msg.code ?? '').split('-').map(Number) : entry.code
            if (entry.kind === 'host' && peers.length > 0) {
              // Someone somewhere already plays with these animals: pick others.
              if (entry.tries < 3) return connect({ kind: 'host', code: randomCode(), tries: entry.tries + 1 })
            } else if (entry.kind === 'code' && peers.length === 0) {
              closeSocket()
              setLobby({ step: 'pick', picked: entry.code, error: `Nobody is playing in ${emojiCode(entry.code)} yet. Check the animals!` })
              return
            }
            const isHost = entry.kind === 'host'
            // The game creates its connection handler on "ready", before it sees the peer list.
            toGame({ type: 'ready', selfId, isHost, code: emojiCode(code) })
            toGame({ type: 'peers', peers })
            setSelfAnimal(peerAnimal(selfId))
            setLobby({ step: 'in-room', code, isHost, showCode: true })
            players = peers.length + 1
            // The game now shows in the family list of every screen on this network.
            if (isHost) nearby.current?.host({ peer: selfId, code: code.join('-'), animal: animalIndex(selfId), max: maxPlayers.current })
            else stopListening()
            // Collapse the hint to just the animals after a few seconds.
            setTimeout(() => setLobby((l) => (l.step === 'in-room' ? { ...l, showCode: false } : l)), 8000)
          } else if (msg.t === 'denied' || msg.t === 'ended') {
            closeSocket()
            setLobby({ step: 'together', note: msg.t === 'denied' ? 'Not this time 🙈' : 'That game ended 👋' })
          } else if (msg.t === 'waiting') {
            setLobby({ step: 'waiting', animal: peerAnimal(selfId) })
          } else if (msg.t === 'knock' && msg.peer) {
            const peer = msg.peer
            setKnocks((k) => (k.includes(peer) ? k : [...k, peer]))
          } else if (msg.t === 'gone' && msg.peer) {
            setKnocks((k) => k.filter((p) => p !== msg.peer))
          } else if (msg.t === 'joined') {
            nearby.current?.setPlayers(++players)
          } else if (msg.t === 'left' && msg.peer) {
            nearby.current?.setPlayers(Math.max(1, --players))
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
            if (l.step === 'in-room') {
              // A lost room can't take more players, so take it off the list.
              stopListening()
              return l
            }
            if (entry.kind === 'code') return { step: 'pick', picked: entry.code, error: 'That room is full or could not be reached.' }
            const note =
              entry.kind === 'host' ? 'Could not start. Try again!' : event.code === 4003 ? 'Not this time 🙈' : event.code === 4004 ? 'That game ended 👋' : 'That game is full or gone.'
            return { step: 'together', note }
          })
        }
      },
      [gameId, toGame, closeSocket, stopListening],
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
          stopListening()
          setLobby({ step: 'closed' })
        }
      }
      window.addEventListener('message', listener)
      return () => {
        window.removeEventListener('message', listener)
        closeSocket()
        stopListening()
      }
    }, [toGame, closeSocket, stopListening])

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
            games={games}
            onTogether={() => {
              listen()
              setLobby({ step: 'together' })
            }}
            onSolo={() => {
              closeSocket()
              stopListening()
              setLobby({ step: 'closed' })
              toGame({ type: 'solo' })
            }}
            onStart={() => connect({ kind: 'host', code: randomCode(), tries: 0 })}
            onJoin={(listing) => connect({ kind: 'listed', listing, addr: nearby.current?.addrFor(listing.id) ?? '' })}
            onType={() => setLobby({ step: 'pick', picked: [] })}
            onPick={(picked) => (picked.length === 3 ? connect({ kind: 'code', code: picked }) : setLobby({ step: 'pick', picked }))}
            onBack={(step) => {
              closeSocket()
              if (step === 'choose') stopListening()
              setLobby({ step })
            }}
          />
        )}
        {knocks[0] && (
          <div className="absolute inset-x-0 top-3 z-10 flex justify-center px-3">
            <div className="flex items-center gap-2 rounded-[28px] bg-white px-3 py-2 text-ink shadow-2xl sm:gap-3 sm:px-5 sm:py-3">
              <span className="text-4xl sm:text-5xl">{peerAnimal(knocks[0])}</span>
              <span className="text-lg font-bold whitespace-nowrap sm:text-xl">wants to play!</span>
              <button type="button" onClick={() => answer(knocks[0]!, true)} className="toy min-h-11 rounded-2xl px-3 py-2 text-lg font-bold whitespace-nowrap text-white sm:px-5 sm:text-xl" style={toy('var(--color-mint)')}>
                ✓ Let in
              </button>
              <button type="button" onClick={() => answer(knocks[0]!, false)} aria-label="Not now" className="toy min-h-11 min-w-11 rounded-2xl px-3 py-2 text-lg font-bold text-white sm:px-4 sm:text-xl" style={toy('var(--color-berry)')}>
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
            className="absolute bottom-3 left-1/2 min-h-11 -translate-x-1/2 rounded-full bg-white/85 px-3 py-1 text-base font-semibold whitespace-nowrap text-ink shadow-lg"
            title="Room code"
          >
            <span className="text-xl">🏠 {emojiCode(lobby.code)}</span>
            {lobby.showCode && lobby.isHost && (
              <span className="ml-2 hidden text-sm text-ink-soft sm:inline">Other screens: “Play together” → {selfAnimal}</span>
            )}
          </button>
        )}
      </div>
    )
}

function LobbyOverlay({
  lobby,
  games,
  onTogether,
  onSolo,
  onStart,
  onJoin,
  onType,
  onPick,
  onBack,
}: {
  lobby: Exclude<Lobby, { step: 'closed' } | { step: 'in-room' }>
  games: Listing[]
  onTogether: () => void
  onSolo: () => void
  onStart: () => void
  onJoin: (listing: Listing) => void
  onType: () => void
  onPick: (picked: number[]) => void
  onBack: (step: 'choose' | 'together') => void
}) {
  const bigButton = 'toy flex min-h-11 flex-col items-center gap-1 rounded-[28px] px-6 py-5 text-xl font-bold text-white sm:text-2xl'
  const backButton = 'min-h-11 px-4 text-lg underline'
  return (
    // Top padding keeps the content clear of the ✕ that closes the game.
    <div className="absolute inset-0 overflow-y-auto bg-ink/80 text-white backdrop-blur-sm">
      <div className="flex min-h-full flex-col items-center justify-center gap-6 px-4 pt-16 pb-6">
        {lobby.step === 'choose' && (
          <>
            <h2 className="text-center text-3xl font-bold sm:text-4xl">Who's playing? 🎮</h2>
            <div className="flex flex-wrap justify-center gap-4">
              <button type="button" onClick={onTogether} className={bigButton} style={toy('var(--color-berry)')}>
                <span className="text-5xl">🏠</span>Play together
              </button>
              <button type="button" onClick={onSolo} className={bigButton} style={toy('var(--color-mint)')}>
                <span className="text-5xl">🙋</span>Just me
              </button>
            </div>
          </>
        )}
        {lobby.step === 'together' && (
          <>
            <h2 className="text-center text-3xl font-bold sm:text-4xl">🏠 Play together</h2>
            {lobby.note && <p className="rounded-2xl bg-berry px-4 py-2 text-center text-lg font-semibold">{lobby.note}</p>}
            {games.length > 0 ? (
              <div className="flex w-full max-w-lg flex-col gap-3">
                {games.map((game) => (
                  <button
                    key={game.id}
                    type="button"
                    onClick={() => onJoin(game)}
                    aria-label={`Join ${ROOM_ANIMALS[game.animal]}'s game`}
                    className="pop flex min-h-20 w-full items-center gap-3 rounded-[28px] bg-white px-4 py-3 text-ink shadow-xl transition hover:scale-[1.02] active:scale-95 sm:gap-4 sm:px-5"
                  >
                    <span className="text-6xl leading-none">{ROOM_ANIMALS[game.animal]}</span>
                    <span className="flex-1 text-left text-2xl tracking-tight" aria-hidden>
                      {'🙂'.repeat(game.players)}
                    </span>
                    <span className="toy rounded-2xl px-5 py-3 text-2xl font-bold text-white" style={toy('var(--color-mint)')}>
                      ▶ Join
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-center">
                <span className="float text-7xl" aria-hidden>
                  👀
                </span>
                <p className="text-2xl font-bold">No family games yet</p>
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-4">
              {games.length === 0 ? (
                <button type="button" onClick={onStart} className={bigButton} style={toy('var(--color-berry)')}>
                  <span className="text-5xl">🏠</span>Start a game
                </button>
              ) : (
                <button type="button" onClick={onStart} className="toy min-h-14 rounded-[22px] px-5 py-3 text-xl font-bold text-white" style={toy('var(--color-berry)')}>
                  🏠 Start a game
                </button>
              )}
              <button type="button" onClick={onType} className="toy min-h-14 rounded-[22px] px-5 py-3 text-xl font-bold text-white" style={toy('var(--color-grape)')}>
                🔢 Tap the animals
              </button>
            </div>
            <button type="button" onClick={() => onBack('choose')} className={backButton}>
              ← Back
            </button>
          </>
        )}
        {lobby.step === 'waiting' && (
          <>
            <span className="float text-8xl">{lobby.animal}</span>
            <h2 className="text-center text-3xl font-bold sm:text-4xl">Knock knock! 🚪</h2>
            <p className="max-w-md text-center text-lg">The other screen shows {lobby.animal}. Tap ✓ there to let this one in.</p>
            <button type="button" onClick={() => onBack('together')} className={backButton}>
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
            <button type="button" onClick={() => onBack('together')} className={backButton}>
              ← Back
            </button>
          </>
        )}
        {lobby.step === 'connecting' && <p className="float text-3xl font-bold">Connecting… 🔌</p>}
      </div>
    </div>
  )
}
