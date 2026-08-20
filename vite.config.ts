import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  resolve: {
    alias: {
      // The frozen auth screens still import the legacy PNG filename. Resolve that import to the
      // clean approved lockup asset without changing screen markup or branding.
      '../assets/verigence-lockup.png': fileURLToPath(
        new URL('./src/assets/verigence-lockup.avif', import.meta.url),
      ),
    },
  },
  build: {
    assetsInlineLimit: 4 * 1024,
  },
  server: {
    port: 5173,
  },
});
