import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  build: {
    // The frozen approved Verigence lockup is ~67 KB. Inline it in the JS bundle so
    // Cloudflare never has to resolve a separate runtime image URL for auth screens.
    assetsInlineLimit: 128 * 1024,
  },
  server: {
    port: 5173,
  },
});
