import { createStart } from '@tanstack/react-start'

// TanStack DB collections live in the browser, so pages render on the client.
// The HTML shell and the /play server route are still served by the Worker.
export const startInstance = createStart(() => ({
  defaultSsr: false,
}))
