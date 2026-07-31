/**
 * Türkiye'nin 81 ili — kanonik ad listesi ve serbest metin GBIF `stateProvince`
 * alanlarını bu listeye çözümleyen normalizasyon.
 *
 * GBIF occurrence kayıtlarındaki `stateProvince` alanı denetimsiz serbest metindir:
 * Türkçe aksansız yazımlar ("Mugla", "Sanliurfa"), eski adlar ("Icel", "Afyon"),
 * parantezli nitelemeler ("Çanakkale [Asia]") ve çoğu zaman il adı bile olmayan
 * lokalite açıklamaları ("22 km north of Van", "3 km east of Bozuyuk-Eskisehir-
 * Kutahya junction") barındırır. Bu dosya, bir değeri yalnızca 81 ilden birine
 * güvenle karşılık geliyorsa çözer; aksi hâlde `null` döner — tahmin yürütülmez.
 */

export const TR_PROVINCES = [
  'Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Aksaray', 'Amasya', 'Ankara', 'Antalya',
  'Ardahan', 'Artvin', 'Aydın', 'Balıkesir', 'Bartın', 'Batman', 'Bayburt', 'Bilecik',
  'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa', 'Çanakkale', 'Çankırı', 'Çorum',
  'Denizli', 'Diyarbakır', 'Düzce', 'Edirne', 'Elazığ', 'Erzincan', 'Erzurum', 'Eskişehir',
  'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkâri', 'Hatay', 'Iğdır', 'Isparta', 'İstanbul',
  'İzmir', 'Kahramanmaraş', 'Karabük', 'Karaman', 'Kars', 'Kastamonu', 'Kayseri', 'Kırıkkale',
  'Kırklareli', 'Kırşehir', 'Kilis', 'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa',
  'Mardin', 'Mersin', 'Muğla', 'Muş', 'Nevşehir', 'Niğde', 'Ordu', 'Osmaniye',
  'Rize', 'Sakarya', 'Samsun', 'Şanlıurfa', 'Siirt', 'Sinop', 'Sivas', 'Şırnak',
  'Tekirdağ', 'Tokat', 'Trabzon', 'Tunceli', 'Uşak', 'Van', 'Yalova', 'Yozgat', 'Zonguldak',
] as const;

export type TrProvince = (typeof TR_PROVINCES)[number];

/** Eski adlar / yaygın GBIF takma adları — kanonik ile aynı fold anahtarına çözülür. */
const ALIAS_TO_CANONICAL: Record<string, TrProvince> = {
  ICEL: 'Mersin',
  MERSIN_ICEL: 'Mersin',
  MARAS: 'Kahramanmaraş',
  AFYON: 'Afyonkarahisar',
  URFA: 'Şanlıurfa',
};

function fold(value: string): string {
  return value
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'i')
    .replace(/Ğ/g, 'G')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'U')
    .replace(/ü/g, 'u')
    .replace(/Ş/g, 'S')
    .replace(/ş/g, 's')
    .replace(/Ö/g, 'O')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'C')
    .replace(/ç/g, 'c')
    .replace(/Â/g, 'A')
    .replace(/â/g, 'a')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
}

const FOLD_LOOKUP = new Map<string, TrProvince>();
for (const province of TR_PROVINCES) FOLD_LOOKUP.set(fold(province), province);
for (const [alias, canonical] of Object.entries(ALIAS_TO_CANONICAL)) {
  FOLD_LOOKUP.set(fold(alias), canonical);
}

/** `İl seçimi` için kullanılan set — `includes` yerine O(1) üyelik testi. */
const CANONICAL_FOLD_SET = new Set(TR_PROVINCES.map(fold));

/**
 * Serbest metin bir GBIF `stateProvince` değerini 81 kanonik ilden birine çözer.
 *
 * Yalnızca virgülle ayrılmış segmentlerin TAMAMI eşleşme adayı olarak denenir
 * (metin içinde geçen bir il adını serbestçe arama YAPILMAZ) — bir lokalite
 * cümlesinde geçen kelimeyi ile karıştırmak yanlış coğrafi atıf riski taşır.
 * "..., Ankara, Turkey." gibi GBIF'in tipik "açıklama, il, ülke" biçimi son
 * segmentten (Turkey hariç) geriye doğru denenerek çözülür; "24km SE of Batman,
 * Diyarbakir, Turkey." → "Diyarbakır" gibi. Hiçbir segment eşleşmezse `null`
 * döner: veri kaynakta yok sayılır, tahmin edilmez.
 */
export function normalizeProvinceName(raw: string | null | undefined): TrProvince | null {
  if (!raw) return null;

  const withoutBrackets = raw.split('[')[0] ?? raw;
  const segments = withoutBrackets
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => fold(s.replace(/\.$/, '')) !== 'TURKEY');

  const candidates = segments.length > 0 ? [...segments].reverse() : [withoutBrackets.trim()];

  for (const candidate of candidates) {
    const cleaned = candidate
      .replace(/\bturkey\b\.?/gi, '')
      .replace(/\bprovince\b/gi, '')
      .replace(/\bili\b/gi, '')
      .replace(/\.$/, '')
      .trim();
    if (!cleaned) continue;

    const key = fold(cleaned);
    const hit = FOLD_LOOKUP.get(key);
    if (hit) return hit;
  }

  return null;
}

/** Bir değerin zaten kanonik 81 il adlarından biri olup olmadığını hızlıca sınar. */
export function isCanonicalProvinceName(value: string): boolean {
  return CANONICAL_FOLD_SET.has(fold(value));
}
