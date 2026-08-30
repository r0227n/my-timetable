import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ mode }) => {
  const e2eMode = mode === "e2e-fake" || mode === "e2e-real";
  return {
    base: "/my-timetable/",
    plugins: [react()],
    resolve: {
      alias: {
        "#analysis": fileURLToPath(
          new URL(
            mode === "e2e-fake" ? "./e2e/fixtures/analysis.ts" : "./src/services/analysis.ts",
            import.meta.url,
          ),
        ),
      },
    },
    build: {
      outDir: e2eMode ? `dist-${mode}` : "dist",
    },
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      css: true,
      include: ["src/**/*.test.{ts,tsx}", "packages/**/*.test.ts"],
    },
  };
});
