import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    exclude: ["tests/e2e/**"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: [
        "src/domain/**/*.ts",
        "src/main/storage.ts",
        "src/main/security.ts",
      ],
      exclude: ["**/*.test.*"],
    },
  },
});
