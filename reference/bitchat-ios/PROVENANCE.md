# BitChat reference code

A subset of the source for the BitChat iOS and macOS app, kept here as a
reference for porting to TypeScript. None of it is compiled or run in this
project.

- Source: https://github.com/permissionlesstech/bitchat
- Commit: 5e9287fae1e5fea80ca741d4ea669829dc16f144 (2026-09-24)
- License: public domain (Unlicense). See LICENSE.

## What was copied

- `localPackages/BitFoundation`: the binary packet format (BitchatPacket, BinaryProtocol, PeerID, MessageType, padding)
- `bitchat/Protocols`, `bitchat/Models`: packet types, file packets, Nostr carrier packets
- `bitchat/Noise`: the Noise XX handshake and encrypted sessions
- `bitchat/Nostr`: event signing, relay manager, bech32, NIP-17 gift-wrap, PoW
- `bitchat/Services/BLE`: the mesh (fragmentation, relaying, announce, central and peripheral roles)
- `bitchat/Services/Gateway`, `Transport`, `MessageRouter`, `NostrTransport`: how the app picks between mesh and Nostr
- `bitchat/Sync`: gossip sync (GCS filters)
- `bitchatTests`: protocol, Noise, Nostr, fragmentation and sync tests, to reuse as test vectors
- `docs/`, `WHITEPAPER.md`: the architecture and protocol docs

## What was left out

- UI, voice and push-to-talk, location channels, boards, groups, Tor (Arti) and Cashu.
- **bitchat-android.** It is licensed GPL-3.0, so copying it would make this
  project GPL as well. Read it if useful, but don't copy it.
