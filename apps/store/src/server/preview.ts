import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { isPreviewToken } from './limits'
import { findPreviewGame } from './preview-lookup'

/** The game behind a preview token, for the /try page. */
export const getPreview = createServerFn({ method: 'GET' })
  .validator(z.object({ token: z.string().refine(isPreviewToken), submissionId: z.string().uuid().optional() }))
  .handler(({ data }) => findPreviewGame(data.token, data.submissionId))
