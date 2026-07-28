import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Statik olarak '0' olduğunda `loadDataset` içindeki gömülü veri dalı ölü kod
  // olarak elenir ve 1,3 MB'lık veri parçası derlemeye hiç girmez.
  // Tek dosyalık derleme bunu '1' ile geçersiz kılar (vite.artifact.config.ts).
  define: { 'import.meta.env.VITE_EMBED_DATA': JSON.stringify('0') },
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
