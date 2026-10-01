import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = process.env.VITE_API_PORT || 3000;
const apiTarget = `http://localhost:${apiPort}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      '/uploads': { target: apiTarget, changeOrigin: true },
      '/socket.io': { target: apiTarget, ws: true, changeOrigin: true },
    },
  },
  preview: {
    host: true,
    port: 4173,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
    sourcemap: false,
  },
});
