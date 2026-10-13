import { createFileRoute } from '@tanstack/react-router'
import { llmsFullTxt, textResponse } from '#/server/llms'

/** /llms.txt plus every listed game's instructions and the full creator guide. */
export const Route = createFileRoute('/llms-full.txt')({
  server: {
    handlers: {
      GET: async () => textResponse(await llmsFullTxt()),
    },
  },
})
