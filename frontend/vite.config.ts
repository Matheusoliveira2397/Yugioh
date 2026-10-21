import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Polling só no Docker (volume Windows) — no host nativo consome CPU à toa.
// Ative com VITE_USE_POLLING=1 no container frontend.
const usePolling =
  process.env.VITE_USE_POLLING === '1' ||
  process.env.VITE_USE_POLLING === 'true' ||
  process.env.CHOKIDAR_USEPOLLING === 'true';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 5173,
    watch: usePolling
      ? { usePolling: true, interval: 1000 }
      : undefined,
    middlewareMode: false,
    fs: {
      strict: false,
    },
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    esbuild: {
      drop: mode === 'production' ? (['console', 'debugger'] as const) : [],
    },
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name].[hash].[ext]',
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('framer-motion')) return 'motion';
          if (id.includes('socket.io')) return 'socket';
          if (id.includes('axios')) return 'axios';
          if (id.includes('react-dom') || id.includes('react-router') || id.includes('/react/')) {
            return 'react-vendor';
          }
          return 'vendor';
        },
      },
    },
  },
  publicDir: 'public',
}));
