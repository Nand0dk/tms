import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "vps-sqlite",
      async configureServer(server) {
        const { createApiMiddleware } = await import("./server/api.mjs")
        server.middlewares.use(createApiMiddleware())
      },
      async configurePreviewServer(server) {
        const { createApiMiddleware } = await import("./server/api.mjs")
        server.middlewares.use(createApiMiddleware())
      },
    },
  ],
})
