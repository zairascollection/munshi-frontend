import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // Split the big libraries into their own files. They change far less
    // often than app code, so after the first visit the browser reuses the
    // cached copies and only re-downloads the small app chunk on each deploy.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          icons: ["lucide-react"],
          // recharts is deliberately NOT listed. Naming it here would make
          // Vite treat it as a shared chunk and preload it on first paint,
          // undoing the lazy import in App.jsx.
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
});
