/** Client for apps/signal: room membership plus relaying of SDP and ICE messages. */

export type SignalData =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "candidate"; candidate: RTCIceCandidateInit };

export interface SignalingEvents {
  /** Peers already in the room when we joined. We initiate to these. */
  peers(peers: string[]): void;
  joined(peer: string): void;
  left(peer: string): void;
  signal(from: string, data: SignalData): void;
  error(message: string): void;
}

/** How peers find each other: room membership plus relaying SDP and ICE messages. */
export interface Signaling {
  readonly selfID: string;
  on<K extends keyof SignalingEvents>(event: K, handler: SignalingEvents[K]): void;
  send(to: string, data: SignalData): void;
  close(): void;
}

export class WebSocketSignaling implements Signaling {
  private socket: WebSocket | null = null;
  private handlers: Partial<SignalingEvents> = {};

  constructor(
    private readonly url: string,
    readonly room: string,
    readonly selfID: string,
  ) {}

  on<K extends keyof SignalingEvents>(event: K, handler: SignalingEvents[K]): void {
    this.handlers[event] = handler;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      socket.onopen = () => {
        socket.send(JSON.stringify({ t: "join", room: this.room, peer: this.selfID }));
        resolve();
      };
      socket.onerror = () => reject(new Error(`could not reach signaling server at ${this.url}`));
      socket.onclose = () => this.handlers.error?.("signaling connection closed");
      socket.onmessage = (event) => this.handle(JSON.parse(String(event.data)));
    });
  }

  send(to: string, data: SignalData): void {
    this.socket?.send(JSON.stringify({ t: "signal", to, data }));
  }

  close(): void {
    if (this.socket) this.socket.onclose = null;
    this.socket?.close();
    this.socket = null;
  }

  private handle(msg: { t: string; peers?: string[]; peer?: string; from?: string; data?: SignalData; message?: string }) {
    switch (msg.t) {
      case "peers":
        return this.handlers.peers?.(msg.peers ?? []);
      case "joined":
        return this.handlers.joined?.(msg.peer!);
      case "left":
        return this.handlers.left?.(msg.peer!);
      case "signal":
        return this.handlers.signal?.(msg.from!, msg.data!);
      case "error":
        return this.handlers.error?.(msg.message ?? "unknown error");
    }
  }
}
