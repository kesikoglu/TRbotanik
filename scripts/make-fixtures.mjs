#!/usr/bin/env node
/**
 * Fixture veri setini üretir.
 *
 * ÖNEMLİ: Bu scriptin ürettiği yayılış noktaları SENTETİKTİR. Gerçek gözlem kaydı
 * değildir ve öyle sunulmamalıdır. Takson adları ve sınıflandırma gerçektir
 * (scripts/fixtures/taxa.mjs), ancak noktalar tohumlu bir rastgele sayı üretecinden
 * gelir. Üretilen manifest `mode: 'fixture'` taşır ve arayüz bunu kalıcı bir uyarı
 * bandı ile gösterir.
 *
 * Tohumlu PRNG kullanılmasının nedeni çıktının deterministik ve diff'lenebilir
 * olmasıdır — aynı girdi her zaman aynı dosyayı üretir.
 *
 * Çıktılar (packages/web/public/data/):
 *   taxonomy.json      DFS indeksli takson ağacı
 *   occurrences.json   sentetik yayılış noktaları
 *   details.json       takson başına tam PlantDetail
 *   manifest.json      sürüm, sayaçlar, veri modu uyarısı
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as turf from '@turf/turf';
import {
  buildTaxonomyNodes,
  davisSquareFor,
  indexByRank,
  rollUpCounts,
} from '@trbotanik/shared';
import { FIXTURE_TAXA } from './fixtures/taxa.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(here, '../packages/web/public/data');
const BORDER = resolve(DATA_DIR, 'geo/turkiye.geojson');

const SEED = 20260728;
const POINTS_TARGET = 3000;
const GENERATED_AT = '2026-07-28T00:00:00.000Z'; // sabit → deterministik çıktı

/* ------------------------------------------------------------------ *
 * Tohumlu PRNG (mulberry32) — deterministik, diff'lenebilir çıktı için
 * ------------------------------------------------------------------ */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(SEED);
const pick = (arr) => arr[Math.floor(random() * arr.length)];
const randInt = (min, max) => min + Math.floor(random() * (max - min + 1));

/* ------------------------------------------------------------------ *
 * Taksonomi ağacı
 * ------------------------------------------------------------------ */
const raw = [];
const seen = new Set();
const addOnce = (key, entry) => {
  if (seen.has(key)) return;
  seen.add(key);
  raw.push(entry);
};

for (const t of FIXTURE_TAXA) {
  const genus = t.sp.split(' ')[0];
  addOnce(`c:${t.cls}`, { key: `c:${t.cls}`, parentKey: null, rank: 'CLASS', name: t.cls });
  addOnce(`o:${t.ord}`, { key: `o:${t.ord}`, parentKey: `c:${t.cls}`, rank: 'ORDER', name: t.ord });
  addOnce(`f:${t.fam}`, { key: `f:${t.fam}`, parentKey: `o:${t.ord}`, rank: 'FAMILY', name: t.fam });
  addOnce(`g:${genus}`, { key: `g:${genus}`, parentKey: `f:${t.fam}`, rank: 'GENUS', name: genus });
  addOnce(`s:${t.sp}`, {
    key: `s:${t.sp}`,
    parentKey: `g:${genus}`,
    rank: 'SPECIES',
    name: t.sp,
    authorship: t.au,
    vernacularTr: t.tr?.[0],
  });
}

const nodes = buildTaxonomyNodes(raw);
const idByName = new Map(nodes.map((n) => [n.name, n.id]));

/* ------------------------------------------------------------------ *
 * Sentetik yayılış noktaları — Türkiye poligonu içinde reddetme örneklemesi
 * ------------------------------------------------------------------ */
const borderJson = JSON.parse(await readFile(BORDER, 'utf8'));
const turkiye = borderJson.features[0];
const [minLon, minLat, maxLon, maxLat] = turf.bbox(turkiye);

function randomPointInTurkiye() {
  // Reddetme örneklemesi: kutu içinde nokta üret, kara üzerinde değilse yeniden dene.
  for (let attempt = 0; attempt < 500; attempt++) {
    const lon = minLon + random() * (maxLon - minLon);
    const lat = minLat + random() * (maxLat - minLat);
    if (turf.booleanPointInPolygon(turf.point([lon, lat]), turkiye)) return [lon, lat];
  }
  return null;
}

/**
 * Her tür için gerçekçi bir "yayılış merkezi" ve yarıçapı seçilir; noktalar bu
 * merkezin çevresine kümelenir. Böylece choropleth düz değil, dokulu görünür —
 * gerçek yayılış desenlerinin nasıl okunacağını gösterir.
 */
const speciesEntries = FIXTURE_TAXA.map((t) => ({
  taxon: t,
  taxonId: idByName.get(t.sp),
  center: randomPointInTurkiye(),
  spreadDeg: 0.8 + random() * 3.2,
  weight: 0.3 + random() * 1.7,
}));

const totalWeight = speciesEntries.reduce((s, e) => s + e.weight, 0);
const BASIS = ['PRESERVED_SPECIMEN', 'HUMAN_OBSERVATION', 'PRESERVED_SPECIMEN', 'MATERIAL_SAMPLE'];

const occurrences = [];
let sequence = 0;

for (const entry of speciesEntries) {
  if (!entry.center) continue;
  const target = Math.max(6, Math.round((entry.weight / totalWeight) * POINTS_TARGET));

  for (let i = 0; i < target; i++) {
    let coords = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      // Merkez çevresinde normal-benzeri dağılım (iki üniform toplamı)
      const dLon = (random() + random() - 1) * entry.spreadDeg;
      const dLat = (random() + random() - 1) * entry.spreadDeg * 0.7;
      const lon = entry.center[0] + dLon;
      const lat = entry.center[1] + dLat;
      if (turf.booleanPointInPolygon(turf.point([lon, lat]), turkiye)) {
        coords = [lon, lat];
        break;
      }
    }
    if (!coords) continue;

    const [lon, lat] = coords;
    const square = davisSquareFor(lat, lon);
    if (!square) continue;

    const alt = entry.taxon.alt;
    occurrences.push({
      id: `fx-${(++sequence).toString().padStart(5, '0')}`,
      taxonId: entry.taxonId,
      lat: Number(lat.toFixed(5)),
      lon: Number(lon.toFixed(5)),
      davisSquare: square,
      coordinateUncertaintyM: pick([10, 25, 100, 100, 250, 1000, 5000]),
      year: randInt(1962, 2025),
      province: null,
      elevationM: alt ? randInt(alt[0], alt[1]) : randInt(0, 2200),
      basisOfRecord: pick(BASIS),
      source: 'fixture',
      license: pick(['CC0', 'CC-BY', 'CC-BY-NC']),
    });
  }
}

/* ------------------------------------------------------------------ *
 * Sayaçları ağaçta topla
 * ------------------------------------------------------------------ */
const perTaxon = new Map();
for (const t of FIXTURE_TAXA) {
  perTaxon.set(idByName.get(t.sp), { occurrences: 0, isEndemic: t.endemic === true });
}
for (const occ of occurrences) {
  const entry = perTaxon.get(occ.taxonId);
  if (entry) entry.occurrences++;
}
rollUpCounts(nodes, perTaxon);

/* ------------------------------------------------------------------ *
 * PlantDetail kayıtları
 * ------------------------------------------------------------------ */
const FIXTURE_SOURCE = {
  source: 'fixture',
  retrievedAt: GENERATED_AT,
  citation: 'TRbotanik örnek veri seti — gerçek gözlem kaydı değildir',
};
const CURATED_SOURCE = {
  source: 'curated',
  retrievedAt: GENERATED_AT,
  citation: 'TRbotanik küratör notu (Faz 1 çekirdek bilgisi)',
};

const sourced = (value, provenance = CURATED_SOURCE) => ({ value, provenance });

/** İçi boş bir yer tutucu görsel — git'te ikili dosya tutmadan galeriyi test eder. */
function placeholderImage(taxon, index) {
  const hue = (taxon.sp.length * 37 + index * 61) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
<stop offset="0%" stop-color="hsl(${hue} 45% 72%)"/><stop offset="100%" stop-color="hsl(${(hue + 40) % 360} 40% 42%)"/>
</linearGradient></defs>
<rect width="400" height="300" fill="url(#g)"/>
<circle cx="200" cy="128" r="52" fill="rgba(255,255,255,.42)"/>
<path d="M200 180 L200 250 M200 205 Q168 190 152 205 M200 225 Q232 210 248 225" stroke="rgba(255,255,255,.75)" stroke-width="6" fill="none" stroke-linecap="round"/>
<text x="200" y="278" font-family="Georgia,serif" font-size="17" font-style="italic" fill="#fff" text-anchor="middle">${taxon.sp}</text>
<text x="200" y="26" font-family="system-ui,sans-serif" font-size="12" fill="rgba(255,255,255,.9)" text-anchor="middle">ÖRNEK GÖRSEL — GERÇEK FOTOĞRAF DEĞİL</text>
</svg>`;
  const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  return {
    id: `${taxon.sp.replace(/\s+/g, '-').toLowerCase()}-${index}`,
    url,
    thumbnailUrl: url,
    width: 400,
    height: 300,
    caption: `${taxon.sp} — yer tutucu görsel`,
    photographer: null,
    license: 'CC0',
    licenseUrl: null,
    attributionText: 'Yer tutucu görsel — gerçek fotoğraf değildir',
    source: 'placeholder',
    sourceUrl: '',
    isPlaceholder: true,
  };
}

const FLORISTIC = ['Iran-Turan', 'Akdeniz', 'Avrupa-Sibirya', 'Oksin', 'Kozmopolit'];

const details = {};
for (const t of FIXTURE_TAXA) {
  const taxonId = idByName.get(t.sp);
  const genus = t.sp.split(' ')[0];
  const own = occurrences.filter((o) => o.taxonId === taxonId);
  const observedSquares = [...new Set(own.map((o) => o.davisSquare))].sort();

  const missingReasons = {};
  if (t.endemic === null) missingReasons.endemism = 'henuz-kuratorlenmedi';
  if (!t.alt) missingReasons.altitudeRange = 'henuz-kuratorlenmedi';
  if (!t.flw) missingReasons.floweringPeriod = 'henuz-kuratorlenmedi';
  if (!t.habitat) missingReasons.habitat = 'henuz-kuratorlenmedi';
  missingReasons.iucn = 'henuz-kuratorlenmedi';
  missingReasons.substrate = 'henuz-kuratorlenmedi';
  missingReasons.fruitingPeriod = 'henuz-kuratorlenmedi';
  missingReasons.publishedIn = 'henuz-kuratorlenmedi';
  missingReasons.davisSquares = 'henuz-kuratorlenmedi';
  missingReasons.floristicElement = 'henuz-kuratorlenmedi';

  const lats = own.map((o) => o.lat);
  const lons = own.map((o) => o.lon);
  const years = own.map((o) => o.year).filter((y) => y !== null);
  const elevations = own.map((o) => o.elevationM).filter((e) => e !== null);

  // Doldurulmuş öznitelik oranı — arayüzde "veri bütünlüğü" göstergesi
  const trackedFields = ['habit', 'habitat', 'altitudeRange', 'floweringPeriod',
    'endemism', 'iucn', 'floristicElement', 'davisSquares', 'substrate', 'fruitingPeriod'];
  const filled = trackedFields.filter((f) => !missingReasons[f]).length;

  details[taxonId] = {
    taxonId,
    acceptedName: sourced(t.sp),
    authorship: sourced(t.au),
    taxonomicStatus: sourced('ACCEPTED'),
    synonyms: sourced([]),
    publishedIn: sourced(null),
    classification: sourced({ class: t.cls, order: t.ord, family: t.fam, genus }),
    vernacularTr: sourced((t.tr ?? []).map((name) => ({ name }))),
    vernacularEn: sourced([]),
    habit: sourced(t.habit ?? null),
    lifeForm: sourced(null),
    habitat: sourced(t.habitat ?? null),
    altitudeRange: sourced(t.alt ? { minM: t.alt[0], maxM: t.alt[1] } : null),
    floweringPeriod: sourced(t.flw ? { startMonth: t.flw[0], endMonth: t.flw[1] } : null),
    fruitingPeriod: sourced(null),
    substrate: sourced(null),
    endemism: sourced(
      t.endemic === null
        ? { isEndemicToTurkiye: false }
        : { isEndemicToTurkiye: t.endemic, ...(t.endemic ? { scope: 'ulusal' } : {}) },
    ),
    iucn: sourced(null),
    floristicElement: sourced(t.endemic === true ? [pick(FLORISTIC)] : []),
    davisSquares: sourced([]),
    observedDavisSquares: observedSquares,
    distribution: {
      occurrenceCount: own.length,
      bbox: own.length
        ? [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
        : null,
      centroid: own.length
        ? [
            Number((lons.reduce((a, b) => a + b, 0) / lons.length).toFixed(4)),
            Number((lats.reduce((a, b) => a + b, 0) / lats.length).toFixed(4)),
          ]
        : null,
      provinces: [],
      firstRecordYear: years.length ? Math.min(...years) : null,
      lastRecordYear: years.length ? Math.max(...years) : null,
      elevationObserved: elevations.length
        ? { minM: Math.min(...elevations), maxM: Math.max(...elevations) }
        : null,
    },
    images: [placeholderImage(t, 0), placeholderImage(t, 1)],
    identifiers: {},
    references: [],
    missingReasons,
    dataCompleteness: Number((filled / trackedFields.length).toFixed(2)),
    _provenanceNote: 'fixture',
  };
}

// Görsel kaynağını fixture olarak işaretle
for (const detail of Object.values(details)) {
  detail.observedDavisSquares = detail.observedDavisSquares ?? [];
  delete detail._provenanceNote;
}

/* ------------------------------------------------------------------ *
 * Yazma
 * ------------------------------------------------------------------ */
const manifest = {
  version: '0.1.0-fixture',
  generatedAt: GENERATED_AT,
  mode: 'fixture',
  taxonCount: FIXTURE_TAXA.length,
  occurrenceCount: occurrences.length,
  gbifDownloadDoi: null,
  gbifRetrievedAt: null,
  notice:
    'Bu veri seti örnek (fixture) veridir. Takson adları ve sınıflandırma gerçektir, ' +
    'ancak yayılış noktaları sentetik olarak üretilmiştir ve gerçek gözlem kaydı değildir. ' +
    'Bilimsel amaçla kullanılamaz.',
};

const taxonomy = {
  version: manifest.version,
  generatedAt: GENERATED_AT,
  nodes,
  byRank: indexByRank(nodes),
  rootIds: nodes.filter((n) => n.parentId === null).map((n) => n.id),
};

await mkdir(DATA_DIR, { recursive: true });
await writeFile(resolve(DATA_DIR, 'taxonomy.json'), JSON.stringify(taxonomy));
await writeFile(resolve(DATA_DIR, 'occurrences.json'), JSON.stringify(occurrences));
await writeFile(resolve(DATA_DIR, 'details.json'), JSON.stringify(details));
await writeFile(resolve(DATA_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

const squares = new Set(occurrences.map((o) => o.davisSquare));
console.log('✓ Fixture veri seti yazıldı');
console.log(`  ${nodes.length} düğüm (${FIXTURE_TAXA.length} tür, ${taxonomy.byRank.FAMILY.length} familya)`);
console.log(`  ${occurrences.length} sentetik nokta, ${squares.size}/29 Davis karesinde`);
console.log(`  ${Object.keys(details).length} tür ayrıntı kaydı`);
