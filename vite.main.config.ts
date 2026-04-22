import { defineConfig } from 'vite';
import path from 'node:path';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/main/index.ts'),
      fileName: () => 'main.js',
      formats: ['cjs'],
    },
    rollupOptions: {
      external: ['whois-json', 'better-sqlite3'],
    },
  },
  resolve: {
    alias: {
      '@main': path.resolve(__dirname, 'src/main'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
});
