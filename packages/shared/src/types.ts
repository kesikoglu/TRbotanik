import type { DavisCode } from './davis.js';

/* ------------------------------------------------------------------ *
 * Provenance — her bilimsel özniteliğin kaynağı
 * ------------------------------------------------------------------ */

/**
 * Bir özniteliğin nereden geldiği. GBIF ad, familya ve koordinat verir; yaşam formu,
 * habitat, yükselti, çiçeklenme dönemi, floristik element ve endemizm vermez — bunlar
 * Flora of Turkey ve diğer literatürden küratörlenir. Akademik bir tabloda bu ikisini
 * ayırt edememek kabul edilemez olduğu için provenance öznitelik düzeyinde tutulur.
 */
export type SourceId =
  | 'gbif'
  | 'powo'
  | 'inaturalist'
  | 'euromed'
  | 'bizimbitkiler'
  | 'flora-of-turkey'
  | 'iucn'
  | 'nuhungemisi'
  | 'eunis'
  | 'curated'
  | 'inferred'
  | 'fixture';

export type LicenseId =
  | 'CC0'
  | 'CC-BY'
  | 'CC-BY-SA'
  | 'CC-BY-NC'
  | 'CC-BY-NC-SA'
  | 'PD'
  | 'UNKNOWN';

export interface DataSourceRef {
  source: SourceId;
  sourceRecordId?: string;
  url?: string;
  /** ISO 8601 tarih */
  retrievedAt?: string;
  /** Tam bibliyografik atıf, ör. "Davis, P.H. (1970) Flora of Turkey, cilt 3, s. 122" */
  citation?: string;
  license?: LicenseId;
}

/** Bir değeri kaynağıyla birlikte sarmalar. */
export interface Sourced<T> {
  value: T;
  provenance: DataSourceRef;
  confidence?: 'high' | 'medium' | 'low';
  note?: string;
}

/**
 * Bir özniteliğin neden boş olduğu. Tabloda satırı gizlemek yerine nedenini göstermek,
 * araştırmacı için "kaynakta yok" ile "henüz girilmedi" arasındaki farkı korur.
 */
export type MissingReason = 'kaynakta-yok' | 'henuz-kuratorlenmedi' | 'uygulanamaz';

/* ------------------------------------------------------------------ *
 * Taksonomi
 * ------------------------------------------------------------------ */

export type TaxonRank =
  | 'CLASS'
  | 'ORDER'
  | 'FAMILY'
  | 'GENUS'
  | 'SPECIES'
  | 'SUBSPECIES'
  | 'VARIETY';

export const TAXON_RANKS: readonly TaxonRank[] = [
  'CLASS',
  'ORDER',
  'FAMILY',
  'GENUS',
  'SPECIES',
  'SUBSPECIES',
  'VARIETY',
];

export type TaxonStatus = 'accepted' | 'user_submitted' | 'merged';

/**
 * Taksonomi ağacının bir düğümü.
 *
 * `id` DFS ön-sıra indeksidir; bu sayede bir düğümün tüm alt ağacı `[id, subtreeEnd)`
 * bitişik tam sayı aralığıdır ve filtreleme iki karşılaştırmaya iner. Ağaç gezintisi,
 * küme üyeliği veya recursive CTE gerekmez.
 */
export interface TaxonNode {
  id: number;
  parentId: number | null;
  rank: TaxonRank;
  /** Yetkisiz kanonik ad, ör. "Astragalus microcephalus" */
  name: string;
  authorship: string | null;
  /** Alt ağaç == [id, subtreeEnd) */
  subtreeEnd: number;
  childIds: number[];
  /** GBIF backbone anahtarı; kullanıcı eklemiş ve henüz eşleşmemişse null */
  gbifKey: number | null;
  status: TaxonStatus;
  /** Ağaçta tanıdıklık için gösterilen birincil Türkçe ad */
  vernacularTr?: string;
  /** İngilizce arayüzde gösterilen birincil İngilizce ad */
  vernacularEn?: string;
  /** Bu düğümün altındaki toplamlar — ingest sırasında hesaplanır */
  occurrenceCount: number;
  speciesCount: number;
  endemicCount: number;
}

export interface TaxonomyBundle {
  version: string;
  generatedAt: string;
  /** DFS ön-sıra dizisi — dizi indeksi === TaxonNode.id */
  nodes: TaxonNode[];
  byRank: Record<TaxonRank, number[]>;
  rootIds: number[];
}

/* ------------------------------------------------------------------ *
 * Tür ayrıntısı — öznitelik tablosunun kaynağı
 * ------------------------------------------------------------------ */

export type Habit =
  | 'agac'
  | 'cali'
  | 'calimsi'
  | 'cok-yillik-ot'
  | 'iki-yillik-ot'
  | 'tek-yillik-ot'
  | 'geofit'
  | 'tirmanici'
  | 'parazit'
  | 'sukkulent';

export type LifeForm =
  | 'fanerofit'
  | 'kamefit'
  | 'hemikriptofit'
  | 'kriptofit'
  | 'terofit'
  | 'hidrofit';

export type FloristicElement =
  | 'Iran-Turan'
  | 'Akdeniz'
  | 'Avrupa-Sibirya'
  | 'Oksin'
  | 'Kozmopolit'
  | 'Bilinmiyor';

export type IucnCategory = 'EX' | 'EW' | 'CR' | 'EN' | 'VU' | 'NT' | 'LC' | 'DD' | 'NE';

/**
 * EEA'nın EUNIS habitat sınıflandırmasında (eunis.eea.europa.eu) bu taksonun
 * "karakteristik tür" olarak listelendiği bir habitat tipi. Kapsam kasıtlı
 * olarak dar tutulur: yalnızca EEA'nın yayımladığı karakteristik tür
 * listesinde adı GEÇEN taksonlar bir eşleşme alır (bkz. docs/DATA_SOURCES.md
 * §4c) — sınıflandırmanın kendisi Avrupa ağırlıklıdır, bu yüzden Türkiye
 * florasının büyük kısmı için eşleşme bulunmaz ve bu, "henüz küratörlenmedi"
 * olarak dürüstçe işaretlenir.
 */
export interface EunisHabitatMatch {
  /** Ör. "E1.2" (Perennial calcareous grassland and basic steppes) */
  code: string;
  /** EUNIS'in İngilizce habitat adı */
  name: string;
}

export type Phenology = 'cicekli' | 'meyveli' | 'vejetatif' | 'tohumlu';

export interface MonthRange {
  startMonth: number;
  endMonth: number;
}

export interface AltitudeRange {
  minM: number;
  maxM: number;
}

export interface Reference {
  citation: string;
  doi?: string;
  url?: string;
}

export interface PlantImage {
  id: string;
  url: string;
  thumbnailUrl: string;
  width?: number;
  height?: number;
  caption?: string;
  photographer: string | null;
  license: LicenseId;
  licenseUrl: string | null;
  /** Görselin altında gösterilmesi zorunlu, önceden oluşturulmuş atıf metni */
  attributionText: string;
  source: 'inaturalist' | 'wikimedia' | 'gbif' | 'curated' | 'placeholder';
  sourceUrl: string;
  /** Yerel üretilmiş yer tutucu görsel mi (fixture modu) */
  isPlaceholder: boolean;
}

/**
 * Bir taksonun tüm özellikleri. Bilimsel alanlar `Sourced<T>` ile sarmalanır;
 * `null` değer "bu bilgi yok" demektir ve tabloda `missingReasons` ile açıklanır.
 */
export interface PlantDetail {
  taxonId: number;

  // Nomenklatür
  acceptedName: Sourced<string>;
  authorship: Sourced<string | null>;
  taxonomicStatus: Sourced<'ACCEPTED' | 'SYNONYM' | 'DOUBTFUL'>;
  synonyms: Sourced<Array<{ name: string; authorship: string | null }>>;
  publishedIn: Sourced<string | null>;

  classification: Sourced<{
    class: string;
    order: string;
    family: string;
    genus: string;
  }>;

  // Yerel adlar
  vernacularTr: Sourced<Array<{ name: string; region?: string }>>;
  vernacularEn: Sourced<string[]>;

  // Biyoloji / ekoloji — küratörlü
  habit: Sourced<Habit | null>;
  lifeForm: Sourced<LifeForm | null>;
  habitat: Sourced<string | null>;
  /** EUNIS habitat tip kodları — bkz. EunisHabitatMatch */
  eunisHabitats: Sourced<EunisHabitatMatch[]>;
  altitudeRange: Sourced<AltitudeRange | null>;
  floweringPeriod: Sourced<MonthRange | null>;
  fruitingPeriod: Sourced<MonthRange | null>;
  substrate: Sourced<string | null>;

  // Koruma / biyocoğrafya
  endemism: Sourced<{ isEndemicToTurkiye: boolean; scope?: 'ulusal' | 'bolgesel' | 'yerel' }>;
  iucn: Sourced<{
    category: IucnCategory;
    criteria?: string;
    assessmentYear?: number;
    /** Türkiye Kırmızı Kitabı ile IUCN global değerlendirmesi farklı olabilir */
    scope: 'global' | 'ulusal';
  } | null>;
  floristicElement: Sourced<FloristicElement[]>;
  /** Literatürde bildirilen yayılış */
  davisSquares: Sourced<DavisCode[]>;
  /** Occurrence kayıtlarından türetilen yayılış — literatürden farklı olabilir */
  observedDavisSquares: DavisCode[];

  distribution: {
    occurrenceCount: number;
    bbox: [number, number, number, number] | null;
    centroid: [number, number] | null;
    provinces: string[];
    firstRecordYear: number | null;
    lastRecordYear: number | null;
    elevationObserved: AltitudeRange | null;
  };

  /**
   * Resmi kurum envanterinde (ör. Nuh'un Gemisi Ulusal Biyolojik Çeşitlilik
   * Veritabanı) bu taksonun kayıtlı olduğu iller. Bu, Davis karesi ataması
   * DEĞİLDİR — kaynak veri koordinat içermez, yalnızca il düzeyinde bilgi verir.
   * Bir il birden fazla Davis karesine yayılabildiği için burası ile haritadaki
   * kareler arasında birebir eşleşme kurulamaz; bu yüzden ayrı bir alan olarak
   * tutulur ve haritaya değil yalnızca öznitelik tablosuna yansır.
   */
  officialProvinces: Sourced<string[]>;

  images: PlantImage[];
  identifiers: {
    gbifTaxonKey?: number;
    powoId?: string;
    ipniId?: string;
    wfoId?: string;
    bizimBitkilerId?: string;
    iNaturalistTaxonId?: number;
  };
  references: Reference[];

  /** Boş alanların neden boş olduğu — tabloda satır gizlenmez, gerekçe gösterilir */
  missingReasons: Partial<Record<string, MissingReason>>;
  /** 0..1 — gerçek değeri olan öznitelik oranı */
  dataCompleteness: number;
}

/* ------------------------------------------------------------------ *
 * Yayılış kayıtları
 * ------------------------------------------------------------------ */

export type RecordSource = 'gbif' | 'community' | 'fixture';

/**
 * Harita üzerinde çizilen tekil kayıt.
 *
 * `source` alanı GBIF/herbaryum kayıtlarını topluluk katkılarından ayırır. Bu ayrım
 * görsel bir tercih değil bilimsel bir gerekliliktir: doğrulanmamış bir topluluk
 * kaydı herbaryum örneğiyle karıştırılmamalıdır.
 */
export interface OccurrenceRecord {
  id: string;
  taxonId: number;
  lat: number;
  lon: number;
  davisSquare: DavisCode | null;
  /** Darwin Core: coordinateUncertaintyInMeters */
  coordinateUncertaintyM: number;
  year: number | null;
  province: string | null;
  elevationM: number | null;
  basisOfRecord: 'PRESERVED_SPECIMEN' | 'HUMAN_OBSERVATION' | 'MATERIAL_SAMPLE' | 'OCCURRENCE';
  source: RecordSource;
  /** Topluluk kayıtlarında ekleyenin görünen bilgisi */
  contributor?: {
    displayName: string;
    institution?: string;
    academicVerified: boolean;
  };
  license: LicenseId;
}

/** Bir Davis karesi için özet istatistikler. */
export interface DavisStats {
  code: DavisCode;
  occurrenceCount: number;
  speciesCount: number;
  endemicSpeciesCount: number;
  /** endemik tür / toplam tür */
  endemismRate: number;
}

/* ------------------------------------------------------------------ *
 * Veri paketi manifestosu
 * ------------------------------------------------------------------ */

export type DataMode = 'fixture' | 'static' | 'live';

export interface DataManifest {
  version: string;
  generatedAt: string;
  mode: DataMode;
  taxonCount: number;
  occurrenceCount: number;
  /** GBIF Download API'nin ürettiği DOI — akademik atıf için zorunlu */
  gbifDownloadDoi: string | null;
  gbifRetrievedAt: string | null;
  notice?: string;
}
