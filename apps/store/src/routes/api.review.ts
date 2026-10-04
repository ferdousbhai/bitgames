import { createFileRoute } from '@tanstack/react-router'
import { handleReviewApi } from '#/server/review-api'

export const Route = createFileRoute('/api/review')({
  server: {
    handlers: {
      POST: ({ request }) => handleReviewApi(request),
    },
  },
})
