/**
 * WebMCP (W3C WebML CG draft): in-page tools that browser agents can call.
 * Types are declared here because no browser ships them in lib.dom yet.
 */

export interface WebMcpTool<Input = Record<string, unknown>> {
  name: string
  title?: string
  description: string
  /** JSON Schema for the input object. */
  inputSchema: Record<string, unknown>
  execute: (input: Input, context: { signal?: AbortSignal }) => Promise<unknown>
  annotations?: { readOnlyHint?: boolean; consequentialHint?: boolean; untrustedContentHint?: boolean }
}

interface ModelContext {
  registerTool: (tool: WebMcpTool<never>, options?: { signal?: AbortSignal }) => void
}

/** Older Chrome previews exposed navigator.modelContext; the draft moved it to document. */
function modelContext(): ModelContext | undefined {
  if (typeof document === 'undefined') return undefined
  const mc = (document as { modelContext?: ModelContext }).modelContext ?? (navigator as { modelContext?: ModelContext }).modelContext
  return mc?.registerTool ? mc : undefined
}

/** Registers the tools until `signal` aborts. Does nothing in browsers without WebMCP. */
export function registerTools(tools: WebMcpTool<never>[], signal: AbortSignal) {
  const mc = modelContext()
  if (!mc) return
  for (const tool of tools) {
    try {
      mc.registerTool(tool, { signal })
    } catch (error) {
      // A tool left over from a previous registration (e.g. hot reload) shouldn't break the page.
      console.warn(`WebMCP: could not register ${tool.name}`, error)
    }
  }
}

/** Typed helper so each tool's execute() sees its own input type. */
export const tool = <Input>(definition: WebMcpTool<Input>) => definition as unknown as WebMcpTool<never>
