#!/usr/bin/env node
/**
 * `gbif-taxonomy.mjs`'in bulduğu her tür için gerçek koordinatlı yayılış
 * kayıtlarını çeker.
 *
 * Tam GBIF Download API (hesap gerektirir, DOI üretir) yerine hesapsız arama
 * uç noktası kullanılır — `/v1/occurrence/search`. Derin sayfalama (offset+limit)
 * 100.000 ile sınırlı; ancak harita görselleştirmesi için tür başına birkaç yüz
 * nokta yeterlidir (istatistiksel örnekleme, tam sayım değil). Gerçek toplam kayıt
 * sayısı zaten `gbif-taxonomy.mjs`'in facet sonucundan `occurrenceCount` olarak
 * bilinir ve `distribution.occurrenceCount` alanında GÖSTERİLEN nokta sayısından
 * bağımsız olarak korunur — hangi rakamın "çizilen" hangisinin "gerçek toplam"
 * olduğu asla karıştırılmaz.
 *
 * ÇIKTI: data/raw/gbif/occurrences.json — { [acceptedGbifKey]: RawOccurrence[] }
 * Kesintiye dayanıklı: tür başına kontrol noktası tutulur.
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { davisSquareFor } from '@trbotanik/shared';
import { fetchJsonRetry, mapWithConcurrency } from './lib/http.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = resolve(here, '../../data/raw/gbif');
const SPECIES_FILE = resolve(RAW_DIR, 'species.json');
const OCCURRENCES_FILE = resolve(RAW_DIR, 'occurrences.json');

const GBIF = 'https://api.gbif.org/v1';
const CONCURRENCY = 6;
const PER_SPECIES_LIMIT = Number(process.env['GBIF_OCCURRENCE_PER_SPECIES_LIMIT'] ?? 300);

async function fetchOccurrencesForKey(occurrenceKey, limit) {
  const page = await fetchJsonRetry(
    `${GBIF}/occurrence/search?country=TR&speciesKey=${occurrenceKey}` +
      `&hasCoordinate=true&hasGeospatialIssue=false&limit=${Math.min(limit, 300)}`,
  );
  return page.results ?? [];
}

function toRawRecord(rec) {
  const lat = rec.decimalLatitude;
  const lon = rec.decimalLongitude;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  const square = davisSquareFor(lat, lon);
  return {
    id: `gbif-${rec.key}`,
    lat: Number(lat.toFixed(5)),
    lon: Number(lon.toFixed(5)),
    davisSquare: square,
    coordinateUncertaintyM: rec.coordinateUncertaintyInMeters ?? null,
    year: rec.year ?? null,
    province: rec.stateProvince ?? null,
    elevationM: typeof rec.elevation === 'number' ? Math.round(rec.elevation) : null,
    basisOfRecord: rec.basisOfRecord ?? 'OCCURRENCE',
    license: normalizeLicense(rec.license),
  };
}

function normalizeLicense(license) {
  if (!license) return 'UNKNOWN';
  const l = license.toUpperCase();
  if (l.includes('CC0')) return 'CC0';
  if (l.includes('CC-BY-NC-SA') || l.includes('CC BY-NC-SA')) return 'CC-BY-NC-SA';
  if (l.includes('CC-BY-NC') || l.includes('CC BY-NC')) return 'CC-BY-NC';
  if (l.includes('CC-BY-SA') || l.includes('CC BY-SA')) return 'CC-BY-SA';
  if (l.includes('CC-BY') || l.includes('CC BY')) return 'CC-BY';
  return 'UNKNOWN';
}

async function main() {
  if (!existsSync(SPECIES_FILE)) {
    console.error('data/raw/gbif/species.json yok — önce `npm run data:gbif-taxonomy` çalıştırın.');
    process.exit(1);
  }
  const species = JSON.parse(await readFile(SPECIES_FILE, 'utf8'));

  // occurrenceKey'leri kabul edilen gbifKey'e göre grupla (eş anlamlılar birleşir).
  const groups = new Map(); // acceptedGbifKey -> Set<occurrenceKey>
  for (const entry of Object.values(species)) {
    const set = groups.get(entry.gbifKey) ?? new Set();
    set.add(entry.occurrenceKey);
    groups.set(entry.gbifKey, set);
  }
  const acceptedKeys = [...groups.keys()];
  console.log(`${acceptedKeys.length} kabul edilen tür için yayılış kaydı çekilecek.`);

  await mkdir(RAW_DIR, { recursive: true });
  let checkpoint = {};
  if (existsSync(OCCURRENCES_FILE)) {
    checkpoint = JSON.parse(await readFile(OCCURRENCES_FILE, 'utf8'));
    console.log(`Var olan kontrol noktası: ${Object.keys(checkpoint).length} tür.`);
  }

  const pending = acceptedKeys.filter((k) => !checkpoint[String(k)]);
  console.log(`${pending.length} tür yeni işlenecek.`);

  let processed = 0;
  await mapWithConcurrency(pending, CONCURRENCY, async (acceptedKey) => {
    try {
      const occurrenceKeys = [...groups.get(acceptedKey)];
      const seen = new Map();
      for (const key of occurrenceKeys) {
        if (seen.size >= PER_SPECIES_LIMIT) break;
        const raw = await fetchOccurrencesForKey(key, PER_SPECIES_LIMIT - seen.size);
        for (const rec of raw) {
          const parsed = toRawRecord(rec);
          if (parsed) seen.set(parsed.id, parsed);
        }
      }
      checkpoint[String(acceptedKey)] = [...seen.values()];
    } catch (err) {
      console.warn(`  ⚠ tür ${acceptedKey} yayılış kaydı atlandı: ${err.message}`);
      checkpoint[String(acceptedKey)] = [];
    }
    processed++;
    if (processed % 200 === 0) {
      await writeFile(OCCURRENCES_FILE, JSON.stringify(checkpoint));
      console.log(`  💾 ara kayıt: ${Object.keys(checkpoint).length} tür.`);
    }
  });

  await writeFile(OCCURRENCES_FILE, JSON.stringify(checkpoint));
  const total = Object.values(checkpoint).reduce((s, arr) => s + arr.length, 0);
  console.log(`✓ ${Object.keys(checkpoint).length} tür, toplam ${total} örneklenmiş nokta.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
