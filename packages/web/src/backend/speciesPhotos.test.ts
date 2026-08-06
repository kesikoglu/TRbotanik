import { describe, expect, it } from 'vitest';
import { buildTaxonomyNodes, type RawTaxon, type PlantDetail } from '@trbotanik/shared';
import { mergeSpeciesPhotosIntoDetails, toSpeciesPhotoImages } from './speciesPhotos';
import type { SpeciesPhoto } from './types';

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

function photoRow(overrides: Partial<SpeciesPhoto> = {}): SpeciesPhoto {
  return {
    id: 'sp-1',
    gbif_key: 5352983,
    scientific_name: 'Astragalus microcephalus',
    source_observation_id: 'obs-1',
    source_photo_id: 'photo-1',
    storage_path: '5352983/photo-1.jpg',
    caption: null,
    width: 1600,
    height: 1200,
    bytes: 240_000,
    contributor_name: 'Ayşe Yılmaz',
    license: 'CC-BY',
    sort_order: 0,
    promoted_by: 'curator-1',
    promoted_at: '2026-08-06T10:00:00Z',
    ...overrides,
  };
}

describe('toSpeciesPhotoImages', () => {
  it('GBIF anahtarıyla eşleştirir', () => {
    const { photosByTaxonId, unmatched } = toSpeciesPhotoImages([photoRow()], NODES);
    expect(unmatched).toBe(0);
    const taxonId = [...photosByTaxonId.keys()][0]!;
    expect(NODES[taxonId]!.name).toBe('Astragalus microcephalus');
    expect(photosByTaxonId.get(taxonId)).toHaveLength(1);
  });

  it('anahtar yoksa ADA göre eşleştirir', () => {
    const { photosByTaxonId, unmatched } = toSpeciesPhotoImages(
      [photoRow({ gbif_key: null, scientific_name: 'Astragalus anthylloides' })],
      NODES,
    );
    expect(unmatched).toBe(0);
    const taxonId = [...photosByTaxonId.keys()][0]!;
    expect(NODES[taxonId]!.name).toBe('Astragalus anthylloides');
  });

  it('ağaçta karşılığı olmayan kaydı ATLAR ve sayar', () => {
    const { photosByTaxonId, unmatched } = toSpeciesPhotoImages(
      [photoRow({ gbif_key: null, scientific_name: 'Astragalus sp.' })],
      NODES,
    );
    expect(photosByTaxonId.size).toBe(0);
    expect(unmatched).toBe(1);
  });

  it('kaynağı community olarak işaretler — akademik referansla karışmasın', () => {
    const { photosByTaxonId } = toSpeciesPhotoImages([photoRow()], NODES);
    const [images] = [...photosByTaxonId.values()];
    expect(images![0]!.source).toBe('community');
  });

  it('kimliği community öneki taşır, GBIF/curated kayıtlarla çakışmaz', () => {
    const { photosByTaxonId } = toSpeciesPhotoImages([photoRow({ id: 'abc' })], NODES);
    const [images] = [...photosByTaxonId.values()];
    expect(images![0]!.id).toBe('community-abc');
  });

  it('aynı taksonda birden fazla fotoğrafı biriktirir', () => {
    const { photosByTaxonId } = toSpeciesPhotoImages(
      [photoRow({ id: 'a' }), photoRow({ id: 'b' })],
      NODES,
    );
    const [images] = [...photosByTaxonId.values()];
    expect(images).toHaveLength(2);
  });

  it('atıf metninde katkıda bulunanın adı ve lisans geçer', () => {
    const { photosByTaxonId } = toSpeciesPhotoImages([photoRow()], NODES);
    const [images] = [...photosByTaxonId.values()];
    expect(images![0]!.attributionText).toContain('Ayşe Yılmaz');
    expect(images![0]!.attributionText).toContain('CC-BY');
  });

  it('katkıda bulunan adı bilinmiyorsa "bilinmeyen katkıcı" yazar', () => {
    const { photosByTaxonId } = toSpeciesPhotoImages(
      [photoRow({ contributor_name: null })],
      NODES,
    );
    const [images] = [...photosByTaxonId.values()];
    expect(images![0]!.attributionText).toContain('bilinmeyen katkıcı');
    expect(images![0]!.photographer).toBeNull();
  });

  it('yer tutucu DEĞİLDİR', () => {
    const { photosByTaxonId } = toSpeciesPhotoImages([photoRow()], NODES);
    const [images] = [...photosByTaxonId.values()];
    expect(images![0]!.isPlaceholder).toBe(false);
  });

  it('boş girdide boş sonuç verir', () => {
    expect(toSpeciesPhotoImages([], NODES)).toEqual({ photosByTaxonId: new Map(), unmatched: 0 });
  });
});

describe('mergeSpeciesPhotosIntoDetails', () => {
  function detail(images: PlantDetail['images'] = []): PlantDetail {
    return { images } as PlantDetail;
  }

  it('yükseltilmiş fotoğrafı özgün görsellerin SONUNA ekler', () => {
    const original = detail([{ id: 'gbif-1' } as never]);
    const details = { 5: original };
    const photosByTaxonId = new Map([[5, [{ id: 'community-1' } as never]]]);

    const merged = mergeSpeciesPhotosIntoDetails(details, photosByTaxonId);
    expect(merged[5]!.images.map((i) => i.id)).toEqual(['gbif-1', 'community-1']);
  });

  it('özgün details nesnesini DEĞİŞTİRMEZ (referans eşitliği bozulmaz)', () => {
    const original = detail([]);
    const details = { 5: original };
    mergeSpeciesPhotosIntoDetails(details, new Map([[5, [{ id: 'x' } as never]]]));
    expect(details[5]).toBe(original);
    expect(original.images).toEqual([]);
  });

  it('etkilenmeyen taksonların detail nesnesi aynı referansta kalır', () => {
    const untouched = detail([]);
    const details = { 5: detail([]), 6: untouched };
    const merged = mergeSpeciesPhotosIntoDetails(details, new Map([[5, [{ id: 'x' } as never]]]));
    expect(merged[6]).toBe(untouched);
  });

  it('haritada karşılığı olmayan taksonId sessizce atlanır', () => {
    const details = { 5: detail([]) };
    const merged = mergeSpeciesPhotosIntoDetails(details, new Map([[999, [{ id: 'x' } as never]]]));
    expect(merged).toEqual(details);
  });

  it('boş haritada details aynen döner', () => {
    const details = { 5: detail([]) };
    expect(mergeSpeciesPhotosIntoDetails(details, new Map())).toBe(details);
  });
});
