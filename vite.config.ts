import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  define: {
    // Allow wagmi/onchainkit to detect browser environment
    global: 'globalThis',
  },
});
