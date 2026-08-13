#!/usr/bin/env node
/**
 * `data/curated/flora-of-turkey/`deki literatür kaynaklarını (bkz.
 * floraOfTurkeyParse.mjs) yeniden tarayıp `data/gbif-snapshot/details.json`
 * içindeki `davisSquares` alanlarını YERİNDE günceller — GBIF'ten tam bir
 * yeniden çekim (`build-real-dataset.mjs`, ham `data/raw/gbif/*` gerektirir)
 * yapmadan.
 *
 * NEDEN AYRI BİR SCRİPT: Ham GBIF kontrol noktaları commit edilmez (bkz.
 * build-real-dataset.mjs başlık yorumu) — yalnızca ilk üretimi yapan ortamda
 * bulunur. Ama `data/curated/flora-of-turkey/`e yeni bir eser eklendiğinde
 * (ör. yeni bir OCR'lanmış cilt) yalnızca `davisSquares` alanı değişir; bunun
 * için GBIF'i yeniden çekmeye gerek yoktur. Bu script `packDetails`/
 * `unpackDetails` ile anlık görüntüyü güvenle açıp yalnızca ilgili alanları
 * günceller, geri kalan her şeyi (görseller, endemizm, IUCN, ...) dokunmadan
 * bırakır.
 *
 * `build-real-dataset.mjs`'teki `sourced`/`missingReasons`/`dataCompleteness`
 * mantığının davisSquares'e özgü kısmıyla BİLEREK aynı tutulur — o script tam
 * bir yeniden çekimde bu patch'i gereksiz kılar, ama sonucu birebir eşleşmelidir.
 *
 * Kullanım: node scripts/ingest/patch-flora-of-turkey-squares.mjs
 */
import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packDetails, unpackDetails } from '@trbotanik/shared';
import { speciesKey } from './nuhungemisiParse.mjs';
import { parseVolumeFile } from './floraOfTurkeyParse.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = resolve(here, '../../data/gbif-snapshot');
const PUBLIC_DATA_DIR = resolve(here, '../../packages/web/public/data');
const FLORA_OF_TURKEY_DIR = resolve(here, '../../data/curated/flora-of-turkey');

const FLORA_OF_TURKEY_SOURCE = {
  source: 'flora-of-turkey',
  retrievedAt: new Date().toISOString(),
  citation:
    'P. H. Davis (ed.), Flora of Turkey and the East Aegean Islands (1965–1988) — ' +
    'Davis kareleme sisteminin tanımlandığı asıl kaynak; Astragalus cinsi için ayrıca ' +
    'D. Podlech & Sh. Zarre, A taxonomic revision of the genus Astragalus L. in the Old World, ' +
    'Vol. III (Naturhistorisches Museum Wien, 2013). Basılı ciltlerin OCR taramasından, ' +
    'dağılım paragraflarındaki Davis kare atıflarından çıkarıldı (kullanıcı tarafından sağlandı).',
};

const TRACKED_FIELDS = [
  'habit', 'habitat', 'altitudeRange', 'floweringPeriod', 'endemism',
  'iucn', 'floristicElement', 'davisSquares', 'substrate', 'fruitingPeriod', 'officialProvinces',
  'eunisHabitats',
];

async function loadFloraOfTurkeyIndex() {
  const index = new Map(); // speciesKey(ad) -> Set<DavisCode>
  if (!existsSync(FLORA_OF_TURKEY_DIR)) return index;
  const files = (await readdir(FLORA_OF_TURKEY_DIR)).filter((f) => f.endsWith('.xlsx'));
  for (const file of files) {
    const perVolume = await parseVolumeFile(resolve(FLORA_OF_TURKEY_DIR, file));
    for (const [name, squares] of perVolume) {
      const key = speciesKey(name);
      const existing = index.get(key) ?? new Set();
      for (const code of squares) existing.add(code);
      index.set(key, existing);
    }
    console.log(`ℹ ${file} yüklendi: ${perVolume.size} tür için kare atfı.`);
  }
  return index;
}

async function main() {
  const index = await loadFloraOfTurkeyIndex();

  const detailsRaw = JSON.parse(await readFile(resolve(SNAPSHOT_DIR, 'details.json'), 'utf-8'));
  const details = unpackDetails(detailsRaw);

  // NOT: yalnızca DEĞER değiştiyse değil, eşleşme VARSA her zaman provenance da
  // yeniden yazılır — aksi hâlde bu script daha önce farklı bir atıf metniyle
  // (ör. yalnızca Davis'i anan eski metin) işlenmiş ama karesi AYNI kalan türler,
  // yeni ortak atıf metnini (Podlech & Zarre dahil) hiç almazdı; aynı kaynak
  // kimliği ('flora-of-turkey') için sitede iki farklı atıf metni dolaşırdı.
  let changed = 0;
  let refreshed = 0;
  for (const detail of Object.values(details)) {
    const name = detail.acceptedName?.value;
    if (!name) continue;
    const squares = index.get(speciesKey(name));
    const newSquares = squares ? [...squares].sort() : null;
    const oldSquares = detail.davisSquares?.value ?? [];

    if (newSquares === null && oldSquares.length === 0) continue; // hiç kaynak yok, dokunma

    const same =
      newSquares !== null &&
      newSquares.length === oldSquares.length &&
      newSquares.every((c, i) => c === oldSquares[i]);
    if (same) refreshed++;
    else changed++;

    detail.davisSquares = newSquares ? { value: newSquares, provenance: FLORA_OF_TURKEY_SOURCE } : { value: [] };

    const missingReasons = { ...detail.missingReasons };
    if (newSquares) delete missingReasons.davisSquares;
    else missingReasons.davisSquares = 'henuz-kuratorlenmedi';
    detail.missingReasons = missingReasons;

    const filled = TRACKED_FIELDS.filter((f) => !missingReasons[f]).length;
    detail.dataCompleteness = Number((filled / TRACKED_FIELDS.length).toFixed(2));
  }

  console.log(
    `✓ ${changed} türde kare değeri değişti, ${refreshed} türde atıf metni tazelendi (kare aynı kaldı).`,
  );

  const packed = packDetails(details);
  const json = JSON.stringify(packed);
  await writeFile(resolve(SNAPSHOT_DIR, 'details.json'), json);
  if (existsSync(PUBLIC_DATA_DIR)) {
    await writeFile(resolve(PUBLIC_DATA_DIR, 'details.json'), json);
  }
  console.log('✓ data/gbif-snapshot/details.json ve packages/web/public/data/details.json yazıldı.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
