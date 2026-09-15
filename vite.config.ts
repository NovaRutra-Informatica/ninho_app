import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "local-development-policy",
      apply: "serve",
      transformIndexHtml(html) {
        return html
          .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
          .replace("connect-src 'none'", "connect-src 'self' ws://127.0.0.1:*");
      },
    },
  ],
  base: "./",
  build: { outDir: "dist" },
});
