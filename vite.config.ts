// Standard TanStack Start + Vite config.
// Replaces the old @lovable.dev/vite-tanstack-config shim.
// Plugin order (required by TanStack Router):
//   1. tsConfigPaths        — alias resolution first
//   2. tanstackRouter       — route file scanning
//   3. tanStackRouterCodeSplitter — code splitting
//   4. viteReact            — JSX transformation
//   5. tailwindcss          — CSS pipeline
//   6. tanstackStart        — start framework + Nitro build
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { tanstackRouter, tanStackRouterCodeSplitter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    tsConfigPaths(),
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    tanStackRouterCodeSplitter(),
    viteReact(),
    tailwindcss(),
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
    }),
  ],
  server: {
    port: 8080,
    host: "0.0.0.0",
  },
});
