import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'maswitch-csp-dev-relax',
      transformIndexHtml(html, ctx) {
        if (ctx.server) {
          return html.replace(
            "script-src 'self';",
            "script-src 'self' 'unsafe-inline';"
          ).replace(
            "connect-src 'self' maswitch-asset:;",
            "connect-src 'self' maswitch-asset: ws://localhost:5173 http://localhost:5173;"
          );
        }
        return html;
      },
    },
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    // File-backed SQLite commits fsync on every transaction; hosted Windows runners are ~30x slower than local disks.
    testTimeout: 30_000,
  },
});
