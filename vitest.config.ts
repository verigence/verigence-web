import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['lib/**', 'app/api/**'],
      exclude: ['**/*.d.ts'],
    },
  },
  resolve: {
    alias: { '@': resolve(__dirname, '.') },
  },
})
