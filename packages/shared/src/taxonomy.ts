import type { TaxonNode, TaxonRank } from './types.js';

/**
 * DFS aralık indeksi.
 *
 * Ağaç derinlik-öncelikli gezilir ve her düğüme ziyaret sırası (`id`) atanır. Bu
 * numaralandırmada bir düğümün tüm alt ağacı `[id, subtreeEnd)` bitişik aralığıdır:
 *
 *     takson T, seçili düğüm S'nin içinde  ⟺  S.id ≤ T.id < S.subtreeEnd
 *
 * Böylece "Fabaceae'nin tüm kayıtları" filtresi, kayıt başına iki tam sayı
 * karşılaştırmasına iner — ağaç gezintisi veya küme üyeliği gerekmez.
 */

export interface Interval {
  start: number;
  end: number;
}

/** Ham (numaralandırılmamış) ağaç girdisi. */
export interface RawTaxon {
  key: string;
  parentKey: string | null;
  rank: TaxonRank;
  name: string;
  authorship?: string | null;
  gbifKey?: number | null;
  vernacularTr?: string;
  isEndemic?: boolean;
}

/**
 * Ham ağacı DFS ön-sırada numaralandırıp `TaxonNode[]` üretir.
 * Dönen dizide `nodes[i].id === i` garantidir.
 *
 * Kardeş düğümler ada göre sıralanır; böylece aynı girdi her zaman aynı indeksleri
 * üretir (deterministik, diff'lenebilir çıktı).
 */
export function buildTaxonomyNodes(raw: RawTaxon[]): TaxonNode[] {
  const childrenByParent = new Map<string | null, RawTaxon[]>();
  for (const item of raw) {
    const list = childrenByParent.get(item.parentKey);
    if (list) list.push(item);
    else childrenByParent.set(item.parentKey, [item]);
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }

  const nodes: TaxonNode[] = [];
  const idByKey = new Map<string, number>();

  function visit(item: RawTaxon, parentId: number | null): number {
    const id = nodes.length;
    idByKey.set(item.key, id);

    const node: TaxonNode = {
      id,
      parentId,
      rank: item.rank,
      name: item.name,
      authorship: item.authorship ?? null,
      subtreeEnd: id + 1, // çocuklar eklendikten sonra düzeltilir
      childIds: [],
      gbifKey: item.gbifKey ?? null,
      status: 'accepted',
      occurrenceCount: 0,
      speciesCount: 0,
      endemicCount: 0,
    };
    if (item.vernacularTr) node.vernacularTr = item.vernacularTr;
    nodes.push(node);

    for (const child of childrenByParent.get(item.key) ?? []) {
      node.childIds.push(visit(child, id));
    }
    node.subtreeEnd = nodes.length;
    return id;
  }

  for (const root of childrenByParent.get(null) ?? []) {
    visit(root, null);
  }
  return nodes;
}

/**
 * Yaprak sayımlarını (tür, endemik, occurrence) ağaçta aşağıdan yukarı toplar.
 *
 * DFS ön-sırada çocukların id'si her zaman ebeveyninkinden büyüktür; bu yüzden
 * diziyi ters sırada tek geçişte taramak doğru birikimi verir — O(n).
 */
export function rollUpCounts(
  nodes: TaxonNode[],
  perTaxon: Map<number, { occurrences: number; isEndemic: boolean }>,
): void {
  for (const node of nodes) {
    const own = perTaxon.get(node.id);
    node.occurrenceCount = own?.occurrences ?? 0;
    node.speciesCount = node.rank === 'SPECIES' ? 1 : 0;
    node.endemicCount = node.rank === 'SPECIES' && own?.isEndemic ? 1 : 0;
  }

  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]!;
    if (node.parentId === null) continue;
    const parent = nodes[node.parentId]!;
    parent.occurrenceCount += node.occurrenceCount;
    parent.speciesCount += node.speciesCount;
    parent.endemicCount += node.endemicCount;
  }
}

/**
 * Seçili düğümlerin alt ağaçlarını, örtüşenleri birleştirilmiş sıralı aralıklara çevirir.
 * Bir üst düğüm ve altındaki bir düğüm birlikte seçilirse tek aralığa indirgenir.
 */
export function toIntervals(nodes: TaxonNode[], selectedIds: Iterable<number>): Interval[] {
  const raw: Interval[] = [];
  for (const id of selectedIds) {
    const node = nodes[id];
    if (node) raw.push({ start: node.id, end: node.subtreeEnd });
  }
  if (raw.length === 0) return [];

  raw.sort((a, b) => a.start - b.start);
  const merged: Interval[] = [raw[0]!];
  for (let i = 1; i < raw.length; i++) {
    const current = raw[i]!;
    const last = merged[merged.length - 1]!;
    if (current.start <= last.end) {
      if (current.end > last.end) last.end = current.end;
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

/**
 * Bir takson id'sinin seçime dahil olup olmadığını ikili aramayla belirler.
 * Boş aralık listesi "filtre yok" anlamına gelir ve her taksonu kabul eder.
 */
export function isInSelection(taxonId: number, intervals: Interval[]): boolean {
  if (intervals.length === 0) return true;
  let lo = 0;
  let hi = intervals.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const interval = intervals[mid]!;
    if (taxonId < interval.start) hi = mid - 1;
    else if (taxonId >= interval.end) lo = mid + 1;
    else return true;
  }
  return false;
}

/** Seçimdeki belirli ranktaki tüm düğüm id'lerini toplar. */
export function collectByRank(
  nodes: TaxonNode[],
  intervals: Interval[],
  rank: TaxonRank,
): number[] {
  const result: number[] = [];
  if (intervals.length === 0) {
    for (const node of nodes) if (node.rank === rank) result.push(node.id);
    return result;
  }
  for (const { start, end } of intervals) {
    for (let id = start; id < end; id++) {
      const node = nodes[id];
      if (node && node.rank === rank) result.push(id);
    }
  }
  return result;
}

/** Bir düğümden köke uzanan yol (kök → düğüm sırasıyla). */
export function ancestorPath(nodes: TaxonNode[], taxonId: number): TaxonNode[] {
  const path: TaxonNode[] = [];
  let current = nodes[taxonId];
  while (current) {
    path.unshift(current);
    current = current.parentId === null ? undefined : nodes[current.parentId];
  }
  return path;
}

/** Rank başına düğüm id'leri — arayüzdeki "sınıfa/familyaya göre seç" listeleri için. */
export function indexByRank(nodes: TaxonNode[]): Record<TaxonRank, number[]> {
  const byRank = {
    CLASS: [],
    ORDER: [],
    FAMILY: [],
    GENUS: [],
    SPECIES: [],
    SUBSPECIES: [],
    VARIETY: [],
  } as Record<TaxonRank, number[]>;
  for (const node of nodes) byRank[node.rank].push(node.id);
  return byRank;
}
