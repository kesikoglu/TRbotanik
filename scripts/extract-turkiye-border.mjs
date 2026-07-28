#!/usr/bin/env node
/**
 * Türkiye kara sınırını GeoJSON olarak çıkarır.
 *
 * Kaynak: Natural Earth 1:10m, `world-atlas` npm paketi içinde TopoJSON olarak gelir.
 * Bu, geliştirme ortamının dış ağa çıkamadığı durumlarda da gerçek ülke sınırına
 * erişebilmemizi sağlar — paket içeriği npm üzerinden gelir, harici indirme gerekmez.
 *
 * Çıktı: packages/web/public/data/geo/turkiye.geojson
 */
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../packages/web/public/data/geo/turkiye.geojson');

/** Natural Earth, Türkiye'yi ISO 3166-1 sayısal kodu 792 ile tanımlar. */
const TURKIYE_ISO_NUMERIC = '792';

const topology = require('world-atlas/countries-10m.json');
const geometry = topology.objects.countries.geometries.find(
  (g) => String(g.id) === TURKIYE_ISO_NUMERIC,
);

if (!geometry) {
  console.error('HATA: world-atlas içinde 792 (Türkiye) kodlu ülke bulunamadı.');
  process.exit(1);
}

const collection = feature(topology, { type: 'GeometryCollection', geometries: [geometry] });
const [turkiye] = collection.features;

turkiye.id = 'turkiye';
turkiye.properties = {
  name: 'Türkiye',
  nameEn: 'Türkiye',
  iso3166: 'TR',
  source: 'Natural Earth 1:10m (world-atlas npm paketi)',
  license: 'Public Domain',
};

const output = { type: 'FeatureCollection', features: [turkiye] };

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(output));

const ringCount = turkiye.geometry.coordinates.length;
const pointCount = JSON.stringify(turkiye.geometry.coordinates).match(/\[-?\d/g)?.length ?? 0;
console.log(`✓ Türkiye sınırı yazıldı: ${OUT}`);
console.log(`  ${turkiye.geometry.type}, ${ringCount} parça, ~${pointCount} nokta`);
