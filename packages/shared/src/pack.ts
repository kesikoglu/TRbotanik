import type { DataSourceRef, PlantDetail } from './types.js';

/**
 * `details.json` için kaynak (provenance) tekilleştirmesi.
 *
 * NEDEN: Her öznitelik kendi `Sourced<T>` sarmalayıcısında tam bir `DataSourceRef`
 * taşır (kaynak adı, çekilme zamanı, adres, atıf metni). Bu tasarım doğrudur —
 * akademik kullanımda her değerin nereden geldiği görünmelidir — ama serileştirmede
 * pahalıdır: 13.038 türde 130.864 `Sourced` alan var, oysa BENZERSİZ kaynak nesnesi
 * yalnızca 6 tane. Aynı 183–441 baytlık nesne on binlerce kez tekrarlanınca
 * `details.json`'ın %44'ünü (27,8 MB) kaynak bilgisi kaplıyordu.
 *
 * Çözüm: kaynaklar bir kez bir tabloya yazılır, alanlar tabloya indeksle referans
 * verir. Açarken (`unpackDetails`) her indeks AYNI nesneye çözülür — dosya küçülür
 * VE bellekte 130.864 ayrı nesne yerine 6 paylaşılan nesne kalır. Bu ikincisi
 * özellikle mobil için önemlidir.
 *
 * Tüketen kod değişmez: açma işleminden sonra `detail.habit.provenance.source`
 * eskisi gibi çalışır.
 */

/** Paketlenmiş dosya biçimi. Düz `Record<number, PlantDetail>` de kabul edilir (bkz. `unpackDetails`). */
export interface PackedDetailsFile {
  /** Biçim işareti — düz (paketlenmemiş) dosyadan ayırt etmek için. */
  format: 'packed-provenance-1';
  /** Benzersiz kaynak nesneleri; alanlar buraya indeksle referans verir. */
  provenances: DataSourceRef[];
  /** Taxon id → paketlenmiş ayrıntı kaydı. */
  species: Record<string, unknown>;
}

const SOURCED_KEYS = new Set(['value', 'provenance', 'confidence', 'note']);

/**
 * Bir değerin `Sourced<T>` olup olmadığını yapısına bakarak belirler.
 *
 * Yalnızca `value` anahtarına bakmak yetmez — `distribution`, `identifiers` gibi
 * düz nesneler yanlışlıkla eşleşebilirdi. Bu yüzden anahtar kümesinin tamamı
 * `Sourced`'ın bilinen alanlarının içinde kalmalıdır. `provenance` yokluğu
 * normaldir: `sourced(null)` çağrıları kaynaksız boş değer üretir.
 */
function isSourced(value: unknown): value is { value: unknown; provenance?: DataSourceRef } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (!keys.includes('value')) return false;
  return keys.every((k) => SOURCED_KEYS.has(k));
}

/** Kaynak nesnesini kararlı bir anahtara çevirir (alan sırası fark etmesin). */
function provenanceKey(provenance: DataSourceRef): string {
  const entries = Object.entries(provenance).sort(([a], [b]) => (a < b ? -1 : 1));
  return JSON.stringify(entries);
}

/** `Record<number, PlantDetail>` → kaynakları tekilleştirilmiş paket. */
export function packDetails(details: Record<number, PlantDetail>): PackedDetailsFile {
  const provenances: DataSourceRef[] = [];
  const indexByKey = new Map<string, number>();

  const intern = (provenance: DataSourceRef): number => {
    const key = provenanceKey(provenance);
    const existing = indexByKey.get(key);
    if (existing !== undefined) return existing;
    const index = provenances.length;
    provenances.push(provenance);
    indexByKey.set(key, index);
    return index;
  };

  const species: Record<string, unknown> = {};
  for (const [taxonId, detail] of Object.entries(details)) {
    const packed: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(detail as unknown as Record<string, unknown>)) {
      if (isSourced(value) && value.provenance) {
        const { provenance, ...rest } = value;
        packed[field] = { ...rest, p: intern(provenance) };
      } else {
        packed[field] = value;
      }
    }
    species[taxonId] = packed;
  }

  return { format: 'packed-provenance-1', provenances, species };
}

/** Paketlenmiş dosyayı açar; zaten düz biçimdeyse olduğu gibi döner. */
export function unpackDetails(
  file: PackedDetailsFile | Record<number, PlantDetail>,
): Record<number, PlantDetail> {
  if (!isPacked(file)) return file as Record<number, PlantDetail>;

  const { provenances, species } = file;
  const out: Record<number, PlantDetail> = {};
  for (const [taxonId, packedDetail] of Object.entries(species)) {
    const detail: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(packedDetail as Record<string, unknown>)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value) && 'p' in value) {
        const { p, ...rest } = value as { p: number };
        // Kasıtlı olarak KOPYALANMAZ: aynı nesne referansı paylaşılır, bellek kazancı buradan gelir.
        detail[field] = { ...rest, provenance: provenances[p] };
      } else {
        detail[field] = value;
      }
    }
    out[Number(taxonId)] = detail as unknown as PlantDetail;
  }
  return out;
}

/** Yüklenen JSON'un paketlenmiş biçimde olup olmadığını söyler. */
export function isPacked(file: unknown): file is PackedDetailsFile {
  return (
    typeof file === 'object' &&
    file !== null &&
    (file as PackedDetailsFile).format === 'packed-provenance-1' &&
    Array.isArray((file as PackedDetailsFile).provenances)
  );
}
