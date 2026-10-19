import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Os testes não podem depender do fuso do computador.
process.env.TZ = "UTC";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    alias: {
      // "server-only" bloqueia import fora do servidor Next; nos testes é inofensivo.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
});
