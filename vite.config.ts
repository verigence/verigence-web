import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  resolve: {
    alias: [
      {
        // Some frozen auth screens still use the legacy PNG import. Match by filename rather than
        // by one relative specifier so Vite always resolves those imports to the clean lockup.
        find: /verigence-lockup\.png$/,
        replacement: fileURLToPath(new URL('./src/assets/verigence-lockup.avif', import.meta.url)),
      },
    ],
  },
  build: {
    assetsInlineLimit: 4 * 1024,
  },
  server: {
    port: 5173,
  },
});
