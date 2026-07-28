/**
 * Nuh'un Gemisi dışa aktarımını ayrıştıran saf fonksiyonlar.
 *
 * Bunlar bilerek dosya G/Ç'sinden ayrıştırılmıştır — hem `nuhungemisi.mjs` orkestratörü
 * hem de birim testleri (`nuhungemisiParse.test.mjs`) aynı mantığı, gerçek 3 MB'lık
 * dosyaya ya da `exceljs`'e ihtiyaç duymadan kullanır.
 */

/** Kaynak dosyada bu değer bulunan satırlar damarlı bitki kaydıdır. */
export const PLANT_GROUP_LABEL = 'Damarlı Bitkiler';

/**
 * "Tür" sütununu bilimsel ad ve Türkçe ada ayırır.
 *
 * Biçim: "Centaurium erythraea - Kırmızı Kantaron" veya alt tür için
 * "Ranunculus ficaria subsp. calthifolius - Arpacıksalebi". Ayraç yalnızca İLK
 * " - " geçişidir; Türkçe ad kendi içinde tire taşıyabilir (nadir), bilimsel ad
 * neredeyse hiç taşımaz.
 */
export function parseTurColumn(value) {
  const text = (value ?? '').toString().trim();
  if (!text) return { scientificName: '', vernacularTr: null };

  const sepIndex = text.indexOf(' - ');
  if (sepIndex === -1) return { scientificName: text, vernacularTr: null };

  return {
    scientificName: text.slice(0, sepIndex).trim(),
    vernacularTr: text.slice(sepIndex + 3).trim() || null,
  };
}

/**
 * "IUCN" sütununu kategori kodu ve açıklamasına ayırır.
 * Biçim: "LC - Least Concern (En Az Endişe Verici)". Boşsa null döner —
 * kaynak veri setinde bitki satırlarının ~%83'ünde bu alan boştur.
 */
export function parseIucnColumn(value) {
  const text = (value ?? '').toString().trim();
  if (!text) return null;

  const sepIndex = text.indexOf(' - ');
  if (sepIndex === -1) return { code: text, label: text };

  return {
    code: text.slice(0, sepIndex).trim(),
    label: text.slice(sepIndex + 3).trim(),
  };
}

/** Kaynak metnini iç endemizm koduna çevirir. Bilinmeyen/boş değer için null. */
export function normalizeEndemism(value) {
  const text = (value ?? '').toString().trim();
  if (text === 'Lokal Endemik') return 'lokal-endemik';
  if (text === 'Endemik') return 'endemik';
  if (text === 'Endemik Değil') return 'degil';
  return null;
}

/**
 * Aynı tür için birden fazla satırdaki (farklı il/gözlem) endemizm etiketlerini
 * birleştirir. Öncelik en spesifik/nadir sınıfa verilir: bir satır bile
 * "lokal endemik" veya "endemik" diyorsa, diğerleri "endemik değil" dese bile
 * bu öncelik kazanır — veri girişindeki tutarsızlıkta bilimsel açıdan daha
 * güvenli tarafta kalınır.
 */
export function mergeEndemismStatuses(statuses) {
  let hasEndemik = false;
  for (const status of statuses) {
    if (status === 'lokal-endemik') return 'lokal-endemik';
    if (status === 'endemik') hasEndemik = true;
  }
  if (hasEndemik) return 'endemik';
  if (statuses.some((s) => s === 'degil')) return 'degil';
  return null;
}

/**
 * Bilimsel ad eşleştirme anahtarı: küçük harfe çevrilir, fazla boşluk sıkıştırılır.
 * Görüntüleme için orijinal yazım korunur, yalnızca eşleştirme bu anahtarla yapılır.
 */
export function speciesKey(scientificName) {
  return scientificName.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
}

/**
 * Ham satırları tür bazında birleştirir.
 *
 * @param records {{ scientificName: string, vernacularTr: string|null, province: string,
 *   endemism: string|null, iucnCode: string|null, iucnLabel: string|null, monitored: boolean }[]}
 * @returns {Map<string, object>} anahtar = speciesKey(scientificName)
 */
export function aggregateSpecies(records) {
  const byKey = new Map();

  for (const record of records) {
    if (!record.scientificName) continue;
    const key = speciesKey(record.scientificName);

    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        scientificName: record.scientificName,
        vernacularTr: record.vernacularTr,
        provinces: new Set(),
        endemismVotes: [],
        iucnCode: null,
        iucnLabel: null,
        monitored: false,
        recordCount: 0,
      };
      byKey.set(key, entry);
    }

    entry.provinces.add(record.province);
    entry.endemismVotes.push(record.endemism);
    if (!entry.vernacularTr && record.vernacularTr) entry.vernacularTr = record.vernacularTr;
    if (!entry.iucnCode && record.iucnCode) {
      entry.iucnCode = record.iucnCode;
      entry.iucnLabel = record.iucnLabel;
    }
    if (record.monitored) entry.monitored = true;
    entry.recordCount++;
  }

  const result = new Map();
  for (const [key, entry] of byKey) {
    result.set(key, {
      scientificName: entry.scientificName,
      vernacularTr: entry.vernacularTr,
      provinces: [...entry.provinces].sort((a, b) => a.localeCompare(b, 'tr')),
      endemism: mergeEndemismStatuses(entry.endemismVotes),
      iucnCode: entry.iucnCode,
      iucnLabel: entry.iucnLabel,
      monitored: entry.monitored,
      recordCount: entry.recordCount,
    });
  }
  return result;
}
