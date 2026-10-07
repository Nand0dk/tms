import type { IncomingMessage, ServerResponse } from "node:http"

export function createApiMiddleware(): (
  req: IncomingMessage,
  res: ServerResponse,
  next: (error?: unknown) => void,
) => void
