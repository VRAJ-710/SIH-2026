import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  plugins: [react(), (cesium as any)()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      // Proxy /thredds to the TDS container so the browser sees same-origin
      // requests and CORS never applies during local development.
      '/thredds': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});