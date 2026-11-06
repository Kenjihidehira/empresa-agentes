import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true, proxy: { '/api': 'http://localhost:3001' } },
  // O Three.js (~625 kB) fica num pacote próprio, carregado só ao abrir o escritório 3D.
  build: { outDir: 'dist', chunkSizeWarningLimit: 700 },
});
