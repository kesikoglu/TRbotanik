#!/usr/bin/env node
/**
 * GBIF'ten Türkiye'de kaydı olan damarlı bitki (Tracheophyta) türlerini keşfeder.
 *
 * Yöntem: `/v1/occurrence/search` üzerinde `facet=speciesKey` ile TEK bir sorgu
 * ailesinde (facetOffset ile sayfalanarak) Türkiye'de en az bir kaydı olan tüm
 * tür anahtarlarını ve kayıt sayılarını alır. Bu, planın ilk taslağındaki
 * "familya → cins → tür" iç içe facet gezintisinden çok daha ucuzdur ve GBIF'in
 * `facetOffset`/`facetLimit` sayfalamasıyla tek uç noktada tüm türleri verir.
 *
 * Her tür anahtarı için `/v1/species/{key}` (kabul edilmemişse `acceptedKey`'e
 * takip edilir) ve `/v1/species/{key}/vernacularNames` (tr/en) çekilir.
 *
 * ÇIKTI: data/raw/gbif/species.json (gitignore'da; regenere edilebilir ham veri).
 * Bu script KESİNTİYE DAYANIKLIDIR: zaten çekilmiş türler bir sonraki çalıştırmada
 * atlanır — GitHub Actions runner'ında uzun sürebileceği ve iş zaman aşımına
 * uğrayabileceği için önemlidir (bkz. refresh-data.yml, actions/cache).
 *
 * Bu SADECE gerçek internet erişimi olan bir ortamda (GitHub Actions) çalışır —
 * geliştirme konteynerinin egress politikası api.gbif.org'u engelliyor.
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchJsonRetry, mapWithConcurrency } from './lib/http.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = resolve(here, '../../data/raw/gbif');
const SPECIES_FILE = resolve(RAW_DIR, 'species.json');

const GBIF = 'https://api.gbif.org/v1';
const TRACHEOPHYTA_KEY = 7707728; // GBIF backbone: Tracheophyta (damarlı bitkiler)
// Occurrences adımında (bkz. gbif-occurrences.mjs) GBIF saatler süren bir 429
// fırtınasına girdi; bu adım kendi başına sorunsuz tamamlanmış olsa da, aynı
// çalıştırma içinde toplam yükü azaltmak için ihtiyatlı biçimde düşürüldü.
const CONCURRENCY = 4;
const SPECIES_LIMIT = process.env['GBIF_SPECIES_LIMIT']
  ? Number(process.env['GBIF_SPECIES_LIMIT'])
  : null;

async function discoverSpeciesKeys() {
  const pageSize = 1000;
  let offset = 0;
  const counts = new Map();
  console.log('Türkiye Tracheophyta tür anahtarları keşfediliyor (facet sayfalama)…');
  for (;;) {
    const url =
      `${GBIF}/occurrence/search?country=TR&taxonKey=${TRACHEOPHYTA_KEY}&limit=0` +
      `&facet=speciesKey&facetLimit=${pageSize}&facetOffset=${offset}`;
    const data = await fetchJsonRetry(url);
    const page = data.facets?.[0]?.counts ?? [];
    for (const c of page) {
      if (c.name === null || c.name === undefined) continue;
      counts.set(Number(c.name), Number(c.count));
    }
    console.log(`  facetOffset=${offset}: ${page.length} anahtar`);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return counts;
}

/** Kabul edilmemişse (synonym) kabul edilen kayda takip eder. */
async function resolveAcceptedSpecies(key) {
  const record = await fetchJsonRetry(`${GBIF}/species/${key}`);
  if (record.taxonomicStatus && record.taxonomicStatus !== 'ACCEPTED' && record.acceptedKey) {
    const accepted = await fetchJsonRetry(`${GBIF}/species/${record.acceptedKey}`);
    return { record: accepted, originalSynonym: record };
  }
  return { record, originalSynonym: null };
}

async function fetchVernacularNames(key) {
  try {
    const data = await fetchJsonRetry(`${GBIF}/species/${key}/vernacularNames`);
    const tr = [];
    const en = [];
    for (const v of data.results ?? []) {
      const lang = (v.language ?? '').toLowerCase();
      if (!v.vernacularName) continue;
      if (lang === 'tur' || lang === 'tr') tr.push(v.vernacularName);
      else if (lang === 'eng' || lang === 'en') en.push(v.vernacularName);
    }
    return { tr: [...new Set(tr)], en: [...new Set(en)] };
  } catch {
    return { tr: [], en: [] };
  }
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });

  /** @type {Record<string, object>} */
  let checkpoint = {};
  if (existsSync(SPECIES_FILE)) {
    checkpoint = JSON.parse(await readFile(SPECIES_FILE, 'utf8'));
    console.log(`Var olan kontrol noktası yüklendi: ${Object.keys(checkpoint).length} tür.`);
  }

  const counts = await discoverSpeciesKeys();
  let keys = [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  console.log(`Toplam ${keys.length} benzersiz tür anahtarı bulundu.`);

  if (SPECIES_LIMIT) {
    keys = keys.slice(0, SPECIES_LIMIT);
    console.log(`GBIF_SPECIES_LIMIT=${SPECIES_LIMIT} — en çok kayıtlı ilk ${keys.length} tür işlenecek.`);
  }

  const pending = keys.filter((k) => !checkpoint[String(k)]);
  console.log(`${pending.length} tür yeni işlenecek (${keys.length - pending.length} zaten kontrol noktasında).`);

  let processed = 0;
  const acceptedCache = new Map();

  await mapWithConcurrency(pending, CONCURRENCY, async (key) => {
    try {
      const { record, originalSynonym } = await resolveAcceptedSpecies(key);
      const acceptedKey = record.key;

      let vernacular = acceptedCache.get(acceptedKey);
      if (!vernacular) {
        vernacular = await fetchVernacularNames(acceptedKey);
        acceptedCache.set(acceptedKey, vernacular);
      }

      checkpoint[String(key)] = {
        gbifKey: acceptedKey,
        occurrenceKey: key, // occurrence facet'inin orijinal anahtarı — occurrence eşleştirmesi için
        occurrenceCount: counts.get(key) ?? 0,
        canonicalName: record.canonicalName ?? record.scientificName,
        authorship: record.authorship ?? null,
        rank: record.rank,
        taxonomicStatus: originalSynonym ? 'SYNONYM' : (record.taxonomicStatus ?? 'ACCEPTED'),
        kingdom: record.kingdom ?? null,
        phylum: record.phylum ?? null,
        class: record.class ?? null,
        order: record.order ?? null,
        family: record.family ?? null,
        genus: record.genus ?? null,
        vernacularTr: vernacular.tr,
        vernacularEn: vernacular.en,
        synonymOf: originalSynonym ? record.canonicalName ?? record.scientificName : null,
        originalName: originalSynonym
          ? originalSynonym.canonicalName ?? originalSynonym.scientificName
          : null,
      };
    } catch (err) {
      console.warn(`  ⚠ tür ${key} atlandı: ${err.message}`);
    }

    processed++;
    if (processed % 200 === 0) {
      await writeFile(SPECIES_FILE, JSON.stringify(checkpoint));
      console.log(`  💾 ara kayıt: ${Object.keys(checkpoint).length} tür kontrol noktasında.`);
    }
  });

  await writeFile(SPECIES_FILE, JSON.stringify(checkpoint));
  console.log(`✓ ${Object.keys(checkpoint).length} tür data/raw/gbif/species.json içinde.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
