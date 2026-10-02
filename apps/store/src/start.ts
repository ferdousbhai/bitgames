import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

// Server functions (likes, creator keys, admin review) are same-origin RPC
// endpoints; reject cross-site calls to them.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

// TanStack DB collections live in the browser, so pages render on the client.
// The HTML shell and the server routes are still served by the Worker.
export const startInstance = createStart(() => ({
  defaultSsr: false,
  requestMiddleware: [csrfMiddleware],
}))
