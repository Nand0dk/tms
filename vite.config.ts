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
  build: {
    target: "es2022",
    cssCodeSplit: true,
    sourcemap: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("@zxing")) return "zxing"
            if (id.includes("qrcode")) return "qrcode"
            if (id.includes("react-dom") || id.includes("/react/")) return "react"
          }
        },
      },
    },
  },
})
