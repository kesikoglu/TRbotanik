import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages bir proje sitesini "kullanıcıadı.github.io/repo-adı/" alt yolunda
  // yayınlar; kök yol yerine bu alt yol kullanılmalıdır. Yerel geliştirmede ve tek
  // dosyalık derlemede (vite.artifact.config.ts kendi ayarını kullanır) bu değişken
  // tanımsızdır ve kök yol ('/') geçerli kalır.
  base: process.env['GH_PAGES_BASE'] ?? '/',
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
