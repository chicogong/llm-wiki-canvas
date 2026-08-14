import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "viewer-dist",
    rollupOptions: {
      output: {
        manualChunks: {
          graph: ["cytoscape"],
          react: ["react", "react-dom"],
        },
      },
    },
  },
  server: { port: 4173, strictPort: true },
});
