#!/usr/bin/env node
/**
 * iNaturalist'te fotoğrafı bulunamayan türler için Wikimedia Commons'ta arar.
 *
 * Yalnızca daha önce hiç fotoğrafı bulunamamış (images.json'da boş dizi veya
 * kayıt yok) türler işlenir — inaturalist-images.mjs'in bulduklarına dokunulmaz,
 * ÇIKTI AYNI kontrol noktası dosyasına (data/raw/gbif/images.json) eklenir.
 *
 * Commons, taksonlar için "Category:Cins tür" biçiminde küratörlü kategoriler
 * tutar (Wikimedia Commons Taxonomy projesi) — bu kategori doğrudan sorgulanır.
 * Serbest metin arama YAPILMAZ: bir tür adının başka bir dosyanın açıklamasında
 * rastlantısal geçmesi yanlış tür-fotoğraf eşleşmesine yol açabilir; kategori
 * eşleşmesi olmayan bir tür için sessizce boş sonuç kabul edilir.
 *
 * Commons yalnızca serbestçe yeniden dağıtılabilir lisanslı dosya barındırır
 * (site politikası), yine de her dosyanın lisansı ayrıca doğrulanır ve
 * çözülemezse (ör. yalnızca GFDL, dual-lisans yok) o görsel atlanır.
 *
 * ÇIKTI: data/raw/gbif/images.json — { [acceptedGbifKey]: PlantImage[] } (birleştirilmiş)
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

const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const IMAGES_PER_SPECIES = Number(process.env['WIKIMEDIA_IMAGES_PER_SPECIES'] ?? 3);
const REQUESTS_PER_MINUTE = Number(process.env['WIKIMEDIA_REQUESTS_PER_MINUTE'] ?? 100);
const THUMB_WIDTH = 1200;

const LICENSE_URL = {
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/',
  PD: 'https://creativecommons.org/publicdomain/mark/1.0/',
  'CC-BY': 'https://creativecommons.org/licenses/by/4.0/',
  'CC-BY-SA': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC-BY-NC': 'https://creativecommons.org/licenses/by-nc/4.0/',
  'CC-BY-NC-SA': 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
};

/** Commons'ın `extmetadata.LicenseShortName` metnini bizim lisans sözlüğümüze eşler. */
export function normalizeLicense(shortName) {
  if (!shortName) return null;
  const s = shortName.toLowerCase();
  if (s.includes('cc0')) return 'CC0';
  if (s.includes('public domain') || s.startsWith('pd') || s.includes('pd-')) return 'PD';
  if (s.includes('by-nc-sa')) return 'CC-BY-NC-SA';
  if (s.includes('by-nc')) return 'CC-BY-NC';
  if (s.includes('by-sa')) return 'CC-BY-SA';
  if (s.includes('by')) return 'CC-BY';
  return null;
}

/** Commons'ın `Artist`/`Credit` alanları HTML içerir (ör. bağlantılı kullanıcı adı). */
export function stripHtml(html) {
  if (!html) return null;
  const text = html.replace(/<[^>]*>/g, '').trim();
  return text || null;
}

/** Commons kategori adlarında boşluk yerine alt çizgi kullanılır. */
export function categoryTitleFor(scientificName) {
  return `Category:${scientificName.trim().replace(/\s+/g, '_')}`;
}

function toPlantImages(pages, scientificName) {
  const images = [];
  for (const page of Object.values(pages)) {
    const info = page.imageinfo?.[0];
    if (!info) continue;
    const meta = info.extmetadata ?? {};
    const license = normalizeLicense(meta.LicenseShortName?.value);
    if (!license) continue;

    const fullUrl = info.thumburl ?? info.url;
    if (!fullUrl) continue;
    const thumbnailUrl = fullUrl.replace(`/${THUMB_WIDTH}px-`, '/320px-');
    const photographer = stripHtml(meta.Artist?.value) ?? stripHtml(meta.Credit?.value);

    images.push({
      id: `commons-${page.pageid}`,
      url: fullUrl,
      thumbnailUrl,
      caption: scientificName,
      photographer,
      license,
      licenseUrl: LICENSE_URL[license] ?? null,
      attributionText: `© ${photographer ?? 'bilinmeyen katkıcı'} — ${license} — Wikimedia Commons`,
      source: 'wikimedia',
      sourceUrl: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title ?? '')}`,
      isPlaceholder: false,
    });
    if (images.length >= IMAGES_PER_SPECIES) break;
  }
  return images;
}

async function fetchImagesFor(scientificName) {
  const url =
    `${COMMONS}?action=query&format=json&generator=categorymembers` +
    `&gcmtitle=${encodeURIComponent(categoryTitleFor(scientificName))}&gcmtype=file&gcmlimit=10` +
    `&prop=imageinfo&iiprop=url%7Cextmetadata&iiurlwidth=${THUMB_WIDTH}`;
  const data = await fetchJsonRetry(url, { retries: 2, timeoutMs: 15000 });
  const pages = data.query?.pages;
  if (!pages) return [];
  return toPlantImages(pages, scientificName);
}

async function main() {
  if (!existsSync(SPECIES_FILE)) {
    console.error('data/raw/gbif/species.json yok — önce `npm run data:gbif-taxonomy` çalıştırın.');
    process.exit(1);
  }
  const species = JSON.parse(await readFile(SPECIES_FILE, 'utf8'));

  const byAccepted = new Map();
  for (const entry of Object.values(species)) {
    if (entry.taxonomicStatus === 'SYNONYM') continue;
    const existing = byAccepted.get(entry.gbifKey);
    if (!existing || entry.occurrenceCount > existing.occurrenceCount) {
      byAccepted.set(entry.gbifKey, entry);
    }
  }
  const ordered = [...byAccepted.values()].sort((a, b) => b.occurrenceCount - a.occurrenceCount);

  await mkdir(RAW_DIR, { recursive: true });
  let checkpoint = {};
  if (existsSync(IMAGES_FILE)) {
    checkpoint = JSON.parse(await readFile(IMAGES_FILE, 'utf8'));
    console.log(`Var olan kontrol noktası: ${Object.keys(checkpoint).length} tür.`);
  }

  const pending = ordered.filter((e) => {
    const existing = checkpoint[String(e.gbifKey)];
    return !existing || existing.length === 0;
  });
  console.log(
    `${pending.length} tür Wikimedia Commons'ta aranacak ` +
      `(~${(pending.length / REQUESTS_PER_MINUTE).toFixed(0)} dk sürebilir).`,
  );

  const wait = rateLimiter(REQUESTS_PER_MINUTE);
  let processed = 0;
  let found = 0;
  for (const entry of pending) {
    await wait();
    try {
      const images = await fetchImagesFor(entry.canonicalName);
      if (images.length > 0) {
        checkpoint[String(entry.gbifKey)] = images;
        found++;
      }
    } catch (err) {
      console.warn(`  ⚠ ${entry.canonicalName} Commons araması atlandı: ${err.message}`);
    }
    processed++;
    if (processed % 50 === 0) {
      await writeFile(IMAGES_FILE, JSON.stringify(checkpoint));
      console.log(`  💾 ara kayıt: ${processed}/${pending.length} işlendi, ${found} yeni tür fotoğraflandı.`);
    }
  }

  await writeFile(IMAGES_FILE, JSON.stringify(checkpoint));
  console.log(`✓ ${processed} tür işlendi, Wikimedia Commons'tan ${found} türde yeni fotoğraf bulundu.`);
}

// Yalnızca doğrudan çalıştırıldığında (`node wikimedia-images.mjs`) main() tetiklenir —
// test dosyası saf fonksiyonları (normalizeLicense, stripHtml, categoryTitleFor) import
// ederken bu yan etkinin (ve eksik species.json'da process.exit(1)'in) tetiklenmemesi için.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
