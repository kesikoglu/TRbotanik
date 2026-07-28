import type { LayerSpecification, SourceSpecification } from 'maplibre-gl';

/**
 * Takas edilebilir altlık harita kayıtları.
 *
 * Altlık bir kod yolu değil, bir veri nesnesidir; `VITE_BASEMAP` ile veya arayüzden
 * değiştirilir ve atıf metni altlıkla birlikte otomatik değişir.
 *
 * DOĞRULAMA NOTU: `offline` dışındaki altlıkların karo adresleri bu geliştirme
 * ortamından test EDİLEMEDİ (egress politikası tüm harici hostları engelliyor).
 * Üretime almadan önce her birinin çalıştığı ve kullanım koşullarının projeye
 * uygunluğu doğrulanmalıdır — bkz. docs/DATA_SOURCES.md.
 */

export interface BasemapDefinition {
  id: string;
  labelKey: string;
  /** Kapatılamaz atıf çubuğunda gösterilen metin (HTML) */
  attributionHtml: string;
  /** API anahtarı gerektiriyor mu */
  requiresKey: boolean;
  sources: Record<string, SourceSpecification>;
  layers: LayerSpecification[];
  /** Uzak karo yoksa ülke poligonu kara dolgusu olarak çizilir */
  drawLandFill: boolean;
  maxZoom: number;
}

const maptilerKey = import.meta.env['VITE_MAPTILER_KEY'] ?? '';

export const BASEMAPS: Record<string, BasemapDefinition> = {
  /** Ağsız geliştirme ve test için — hiçbir dış istek yapılmaz. */
  offline: {
    id: 'offline',
    labelKey: 'map.basemapOffline',
    attributionHtml: 'Sınır verisi: Natural Earth (kamu malı)',
    requiresKey: false,
    sources: {},
    layers: [],
    drawLandFill: true,
    maxZoom: 12,
  },

  /** EOX Sentinel-2 cloudless — akademik (ticari olmayan) kullanıma uygun. */
  'eox-s2cloudless': {
    id: 'eox-s2cloudless',
    labelKey: 'map.basemapEox',
    attributionHtml:
      'Sentinel-2 cloudless — <a href="https://s2maps.eu" target="_blank" rel="noreferrer">s2maps.eu</a> ' +
      'by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024) — CC BY-NC-SA 4.0',
    requiresKey: false,
    sources: {
      'basemap-raster': {
        type: 'raster',
        tiles: [
          'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg',
        ],
        tileSize: 256,
        maxzoom: 14,
        attribution: 'Sentinel-2 cloudless by EOX',
      },
    },
    layers: [{ id: 'basemap-raster', type: 'raster', source: 'basemap-raster' }],
    drawLandFill: false,
    maxZoom: 14,
  },

  /** Esri World Imagery — kullanım koşulları belirsiz, bilinçli tercih gerektirir. */
  'esri-imagery': {
    id: 'esri-imagery',
    labelKey: 'map.basemapEsri',
    attributionHtml:
      'Görüntü: Esri World Imagery — Esri, Maxar, Earthstar Geographics ve GIS kullanıcı topluluğu',
    requiresKey: false,
    sources: {
      'basemap-raster': {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        maxzoom: 18,
        attribution: 'Esri World Imagery',
      },
    },
    layers: [{ id: 'basemap-raster', type: 'raster', source: 'basemap-raster' }],
    drawLandFill: false,
    maxZoom: 18,
  },

  /** MapTiler uydu — koşulları en net olan seçenek, API anahtarı gerekir. */
  'maptiler-satellite': {
    id: 'maptiler-satellite',
    labelKey: 'map.basemapMaptiler',
    attributionHtml:
      '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noreferrer">© MapTiler</a> ' +
      '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap katkıcıları</a>',
    requiresKey: true,
    sources: {
      'basemap-raster': {
        type: 'raster',
        tiles: [`https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${maptilerKey}`],
        tileSize: 256,
        maxzoom: 20,
        attribution: '© MapTiler © OpenStreetMap katkıcıları',
      },
    },
    layers: [{ id: 'basemap-raster', type: 'raster', source: 'basemap-raster' }],
    drawLandFill: false,
    maxZoom: 20,
  },
};

/**
 * Yapılandırılmış altlığı çözer. Anahtar gerektiren bir altlık anahtarsız seçilmişse
 * sessizce bozuk bir harita göstermek yerine çevrimdışı altlığa düşer.
 */
export function resolveBasemap(id?: string): BasemapDefinition {
  const requested = id ?? import.meta.env['VITE_BASEMAP'] ?? 'offline';
  const basemap = BASEMAPS[requested];
  if (!basemap) return BASEMAPS['offline']!;
  if (basemap.requiresKey && !maptilerKey) {
    console.warn(
      `[TRbotanik] "${requested}" altlığı API anahtarı gerektiriyor (VITE_MAPTILER_KEY boş). ` +
        'Çevrimdışı altlığa dönülüyor.',
    );
    return BASEMAPS['offline']!;
  }
  return basemap;
}

/** Belirtilen id'ye karşılık gelen tanımı döner; bulunamazsa çevrimdışı altlığa düşer. */
export function getBasemap(id: string): BasemapDefinition {
  const basemap = BASEMAPS[id];
  if (!basemap) return BASEMAPS['offline']!;
  if (basemap.requiresKey && !maptilerKey) return BASEMAPS['offline']!;
  return basemap;
}

/**
 * Arayüzde gösterilecek altlık listesi, sabit bir sırayla.
 *
 * Anahtar gerektiren altlıklar, anahtar tanımlı değilse listeden tamamen çıkarılır —
 * seçilemeyecek bir seçeneği göstermek yerine.
 */
export function listAvailableBasemaps(): BasemapDefinition[] {
  const order = ['offline', 'eox-s2cloudless', 'esri-imagery', 'maptiler-satellite'];
  return order
    .map((id) => BASEMAPS[id])
    .filter((def): def is BasemapDefinition => Boolean(def && !(def.requiresKey && !maptilerKey)));
}
