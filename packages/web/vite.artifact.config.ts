import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Tek dosyalık derleme.
 *
 * Tüm JavaScript, CSS ve veri seti tek bir HTML dosyasına gömülür; uygulama bir dosya
 * sunucusu olmadan, yalnızca dosyayı açarak çalışır. Paylaşım ve demo içindir.
 *
 * `VITE_EMBED_DATA=1` veri yüklemeyi `fetch` yerine gömülü modüle yönlendirir
 * (bkz. src/data/dataset.ts).
 */
export default defineConfig({
  define: {
    'import.meta.env.VITE_EMBED_DATA': JSON.stringify('1'),
    'import.meta.env.VITE_BASEMAP': JSON.stringify('offline'),
    'import.meta.env.VITE_DATA_MODE': JSON.stringify('fixture'),
  },
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    outDir: 'dist-single',
    target: 'es2022',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
