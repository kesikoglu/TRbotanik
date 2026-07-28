/**
 * Davis kareleme sistemi (Flora of Turkey grid system).
 *
 * P. H. Davis'in "Flora of Turkey and the East Aegean Islands" (1965–1988) eserinde
 * kullanılan ve Türk floristik literatürünün standardı hâline gelen kareleme sistemi.
 * Sistem 2 derecelik enlem/boylam aralıklarına dayanır ve Türkiye'yi 29 kareye böler.
 *
 *   Satırlar (enlem bantları):  A = 40–42°N,  B = 38–40°N,  C = 36–38°N
 *   Sütunlar (boylam):          n = (24 + 2n)°E … (26 + 2n)°E
 *                               yani 1 = 26–28°E, 2 = 28–30°E, … 10 = 44–46°E
 *
 * Kareler: A1–A9 (9) + B1–B10 (10) + C1–C10 (10) = 29.
 * A10 (44–46°E, 40–42°N) tanımlı değildir; bu alan Türkiye sınırlarının dışında kalır.
 *
 * Türetilen formül, yayınlanmış floristik literatürdeki bilinen kare atamalarıyla
 * doğrulanmıştır (bkz. davis.test.ts): İstanbul A2, Ankara B4, İzmir B1, Van B9,
 * Antalya C3, Gaziantep C6, Tunceli B7, Osmaneli A3, Kastamonu A4, Kars A9.
 */

export type DavisBand = 'A' | 'B' | 'C';

export type DavisCode =
  | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'A7' | 'A8' | 'A9'
  | 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6' | 'B7' | 'B8' | 'B9' | 'B10'
  | 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7' | 'C8' | 'C9' | 'C10';

/** Kare kenar uzunluğu (derece). */
export const DAVIS_CELL_SIZE = 2;

/** Grid'in güneybatı köşesi. */
export const DAVIS_ORIGIN_LON = 26;
export const DAVIS_ORIGIN_LAT = 36;

/** Bantlar güneyden kuzeye: index 0 → C (36–38), 1 → B (38–40), 2 → A (40–42). */
const BANDS_SOUTH_TO_NORTH = ['C', 'B', 'A'] as const;

/** Her bandın sütun sayısı. A bandı 9'da biter — A10 tanımlı değildir. */
const COLUMNS_PER_BAND: Record<DavisBand, number> = { A: 9, B: 10, C: 10 };

/**
 * Türkiye'nin yaklaşık sınırlayıcı kutusu (Gökçeada ve Hatay'ın güney ucu dahil).
 * Grid 26–46°E / 36–42°N aralığını kapsar; ülkenin birkaç uç noktası bu aralığın
 * hemen dışına taşar ve aşağıda en yakın kareye sabitlenir (clamp).
 */
export const TURKIYE_BBOX = {
  west: 25.6,
  south: 35.8,
  east: 44.9,
  north: 42.2,
} as const;

/** 29 kare kodunun tamamı, A1…A9, B1…B10, C1…C10 sırasıyla. */
export const DAVIS_CODES: readonly DavisCode[] = (['A', 'B', 'C'] as const).flatMap((band) =>
  Array.from(
    { length: COLUMNS_PER_BAND[band] },
    (_, i) => `${band}${i + 1}` as DavisCode,
  ),
);

const DAVIS_CODE_SET = new Set<string>(DAVIS_CODES);

export function isDavisCode(value: unknown): value is DavisCode {
  return typeof value === 'string' && DAVIS_CODE_SET.has(value);
}

/** Kare kodunu bant harfi ve sütun numarasına ayırır. */
export function parseDavisCode(code: DavisCode): { band: DavisBand; column: number } {
  return {
    band: code[0] as DavisBand,
    column: Number(code.slice(1)),
  };
}

/**
 * Bir karenin coğrafi sınırları: [batı, güney, doğu, kuzey] (derece).
 */
export function davisSquareBounds(code: DavisCode): [number, number, number, number] {
  const { band, column } = parseDavisCode(code);
  const rowIndex = BANDS_SOUTH_TO_NORTH.indexOf(band as (typeof BANDS_SOUTH_TO_NORTH)[number]);
  const west = DAVIS_ORIGIN_LON + (column - 1) * DAVIS_CELL_SIZE;
  const south = DAVIS_ORIGIN_LAT + rowIndex * DAVIS_CELL_SIZE;
  return [west, south, west + DAVIS_CELL_SIZE, south + DAVIS_CELL_SIZE];
}

/** Karenin merkez noktası [boylam, enlem]. */
export function davisSquareCentroid(code: DavisCode): [number, number] {
  const [w, s, e, n] = davisSquareBounds(code);
  return [(w + e) / 2, (s + n) / 2];
}

/** Kareyi GeoJSON Polygon halkasına çevirir (saat yönünün tersine, kapalı). */
export function davisSquareRing(code: DavisCode): [number, number][] {
  const [w, s, e, n] = davisSquareBounds(code);
  return [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Bir koordinatın hangi Davis karesine düştüğünü döner.
 *
 * Türkiye'nin sınırlayıcı kutusu dışındaki noktalar için `null` döner — bu, hatalı
 * koordinatların sessizce bir kareye atanmasını engeller. Kutu içinde olup grid'in
 * hemen dışına taşan uç noktalar (ör. Gökçeada 25.9°E) en yakın kareye sabitlenir.
 *
 * @param lat Enlem (derece, WGS84)
 * @param lon Boylam (derece, WGS84)
 */
export function davisSquareFor(lat: number, lon: number): DavisCode | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (
    lat < TURKIYE_BBOX.south ||
    lat > TURKIYE_BBOX.north ||
    lon < TURKIYE_BBOX.west ||
    lon > TURKIYE_BBOX.east
  ) {
    return null;
  }

  // Grid aralığına sabitle: uç noktalar en yakın kareye düşsün.
  const maxLat = DAVIS_ORIGIN_LAT + BANDS_SOUTH_TO_NORTH.length * DAVIS_CELL_SIZE;
  const clampedLat = clamp(lat, DAVIS_ORIGIN_LAT, maxLat - 1e-9);
  const clampedLon = clamp(lon, DAVIS_ORIGIN_LON, DAVIS_ORIGIN_LON + 10 * DAVIS_CELL_SIZE - 1e-9);

  const rowIndex = Math.floor((clampedLat - DAVIS_ORIGIN_LAT) / DAVIS_CELL_SIZE);
  const band = BANDS_SOUTH_TO_NORTH[rowIndex];
  if (!band) return null;

  const rawColumn = Math.floor((clampedLon - DAVIS_ORIGIN_LON) / DAVIS_CELL_SIZE) + 1;
  // A bandı 9'da biter; kuzeydoğu ucundaki noktalar A9'a sabitlenir.
  const column = clamp(rawColumn, 1, COLUMNS_PER_BAND[band]);

  return `${band}${column}` as DavisCode;
}

/**
 * Kare kodu → insan okunur etiket. İl listesi `DAVIS_SQUARE_PROVINCES` içinde,
 * karenin kapsadığı belli başlı illerden türetilir.
 */
export function davisSquareLabel(code: DavisCode): string {
  const provinces = DAVIS_SQUARE_PROVINCES[code];
  return provinces && provinces.length > 0 ? `${code} — ${provinces.join(', ')}` : code;
}

/**
 * Her karenin kapsadığı belli başlı iller (tam liste değil, yönlendirme amaçlı).
 * Kullanıcının haritada kareyi tanıyabilmesi için gösterilir; bir kaydın ili her
 * zaman koordinattan türetilir, bu tablodan değil.
 */
export const DAVIS_SQUARE_PROVINCES: Partial<Record<DavisCode, string[]>> = {
  A1: ['Çanakkale', 'Edirne', 'Tekirdağ', 'Gökçeada'],
  A2: ['İstanbul', 'Kocaeli', 'Bursa', 'Balıkesir', 'Bilecik'],
  A3: ['Sakarya', 'Düzce', 'Bolu', 'Zonguldak'],
  A4: ['Karabük', 'Kastamonu', 'Çankırı', 'Bartın'],
  A5: ['Sinop', 'Samsun', 'Çorum', 'Amasya'],
  A6: ['Ordu', 'Tokat', 'Giresun'],
  A7: ['Trabzon', 'Gümüşhane', 'Bayburt', 'Rize'],
  A8: ['Artvin', 'Erzurum', 'Ardahan'],
  A9: ['Kars', 'Ardahan', 'Iğdır'],
  B1: ['İzmir', 'Manisa', 'Aydın'],
  B2: ['Kütahya', 'Uşak', 'Denizli', 'Afyonkarahisar'],
  B3: ['Eskişehir', 'Afyonkarahisar', 'Konya (kuzey)'],
  B4: ['Ankara', 'Kırıkkale', 'Kırşehir', 'Aksaray'],
  B5: ['Yozgat', 'Nevşehir', 'Kayseri', 'Sivas (batı)'],
  B6: ['Sivas', 'Kayseri (doğu)', 'Malatya (kuzey)'],
  B7: ['Erzincan', 'Tunceli', 'Elazığ', 'Malatya'],
  B8: ['Bingöl', 'Muş', 'Erzurum (güney)', 'Bitlis'],
  B9: ['Van', 'Ağrı', 'Bitlis (doğu)'],
  B10: ['Hakkâri (kuzey)', 'Van (doğu)'],
  C1: ['Muğla', 'Aydın (güney)'],
  C2: ['Denizli (güney)', 'Burdur', 'Isparta', 'Antalya (batı)'],
  C3: ['Antalya', 'Isparta (güney)', 'Konya (batı)'],
  C4: ['Konya', 'Karaman', 'Mersin (batı)'],
  C5: ['Mersin', 'Niğde', 'Adana (batı)'],
  C6: ['Gaziantep', 'Adana', 'Osmaniye', 'Hatay', 'Kahramanmaraş'],
  C7: ['Şanlıurfa', 'Adıyaman', 'Diyarbakır (batı)'],
  C8: ['Diyarbakır', 'Mardin', 'Batman', 'Siirt'],
  C9: ['Şırnak', 'Hakkâri', 'Siirt (doğu)'],
  C10: ['Hakkâri (güneydoğu)'],
};
