/** A failure that the creator can fix and their agent should see as a tool error. */
export class CreatorError extends Error {}
export class UnreachableError extends CreatorError {}
