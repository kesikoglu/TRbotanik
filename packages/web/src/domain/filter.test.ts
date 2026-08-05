import { describe, expect, it } from 'vitest';
import { buildTaxonomyNodes, rollUpCounts, type RawTaxon } from '@trbotanik/shared';
import type { OccurrenceRecord, PlantDetail } from '@trbotanik/shared';
import { applyFilter, EMPTY_FILTER, metricValue, normalizeTr } from './filter';

const raw: RawTaxon[] = [
  { key: 'c', parentKey: null, rank: 'CLASS', name: 'Magnoliopsida' },
  { key: 'o1', parentKey: 'c', rank: 'ORDER', name: 'Fabales' },
  { key: 'f1', parentKey: 'o1', rank: 'FAMILY', name: 'Fabaceae' },
  { key: 'g1', parentKey: 'f1', rank: 'GENUS', name: 'Astragalus' },
  {
    key: 's1', parentKey: 'g1', rank: 'SPECIES',
    name: 'Astragalus microcephalus', vernacularTr: 'Geven',
  },
  { key: 'o2', parentKey: 'c', rank: 'ORDER', name: 'Asterales' },
  { key: 'f2', parentKey: 'o2', rank: 'FAMILY', name: 'Asteraceae' },
  { key: 'g2', parentKey: 'f2', rank: 'GENUS', name: 'Centaurea' },
  {
    key: 's2', parentKey: 'g2', rank: 'SPECIES',
    name: 'Centaurea tchihatcheffii', vernacularTr: 'Sevgi çiçeği',
  },
];

const nodes = buildTaxonomyNodes(raw);
const byName = new Map(nodes.map((n) => [n.name, n.id]));
const geven = byName.get('Astragalus microcephalus')!;
const sevgi = byName.get('Centaurea tchihatcheffii')!;

const occurrence = (
  id: string,
  taxonId: number,
  lat: number,
  lon: number,
): OccurrenceRecord => ({
  id,
  taxonId,
  lat,
  lon,
  davisSquare: null,
  coordinateUncertaintyM: 100,
  year: 2020,
  province: null,
  elevationM: null,
  basisOfRecord: 'PRESERVED_SPECIMEN',
  source: 'fixture',
  license: 'CC0',
});

// Ankara (B4) ve Antalya (C3) çevresi
const occurrences: OccurrenceRecord[] = [
  { ...occurrence('a1', geven, 39.93, 32.86), davisSquare: 'B4', province: 'Ankara' },
  { ...occurrence('a2', geven, 39.5, 32.2), davisSquare: 'B4', province: 'Ankara' },
  { ...occurrence('a3', geven, 36.9, 30.7), davisSquare: 'C3', province: 'Antalya' },
  { ...occurrence('b1', sevgi, 39.85, 32.7), davisSquare: 'B4', province: 'Ankara' },
];

rollUpCounts(
  nodes,
  new Map([
    [geven, { occurrences: 3, isEndemic: false }],
    [sevgi, { occurrences: 1, isEndemic: true }],
  ]),
);

const endemicIds = new Set([sevgi]);

describe('normalizeTr', () => {
  it('Türkçe büyük I harfini doğru küçültür', () => {
    // toLowerCase('I') İngilizce'de "i" verir; Türkçe'de "ı" olmalıdır
    expect(normalizeTr('ISPARTA')).toBe(normalizeTr('ısparta'));
  });

  it('aksanları kaldırarak eşleşmeyi kolaylaştırır', () => {
    expect(normalizeTr('Sevgi çiçeği')).toBe('sevgi cicegi');
    expect(normalizeTr('ÇİĞDEM')).toBe('cigdem');
  });
});

describe('applyFilter', () => {
  it('filtre yokken tüm türleri döner', () => {
    const result = applyFilter(nodes, occurrences, endemicIds, EMPTY_FILTER);
    expect(result.totals.species).toBe(2);
    expect(result.totals.records).toBe(4);
    expect(result.totals.endemic).toBe(1);
  });

  it('familya seçimi yalnızca o alt ağacı bırakır', () => {
    const result = applyFilter(nodes, occurrences, endemicIds, {
      ...EMPTY_FILTER,
      selectedTaxonIds: [byName.get('Fabaceae')!],
    });
    expect(result.speciesIds).toEqual(new Set([geven]));
    expect(result.totals.records).toBe(3);
  });

  it('endemik filtresi endemik olmayanları eler', () => {
    const result = applyFilter(nodes, occurrences, endemicIds, {
      ...EMPTY_FILTER,
      endemicOnly: true,
    });
    expect(result.speciesIds).toEqual(new Set([sevgi]));
    expect(result.totals.records).toBe(1);
  });

  it('il filtresi yalnızca o ilde kaydı olan türleri bırakır', () => {
    const result = applyFilter(nodes, occurrences, endemicIds, {
      ...EMPTY_FILTER,
      province: 'Antalya',
    });
    expect(result.speciesIds).toEqual(new Set([geven]));
  });

  it('il filtresi eşleşen türün TÜM kayıtlarını gösterir (yalnızca o ildekileri değil)', () => {
    const result = applyFilter(nodes, occurrences, endemicIds, {
      ...EMPTY_FILTER,
      province: 'Ankara',
    });
    expect(result.speciesIds).toEqual(new Set([geven, sevgi]));
    expect(result.totals.records).toBe(4);
  });

  it('Türkçe ada göre arama yapar', () => {
    const result = applyFilter(nodes, occurrences, endemicIds, {
      ...EMPTY_FILTER,
      query: 'sevgi cicegi',
    });
    expect(result.speciesIds).toEqual(new Set([sevgi]));
  });

  it('üst taksona göre arama alttaki türleri getirir', () => {
    const result = applyFilter(nodes, occurrences, endemicIds, {
      ...EMPTY_FILTER,
      query: 'Fabaceae',
    });
    expect(result.speciesIds).toEqual(new Set([geven]));
  });

  it('eşleşen türlerin tüm atalarını görünür yapar', () => {
    const result = applyFilter(nodes, occurrences, endemicIds, {
      ...EMPTY_FILTER,
      query: 'geven',
    });
    expect(result.visibleTaxonIds).toContain(byName.get('Magnoliopsida'));
    expect(result.visibleTaxonIds).toContain(byName.get('Fabales'));
    expect(result.visibleTaxonIds).toContain(byName.get('Fabaceae'));
    expect(result.visibleTaxonIds).not.toContain(byName.get('Asteraceae'));
  });

  it('kare istatistiklerini 29 kare için eksiksiz üretir', () => {
    const result = applyFilter(nodes, occurrences, endemicIds, EMPTY_FILTER);
    expect(result.statsBySquare.size).toBe(29);

    const b4 = result.statsBySquare.get('B4')!;
    expect(b4.occurrenceCount).toBe(3);
    expect(b4.speciesCount).toBe(2);
    expect(b4.endemicSpeciesCount).toBe(1);
    expect(b4.endemismRate).toBeCloseTo(0.5);

    const c3 = result.statsBySquare.get('C3')!;
    expect(c3.occurrenceCount).toBe(1);
    expect(c3.speciesCount).toBe(1);

    // Kaydı olmayan kareler sıfır değerle var olmalı, eksik olmamalı
    expect(result.statsBySquare.get('A1')).toEqual({
      code: 'A1',
      occurrenceCount: 0,
      speciesCount: 0,
      endemicSpeciesCount: 0,
      endemismRate: 0,
    });
  });

  it('kayıtsız takson filtresi çalışır', () => {
    const withoutRecords = buildTaxonomyNodes([
      ...raw,
      { key: 's3', parentKey: 'g1', rank: 'SPECIES', name: 'Astragalus angustifolius' },
    ]);
    rollUpCounts(withoutRecords, new Map());

    const all = applyFilter(withoutRecords, [], new Set(), EMPTY_FILTER);
    expect(all.totals.species).toBe(3);

    const onlyWithRecords = applyFilter(withoutRecords, [], new Set(), {
      ...EMPTY_FILTER,
      withRecordsOnly: true,
    });
    expect(onlyWithRecords.totals.species).toBe(0);
  });
});

describe('metricValue', () => {
  const stats = {
    code: 'B4' as const,
    occurrenceCount: 3,
    speciesCount: 2,
    endemicSpeciesCount: 1,
    endemismRate: 0.5,
  };

  it('her ölçüt için doğru değeri döner', () => {
    expect(metricValue(stats, 'species')).toBe(2);
    expect(metricValue(stats, 'endemic')).toBe(1);
    expect(metricValue(stats, 'records')).toBe(3);
    expect(metricValue(stats, 'endemismRate')).toBe(50);
  });
});

describe('buildEndemicSet', () => {
  it('yalnızca endemik işaretli taksonları toplar', async () => {
    const { buildEndemicSet } = await import('./filter');
    const details = {
      1: { endemism: { value: { isEndemicToTurkiye: true } } },
      2: { endemism: { value: { isEndemicToTurkiye: false } } },
      3: {},
    } as unknown as Record<number, PlantDetail>;

    expect(buildEndemicSet(details)).toEqual(new Set([1]));
  });
});

describe('topluluk katkısı filtresi', () => {
  // Sevgi çiçeğine ait BİR topluluk kaydı; geven'in hiç topluluk kaydı yok.
  const withCommunity: OccurrenceRecord[] = [
    ...occurrences,
    {
      ...occurrence('c1', sevgi, 38.4, 27.1),
      davisSquare: 'B1',
      province: 'İzmir',
      source: 'community',
      contributor: { displayName: 'Ayşe Yılmaz', academicVerified: false },
    },
  ];

  it('yalnızca topluluk kaydı OLAN türleri bırakır', () => {
    const result = applyFilter(nodes, withCommunity, endemicIds, {
      ...EMPTY_FILTER,
      communityOnly: true,
    });
    expect(result.speciesIds).toEqual(new Set([sevgi]));
  });

  it('haritada YALNIZCA topluluk noktalarını bırakır', () => {
    const result = applyFilter(nodes, withCommunity, endemicIds, {
      ...EMPTY_FILTER,
      communityOnly: true,
    });
    // Sevgi çiçeğinin bir de GBIF kaydı var; o gösterilmemeli.
    expect(result.occurrences.map((o) => o.id)).toEqual(['c1']);
    expect(result.occurrences.every((o) => o.source === 'community')).toBe(true);
  });

  it('kapalıyken her iki kaynağı da gösterir', () => {
    const result = applyFilter(nodes, withCommunity, endemicIds, EMPTY_FILTER);
    expect(result.occurrences).toHaveLength(5);
  });

  it('kare istatistikleri yalnızca topluluk kayıtlarından hesaplanır', () => {
    const result = applyFilter(nodes, withCommunity, endemicIds, {
      ...EMPTY_FILTER,
      communityOnly: true,
    });
    expect(result.statsBySquare.get('B1')?.occurrenceCount).toBe(1);
    // B4'te yalnızca GBIF kaydı var — filtre açıkken boş kalmalı.
    expect(result.statsBySquare.get('B4')?.occurrenceCount).toBe(0);
    expect(result.totals.squares).toBe(1);
  });

  it('hiç topluluk kaydı yoksa sonuç boş çıkar', () => {
    const result = applyFilter(nodes, occurrences, endemicIds, {
      ...EMPTY_FILTER,
      communityOnly: true,
    });
    expect(result.totals.species).toBe(0);
    expect(result.occurrences).toHaveLength(0);
  });

  it('diğer filtrelerle birlikte çalışır', () => {
    // Topluluk + endemik: sevgi çiçeği endemik olduğu için kalmalı
    expect(
      applyFilter(nodes, withCommunity, endemicIds, {
        ...EMPTY_FILTER,
        communityOnly: true,
        endemicOnly: true,
      }).speciesIds,
    ).toEqual(new Set([sevgi]));

    // Topluluk + İzmir ili: topluluk kaydı İzmir'de
    expect(
      applyFilter(nodes, withCommunity, endemicIds, {
        ...EMPTY_FILTER,
        communityOnly: true,
        province: 'İzmir',
      }).speciesIds,
    ).toEqual(new Set([sevgi]));

    // Topluluk + Ankara ili: topluluk kaydı Ankara'da DEĞİL, boş çıkmalı
    expect(
      applyFilter(nodes, withCommunity, endemicIds, {
        ...EMPTY_FILTER,
        communityOnly: true,
        province: 'Ankara',
      }).totals.species,
    ).toBe(0);
  });
});

describe('"kayıtlı taksonlar" filtresi topluluk kayıtlarını sayar', () => {
  /*
   * `node.occurrenceCount` statik anlık görüntüden gelir ve topluluk katkılarını
   * içermez. Yalnızca topluluk kaydı olan bir tür, o sayaca bakılsaydı
   * "kayıtsız" sayılıp elenirdi.
   */
  it('yalnızca topluluk kaydı olan tür elenmez', () => {
    const onlyCommunityForGeven: OccurrenceRecord[] = [
      {
        ...occurrence('c9', geven, 38.4, 27.1),
        davisSquare: 'B1',
        source: 'community',
      },
    ];
    // Bu dizide geven'in yalnızca topluluk kaydı var; node.occurrenceCount ise
    // yukarıdaki rollUpCounts'tan 3 geliyor — testin anlamlı olması için
    // sayaca DEĞİL, gerçek kayıtlara bakıldığını doğruluyoruz.
    const result = applyFilter(nodes, onlyCommunityForGeven, endemicIds, {
      ...EMPTY_FILTER,
      withRecordsOnly: true,
    });
    expect(result.speciesIds.has(geven)).toBe(true);
    // Hiç kaydı olmayan sevgi çiçeği elenmeli.
    expect(result.speciesIds.has(sevgi)).toBe(false);
  });
});
