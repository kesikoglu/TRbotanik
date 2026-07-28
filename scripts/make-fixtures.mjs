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
import { existsSync } from 'node:fs';
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
import { speciesKey } from './ingest/nuhungemisiParse.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(here, '../packages/web/public/data');
const BORDER = resolve(DATA_DIR, 'geo/turkiye.geojson');
const NUHUNGEMISI_DERIVED = resolve(here, '../data/nuhungemisi/derived.json');

/**
 * Nuh'un Gemisi Ulusal Biyolojik Çeşitlilik Veritabanı'ndan türetilen küratörleme
 * verisi — varsa yüklenir (`npm run data:nuhungemisi` ile üretilir). Yoksa fixture
 * üretimi bu adımı sessizce atlar; hiçbir taksonun endemizm/IUCN alanı bu kaynaktan
 * doldurulmaz ve "henüz küratörlenmedi" görünmeye devam eder.
 *
 * KISIT: Kaynak veri koordinat içermez ve şu an yalnızca Trakya + Güney Marmara
 * illerini kapsıyor (bkz. data/nuhungemisi/README.md). Bu yüzden yalnızca ZATEN
 * bilinen bir taksonun endemizm/IUCN alanını doldurmak için kullanılır; kendi
 * küratörümüzün belirlediği bir değerin (`t.endemic !== null`) üzerine YAZILMAZ —
 * resmi kaynak yalnızca boşlukları doldurur, mevcut kararları geçersiz kılmaz.
 */
let nuhungemisi = null;
if (existsSync(NUHUNGEMISI_DERIVED)) {
  const raw = JSON.parse(await readFile(NUHUNGEMISI_DERIVED, 'utf8'));
  nuhungemisi = raw;
  console.log(
    `ℹ Nuh'un Gemisi verisi yüklendi: ${raw.speciesCount} tür, ` +
      `${raw.provincesCovered.length}/81 il (${raw.provincesCovered.join(', ')})`,
  );
} else {
  console.log(
    "ℹ Nuh'un Gemisi verisi bulunamadı (data/nuhungemisi/derived.json) — " +
      "endemizm/IUCN küratörlemesi bu kaynaktan yapılmayacak. Üretmek için: " +
      'npm run data:nuhungemisi',
  );
}

const IUCN_CODES = new Set(['EX', 'EW', 'CR', 'EN', 'VU', 'NT', 'LC', 'DD', 'NE']);

function officialLookup(scientificName) {
  if (!nuhungemisi) return null;
  return nuhungemisi.species[speciesKey(scientificName)] ?? null;
}

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

/**
 * Yer tutucu görsel kaydı.
 *
 * Görselin kendisi burada üretilmez; `isPlaceholder` işaretli kayıtlar için arayüz
 * SVG'yi çalışma anında taksonun adından türetir. Veri setine 138 adet gömülü
 * data-URI koymak dosyayı gereksiz yere birkaç yüz kilobayt şişiriyordu.
 */
function placeholderImage(taxon, index) {
  return {
    id: `${taxon.sp.replace(/\s+/g, '-').toLowerCase()}-${index}`,
    url: '',
    thumbnailUrl: '',
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

const NUHUNGEMISI_SOURCE = (partial) => ({
  source: 'nuhungemisi',
  retrievedAt: nuhungemisi.generatedAt,
  url: 'https://nuhungemisi.tarimorman.gov.tr/public/istatistik',
  citation:
    "T.C. Tarım ve Orman Bakanlığı, Nuh'un Gemisi Ulusal Biyolojik Çeşitlilik Veritabanı" +
    (partial ? ` (kısmi kapsam: ${nuhungemisi.provincesCovered.length}/81 il)` : ''),
});

const details = {};
let officialEndemismFilled = 0;
let officialIucnFilled = 0;
let officialProvincesFilled = 0;

for (const t of FIXTURE_TAXA) {
  const taxonId = idByName.get(t.sp);
  const genus = t.sp.split(' ')[0];
  const own = occurrences.filter((o) => o.taxonId === taxonId);
  const observedSquares = [...new Set(own.map((o) => o.davisSquare))].sort();
  const official = officialLookup(t.sp);
  const isPartialCoverage = Boolean(nuhungemisi && nuhungemisi.provincesCovered.length < 81);

  const missingReasons = {};
  if (t.endemic === null && !(official && official.endemism !== null)) {
    missingReasons.endemism = 'henuz-kuratorlenmedi';
  }
  if (!t.alt) missingReasons.altitudeRange = 'henuz-kuratorlenmedi';
  if (!t.flw) missingReasons.floweringPeriod = 'henuz-kuratorlenmedi';
  if (!t.habitat) missingReasons.habitat = 'henuz-kuratorlenmedi';
  if (!official?.iucnCode) missingReasons.iucn = 'henuz-kuratorlenmedi';
  missingReasons.substrate = 'henuz-kuratorlenmedi';
  missingReasons.fruitingPeriod = 'henuz-kuratorlenmedi';
  missingReasons.publishedIn = 'henuz-kuratorlenmedi';
  missingReasons.davisSquares = 'henuz-kuratorlenmedi';
  missingReasons.floristicElement = 'henuz-kuratorlenmedi';
  if (!official) missingReasons.officialProvinces = 'kaynakta-yok';

  const lats = own.map((o) => o.lat);
  const lons = own.map((o) => o.lon);
  const years = own.map((o) => o.year).filter((y) => y !== null);
  const elevations = own.map((o) => o.elevationM).filter((e) => e !== null);

  // Doldurulmuş öznitelik oranı — arayüzde "veri bütünlüğü" göstergesi
  const trackedFields = ['habit', 'habitat', 'altitudeRange', 'floweringPeriod',
    'endemism', 'iucn', 'floristicElement', 'davisSquares', 'substrate', 'fruitingPeriod',
    'officialProvinces'];
  const filled = trackedFields.filter((f) => !missingReasons[f]).length;

  // Endemizm: kendi küratörümüzün belirlediği bir değer varsa (t.endemic !== null)
  // o kazanır; yalnızca "emin değiliz" durumunda ve resmi kaynak bir sınıflandırma
  // veriyorsa boşluk resmi veriyle doldurulur.
  let endemismField;
  if (t.endemic !== null) {
    endemismField = sourced({
      isEndemicToTurkiye: t.endemic,
      ...(t.endemic ? { scope: 'ulusal' } : {}),
    });
  } else if (official && official.endemism !== null) {
    officialEndemismFilled++;
    const isEndemic = official.endemism === 'endemik' || official.endemism === 'lokal-endemik';
    endemismField = sourced(
      { isEndemicToTurkiye: isEndemic, ...(isEndemic ? { scope: official.endemism === 'lokal-endemik' ? 'yerel' : 'ulusal' } : {}) },
      NUHUNGEMISI_SOURCE(isPartialCoverage),
    );
  } else {
    endemismField = sourced({ isEndemicToTurkiye: false });
  }

  const iucnField =
    official?.iucnCode && IUCN_CODES.has(official.iucnCode)
      ? (officialIucnFilled++,
        sourced({ category: official.iucnCode, scope: 'ulusal' }, NUHUNGEMISI_SOURCE(isPartialCoverage)))
      : sourced(null);

  const officialProvincesField = official
    ? (officialProvincesFilled++,
      sourced(official.provinces, {
        ...NUHUNGEMISI_SOURCE(isPartialCoverage),
      }))
    : sourced([]);

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
    endemism: endemismField,
    iucn: iucnField,
    floristicElement: sourced(t.endemic === true ? [pick(FLORISTIC)] : []),
    davisSquares: sourced([]),
    officialProvinces: officialProvincesField,
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

if (nuhungemisi) {
  console.log(
    `ℹ Nuh'un Gemisi ile dolduruldu: ${officialEndemismFilled} endemizm boşluğu, ` +
      `${officialIucnFilled} IUCN kategorisi, ${officialProvincesFilled} tür için resmi il listesi`,
  );
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
