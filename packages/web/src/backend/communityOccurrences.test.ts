import { describe, expect, it } from 'vitest';
import { buildTaxonomyNodes, type RawTaxon } from '@trbotanik/shared';
import { buildTaxonIndex, toOccurrenceRecords } from './communityOccurrences';
import type { Observation } from './types';

/** Küçük bir taksonomi ağacı: iki tür, biri GBIF anahtarlı biri anahtarsız. */
const RAW: RawTaxon[] = [
  { key: 'c:Magnoliopsida', parentKey: null, rank: 'CLASS', name: 'Magnoliopsida' },
  { key: 'o:Fabales', parentKey: 'c:Magnoliopsida', rank: 'ORDER', name: 'Fabales' },
  { key: 'f:Fabaceae', parentKey: 'o:Fabales', rank: 'FAMILY', name: 'Fabaceae' },
  { key: 'g:Astragalus', parentKey: 'f:Fabaceae', rank: 'GENUS', name: 'Astragalus' },
  {
    key: 's:Astragalus microcephalus',
    parentKey: 'g:Astragalus',
    rank: 'SPECIES',
    name: 'Astragalus microcephalus',
    gbifKey: 5352983,
  },
  {
    key: 's:Astragalus anthylloides',
    parentKey: 'g:Astragalus',
    rank: 'SPECIES',
    name: 'Astragalus anthylloides',
    gbifKey: null,
  },
];
const NODES = buildTaxonomyNodes(RAW);

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: 'obs-1',
    gbif_key: 5352983,
    scientific_name: 'Astragalus microcephalus',
    vernacular_name: 'Anadolu Kitresi',
    lat: 39.9334,
    lon: 32.8597,
    coordinate_uncertainty_m: 12,
    elevation_m: 890,
    province: 'Ankara',
    locality: 'Beytepe',
    davis_square: 'B4',
    observed_on: '2026-08-05',
    individual_count: 3,
    phenology: 'cicekli',
    habitat_note: null,
    notes: null,
    status: 'approved',
    created_by: 'user-1',
    created_at: '2026-08-05T10:00:00Z',
    updated_at: '2026-08-05T10:00:00Z',
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
    ...overrides,
  };
}

describe('buildTaxonIndex', () => {
  it('yalnızca TÜR düzeyindeki düğümleri indeksler', () => {
    const { byName } = buildTaxonIndex(NODES);
    expect(byName.has('astragalus microcephalus')).toBe(true);
    // Cins ve familya eşleşmemeli — gözlem bir türe bağlanmalı.
    expect(byName.has('astragalus')).toBe(false);
    expect(byName.has('fabaceae')).toBe(false);
  });

  it('GBIF anahtarı olan türleri anahtara göre indeksler', () => {
    expect(buildTaxonIndex(NODES).byGbifKey.get(5352983)).toBeDefined();
  });
});

describe('toOccurrenceRecords', () => {
  it('GBIF anahtarıyla eşleştirir', () => {
    const { occurrences, unmatched } = toOccurrenceRecords([observation()], NODES);
    expect(unmatched).toBe(0);
    expect(occurrences).toHaveLength(1);
    expect(NODES[occurrences[0]!.taxonId]!.name).toBe('Astragalus microcephalus');
  });

  it('anahtar yoksa ADA göre eşleştirir', () => {
    const { occurrences, unmatched } = toOccurrenceRecords(
      [observation({ gbif_key: null, scientific_name: 'Astragalus anthylloides' })],
      NODES,
    );
    expect(unmatched).toBe(0);
    expect(NODES[occurrences[0]!.taxonId]!.name).toBe('Astragalus anthylloides');
  });

  it('ad eşleştirmesinde büyük/küçük harf ve fazla boşluğu yok sayar', () => {
    const { occurrences } = toOccurrenceRecords(
      [observation({ gbif_key: null, scientific_name: '  ASTRAGALUS   microcephalus ' })],
      NODES,
    );
    expect(occurrences).toHaveLength(1);
  });

  it('yanlış GBIF anahtarında ada düşer', () => {
    const { occurrences, unmatched } = toOccurrenceRecords(
      [observation({ gbif_key: 999999 })],
      NODES,
    );
    expect(unmatched).toBe(0);
    expect(occurrences).toHaveLength(1);
  });

  it('ağaçta karşılığı olmayan kaydı ATLAR ve sayar', () => {
    const { occurrences, unmatched } = toOccurrenceRecords(
      [observation({ gbif_key: null, scientific_name: 'Astragalus sp.' })],
      NODES,
    );
    expect(occurrences).toHaveLength(0);
    expect(unmatched).toBe(1);
  });

  it('kaynağı community olarak işaretler — referans veriyle karışmasın', () => {
    const { occurrences } = toOccurrenceRecords([observation()], NODES);
    expect(occurrences[0]!.source).toBe('community');
  });

  it('kimliği GBIF kayıtlarıyla çakışmayacak biçimde önekler', () => {
    const { occurrences } = toOccurrenceRecords([observation({ id: 'abc' })], NODES);
    expect(occurrences[0]!.id).toBe('community-abc');
  });

  it('alanları doğru taşır', () => {
    const { occurrences } = toOccurrenceRecords([observation()], NODES);
    const rec = occurrences[0]!;
    expect(rec.lat).toBe(39.9334);
    expect(rec.davisSquare).toBe('B4');
    expect(rec.year).toBe(2026);
    expect(rec.elevationM).toBe(890);
    expect(rec.province).toBe('Ankara');
    expect(rec.coordinateUncertaintyM).toBe(12);
    expect(rec.basisOfRecord).toBe('HUMAN_OBSERVATION');
  });

  it('geçersiz Davis karesini null yapar', () => {
    const { occurrences } = toOccurrenceRecords(
      [observation({ davis_square: 'Z9' as never })],
      NODES,
    );
    expect(occurrences[0]!.davisSquare).toBeNull();
  });

  it('katkıda bulunanı ekler ama akademik doğrulanmış SAYMAZ', () => {
    const { occurrences } = toOccurrenceRecords(
      [observation()],
      NODES,
      new Map([['user-1', { displayName: 'Ayşe Yılmaz', institution: 'Hacettepe' }]]),
    );
    expect(occurrences[0]!.contributor).toEqual({
      displayName: 'Ayşe Yılmaz',
      institution: 'Hacettepe',
      // Kurum kullanıcının kendi beyanıdır, doğrulanmış kimlik değildir.
      academicVerified: false,
    });
  });

  it('katkıda bulunan bilinmiyorsa alanı hiç eklemez', () => {
    const { occurrences } = toOccurrenceRecords([observation()], NODES);
    expect(occurrences[0]!.contributor).toBeUndefined();
  });

  it('boş girdide boş sonuç verir', () => {
    expect(toOccurrenceRecords([], NODES)).toEqual({ occurrences: [], unmatched: 0 });
  });
});
