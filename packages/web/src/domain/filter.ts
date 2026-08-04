import {
  DAVIS_CODES,
  isInSelection,
  toIntervals,
  type DavisCode,
  type DavisStats,
  type Interval,
  type OccurrenceRecord,
  type PlantDetail,
  type TaxonNode,
} from '@trbotanik/shared';

export interface FilterState {
  /** Taksonomi ağacında seçili düğümler; boş = filtre yok */
  selectedTaxonIds: number[];
  query: string;
  endemicOnly: boolean;
  withRecordsOnly: boolean;
  /** Seçili il; yalnızca bu ilde en az bir kaydı olan türler gösterilir */
  province: string | null;
}

export const EMPTY_FILTER: FilterState = {
  selectedTaxonIds: [],
  query: '',
  endemicOnly: false,
  withRecordsOnly: false,
  province: null,
};

export interface SelectionResult {
  intervals: Interval[];
  /** Filtreye uyan tür düğümlerinin id'leri */
  speciesIds: Set<number>;
  /** Ağaçta gösterilecek düğümler (eşleşenler + ataları) */
  visibleTaxonIds: Set<number>;
  occurrences: OccurrenceRecord[];
  statsBySquare: Map<DavisCode, DavisStats>;
  totals: {
    species: number;
    endemic: number;
    records: number;
    squares: number;
  };
}

/**
 * Türkçe'ye duyarlı normalleştirme.
 *
 * `toLowerCase('I')` İngilizce'de "i" verir, Türkçe'de "ı" olmalıdır; ayrıca kullanıcı
 * "cigdem" yazıp "çiğdem" bulmak ister. Bu yüzden önce Türkçe yerel ayarla küçük harfe
 * çevrilir, sonra aksanlar ayrıştırılıp kaldırılır.
 */
export function normalizeTr(value: string): string {
  return value
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ç/g, 'c')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .trim();
}

/** Endemik tür id'lerini ayrıntı kayıtlarından çıkarır. */
export function buildEndemicSet(details: Record<number, PlantDetail>): Set<number> {
  const endemic = new Set<number>();
  for (const [id, detail] of Object.entries(details)) {
    if (detail.endemism?.value?.isEndemicToTurkiye) endemic.add(Number(id));
  }
  return endemic;
}

/** Arama sorgusuna uyan düğüm id'leri; boş sorgu tüm düğümleri kabul eder. */
function matchQuery(nodes: TaxonNode[], query: string): Set<number> | null {
  const needle = normalizeTr(query);
  if (needle.length === 0) return null;

  const matched = new Set<number>();
  for (const node of nodes) {
    const haystack = normalizeTr(`${node.name} ${node.vernacularTr ?? ''} ${node.vernacularEn ?? ''}`);
    if (haystack.includes(needle)) matched.add(node.id);
  }
  return matched;
}

/**
 * Filtreyi uygular ve haritanın, ağacın ve sayaçların hepsinin okuduğu tek sonucu üretir.
 *
 * Taksonomik filtreleme DFS aralık testine iner: bir occurrence'ın dahil olup olmadığı
 * `intervals` üzerinde ikili aramayla belirlenir; ağaç gezintisi yapılmaz.
 */
export function applyFilter(
  nodes: TaxonNode[],
  occurrences: OccurrenceRecord[],
  endemicIds: Set<number>,
  filter: FilterState,
): SelectionResult {
  const intervals = toIntervals(nodes, filter.selectedTaxonIds);
  const queryMatches = matchQuery(nodes, filter.query);

  // İl filtresi occurrence düzeyinde tutulur (tür düğümünde il bilgisi yok);
  // bir tür, o ilde en az bir kaydı varsa dahil edilir.
  const provinceSpeciesIds = filter.province
    ? new Set(occurrences.filter((o) => o.province === filter.province).map((o) => o.taxonId))
    : null;

  // 1) Filtreye uyan türleri belirle
  const speciesIds = new Set<number>();
  for (const node of nodes) {
    if (node.rank !== 'SPECIES') continue;
    if (!isInSelection(node.id, intervals)) continue;
    if (filter.endemicOnly && !endemicIds.has(node.id)) continue;
    if (filter.withRecordsOnly && node.occurrenceCount === 0) continue;
    if (provinceSpeciesIds && !provinceSpeciesIds.has(node.id)) continue;
    if (queryMatches && !matchesWithAncestors(nodes, node, queryMatches)) continue;
    speciesIds.add(node.id);
  }

  // 2) Ağaçta gösterilecek düğümler: eşleşen türler + tüm ataları
  const visibleTaxonIds = new Set<number>();
  for (const id of speciesIds) {
    let current: TaxonNode | undefined = nodes[id];
    while (current && !visibleTaxonIds.has(current.id)) {
      visibleTaxonIds.add(current.id);
      current = current.parentId === null ? undefined : nodes[current.parentId];
    }
  }

  // 3) Kayıtları süz ve kare istatistiklerini topla
  const filtered: OccurrenceRecord[] = [];
  const speciesPerSquare = new Map<DavisCode, Set<number>>();
  const endemicPerSquare = new Map<DavisCode, Set<number>>();
  const recordsPerSquare = new Map<DavisCode, number>();

  for (const occ of occurrences) {
    if (!speciesIds.has(occ.taxonId)) continue;
    filtered.push(occ);

    const square = occ.davisSquare;
    if (!square) continue;

    recordsPerSquare.set(square, (recordsPerSquare.get(square) ?? 0) + 1);

    let species = speciesPerSquare.get(square);
    if (!species) {
      species = new Set();
      speciesPerSquare.set(square, species);
    }
    species.add(occ.taxonId);

    if (endemicIds.has(occ.taxonId)) {
      let endemics = endemicPerSquare.get(square);
      if (!endemics) {
        endemics = new Set();
        endemicPerSquare.set(square, endemics);
      }
      endemics.add(occ.taxonId);
    }
  }

  const statsBySquare = new Map<DavisCode, DavisStats>();
  for (const code of DAVIS_CODES) {
    const speciesCount = speciesPerSquare.get(code)?.size ?? 0;
    const endemicCount = endemicPerSquare.get(code)?.size ?? 0;
    statsBySquare.set(code, {
      code,
      occurrenceCount: recordsPerSquare.get(code) ?? 0,
      speciesCount,
      endemicSpeciesCount: endemicCount,
      endemismRate: speciesCount > 0 ? endemicCount / speciesCount : 0,
    });
  }

  let endemicTotal = 0;
  for (const id of speciesIds) if (endemicIds.has(id)) endemicTotal++;

  let squaresWithData = 0;
  for (const stats of statsBySquare.values()) if (stats.occurrenceCount > 0) squaresWithData++;

  return {
    intervals,
    speciesIds,
    visibleTaxonIds,
    occurrences: filtered,
    statsBySquare,
    totals: {
      species: speciesIds.size,
      endemic: endemicTotal,
      records: filtered.length,
      squares: squaresWithData,
    },
  };
}

/**
 * Bir tür, kendisi veya herhangi bir atası arama sorgusuna uyuyorsa gösterilir.
 * Böylece "Fabaceae" araması familyanın altındaki tüm türleri getirir.
 */
function matchesWithAncestors(
  nodes: TaxonNode[],
  node: TaxonNode,
  matched: Set<number>,
): boolean {
  let current: TaxonNode | undefined = node;
  while (current) {
    if (matched.has(current.id)) return true;
    current = current.parentId === null ? undefined : nodes[current.parentId];
  }
  return false;
}

/** Seçili ölçüte göre bir karenin sayısal değeri. */
export type ChoroplethMetric = 'species' | 'endemic' | 'records' | 'endemismRate';

export function metricValue(stats: DavisStats, metric: ChoroplethMetric): number {
  switch (metric) {
    case 'species':
      return stats.speciesCount;
    case 'endemic':
      return stats.endemicSpeciesCount;
    case 'records':
      return stats.occurrenceCount;
    case 'endemismRate':
      return Math.round(stats.endemismRate * 100);
  }
}
