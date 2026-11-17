import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative asset paths, so the build runs from any folder: GitHub Pages serves it under /ironfront/.
  base: "./",
  build: {
    target: "es2022",
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
