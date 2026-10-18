/**
 * Messages between a game (sandboxed iframe) and the BitGames page around it
 * for talking characters: the child talks, a character in the game answers.
 *
 * The page owns the microphone, speech recognition and the conversation with
 * BitGames' server. The game only ever sees words (what was heard, what to
 * say) and named actions, so the sandbox keeps no network or microphone access.
 */
export const TALK_BRIDGE = "bitgames-talk-1";

/** A character that can talk, described by the game. */
export interface TalkCharacter {
  id: string;
  name: string;
  /** Who the character is and how they talk. */
  persona: string;
}

/** What the game tells BitGames about its characters. */
export interface TalkProfile {
  /** One or two sentences about the game. */
  about: string;
  characters: TalkCharacter[];
  /** Named actions a character may do while talking. */
  actions: string[];
  /** Moods the game can show while a line is spoken. */
  moods: string[];
}

/** Something that happened in the game, which the character may react to. */
export type TalkEvent =
  | { kind: "speech"; text: string }
  | { kind: "touch"; part: string; gesture: string }
  | { kind: "character"; id: string };

/** One turn of the conversation, as the page keeps it and sends it to BitGames. */
export interface TalkTurn {
  from: "child" | "character";
  text: string;
}

/** What the characters remember about the child, kept on the device and sent with each request. */
export interface TalkMemory {
  facts: string[];
  /** One line about the last conversation, to pick up from. */
  last: string;
}

/**
 * How the conversation looks to the game:
 * off (no microphone yet), listening, hearing (someone is talking), thinking (an answer is coming).
 */
export type TalkState = "off" | "listening" | "hearing" | "thinking";

export type GameToPageTalk =
  | { bridge: typeof TALK_BRIDGE; type: "hello" }
  | { bridge: typeof TALK_BRIDGE; type: "open"; profile: TalkProfile; character: string }
  | { bridge: typeof TALK_BRIDGE; type: "event"; event: TalkEvent }
  | { bridge: typeof TALK_BRIDGE; type: "speaking"; on: boolean }
  | { bridge: typeof TALK_BRIDGE; type: "listen" };

export type PageToGameTalk =
  | { bridge: typeof TALK_BRIDGE; type: "hello" }
  | { bridge: typeof TALK_BRIDGE; type: "state"; state: TalkState }
  | { bridge: typeof TALK_BRIDGE; type: "hearing"; text: string; final: boolean }
  | { bridge: typeof TALK_BRIDGE; type: "say"; text: string; mood: string }
  | { bridge: typeof TALK_BRIDGE; type: "action"; name: string }
  /** No answer is coming (see TalkUnansweredReason): the game answers by itself. */
  | { bridge: typeof TALK_BRIDGE; type: "unanswered"; events: TalkEvent[]; reason: TalkUnansweredReason };

/** Why an event went unanswered: limit (today's talking is used up), busy (too fast), failed. */
export type TalkUnansweredReason = "limit" | "busy" | "failed";

export type TalkUnbridged<T> = T extends { type: infer K } ? Omit<T, "bridge"> & { type: K } : never;

export function isTalkMessage<T extends { bridge: string }>(data: unknown): data is T {
  return typeof data === "object" && data !== null && (data as { bridge?: unknown }).bridge === TALK_BRIDGE;
}

/** Limits the page and server both apply to what a game sends. */
export const TALK_LIMITS = {
  text: 300,
  name: 40,
  persona: 600,
  about: 400,
  characters: 8,
  list: 24,
  /** Turns of conversation sent with each request. */
  turns: 16,
  /** Events (touches, speech, a switch of character) for one answer. */
  events: 8,
} as const;

/** How long a talk pass (after the Turnstile check) lasts. */
export const TALK_PASS_HOURS = 12;

/** Game text, trimmed to a limit (anything else becomes empty). */
export const clip = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const names = (value: unknown) =>
  Array.isArray(value) ? [...new Set(value.map((v) => clip(v, TALK_LIMITS.name)).filter(Boolean))].slice(0, TALK_LIMITS.list) : [];

/** A game-supplied profile, trimmed to the limits. Game text is untrusted. */
export function cleanProfile(value: unknown): TalkProfile {
  const p = (value ?? {}) as Partial<TalkProfile>;
  const characters = (Array.isArray(p.characters) ? p.characters : [])
    .map((c) => ({ id: clip(c?.id, TALK_LIMITS.name), name: clip(c?.name, TALK_LIMITS.name), persona: clip(c?.persona, TALK_LIMITS.persona) }))
    .filter((c) => c.id && c.name)
    .slice(0, TALK_LIMITS.characters);
  return { about: clip(p.about, TALK_LIMITS.about), characters, actions: names(p.actions), moods: names(p.moods) };
}

/** A game-supplied event, trimmed to the limits, or null when it isn't one. */
export function cleanEvent(value: unknown): TalkEvent | null {
  const e = (value ?? {}) as Record<string, unknown>;
  if (e.kind === "speech") {
    const text = clip(e.text, TALK_LIMITS.text);
    return text ? { kind: "speech", text } : null;
  }
  if (e.kind === "touch") {
    const part = clip(e.part, TALK_LIMITS.name);
    return part ? { kind: "touch", part, gesture: clip(e.gesture, TALK_LIMITS.name) || "poke" } : null;
  }
  if (e.kind === "character") {
    const id = clip(e.id, TALK_LIMITS.name);
    return id ? { kind: "character", id } : null;
  }
  return null;
}
