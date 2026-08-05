#!/usr/bin/env node
/**
 * Kabul edilen her tür için GBIF'in TAM eş anlamlı ad listesini çeker.
 *
 * NEDEN AYRI BİR ADIM: `gbif-taxonomy.mjs` yalnızca occurrence facet'inin
 * döndürdüğü anahtarları çözer; bir eş anlamlı ad ancak KENDİ BAŞINA Türkiye
 * kaydı varsa o yoldan görünür. Türk floristik literatürü eski adlarla dolu
 * (özellikle Astragalus, Centaurea, Verbascum) ve bu adların çoğunun ayrı bir
 * Türkiye kaydı yok — sonuç olarak veri setinde eş anlamlılar neredeyse tamamen
 * boştu. `/species/{key}/synonyms` uç noktası listenin tamamını verir.
 *
 * Kendi kontrol noktasını tutar; `species.json`'a DOKUNMAZ — o dosya saatler
 * süren bir çalıştırmanın ürünü ve yeniden üretilmesi pahalıdır.
 *
 * ÇIKTI: data/raw/gbif/synonyms.json — { [acceptedGbifKey]: Array<{name, authorship}> }
 *
 * Bu SADECE gerçek internet erişimi olan bir ortamda (GitHub Actions) çalışır.
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchJsonRetry, mapWithConcurrency } from './lib/http.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = resolve(here, '../../data/raw/gbif');
const SPECIES_FILE = resolve(RAW_DIR, 'species.json');
const SYNONYMS_FILE = resolve(RAW_DIR, 'synonyms.json');

const GBIF = 'https://api.gbif.org/v1';
const CONCURRENCY = Number(process.env['GBIF_SYNONYM_CONCURRENCY'] ?? 4);
const PAGE_SIZE = 100;
/** Tek bir taksonun eş anlamlı listesi için üst sınır — patolojik durumlarda sayfalamayı durdurur. */
const MAX_PAGES = 10;

/**
 * GBIF'in eş anlamlı kaydından gösterilecek adı çıkarır.
 *
 * `canonicalName` yetkisiz (yazar adı olmayan) addır ve tercih edilir; yoksa
 * `scientificName`'e düşülür — ama o yazar adını da içerdiği için, ayrı alanda
 * taşınan `authorship` ile tekrar etmesin diye kırpılır.
 */
export function toSynonymEntry(record) {
  const authorship = record.authorship?.trim() || null;
  let name = record.canonicalName?.trim();
  if (!name) {
    name = record.scientificName?.trim() ?? '';
    if (authorship && name.endsWith(authorship)) {
      name = name.slice(0, -authorship.length).trim();
    }
  }
  if (!name) return null;
  return { name, authorship };
}

/**
 * Aynı adın birden çok kez (farklı yazar/statüyle) dönmesi olağandır; ada göre
 * teklileştirilir ve kararlı (alfabetik) sırayla döner — çıktı diff'lenebilir olsun.
 */
export function dedupeSynonyms(entries) {
  const byName = new Map();
  for (const entry of entries) {
    if (!entry) continue;
    const existing = byName.get(entry.name);
    // Yazar adı taşıyan kayıt, taşımayana tercih edilir.
    if (!existing || (!existing.authorship && entry.authorship)) {
      byName.set(entry.name, entry);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'la'));
}

async function fetchSynonymsFor(acceptedKey) {
  const collected = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${GBIF}/species/${acceptedKey}/synonyms?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`;
    const data = await fetchJsonRetry(url);
    for (const record of data.results ?? []) {
      collected.push(toSynonymEntry(record));
    }
    if (data.endOfRecords !== false) break;
  }
  return dedupeSynonyms(collected);
}

async function main() {
  if (!existsSync(SPECIES_FILE)) {
    console.error('data/raw/gbif/species.json yok — önce `npm run data:gbif-taxonomy` çalıştırın.');
    process.exit(1);
  }
  const species = JSON.parse(await readFile(SPECIES_FILE, 'utf8'));

  // Aynı kabul edilen taksona birden çok facet anahtarı işaret edebilir; eş
  // anlamlı listesi kabul edilen anahtara aittir, her anahtar bir kez sorgulanır.
  const acceptedKeys = new Set();
  for (const entry of Object.values(species)) {
    if (entry.taxonomicStatus === 'SYNONYM') continue;
    if (entry.gbifKey) acceptedKeys.add(entry.gbifKey);
  }

  await mkdir(RAW_DIR, { recursive: true });
  let checkpoint = {};
  if (existsSync(SYNONYMS_FILE)) {
    checkpoint = JSON.parse(await readFile(SYNONYMS_FILE, 'utf8'));
    console.log(`Var olan kontrol noktası: ${Object.keys(checkpoint).length} takson.`);
  }

  const pending = [...acceptedKeys].filter((key) => !(String(key) in checkpoint));
  console.log(
    `${acceptedKeys.size} kabul edilen taksondan ${pending.length} tanesi için eş anlamlı adlar çekilecek.`,
  );

  let processed = 0;
  let withSynonyms = 0;
  await mapWithConcurrency(pending, CONCURRENCY, async (key) => {
    try {
      const synonyms = await fetchSynonymsFor(key);
      // Boş sonuç da kaydedilir: "sorduk, eş anlamlısı yok" ile "hiç sorulmadı"
      // ayrımı korunsun ki bir sonraki çalıştırma boşuna tekrar sormasın.
      checkpoint[String(key)] = synonyms;
      if (synonyms.length > 0) withSynonyms++;
    } catch (err) {
      console.warn(`  ⚠ takson ${key} eş anlamlıları atlandı: ${err.message}`);
    }

    processed++;
    if (processed % 500 === 0) {
      await writeFile(SYNONYMS_FILE, JSON.stringify(checkpoint));
      console.log(`  💾 ara kayıt: ${processed}/${pending.length} işlendi.`);
    }
  });

  await writeFile(SYNONYMS_FILE, JSON.stringify(checkpoint));
  console.log(
    `✓ ${processed} takson işlendi, ${withSynonyms} tanesinde en az bir eş anlamlı ad bulundu. ` +
      `Kontrol noktasında toplam ${Object.keys(checkpoint).length} takson.`,
  );
}

// Yalnızca doğrudan çalıştırıldığında main() tetiklenir — test dosyası saf
// fonksiyonları (toSynonymEntry, dedupeSynonyms) import ederken yan etki olmasın.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
