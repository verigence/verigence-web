import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  build: {
    // Keep the approved Verigence lockup as a normal same-origin hashed asset.
    // This avoids data: image URLs, which can be blocked by a host-level CSP.
    assetsInlineLimit: 4 * 1024,
  },
  server: {
    port: 5173,
  },
});
