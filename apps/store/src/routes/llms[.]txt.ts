import { createFileRoute } from '@tanstack/react-router'
import { llmsTxt, textResponse } from '#/server/llms'

/** What BitGames is and how agents can use it (https://llmstxt.org). */
export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET: async () => textResponse(await llmsTxt()),
    },
  },
})
