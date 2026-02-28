import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 5173,
    watch: {
      usePolling: true,
    },
    // Middleware para garantir que imagens retornem 404 em vez de index.html
    middlewareMode: false,
    fs: {
      // Permitir servir arquivos de public
      strict: false,
    },
  },
  // Configuração de build
  build: {
    rollupOptions: {
      output: {
        // Manter estrutura de diretórios para assets
        assetFileNames: 'assets/[name].[hash].[ext]',
      },
    },
  },
  // Configuração de publicDir
  publicDir: 'public',
});
