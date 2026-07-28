#!/usr/bin/env node
/**
 * Davis kareleme sistemini (29 kare) GeoJSON olarak üretir.
 *
 * Kareler harici bir veri setinden indirilmez — 2°×2° tanımdan deterministik olarak
 * üretilir (bkz. packages/shared/src/davis.ts). Ardından `@turf` ile Türkiye kara
 * sınırına kırpılır, böylece choropleth ülke şeklinde okunur.
 *
 * Kenar kareleri, ülkenin grid dışına taşan uç noktalarını (Gökçeada 25.9°E,
 * Hatay'ın güney ucu 35.9°N gibi) kapsayacak şekilde dışa doğru genişletilir.
 * Bu, `davisSquareFor()` fonksiyonunun sabitleme (clamp) davranışıyla birebir
 * tutarlıdır: bir nokta hangi kareye atanıyorsa, o karenin poligonu içinde çizilir.
 *
 * Çıktı: packages/web/public/data/geo/davis-grid.geojson
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as turf from '@turf/turf';
import {
  DAVIS_CODES,
  DAVIS_SQUARE_PROVINCES,
  TURKIYE_BBOX,
  davisSquareBounds,
  davisSquareCentroid,
  parseDavisCode,
} from '@trbotanik/shared';

const here = dirname(fileURLToPath(import.meta.url));
const BORDER = resolve(here, '../packages/web/public/data/geo/turkiye.geojson');
const OUT = resolve(here, '../packages/web/public/data/geo/davis-grid.geojson');

/** Kenar karelerinin dışa taşma payı (derece) — ülke uçlarını güvenle kapsar. */
const EDGE_MARGIN = 1.5;

const MAX_COLUMN = { A: 9, B: 10, C: 10 };

/**
 * Karenin kırpma için kullanılacak sınırlarını verir. Grid kenarındaki kareler,
 * ülkenin grid dışına taşan parçalarını da kapsasın diye dışa doğru genişletilir.
 */
function clipBounds(code) {
  const { band, column } = parseDavisCode(code);
  let [west, south, east, north] = davisSquareBounds(code);

  if (column === 1) west = TURKIYE_BBOX.west - EDGE_MARGIN;
  if (column === MAX_COLUMN[band]) east = TURKIYE_BBOX.east + EDGE_MARGIN;
  if (band === 'C') south = TURKIYE_BBOX.south - EDGE_MARGIN;
  if (band === 'A') north = TURKIYE_BBOX.north + EDGE_MARGIN;

  return [west, south, east, north];
}

const borderJson = JSON.parse(await readFile(BORDER, 'utf8'));
const turkiye = borderJson.features[0];

const features = [];
const skipped = [];

for (const code of DAVIS_CODES) {
  const cell = turf.bboxPolygon(clipBounds(code));
  const clipped = turf.intersect(turf.featureCollection([cell, turkiye]));

  if (!clipped) {
    skipped.push(code);
    continue;
  }

  const [west, south, east, north] = davisSquareBounds(code);
  const { band, column } = parseDavisCode(code);

  // Etiket noktası karenin geometrik merkezi DEĞİL, kırpılmış poligonun İÇİNDE
  // garanti bir noktadır. B10/C10 gibi kenar karelerinde kare merkezi Türkiye
  // sınırlarının dışına (İran/Irak) düşer ve etiket boşlukta asılı kalırdı.
  const labelPoint = turf.pointOnFeature(clipped).geometry.coordinates;

  features.push({
    type: 'Feature',
    // MapLibre `promoteId` ile feature-state anahtarı olarak kullanılır
    id: code,
    properties: {
      code,
      band,
      column,
      /** Karenin gerçek (kırpılmamış) 2°×2° sınırları — yakınlaştırma için */
      bounds: [west, south, east, north],
      /** Kırpılmış poligon içinde, etiketin çizileceği nokta */
      labelPoint,
      /** Kırpılmamış kare merkezi — analitik referans */
      squareCentroid: davisSquareCentroid(code),
      provinces: DAVIS_SQUARE_PROVINCES[code] ?? [],
      areaKm2: Math.round(turf.area(clipped) / 1e6),
      /** Geometri kara sınırına kırpıldı; kare tanımı 2°×2° olarak korunur */
      clipped: true,
    },
    geometry: clipped.geometry,
  });
}

if (features.length !== 29) {
  console.error(
    `HATA: 29 kare bekleniyordu, ${features.length} üretildi. Atlananlar: ${skipped.join(', ')}`,
  );
  process.exit(1);
}

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify({ type: 'FeatureCollection', features }));

const totalArea = features.reduce((sum, f) => sum + f.properties.areaKm2, 0);
console.log(`✓ Davis grid yazıldı: ${OUT}`);
console.log(`  ${features.length} kare, toplam kara alanı ~${totalArea.toLocaleString('tr-TR')} km²`);
console.log(
  `  (Türkiye'nin yüzölçümü ~783.562 km² — sapma kıyı genelleştirmesinden kaynaklanır)`,
);
