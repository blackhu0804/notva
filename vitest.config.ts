import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node"
  },
  resolve: {
    alias: {
      "@notva/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url))
    }
  }
});
