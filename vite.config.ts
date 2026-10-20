import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'demo',
  // GitHub Pages serves the demo from /react-editable-grid/.
  base: './',
  build: { outDir: '../dist', emptyOutDir: true },
  test: {
    root: '.',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    css: false,
  },
});
