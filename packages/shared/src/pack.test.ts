import { describe, expect, it } from 'vitest';
import { isPacked, packDetails, unpackDetails, type PackedDetailsFile } from './pack.js';
import type { PlantDetail } from './types.js';

const GBIF = { source: 'gbif' as const, retrievedAt: '2026-01-01T00:00:00.000Z', url: 'https://gbif.org' };
const KEW = { source: 'powo' as const, retrievedAt: '2026-01-01T00:00:00.000Z', citation: 'Kew WCVP' };

/** Testler için minimum ama gerçekçi bir ayrıntı kaydı. */
function detail(overrides: Record<string, unknown> = {}): PlantDetail {
  return {
    taxonId: 1,
    acceptedName: { value: 'Astragalus microcephalus', provenance: GBIF },
    habit: { value: 'cali', provenance: KEW },
    iucn: { value: null },
    images: [{ id: 'a-0', url: 'x', isPlaceholder: false }],
    distribution: { occurrenceCount: 5, provinces: ['Ankara'] },
    missingReasons: { habitat: 'henuz-kuratorlenmedi' },
    ...overrides,
  } as unknown as PlantDetail;
}

describe('packDetails', () => {
  it('aynı kaynağı tabloda bir kez tutar', () => {
    const packed = packDetails({ 1: detail(), 2: detail({ taxonId: 2 }) });
    expect(packed.provenances).toHaveLength(2); // GBIF + KEW, tekrarları değil
    expect(packed.format).toBe('packed-provenance-1');
  });

  it('Sourced alanı indekse çevirir, değeri korur', () => {
    const packed = packDetails({ 1: detail() });
    const s = packed.species['1'] as Record<string, { value: unknown; p?: number }>;
    expect(s['acceptedName']).toEqual({ value: 'Astragalus microcephalus', p: 0 });
    expect(s['acceptedName']).not.toHaveProperty('provenance');
  });

  it('kaynaksız Sourced alanına dokunmaz', () => {
    const packed = packDetails({ 1: detail() });
    expect((packed.species['1'] as Record<string, unknown>)['iucn']).toEqual({ value: null });
  });

  it('Sourced olmayan alanları (dizi, düz nesne) olduğu gibi bırakır', () => {
    const packed = packDetails({ 1: detail() });
    const s = packed.species['1'] as Record<string, unknown>;
    expect(s['images']).toEqual([{ id: 'a-0', url: 'x', isPlaceholder: false }]);
    expect(s['distribution']).toEqual({ occurrenceCount: 5, provinces: ['Ankara'] });
    expect(s['missingReasons']).toEqual({ habitat: 'henuz-kuratorlenmedi' });
    expect(s['taxonId']).toBe(1);
  });

  it('`value` anahtarı olsa da fazladan alanı olan nesneyi Sourced saymaz', () => {
    const packed = packDetails({
      1: detail({ weird: { value: 1, somethingElse: 2, provenance: GBIF } }),
    });
    expect((packed.species['1'] as Record<string, unknown>)['weird']).toEqual({
      value: 1,
      somethingElse: 2,
      provenance: GBIF,
    });
  });
});

describe('unpackDetails', () => {
  it('paketlemenin tersini yapar (gidiş-dönüş aynı sonucu verir)', () => {
    const original = { 1: detail(), 2: detail({ taxonId: 2 }) };
    const restored = unpackDetails(packDetails(original));
    expect(restored).toEqual(original);
  });

  it('aynı kaynağı kullanan alanlar AYNI nesne referansını paylaşır', () => {
    const restored = unpackDetails(packDetails({ 1: detail(), 2: detail({ taxonId: 2 }) }));
    const a = restored[1]!.acceptedName.provenance;
    const b = restored[2]!.acceptedName.provenance;
    expect(a).toBe(b); // referans eşitliği — bellek kazancının kanıtı
  });

  it('JSON gidiş-dönüşünden sonra da doğru açılır', () => {
    const original = { 1: detail() };
    const roundTripped = JSON.parse(JSON.stringify(packDetails(original))) as PackedDetailsFile;
    expect(unpackDetails(roundTripped)).toEqual(original);
  });

  it('paketlenmemiş (eski/fixture) dosyayı olduğu gibi döner', () => {
    const plain = { 1: detail() };
    expect(unpackDetails(plain)).toBe(plain);
  });

  it('boş girdide boş sonuç verir', () => {
    expect(unpackDetails(packDetails({}))).toEqual({});
  });
});

describe('isPacked', () => {
  it('paketlenmiş dosyayı tanır', () => {
    expect(isPacked(packDetails({ 1: detail() }))).toBe(true);
  });

  it('düz kaydı paketlenmiş sanmaz', () => {
    expect(isPacked({ 1: detail() })).toBe(false);
    expect(isPacked(null)).toBe(false);
    expect(isPacked([])).toBe(false);
  });
});
