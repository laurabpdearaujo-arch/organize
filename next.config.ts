import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Saída enxuta para o contêiner Docker (só o necessário para "node server.js").
  output: "standalone",
  // O leitor de PDF (importação de extratos) roda no servidor como pacote do Node, sem empacotar.
  serverExternalPackages: ["pdfjs-dist"],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
