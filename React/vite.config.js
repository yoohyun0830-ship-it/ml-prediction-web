import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: process.env.GATEWAY_URL || 'http://127.0.0.1:8080', changeOrigin: true, timeout: 60000 },
    },
  },
});
