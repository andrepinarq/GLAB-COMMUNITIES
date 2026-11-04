import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
  // Nada embutido como data: URI — a política de segurança (CSP) só aceita arquivos do próprio site.
  build: { assetsInlineLimit: 0 },
});
