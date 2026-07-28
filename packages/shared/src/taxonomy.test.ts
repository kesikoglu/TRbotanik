import { describe, expect, it } from 'vitest';
import {
  ancestorPath,
  buildTaxonomyNodes,
  collectByRank,
  indexByRank,
  isInSelection,
  rollUpCounts,
  toIntervals,
  type RawTaxon,
} from './taxonomy.js';

/**
 * Küçük ama gerçekçi bir ağaç:
 *   Magnoliopsida
 *     ├─ Fabales → Fabaceae → Astragalus → { A. microcephalus, A. angustifolius }
 *     └─ Lamiales → Lamiaceae → Salvia    → { S. cryptantha }
 */
const raw: RawTaxon[] = [
  { key: 'c1', parentKey: null, rank: 'CLASS', name: 'Magnoliopsida' },
  { key: 'o1', parentKey: 'c1', rank: 'ORDER', name: 'Fabales' },
  { key: 'f1', parentKey: 'o1', rank: 'FAMILY', name: 'Fabaceae' },
  { key: 'g1', parentKey: 'f1', rank: 'GENUS', name: 'Astragalus' },
  { key: 's1', parentKey: 'g1', rank: 'SPECIES', name: 'Astragalus microcephalus' },
  { key: 's2', parentKey: 'g1', rank: 'SPECIES', name: 'Astragalus angustifolius' },
  { key: 'o2', parentKey: 'c1', rank: 'ORDER', name: 'Lamiales' },
  { key: 'f2', parentKey: 'o2', rank: 'FAMILY', name: 'Lamiaceae' },
  { key: 'g2', parentKey: 'f2', rank: 'GENUS', name: 'Salvia' },
  { key: 's3', parentKey: 'g2', rank: 'SPECIES', name: 'Salvia cryptantha' },
];

const nodes = buildTaxonomyNodes(raw);
const byName = new Map(nodes.map((n) => [n.name, n]));
const id = (name: string) => byName.get(name)!.id;

describe('DFS aralık indeksi', () => {
  it('düğüm id\'leri dizi indeksiyle aynıdır', () => {
    nodes.forEach((node, index) => expect(node.id).toBe(index));
  });

  it('alt ağaç bitişik bir aralıktır', () => {
    const fabaceae = byName.get('Fabaceae')!;
    const inSubtree = nodes
      .filter((n) => n.id >= fabaceae.id && n.id < fabaceae.subtreeEnd)
      .map((n) => n.name);
    expect(inSubtree).toEqual([
      'Fabaceae',
      'Astragalus',
      'Astragalus angustifolius',
      'Astragalus microcephalus',
    ]);
  });

  it('kök düğümün alt ağacı tüm ağacı kapsar', () => {
    const root = byName.get('Magnoliopsida')!;
    expect(root.id).toBe(0);
    expect(root.subtreeEnd).toBe(nodes.length);
  });

  it('kardeşler Türkçe sıralamaya göre deterministik dizilir', () => {
    const astragalus = byName.get('Astragalus')!;
    expect(astragalus.childIds.map((c) => nodes[c]!.name)).toEqual([
      'Astragalus angustifolius',
      'Astragalus microcephalus',
    ]);
  });

  it('aynı girdi için aynı indeksleri üretir', () => {
    const rebuilt = buildTaxonomyNodes([...raw].reverse());
    expect(rebuilt.map((n) => n.name)).toEqual(nodes.map((n) => n.name));
  });
});

describe('seçim aralıkları', () => {
  it('bir familya seçimi alt ağacındaki türleri kapsar', () => {
    const intervals = toIntervals(nodes, [id('Fabaceae')]);
    expect(isInSelection(id('Astragalus microcephalus'), intervals)).toBe(true);
    expect(isInSelection(id('Salvia cryptantha'), intervals)).toBe(false);
  });

  it('boş seçim her taksonu kabul eder (filtre yok)', () => {
    expect(isInSelection(id('Salvia cryptantha'), [])).toBe(true);
  });

  it('örtüşen seçimleri tek aralığa birleştirir', () => {
    const intervals = toIntervals(nodes, [id('Fabaceae'), id('Astragalus')]);
    expect(intervals).toHaveLength(1);
    expect(intervals[0]).toEqual({
      start: id('Fabaceae'),
      end: byName.get('Fabaceae')!.subtreeEnd,
    });
  });

  it('ayrık seçimleri ayrı aralıklar olarak tutar ve sıralar', () => {
    const intervals = toIntervals(nodes, [id('Lamiaceae'), id('Fabaceae')]);
    expect(intervals).toHaveLength(2);
    expect(intervals[0]!.start).toBeLessThan(intervals[1]!.start);
    expect(isInSelection(id('Astragalus angustifolius'), intervals)).toBe(true);
    expect(isInSelection(id('Salvia cryptantha'), intervals)).toBe(true);
  });

  it('bilinmeyen id\'leri yok sayar', () => {
    expect(toIntervals(nodes, [9999])).toEqual([]);
  });
});

describe('sayaç toplama', () => {
  it('tür ve endemik sayılarını ağaçta yukarı taşır', () => {
    const perTaxon = new Map([
      [id('Astragalus microcephalus'), { occurrences: 12, isEndemic: true }],
      [id('Astragalus angustifolius'), { occurrences: 5, isEndemic: false }],
      [id('Salvia cryptantha'), { occurrences: 7, isEndemic: true }],
    ]);
    rollUpCounts(nodes, perTaxon);

    const astragalus = byName.get('Astragalus')!;
    expect(astragalus.occurrenceCount).toBe(17);
    expect(astragalus.speciesCount).toBe(2);
    expect(astragalus.endemicCount).toBe(1);

    const root = byName.get('Magnoliopsida')!;
    expect(root.occurrenceCount).toBe(24);
    expect(root.speciesCount).toBe(3);
    expect(root.endemicCount).toBe(2);
  });
});

describe('yardımcılar', () => {
  it('seçimdeki türleri rank ile toplar', () => {
    const intervals = toIntervals(nodes, [id('Fabales')]);
    const species = collectByRank(nodes, intervals, 'SPECIES').map((i) => nodes[i]!.name);
    expect(species).toEqual(['Astragalus angustifolius', 'Astragalus microcephalus']);
  });

  it('kökten düğüme uzanan yolu döner', () => {
    const path = ancestorPath(nodes, id('Salvia cryptantha')).map((n) => n.name);
    expect(path).toEqual([
      'Magnoliopsida',
      'Lamiales',
      'Lamiaceae',
      'Salvia',
      'Salvia cryptantha',
    ]);
  });

  it('rank başına indeks üretir', () => {
    const byRank = indexByRank(nodes);
    expect(byRank.FAMILY).toHaveLength(2);
    expect(byRank.SPECIES).toHaveLength(3);
    expect(byRank.VARIETY).toHaveLength(0);
  });
});
