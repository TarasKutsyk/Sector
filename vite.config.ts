import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Single-file build (dist/index.html, committed) so runtime needs zero Node —
// plan §Stack. Dev server proxies API calls to the Python backend.
export default defineConfig({
  plugins: [viteSingleFile()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8377",
      "/raw": "http://127.0.0.1:8377",
    },
  },
  build: { chunkSizeWarningLimit: 4096 },
});
