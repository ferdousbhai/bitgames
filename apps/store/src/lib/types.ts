import { z } from 'zod'

export const gameSchema = z.object({
  id: z.string(),
  title: z.string(),
  tagline: z.string(),
  howToPlay: z.string(),
  emoji: z.string(),
  color: z.string(),
  category: z.string(),
  together: z.boolean(),
  entry: z.string(),
  featured: z.boolean(),
  plays: z.number(),
  likes: z.number(),
  createdAt: z.number(),
  /** URL of the cover picture, or null to show the emoji. */
  cover: z.string().nullable(),
})

export type Game = z.infer<typeof gameSchema>
