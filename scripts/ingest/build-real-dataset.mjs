#!/usr/bin/env node
/**
 * `gbif-taxonomy.mjs`, `gbif-occurrences.mjs` ve `inaturalist-images.mjs`'in
 * ürettiği ham kontrol noktalarını (data/raw/gbif/*.json — gitignore'da) ve
 * Nuh'un Gemisi küratörleme verisini (data/nuhungemisi/derived.json) birleştirip
 * uygulamanın okuduğu tam şemada bir anlık görüntü üretir:
 *
 *   data/gbif-snapshot/{manifest,taxonomy,occurrences,details}.json
 *
 * Bu anlık görüntü — nuhungemisi'nin ham xlsx'i gibi — COMMIT EDİLİR. Neden:
 * GBIF/iNaturalist'ten yeniden çekmek onlarca dakika ile saatler arası sürebilir
 * (bkz. ingest scriptlerinin başlık yorumları) ve normal bir push'ta (ör. bir
 * dokümantasyon düzeltmesi) bunu yeniden yapmak hem yavaş hem gereksizdir.
 * `scripts/select-dataset.mjs` (data:all zincirinin son adımı) bu anlık görüntü
 * varsa onu `packages/web/public/data/`'ya kopyalar; yoksa örnek (fixture)
 * veriye döner. Böylece gerçek veri yalnızca BEN `refresh-data.yml` iş akışını
 * (ingest scriptlerine dokunarak veya elle) tetiklediğimde yenilenir.
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildTaxonomyNodes,
  indexByRank,
  normalizeProvinceName,
  packDetails,
  rollUpCounts,
} from '@trbotanik/shared';
import { speciesKey } from './nuhungemisiParse.mjs';
import { buildWcvpIndex, parseWcvpCsv } from './wcvpParse.mjs';
import { dedupeSynonyms } from './gbif-synonyms.mjs';
import { parseVolumeFile } from './floraOfTurkeyParse.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = resolve(here, '../../data/raw/gbif');
const SNAPSHOT_DIR = resolve(here, '../../data/gbif-snapshot');
const NUHUNGEMISI_DERIVED = resolve(here, '../../data/nuhungemisi/derived.json');
const EUNIS_FILE = resolve(here, '../../data/raw/eunis/species-habitats.json');
const WCVP_FILE = resolve(here, '../../data/curated/wcvp-turkey.csv');
const FLORA_OF_TURKEY_DIR = resolve(here, '../../data/curated/flora-of-turkey');
const IMAGE_BLOCKLIST_FILE = resolve(here, '../../data/curated/image-blocklist.csv');

const IUCN_CODES = new Set(['EX', 'EW', 'CR', 'EN', 'VU', 'NT', 'LC', 'DD', 'NE']);

function sourced(value, provenance) {
  return { value, provenance };
}

const now = new Date().toISOString();
const GBIF_SOURCE = {
  source: 'gbif',
  retrievedAt: now,
  url: 'https://www.gbif.org',
  citation: 'GBIF.org — Global Biodiversity Information Facility (hesapsız arama API\'si)',
};
const INAT_PROVENANCE = {
  source: 'inaturalist',
  retrievedAt: now,
  citation: 'iNaturalist gözlem fotoğrafı',
};

async function main() {
  const speciesFile = resolve(RAW_DIR, 'species.json');
  if (!existsSync(speciesFile)) {
    console.error('data/raw/gbif/species.json yok — önce `npm run data:gbif-taxonomy` çalıştırın.');
    process.exit(1);
  }
  const species = JSON.parse(await readFile(speciesFile, 'utf8'));

  const occurrencesFile = resolve(RAW_DIR, 'occurrences.json');
  const rawOccurrencesByKey = existsSync(occurrencesFile)
    ? JSON.parse(await readFile(occurrencesFile, 'utf8'))
    : {};

  const imagesFile = resolve(RAW_DIR, 'images.json');
  const imagesByKey = existsSync(imagesFile) ? JSON.parse(await readFile(imagesFile, 'utf8')) : {};

  // Kabul edilen anahtar başına TAM eş anlamlı listesi (bkz. gbif-synonyms.mjs).
  // Yoksa aşağıda occurrence facet'inden toplanan kısmi listeye düşülür.
  const synonymsFile = resolve(RAW_DIR, 'synonyms.json');
  const synonymsByKey = existsSync(synonymsFile)
    ? JSON.parse(await readFile(synonymsFile, 'utf8'))
    : {};
  if (Object.keys(synonymsByKey).length) {
    console.log(`ℹ GBIF eş anlamlı listesi yüklendi: ${Object.keys(synonymsByKey).length} takson.`);
  }

  // Kaynak API'lerin (özellikle iNaturalist "needs_id" gözlemleri) yanlış türle
  // eşleştirdiği görseller için — ham kontrol noktası her çalıştırmada aynı hatalı
  // görseli getirmeye devam eder, bu yüzden dışlama burada, kalıcı olarak yapılır.
  let blockedImageIds = new Set();
  if (existsSync(IMAGE_BLOCKLIST_FILE)) {
    const blocklistText = await readFile(IMAGE_BLOCKLIST_FILE, 'utf8');
    blockedImageIds = new Set(
      blocklistText
        .split('\n')
        .slice(1)
        .map((line) => line.split(',')[0]?.trim())
        .filter(Boolean),
    );
    console.log(`ℹ Görsel kara listesi yüklendi: ${blockedImageIds.size} görsel dışlanacak.`);
  }

  let nuhungemisi = null;
  if (existsSync(NUHUNGEMISI_DERIVED)) {
    nuhungemisi = JSON.parse(await readFile(NUHUNGEMISI_DERIVED, 'utf8'));
    console.log(`ℹ Nuh'un Gemisi verisi yüklendi: ${nuhungemisi.speciesCount} tür.`);
  }
  const officialLookup = (name) => (nuhungemisi ? nuhungemisi.species[speciesKey(name)] ?? null : null);

  let eunis = null;
  if (existsSync(EUNIS_FILE)) {
    eunis = JSON.parse(await readFile(EUNIS_FILE, 'utf8'));
    console.log(`ℹ EUNIS habitat verisi yüklendi: ${eunis.speciesCount} tür eşleşmesi.`);
  }
  const eunisLookup = (name) => (eunis ? eunis.species[speciesKey(name)] ?? null : null);

  let wcvpIndex = null;
  if (existsSync(WCVP_FILE)) {
    const wcvpRows = parseWcvpCsv(await readFile(WCVP_FILE, 'utf8'));
    const byName = buildWcvpIndex(wcvpRows);
    wcvpIndex = new Map([...byName].map(([name, value]) => [speciesKey(name), value]));
    console.log(`ℹ WCVP verisi yüklendi: ${wcvpIndex.size} kabul edilmiş takson.`);
  }
  const wcvpLookup = (name) => (wcvpIndex ? wcvpIndex.get(speciesKey(name)) ?? null : null);
  const WCVP_SOURCE = {
    source: 'powo',
    retrievedAt: now,
    url: 'https://powo.science.kew.org',
    citation:
      'WCVP (World Checklist of Vascular Plants) — Royal Botanic Gardens, Kew. ' +
      'Türkiye (TDWG:TUR/TUE) dağılımlı kabul edilmiş taksonlardan; kullanıcı tarafından yerel olarak ' +
      'filtrelenip data/curated/wcvp-turkey.csv olarak eklendi.',
  };

  // data/curated/flora-of-turkey/'daki .xlsx dosyaları TEK bir esere ait değil —
  // Davis kare kodu kullanan, Türkiye florası üzerine basılı literatürün tamamına
  // ait (bkz. floraOfTurkeyParse.mjs başlık yorumu): P. H. Davis'in Flora of
  // Turkey ciltleri (Davis kareleme sisteminin BİZZAT kaynağı) ve, yalnızca
  // Astragalus cinsi için, D. Podlech & Sh. Zarre'nin 2013 revizyonu. Her eser
  // OCR ile çıkarılıp .xlsx olarak eklenir. Birden çok eser/cilt aynı türe
  // atıfta bulunabilir, bu yüzden kareler tümü boyunca birleştirilir (union) —
  // hangi karenin hangi eserden geldiği ayrı ayrı izlenmez, tek bir ortak atıf
  // metninde her ikisi de anılır (aşağıda).
  const floraOfTurkeyIndex = new Map(); // speciesKey(ad) -> Set<DavisCode>
  if (existsSync(FLORA_OF_TURKEY_DIR)) {
    const files = (await readdir(FLORA_OF_TURKEY_DIR)).filter((f) => f.endsWith('.xlsx'));
    for (const file of files) {
      const perVolume = await parseVolumeFile(resolve(FLORA_OF_TURKEY_DIR, file));
      for (const [name, squares] of perVolume) {
        const key = speciesKey(name);
        const existing = floraOfTurkeyIndex.get(key) ?? new Set();
        for (const code of squares) existing.add(code);
        floraOfTurkeyIndex.set(key, existing);
      }
      console.log(`ℹ Flora of Turkey ${file} yüklendi: ${perVolume.size} tür için kare atfı.`);
    }
  }
  const floraOfTurkeyLookup = (name) => {
    const squares = floraOfTurkeyIndex.get(speciesKey(name));
    return squares ? [...squares].sort() : null;
  };
  const FLORA_OF_TURKEY_SOURCE = {
    source: 'flora-of-turkey',
    retrievedAt: now,
    citation:
      "P. H. Davis (ed.), Flora of Turkey and the East Aegean Islands (1965–1988) — " +
      'Davis kareleme sisteminin tanımlandığı asıl kaynak; Astragalus cinsi için ayrıca ' +
      'D. Podlech & Sh. Zarre, A taxonomic revision of the genus Astragalus L. in the Old World, ' +
      'Vol. III (Naturhistorisches Museum Wien, 2013). Basılı ciltlerin OCR taramasından, ' +
      'dağılım paragraflarındaki Davis kare atıflarından çıkarıldı (kullanıcı tarafından sağlandı).',
  };

  const EUNIS_SOURCE = {
    source: 'eunis',
    retrievedAt: eunis?.generatedAt ?? now,
    url: 'https://doi.org/10.2909/bfe4c237-e378-4a83-ab21-b3807f96c2e2',
    citation:
      'EEA (European Environment Agency) — EUNIS terrestrial habitat classification review (tabular), ' +
      'version 1, Nov. 2021. Seviye 3/4 karakteristik tür listesi (EVA veritabanından türetilmiş, ' +
      'CC-BY 4.0). Kapsam Avrupa ağırlıklıdır; yalnızca bu listede adı geçen türler kod alır.',
    license: 'CC-BY',
  };

  /* -------------------------------------------------------------- *
   * Kabul edilen türleri grupla; eş anlamlıları ve gerçek toplam kayıt
   * sayısını (facet'ten — örneklenen nokta sayısından FARKLI) birleştir.
   * -------------------------------------------------------------- */
  const accepted = new Map(); // gbifKey -> { entry, totalOccurrenceCount, synonyms: [] }
  for (const entry of Object.values(species)) {
    if (!entry.class || !entry.order || !entry.family || !entry.genus || !entry.canonicalName) {
      continue; // sınıflandırması eksik kayıt — ağaca eklenemez, sessizce atlanmaz, sayılır
    }
    const key = entry.gbifKey;
    let group = accepted.get(key);
    if (!group) {
      group = { entry: null, totalOccurrenceCount: 0, synonyms: [] };
      accepted.set(key, group);
    }
    group.totalOccurrenceCount += entry.occurrenceCount ?? 0;
    if (entry.taxonomicStatus === 'SYNONYM') {
      if (entry.originalName) group.synonyms.push({ name: entry.originalName, authorship: null });
    } else {
      group.entry = entry;
    }
  }

  let skippedNoClassification = 0;
  let skippedNoAcceptedRecord = 0;
  for (const [key, group] of [...accepted.entries()]) {
    if (!group.entry) {
      // Yalnızca eş anlamlı bulundu, kabul edilen kaydın kendisi eksik/eksik sınıflandırmalı.
      accepted.delete(key);
      skippedNoAcceptedRecord++;
    }
  }
  for (const entry of Object.values(species)) {
    if (entry.taxonomicStatus !== 'SYNONYM' && (!entry.class || !entry.order || !entry.family)) {
      skippedNoClassification++;
    }
  }
  if (skippedNoClassification || skippedNoAcceptedRecord) {
    console.log(
      `ℹ ${skippedNoClassification} tür eksik sınıflandırma, ${skippedNoAcceptedRecord} tür ` +
        'yalnızca eş anlamlı kaydı olduğu için ağaca eklenmedi.',
    );
  }

  /* -------------------------------------------------------------- *
   * Taksonomi ağacı
   * -------------------------------------------------------------- */
  const raw = [];
  const seen = new Set();
  const addOnce = (key, entry) => {
    if (seen.has(key)) return;
    seen.add(key);
    raw.push(entry);
  };

  for (const { entry } of accepted.values()) {
    addOnce(`c:${entry.class}`, { key: `c:${entry.class}`, parentKey: null, rank: 'CLASS', name: entry.class });
    addOnce(`o:${entry.order}`, { key: `o:${entry.order}`, parentKey: `c:${entry.class}`, rank: 'ORDER', name: entry.order });
    addOnce(`f:${entry.family}`, { key: `f:${entry.family}`, parentKey: `o:${entry.order}`, rank: 'FAMILY', name: entry.family });
    addOnce(`g:${entry.genus}`, { key: `g:${entry.genus}`, parentKey: `f:${entry.family}`, rank: 'GENUS', name: entry.genus });
    addOnce(`s:${entry.canonicalName}`, {
      key: `s:${entry.canonicalName}`,
      parentKey: `g:${entry.genus}`,
      rank: 'SPECIES',
      name: entry.canonicalName,
      authorship: entry.authorship,
      gbifKey: entry.gbifKey,
      // Nuh'un Gemisi (T.C. Tarım ve Orman Bakanlığı) türlerin %99'unda küratörlü bir
      // Türkçe ad taşıyor; GBIF'in kendi vernacularNames'i çok daha seyrek ve
      // denetimsiz (topluluk katkılı) olduğundan yalnızca yedek olarak kullanılır.
      vernacularTr: officialLookup(entry.canonicalName)?.vernacularTr ?? entry.vernacularTr?.[0],
      // İngilizce ad için küratörlü bir kaynağımız yok; doğrudan GBIF'in
      // vernacularNames'inden ilk İngilizce adı alıyoruz.
      vernacularEn: entry.vernacularEn?.[0],
    });
  }

  const nodes = buildTaxonomyNodes(raw);
  const idByName = new Map(nodes.map((n) => [n.name, n.id]));

  /* -------------------------------------------------------------- *
   * Yayılış kayıtları — örneklenmiş, gerçek koordinatlı
   * -------------------------------------------------------------- */
  const occurrences = [];
  let droppedNoSquare = 0;
  for (const [gbifKeyStr, rawList] of Object.entries(rawOccurrencesByKey)) {
    const gbifKey = Number(gbifKeyStr);
    const group = accepted.get(gbifKey);
    if (!group) continue;
    const taxonId = idByName.get(group.entry.canonicalName);
    if (taxonId === undefined) continue;
    for (const rec of rawList) {
      if (!rec.davisSquare) {
        droppedNoSquare++;
        continue;
      }
      occurrences.push({
        id: rec.id,
        taxonId,
        lat: rec.lat,
        lon: rec.lon,
        davisSquare: rec.davisSquare,
        coordinateUncertaintyM: rec.coordinateUncertaintyM ?? 0,
        year: rec.year,
        // gbif-occurrences.mjs de aynı normalizasyonu uygular, ama önbelleğe
        // alınmış (checkpoint'lenmiş) eski ham kayıtlar bu adımı hiç görmeden
        // buraya ulaşabilir (bkz. actions/cache restore-keys) — bu yüzden
        // burada da tekrar uygulanır; zaten normalize edilmiş bir değer için
        // no-op'tur.
        province: normalizeProvinceName(rec.province),
        elevationM: rec.elevationM,
        basisOfRecord: rec.basisOfRecord,
        source: 'gbif',
        license: rec.license,
      });
    }
  }
  if (droppedNoSquare) {
    console.log(`ℹ ${droppedNoSquare} kayıt Davis karesi dışında kaldığı için haritaya eklenmedi.`);
  }

  /* -------------------------------------------------------------- *
   * Sayaçları ağaçta topla — GERÇEK toplam (facet) kullanılır, örneklenen
   * nokta sayısı değil; böylece kenar çubuğu sayaçları doğru bilimsel toplamı
   * gösterir.
   * -------------------------------------------------------------- */
  const perTaxon = new Map();
  for (const group of accepted.values()) {
    const taxonId = idByName.get(group.entry.canonicalName);
    if (taxonId === undefined) continue;
    const official = officialLookup(group.entry.canonicalName);
    const isEndemic = official?.endemism === 'endemik' || official?.endemism === 'lokal-endemik';
    perTaxon.set(taxonId, { occurrences: group.totalOccurrenceCount, isEndemic });
  }
  rollUpCounts(nodes, perTaxon);

  /* -------------------------------------------------------------- *
   * PlantDetail kayıtları
   * -------------------------------------------------------------- */
  const details = {};
  let officialEndemismFilled = 0;
  let officialIucnFilled = 0;
  let officialVernacularFilled = 0;
  let withImages = 0;
  let withEunisHabitats = 0;
  let withWcvpHabit = 0;
  let withWcvpPublishedIn = 0;
  let withFloraOfTurkeySquares = 0;
  let withSynonyms = 0;
  const isPartialCoverage = Boolean(nuhungemisi && nuhungemisi.provincesCovered.length < 81);

  const NUHUNGEMISI_SOURCE = {
    source: 'nuhungemisi',
    retrievedAt: nuhungemisi?.generatedAt ?? now,
    url: 'https://nuhungemisi.tarimorman.gov.tr/public/istatistik',
    citation:
      "T.C. Tarım ve Orman Bakanlığı, Nuh'un Gemisi Ulusal Biyolojik Çeşitlilik Veritabanı" +
      (isPartialCoverage ? ` (kısmi kapsam: ${nuhungemisi.provincesCovered.length}/81 il)` : ''),
  };

  for (const group of accepted.values()) {
    const { entry } = group;
    const taxonId = idByName.get(entry.canonicalName);
    if (taxonId === undefined) continue;

    const own = occurrences.filter((o) => o.taxonId === taxonId);
    const observedSquares = [...new Set(own.map((o) => o.davisSquare))].sort();
    const official = officialLookup(entry.canonicalName);
    const wcvp = wcvpLookup(entry.canonicalName);
    if (wcvp?.habit) withWcvpHabit++;
    if (wcvp?.publishedIn) withWcvpPublishedIn++;
    const literatureSquares = floraOfTurkeyLookup(entry.canonicalName);
    if (literatureSquares) withFloraOfTurkeySquares++;

    const lats = own.map((o) => o.lat);
    const lons = own.map((o) => o.lon);
    const years = own.map((o) => o.year).filter((y) => y !== null);
    const elevations = own.map((o) => o.elevationM).filter((e) => e !== null);
    const provinces = [...new Set(own.map((o) => o.province).filter(Boolean))];

    let endemismField;
    if (official && official.endemism !== null) {
      officialEndemismFilled++;
      const isEndemic = official.endemism === 'endemik' || official.endemism === 'lokal-endemik';
      endemismField = sourced(
        { isEndemicToTurkiye: isEndemic, ...(isEndemic ? { scope: official.endemism === 'lokal-endemik' ? 'yerel' : 'ulusal' } : {}) },
        NUHUNGEMISI_SOURCE,
      );
    } else {
      endemismField = sourced(
        { isEndemicToTurkiye: false },
        { source: 'inferred', retrievedAt: now, note: 'Resmi kaynakta bulunamadı; doğrulanmamış varsayım.' },
      );
    }

    const iucnField =
      official?.iucnCode && IUCN_CODES.has(official.iucnCode)
        ? (officialIucnFilled++, sourced({ category: official.iucnCode, scope: 'ulusal' }, NUHUNGEMISI_SOURCE))
        : sourced(null);

    // Eş anlamlı adlar iki kaynaktan birleşir: `gbif-synonyms.mjs`'in çektiği tam
    // liste ve occurrence facet'inden düşen kısmi liste (kendi Türkiye kaydı olan
    // eş anlamlılar). İkincisi tek başına neredeyse boştu — bkz. gbif-synonyms.mjs.
    const synonymList = dedupeSynonyms([
      ...(synonymsByKey[String(entry.gbifKey)] ?? []),
      ...group.synonyms,
    ]).filter((s) => s.name !== entry.canonicalName);
    if (synonymList.length) withSynonyms++;

    const eunisMatches = eunisLookup(entry.canonicalName);
    const eunisHabitatsField = eunisMatches?.length
      ? (withEunisHabitats++, sourced(eunisMatches, EUNIS_SOURCE))
      : sourced([]);

    const images = (imagesByKey[String(entry.gbifKey)] ?? [])
      .filter((img) => !blockedImageIds.has(img.id))
      .map((img) => ({
        ...img,
        // Ham kontrol noktası provenance taşımaz — burada ekleniyor
      }));
    if (images.length) withImages++;
    else {
      images.push({
        id: `${entry.canonicalName.replace(/\s+/g, '-').toLowerCase()}-0`,
        url: '',
        thumbnailUrl: '',
        width: 400,
        height: 300,
        caption: `${entry.canonicalName} — yer tutucu görsel`,
        photographer: null,
        license: 'CC0',
        licenseUrl: null,
        attributionText: 'Yer tutucu görsel — henüz gerçek fotoğraf bulunamadı',
        source: 'placeholder',
        sourceUrl: '',
        isPlaceholder: true,
      });
    }

    const missingReasons = {};
    if (!official || official.endemism === null) missingReasons.endemism = 'henuz-kuratorlenmedi';
    if (!wcvp?.habit) missingReasons.habit = 'henuz-kuratorlenmedi';
    missingReasons.lifeForm = 'henuz-kuratorlenmedi';
    missingReasons.habitat = 'henuz-kuratorlenmedi';
    missingReasons.altitudeRange = 'henuz-kuratorlenmedi';
    missingReasons.floweringPeriod = 'henuz-kuratorlenmedi';
    missingReasons.fruitingPeriod = 'henuz-kuratorlenmedi';
    missingReasons.substrate = 'henuz-kuratorlenmedi';
    if (!wcvp?.publishedIn) missingReasons.publishedIn = 'henuz-kuratorlenmedi';
    if (!literatureSquares) missingReasons.davisSquares = 'henuz-kuratorlenmedi';
    missingReasons.floristicElement = 'henuz-kuratorlenmedi';
    if (!official?.iucnCode) missingReasons.iucn = 'henuz-kuratorlenmedi';
    if (!official) missingReasons.officialProvinces = 'kaynakta-yok';
    if (!eunisMatches?.length) missingReasons.eunisHabitats = 'henuz-kuratorlenmedi';

    const trackedFields = ['habit', 'habitat', 'altitudeRange', 'floweringPeriod', 'endemism',
      'iucn', 'floristicElement', 'davisSquares', 'substrate', 'fruitingPeriod', 'officialProvinces',
      'eunisHabitats'];
    const filled = trackedFields.filter((f) => !missingReasons[f]).length;

    details[taxonId] = {
      taxonId,
      acceptedName: sourced(entry.canonicalName, GBIF_SOURCE),
      authorship: sourced(entry.authorship, GBIF_SOURCE),
      taxonomicStatus: sourced('ACCEPTED', GBIF_SOURCE),
      synonyms: sourced(synonymList, GBIF_SOURCE),
      publishedIn: wcvp?.publishedIn ? sourced(wcvp.publishedIn, WCVP_SOURCE) : sourced(null),
      classification: sourced(
        { class: entry.class, order: entry.order, family: entry.family, genus: entry.genus },
        GBIF_SOURCE,
      ),
      vernacularTr: official?.vernacularTr
        ? (officialVernacularFilled++, sourced([{ name: official.vernacularTr }], NUHUNGEMISI_SOURCE))
        : sourced((entry.vernacularTr ?? []).map((name) => ({ name })), GBIF_SOURCE),
      vernacularEn: sourced(entry.vernacularEn ?? [], GBIF_SOURCE),
      habit: wcvp?.habit ? sourced(wcvp.habit, WCVP_SOURCE) : sourced(null),
      lifeForm: sourced(null),
      habitat: sourced(null),
      eunisHabitats: eunisHabitatsField,
      altitudeRange: sourced(null),
      floweringPeriod: sourced(null),
      fruitingPeriod: sourced(null),
      substrate: sourced(null),
      endemism: endemismField,
      iucn: iucnField,
      floristicElement: sourced([]),
      davisSquares: literatureSquares ? sourced(literatureSquares, FLORA_OF_TURKEY_SOURCE) : sourced([]),
      officialProvinces: official ? (sourced(official.provinces, NUHUNGEMISI_SOURCE)) : sourced([]),
      observedDavisSquares: observedSquares,
      distribution: {
        // GERÇEK toplam kayıt sayısı (facet) — haritada ÇİZİLEN örneklenmiş nokta
        // sayısından (own.length) kasıtlı olarak farklıdır, bkz. gbif-occurrences.mjs.
        occurrenceCount: group.totalOccurrenceCount,
        bbox: own.length
          ? [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
          : null,
        centroid: own.length
          ? [
              Number((lons.reduce((a, b) => a + b, 0) / lons.length).toFixed(4)),
              Number((lats.reduce((a, b) => a + b, 0) / lats.length).toFixed(4)),
            ]
          : null,
        provinces,
        firstRecordYear: years.length ? Math.min(...years) : null,
        lastRecordYear: years.length ? Math.max(...years) : null,
        elevationObserved: elevations.length
          ? { minM: Math.min(...elevations), maxM: Math.max(...elevations) }
          : null,
      },
      images,
      identifiers: { gbifTaxonKey: entry.gbifKey },
      references: [],
      missingReasons,
      dataCompleteness: Number((filled / trackedFields.length).toFixed(2)),
    };
  }

  console.log(
    `ℹ Nuh'un Gemisi ile dolduruldu: ${officialEndemismFilled} endemizm, ${officialIucnFilled} IUCN, ` +
      `${officialVernacularFilled} Türkçe ad. ` +
      `${withImages}/${accepted.size} türde en az bir gerçek fotoğraf var. ` +
      `${withEunisHabitats}/${accepted.size} türde en az bir EUNIS habitat kodu var. ` +
      `${withWcvpHabit}/${accepted.size} türde WCVP'den yaşam formu, ${withWcvpPublishedIn}/${accepted.size} türde ilk yayın bilgisi var. ` +
      `${withFloraOfTurkeySquares}/${accepted.size} türde Flora of Turkey'den literatür Davis kare atfı var. ` +
      `${withSynonyms}/${accepted.size} türde en az bir eş anlamlı ad var.`,
  );

  /* -------------------------------------------------------------- *
   * Yazma
   * -------------------------------------------------------------- */
  const manifest = {
    version: '1.0.0-gbif',
    generatedAt: now,
    mode: 'static',
    taxonCount: accepted.size,
    occurrenceCount: occurrences.length,
    gbifDownloadDoi: null,
    gbifRetrievedAt: now,
    notice:
      'Bu veri seti GBIF (Global Biodiversity Information Facility) hesapsız arama API\'sinden ' +
      'çekilmiştir. Yayılış noktaları, her tür için GBIF\'teki gerçek toplam kayıt sayısından ' +
      'örneklenmiş bir alt kümedir (bkz. distribution.occurrenceCount gerçek toplamı taşır). ' +
      'Habitat, yaşam formu, yükselti, çiçeklenme dönemi gibi alanlar GBIF tarafından ' +
      'sağlanmaz; bu alanlar "henüz küratörlenmedi" olarak işaretlenmiştir. EUNIS habitat kodları ' +
      '(EEA) yalnızca EUNIS\'in karakteristik tür listesinde adı geçen türlerde bulunur — bu liste ' +
      'Avrupa ağırlıklıdır, bu yüzden çoğu tür için de "henüz küratörlenmedi" görünür.',
  };

  const taxonomy = {
    version: manifest.version,
    generatedAt: now,
    nodes,
    byRank: indexByRank(nodes),
    rootIds: nodes.filter((n) => n.parentId === null).map((n) => n.id),
  };

  await mkdir(SNAPSHOT_DIR, { recursive: true });
  await writeFile(resolve(SNAPSHOT_DIR, 'taxonomy.json'), JSON.stringify(taxonomy));
  await writeFile(resolve(SNAPSHOT_DIR, 'occurrences.json'), JSON.stringify(occurrences));
  // Kaynak nesneleri tekilleştirilerek yazılır (bkz. packDetails) — dosyanın
  // %44'ü tekrar eden provenance'tı; okuyan taraf unpackDetails ile açar.
  await writeFile(resolve(SNAPSHOT_DIR, 'details.json'), JSON.stringify(packDetails(details)));
  await writeFile(resolve(SNAPSHOT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log('✓ Gerçek veri anlık görüntüsü yazıldı: data/gbif-snapshot/');
  console.log(`  ${nodes.length} düğüm (${accepted.size} tür, ${taxonomy.byRank.FAMILY.length} familya)`);
  console.log(`  ${occurrences.length} örneklenmiş nokta`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
