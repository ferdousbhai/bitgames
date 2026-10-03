import type { CSSProperties } from 'react'

/** Colour for a `.toy` button (see styles.css). */
export const toy = (color: string): CSSProperties => ({ '--toy-bg': color }) as CSSProperties
