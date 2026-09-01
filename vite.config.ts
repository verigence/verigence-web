import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    // Target the minimum Android WebView this app supports.
    // Chromium 85 = Android WebView shipped with Android 10 (API 29).
    // Too high silently breaks old devices; too low bloats output. §7.4
    target: 'chrome85',
    // Hidden sourcemaps: uploaded to error tracker, never served to clients.
    // Required for production stack traces in Axiom/Sentry. §7.4
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        // Vendor chunk splitting: app changes do not invalidate Ionic/React cache.
        // §7.4: "manualChunks splitting vendor / Ionic / validation libs"
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ionic': ['@ionic/react', '@ionic/core', 'ionicons'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-state': ['zustand'],
          'vendor-validation': ['zod'],
        },
      },
    },
  },
});
