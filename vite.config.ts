import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import devServer from "@hono/vite-dev-server";

// Em desenvolvimento, a API (Hono) roda dentro do próprio Vite e lê os segredos do .env.local.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Só /api vai para o Hono; o resto é a tela (Vite serve o index.html e os arquivos)
    devServer({ entry: "src/server/app.ts", exclude: [/^(?!\/api(\/|$)).*/], injectClientScript: false }),
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { port: 3000, strictPort: true },
  build: { outDir: "dist/web", emptyOutDir: true },
});
