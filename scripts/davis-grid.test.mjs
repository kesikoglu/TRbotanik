import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as turf from '@turf/turf';
import { DAVIS_CODES, davisSquareFor, isDavisCode } from '@trbotanik/shared';

const here = dirname(fileURLToPath(import.meta.url));
const GRID = resolve(here, '../packages/web/public/data/geo/davis-grid.geojson');
const BORDER = resolve(here, '../packages/web/public/data/geo/turkiye.geojson');

const grid = JSON.parse(readFileSync(GRID, 'utf8'));
const border = JSON.parse(readFileSync(BORDER, 'utf8'));

describe('üretilen Davis grid GeoJSON', () => {
  it('tam 29 kare içerir', () => {
    expect(grid.features).toHaveLength(29);
  });

  it('her kare geçerli ve benzersiz bir koda sahiptir', () => {
    const codes = grid.features.map((f) => f.properties.code);
    expect(new Set(codes).size).toBe(29);
    for (const code of codes) expect(isDavisCode(code)).toBe(true);
    expect(new Set(codes)).toEqual(new Set(DAVIS_CODES));
  });

  it('MapLibre feature-state için feature.id kare kodudur', () => {
    for (const feature of grid.features) {
      expect(feature.id).toBe(feature.properties.code);
    }
  });

  it('toplam kara alanı Türkiye yüzölçümüne yakındır', () => {
    const total = grid.features.reduce((sum, f) => sum + f.properties.areaKm2, 0);
    // Gerçek yüzölçümü ~783.562 km²; kıyı genelleştirmesi %2'lik sapmaya izin verir
    expect(total).toBeGreaterThan(765_000);
    expect(total).toBeLessThan(800_000);
  });

  it('kareler birbiriyle örtüşmez', () => {
    for (let i = 0; i < grid.features.length; i++) {
      for (let j = i + 1; j < grid.features.length; j++) {
        const overlap = turf.intersect(
          turf.featureCollection([grid.features[i], grid.features[j]]),
        );
        // Komşu kareler kenardan değebilir; anlamlı bir alan paylaşmamalılar
        const areaKm2 = overlap ? turf.area(overlap) / 1e6 : 0;
        expect(areaKm2).toBeLessThan(1);
      }
    }
  });

  it('etiket noktası kendi poligonunun içindedir', () => {
    // B10/C10 gibi kenar karelerinde kare merkezi ülke dışına düşer; etiket
    // noktasının poligon içinde olması bu yüzden ayrıca doğrulanır.
    for (const feature of grid.features) {
      const point = turf.point(feature.properties.labelPoint);
      expect(
        turf.booleanPointInPolygon(point, feature),
        `${feature.properties.code} etiketi poligon dışında`,
      ).toBe(true);
    }
  });

  it('etiket noktasının kare ataması kendi koduyla tutarlıdır', () => {
    // Geometri ile davisSquareFor() aynı sistemi anlatmalı; ayrışırlarsa
    // bir kayıt bir karede sayılıp başka bir karede çizilir.
    for (const feature of grid.features) {
      const [lon, lat] = feature.properties.labelPoint;
      expect(davisSquareFor(lat, lon)).toBe(feature.properties.code);
    }
  });

  it('geometriler Türkiye sınırının içinde kalır', () => {
    const turkiye = border.features[0];
    const turkiyeArea = turf.area(turkiye) / 1e6;
    const gridArea = grid.features.reduce((sum, f) => sum + turf.area(f) / 1e6, 0);
    // Kırpma doğruysa grid toplamı ülke alanını aşamaz
    expect(gridArea).toBeLessThanOrEqual(turkiyeArea * 1.001);
  });
});
