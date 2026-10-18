/**
 * BitGames talking characters for games. Served to games as /vendor/bitgames/talk-1.js.
 *
 *   import { connectTalk } from '/vendor/bitgames/talk-1.js'
 *   const talk = await connectTalk({ about, characters, actions, moods }, 'tom')
 *   talk.on('say', ({ text, mood }) => speak(text, mood))  // one sentence at a time, as it arrives
 *   talk.on('state', (state) => ...)       // 'off' | 'listening' | 'hearing' | 'thinking'
 *   talk.on('hearing', ({ text, final }) => ...)
 *   talk.on('action', (name) => ...)
 *   talk.on('unanswered', ({ events, reason }) => ...)  // no answer is coming: answer with the game's own lines
 *   talk.send({ kind: 'touch', part: 'belly', gesture: 'tickle' })
 *   talk.send({ kind: 'character', id: 'luna' })
 *   talk.speaking(true)                    // pauses the microphone while the game talks
 *   talk.listen()                          // asks BitGames to turn the microphone on
 *
 * The page around the game listens with the microphone and asks BitGames for
 * the character's answers; the game only exchanges words and actions.
 * Answers are free for families and BitGames pays nothing beyond a daily free
 * allowance, so they stop for the day when it runs out: 'unanswered' then hands
 * the game what happened, to answer with its own scripted lines.
 * Outside BitGames, `talk.available` is false and every call is harmless.
 */
import {
  TALK_BRIDGE,
  isTalkMessage,
  type GameToPageTalk,
  type PageToGameTalk,
  type TalkEvent,
  type TalkProfile,
  type TalkState,
  type TalkUnansweredReason,
  type TalkUnbridged,
} from "./talk-bridge.js";

export type { TalkCharacter, TalkEvent, TalkProfile, TalkState, TalkUnansweredReason } from "./talk-bridge.js";

const HELLO_TIMEOUT_MS = 1500;

type Events = {
  say: (line: { text: string; mood: string }) => void;
  action: (name: string) => void;
  state: (state: TalkState) => void;
  hearing: (heard: { text: string; final: boolean }) => void;
  unanswered: (missed: { events: TalkEvent[]; reason: TalkUnansweredReason }) => void;
};

function post(message: TalkUnbridged<GameToPageTalk>) {
  window.parent.postMessage({ bridge: TALK_BRIDGE, ...message }, "*");
}

function onPage(handler: (message: PageToGameTalk) => void): () => void {
  const listener = (event: MessageEvent) => {
    if (event.source !== window.parent || !isTalkMessage<PageToGameTalk>(event.data)) return;
    handler(event.data);
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}

export class Talk {
  private listeners: { [K in keyof Events]: Set<Events[K]> } = { say: new Set(), action: new Set(), state: new Set(), hearing: new Set(), unanswered: new Set() };

  constructor(
    /** False outside BitGames: there is no page to talk through. */
    readonly available: boolean,
  ) {
    if (!available) return;
    onPage((m) => {
      if (m.type === "say") this.emit("say", { text: m.text, mood: m.mood });
      else if (m.type === "action") this.emit("action", m.name);
      else if (m.type === "hearing") this.emit("hearing", { text: m.text, final: m.final });
      else if (m.type === "unanswered") this.emit("unanswered", { events: m.events, reason: m.reason });
      else if (m.type === "state") this.emit("state", m.state);
    });
  }

  on<K extends keyof Events>(event: K, listener: Events[K]): () => void {
    this.listeners[event].add(listener);
    return () => this.listeners[event].delete(listener);
  }

  /** Tells the character something happened: a touch or a character change. */
  send(event: TalkEvent): void {
    if (this.available) post({ type: "event", event });
  }

  /** Call with true while the game is talking, so the microphone doesn't hear it. */
  speaking(on: boolean): void {
    if (this.available) post({ type: "speaking", on });
  }

  /** Asks BitGames to turn the microphone on (it may need a tap on BitGames' 🎤). */
  listen(): void {
    if (this.available) post({ type: "listen" });
  }

  private emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>) {
    for (const fn of this.listeners[event]) (fn as (...a: Parameters<Events[K]>) => void)(...args);
  }
}

function pageAvailable(): Promise<boolean> {
  if (window.parent === window) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      stop();
      resolve(false);
    }, HELLO_TIMEOUT_MS);
    const stop = onPage((m) => {
      if (m.type !== "hello") return;
      clearTimeout(timer);
      stop();
      resolve(true);
    });
    post({ type: "hello" });
  });
}

/**
 * Lets the child talk with the game's characters. `character` is the id of the
 * one on screen; send a `{ kind: 'character', id }` event when it changes.
 */
export async function connectTalk(profile: TalkProfile, character: string): Promise<Talk> {
  if (!(await pageAvailable())) {
    console.warn("[bitgames] Talking only works when the game is opened from BitGames.");
    return new Talk(false);
  }
  const talk = new Talk(true);
  post({ type: "open", profile, character });
  return talk;
}
