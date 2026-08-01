#!/usr/bin/env node
/**
 * Her tür için iNaturalist'ten lisanslı fotoğraf bulur (bilimsel ad ile arama).
 *
 * Yalnızca yeniden dağıtıma açık lisanslar istenir: CC0, CC-BY, CC-BY-SA,
 * CC-BY-NC, CC-BY-NC-SA (ND — "türetilemez" — varyantları İSTENMEZ; küçük
 * resim/thumbnail üretmek teknik olarak bir türetme sayılabileceğinden hariç
 * tutulur). Fotoğrafçı adı ve lisans her zaman `attributionText` içinde saklanır
 * ve arayüzde görselin altında zorunlu olarak gösterilir.
 *
 * iNaturalist nezaket sınırı: dakikada ~60 istek. Güvenlik payı için 50/dk
 * hızında sıralı (concurrency=1) çalışır — bu yüzden tüm Türkiye florası için
 * bu adım SAATLER sürebilir. Kesintiye dayanıklıdır (tür başına kontrol noktası)
 * ve türler önce en çok kayıtlı olandan işlenir; bir çalıştırma yarıda kesilse
 * bile en yaygın türler önce görsel kazanır.
 *
 * ÇIKTI: data/raw/gbif/images.json — { [acceptedGbifKey]: PlantImage[] }
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchJsonRetry, rateLimiter } from './lib/http.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = resolve(here, '../../data/raw/gbif');
const SPECIES_FILE = resolve(RAW_DIR, 'species.json');
const IMAGES_FILE = resolve(RAW_DIR, 'images.json');

const INAT = 'https://api.inaturalist.org/v1';
const IMAGES_PER_SPECIES = Number(process.env['INAT_IMAGES_PER_SPECIES'] ?? 3);
const REQUESTS_PER_MINUTE = 50;
const ALLOWED_LICENSES = 'cc0,cc-by,cc-by-sa,cc-by-nc,cc-by-nc-sa';
// "research" (topluluk kimliği doğrulanmış) gözlemler iNaturalist'teki tüm
// gözlemlerin küçük bir alt kümesidir — nadir/az gözlemlenen Türkiye
// endemikleri için çoğunlukla hiç "research grade" gözlem yoktur, ama
// "needs_id" (gözlemcinin kendi tanımladığı, henüz topluluk onayı almamış)
// gözlemler genelde vardır. Fotoğraf yalnızca görsel bir ek — habitat/
// endemizm gibi bilimsel alanlar gibi otoriter değil — bu yüzden burada
// tanı kesinliğinden çok kapsamı önceliklendiriyoruz.
const ALLOWED_QUALITY_GRADES = 'research,needs_id';
// Tek tek istek retry/timeout'u (retries=2/15sn) sürdürülen bir 429 fırtınasını
// sınırlamaz — art arda çok sayıda başarısızlık, iNaturalist'in geçici olarak
// bizi tamamen engellediğinin işaretidir. Bu durumda hemen tekrar denemek
// yerine bir süre tamamen durup nezaket sınırının geçmesini beklemek, zaman
// bütçesini onlarca başarısız istekle harcamaktan daha verimlidir.
const CONSECUTIVE_FAILURE_THRESHOLD = Number(process.env['INAT_FAILURE_THRESHOLD'] ?? 25);
const CIRCUIT_BREAKER_PAUSE_MS = Number(process.env['INAT_CIRCUIT_BREAKER_PAUSE_MS'] ?? 10 * 60 * 1000);

const LICENSE_MAP = {
  cc0: 'CC0',
  'cc-by': 'CC-BY',
  'cc-by-sa': 'CC-BY-SA',
  'cc-by-nc': 'CC-BY-NC',
  'cc-by-nc-sa': 'CC-BY-NC-SA',
};
const LICENSE_URL = {
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/',
  'CC-BY': 'https://creativecommons.org/licenses/by/4.0/',
  'CC-BY-SA': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC-BY-NC': 'https://creativecommons.org/licenses/by-nc/4.0/',
  'CC-BY-NC-SA': 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
};

function toPlantImages(observations) {
  const images = [];
  for (const obs of observations) {
    for (const photo of obs.photos ?? []) {
      const licenseCode = (photo.license_code ?? '').toLowerCase();
      const license = LICENSE_MAP[licenseCode];
      if (!license || !photo.url) continue;

      const photographer = obs.user?.name || obs.user?.login || null;
      images.push({
        id: `inat-${photo.id}`,
        url: photo.url.replace('square', 'medium'),
        thumbnailUrl: photo.url.replace('square', 'small'),
        caption: obs.taxon?.name ?? undefined,
        photographer,
        license,
        licenseUrl: LICENSE_URL[license] ?? null,
        attributionText: `© ${photographer ?? 'bilinmeyen katkıcı'} — ${license} — iNaturalist`,
        source: 'inaturalist',
        sourceUrl: obs.uri ?? `https://www.inaturalist.org/observations/${obs.id}`,
        isPlaceholder: false,
      });
      if (images.length >= IMAGES_PER_SPECIES) return images;
    }
  }
  return images;
}

async function fetchImagesFor(scientificName) {
  const url =
    `${INAT}/observations?taxon_name=${encodeURIComponent(scientificName)}` +
    `&photos=true&photo_license=${ALLOWED_LICENSES}&quality_grade=${ALLOWED_QUALITY_GRADES}` +
    `&order_by=votes&order=desc&per_page=10`;
  // Fotoğraf kaybı düşük riskli (tür verisi değil, görsel eksik kalır) — bu
  // yüzden GBIF çekimindeki kadar sabırlı (5 deneme × 30sn) davranmıyoruz.
  // Tam ölçekli çalıştırmada (run 30513090228) iNaturalist sürdürülen yüksek
  // hacimden sonra bir süre neredeyse her isteği reddetti; varsayılan
  // retry/timeout ile bu, checkpoint'in 400 dk'ya kadar ilerlememesi anlamına
  // gelebiliyordu (100 türlük bir blok × ~4 dk en kötü durum). Hızlı vazgeçip
  // devam etmek, tüm zaman bütçesini birkaç kötü türe kaptırmaktan iyidir.
  const data = await fetchJsonRetry(url, { retries: 2, timeoutMs: 15000 });
  return toPlantImages(data.results ?? []);
}

async function main() {
  if (!existsSync(SPECIES_FILE)) {
    console.error('data/raw/gbif/species.json yok — önce `npm run data:gbif-taxonomy` çalıştırın.');
    process.exit(1);
  }
  const species = JSON.parse(await readFile(SPECIES_FILE, 'utf8'));

  // Kabul edilen tür başına bir kayıt (eş anlamlılardan herhangi biri, aynı ad işe yarar).
  const byAccepted = new Map();
  for (const entry of Object.values(species)) {
    if (entry.taxonomicStatus === 'SYNONYM') continue;
    const existing = byAccepted.get(entry.gbifKey);
    if (!existing || entry.occurrenceCount > existing.occurrenceCount) {
      byAccepted.set(entry.gbifKey, entry);
    }
  }
  const ordered = [...byAccepted.values()].sort((a, b) => b.occurrenceCount - a.occurrenceCount);
  console.log(`${ordered.length} kabul edilen tür için görsel aranacak (en çok kayıtlıdan başlanır).`);

  await mkdir(RAW_DIR, { recursive: true });
  let checkpoint = {};
  if (existsSync(IMAGES_FILE)) {
    checkpoint = JSON.parse(await readFile(IMAGES_FILE, 'utf8'));
    console.log(`Var olan kontrol noktası: ${Object.keys(checkpoint).length} tür.`);
  }

  // Daha önce hiç fotoğraf bulunamayan (boş dizi) türler de yeniden denenir —
  // iNaturalist'in gözlem havuzu zamanla büyüyor, ve "needs_id" kapsamının
  // eklenmesinden önce kaydedilmiş boş sonuçlar artık güncel değil olabilir.
  const pending = ordered.filter((e) => {
    const existing = checkpoint[String(e.gbifKey)];
    return !existing || existing.length === 0;
  });
  console.log(`${pending.length} tür yeni işlenecek (~${(pending.length / REQUESTS_PER_MINUTE).toFixed(0)} dk sürebilir).`);

  const wait = rateLimiter(REQUESTS_PER_MINUTE);
  let processed = 0;
  let consecutiveFailures = 0;
  for (const entry of pending) {
    await wait();
    try {
      const images = await fetchImagesFor(entry.canonicalName);
      checkpoint[String(entry.gbifKey)] = images;
      consecutiveFailures = 0;
    } catch (err) {
      console.warn(`  ⚠ ${entry.canonicalName} görsel araması atlandı: ${err.message}`);
      checkpoint[String(entry.gbifKey)] = [];
      consecutiveFailures++;
      if (consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD) {
        await writeFile(IMAGES_FILE, JSON.stringify(checkpoint));
        console.warn(
          `  ⏸ ${consecutiveFailures} ardışık başarısızlık — iNaturalist'e ${Math.round(CIRCUIT_BREAKER_PAUSE_MS / 60000)} dk ara veriliyor.`
        );
        await new Promise((r) => setTimeout(r, CIRCUIT_BREAKER_PAUSE_MS));
        consecutiveFailures = 0;
      }
    }
    processed++;
    if (processed % 20 === 0) {
      await writeFile(IMAGES_FILE, JSON.stringify(checkpoint));
      console.log(`  💾 ara kayıt: ${Object.keys(checkpoint).length} tür (${processed}/${pending.length}).`);
    }
  }

  await writeFile(IMAGES_FILE, JSON.stringify(checkpoint));
  const withPhotos = Object.values(checkpoint).filter((v) => v.length > 0).length;
  console.log(`✓ ${Object.keys(checkpoint).length} tür işlendi, ${withPhotos} tanesinde en az bir fotoğraf bulundu.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
