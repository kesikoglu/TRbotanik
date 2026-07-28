import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          // MapLibre büyük ve nadiren değişir — ayrı chunk uzun süreli önbellek sağlar
          maplibre: ['maplibre-gl'],
        },
      },
    },
  },
});
