import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  resolve: {
    alias: [
      {
        // Frozen onboarding screens retain the approved legacy import path. Resolve it to the
        // exact bundled PNG pixels so no browser/CDN asset lookup is involved.
        find: /verigence-lockup\.png$/,
        replacement: fileURLToPath(new URL('./src/assets/verigenceLockup.ts', import.meta.url)),
      },
    ],
  },
  server: {
    port: 5173,
  },
});
