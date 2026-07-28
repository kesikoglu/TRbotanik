import type { Map as MapLibreMap } from 'maplibre-gl';

/**
 * Yalnızca `VITE_EXPOSE_MAP_DEBUG=1` ile derlenen e2e yapılandırmasında var olur
 * (bkz. MapCanvas.tsx ve playwright.config.ts). Üretim derlemesinde tanımsızdır.
 */
declare global {
  interface Window {
    __trbotanikMap: MapLibreMap;
  }
}

export {};
