import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Os testes não podem depender do fuso do computador.
process.env.TZ = "UTC";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
