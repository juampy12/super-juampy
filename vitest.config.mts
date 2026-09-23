import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Tests unitarios (lib/**/__tests__): sin DOM, sin mocks de Next/Supabase —
// solo funciones puras (toHourly, applyCounts, cálculo de "hoy" en Argentina).
export default defineConfig({
  resolve: {
    alias: {
      "@": rootDir,
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
});
