import { env } from 'cloudflare:workers'

/**
 * Workers AI for talking characters, through the account's AI Gateway
 * (env.AI_GATEWAY_ID) so every request is logged there. Workers AI includes a
 * free daily allowance of neurons; talk.ts stops for the day at that allowance,
 * so the characters cost nothing (or next to nothing, if answers under way go slightly over).
 */
export const TALK_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8'

/**
 * Neurons per token for TALK_MODEL ($0.0509 per million input tokens, $0.335 per
 * million output, at $0.011 per 1,000 neurons), for when a reply doesn't report
 * its own neurons.
 */
const NEURONS_PER_INPUT_TOKEN = 0.0509 / 0.011 / 1000
const NEURONS_PER_OUTPUT_TOKEN = 0.335 / 0.011 / 1000

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface Usage {
  prompt_tokens?: number
  completion_tokens?: number
  neurons?: number
}

const neuronsOf = (usage: Usage | undefined) =>
  usage?.neurons ?? (usage?.prompt_tokens ?? 0) * NEURONS_PER_INPUT_TOKEN + (usage?.completion_tokens ?? 0) * NEURONS_PER_OUTPUT_TOKEN

/** Qwen3 thinks before answering unless told not to; spoken replies need the first words fast. */
function noThinking(messages: ChatMessage[]): ChatMessage[] {
  const last = messages.at(-1)
  return last?.role === 'user' ? [...messages.slice(0, -1), { ...last, content: `${last.content} /no_think` }] : messages
}

function run(inputs: Record<string, unknown>) {
  return env.AI.run(TALK_MODEL as keyof AiModels, inputs as never, {
    // Every answer is fresh: a cached reply would repeat itself word for word.
    gateway: { id: env.AI_GATEWAY_ID, skipCache: true },
  }) as Promise<unknown>
}

/** Drops <think>…</think> blocks from streamed text, across pieces. */
class ThinkFilter {
  private thinking = false
  private held = ''

  push(text: string): string {
    let out = ''
    let rest = this.held + text
    this.held = ''
    for (;;) {
      const tag = this.thinking ? '</think>' : '<think>'
      const at = rest.indexOf(tag)
      if (at >= 0) {
        if (!this.thinking) out += rest.slice(0, at)
        rest = rest.slice(at + tag.length)
        this.thinking = !this.thinking
        continue
      }
      // Hold back a possible partial tag at the end.
      const partial = rest.lastIndexOf('<')
      const keep = partial >= 0 && tag.startsWith(rest.slice(partial)) ? rest.slice(partial) : ''
      if (!this.thinking) out += rest.slice(0, rest.length - keep.length)
      this.held = keep
      return out
    }
  }
}

/**
 * Streams the model's answer, calling onText with each piece of text as it
 * arrives. Resolves with the neurons it used.
 */
export async function streamChat(messages: ChatMessage[], maxTokens: number, onText: (text: string) => void): Promise<number> {
  const stream = (await run({ messages: noThinking(messages), max_tokens: maxTokens, temperature: 0.8, stream: true })) as ReadableStream<Uint8Array>
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const think = new ThinkFilter()
  let buffer = ''
  let total: number | null = null
  let tokens: Usage = {}
  const line = (data: string) => {
    if (!data || data === '[DONE]') return
    let chunk: { choices?: { delta?: { content?: string | null } }[]; response?: string; usage?: Usage }
    try {
      chunk = JSON.parse(data)
    } catch {
      return
    }
    // The last chunk, without choices, carries the whole request's usage.
    if (!chunk.choices && chunk.usage) total = neuronsOf(chunk.usage)
    else if (chunk.usage) {
      tokens = {
        prompt_tokens: (tokens.prompt_tokens ?? 0) + (chunk.usage.prompt_tokens ?? 0),
        completion_tokens: (tokens.completion_tokens ?? 0) + (chunk.usage.completion_tokens ?? 0),
      }
    }
    const text = chunk.choices ? chunk.choices[0]?.delta?.content : chunk.response
    if (text) {
      const said = think.push(text)
      if (said) onText(said)
    }
  }
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let end: number
    while ((end = buffer.indexOf('\n')) >= 0) {
      const raw = buffer.slice(0, end).trim()
      buffer = buffer.slice(end + 1)
      if (raw.startsWith('data:')) line(raw.slice(5).trim())
    }
  }
  if (buffer.trim().startsWith('data:')) line(buffer.trim().slice(5).trim())
  return total ?? neuronsOf(tokens)
}

/** One JSON answer that follows `schema`, or null. Resolves with the neurons it used either way. */
export async function jsonChat<T>(messages: ChatMessage[], schema: Record<string, unknown>, maxTokens: number): Promise<{ value: T | null; neurons: number }> {
  const result = (await run({
    messages: noThinking(messages),
    max_tokens: maxTokens,
    response_format: { type: 'json_schema', json_schema: schema },
  })) as { response?: unknown; choices?: { message?: { content?: string | null } }[]; usage?: Usage }
  let value: unknown = result.response
  if (typeof value !== 'object' || value === null) {
    const text = typeof value === 'string' ? value : result.choices?.[0]?.message?.content
    try {
      value = text ? JSON.parse(text.replace(/<think>[\s\S]*?<\/think>/g, '')) : null
    } catch {
      value = null
    }
  }
  return { value: (value as T) ?? null, neurons: neuronsOf(result.usage) }
}
