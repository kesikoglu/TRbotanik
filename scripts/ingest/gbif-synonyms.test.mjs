import { describe, expect, it } from 'vitest';
import { dedupeSynonyms, toSynonymEntry } from './gbif-synonyms.mjs';

describe('toSynonymEntry', () => {
  it('yetkisiz canonicalName varsa onu kullanır', () => {
    expect(
      toSynonymEntry({
        canonicalName: 'Astragalus vulpinus',
        scientificName: 'Astragalus vulpinus Willd.',
        authorship: 'Willd.',
      }),
    ).toEqual({ name: 'Astragalus vulpinus', authorship: 'Willd.' });
  });

  it('canonicalName yoksa scientificName\'den yazar adını kırpar', () => {
    expect(
      toSynonymEntry({ scientificName: 'Centaurea kotschyi Boiss. & Heldr.', authorship: 'Boiss. & Heldr.' }),
    ).toEqual({ name: 'Centaurea kotschyi', authorship: 'Boiss. & Heldr.' });
  });

  it('yazar adı yoksa null taşır, adı bozmaz', () => {
    expect(toSynonymEntry({ scientificName: 'Verbascum sinuatum' })).toEqual({
      name: 'Verbascum sinuatum',
      authorship: null,
    });
  });

  it('adsız kaydı eler', () => {
    expect(toSynonymEntry({ authorship: 'L.' })).toBeNull();
    expect(toSynonymEntry({ canonicalName: '   ' })).toBeNull();
  });
});

describe('dedupeSynonyms', () => {
  it('aynı adı bir kez tutar', () => {
    const result = dedupeSynonyms([
      { name: 'Astragalus vulpinus', authorship: 'Willd.' },
      { name: 'Astragalus vulpinus', authorship: 'Willd.' },
    ]);
    expect(result).toEqual([{ name: 'Astragalus vulpinus', authorship: 'Willd.' }]);
  });

  it('yazar adı taşıyan kaydı taşımayana tercih eder', () => {
    const result = dedupeSynonyms([
      { name: 'Salvia tomentosa', authorship: null },
      { name: 'Salvia tomentosa', authorship: 'Mill.' },
    ]);
    expect(result).toEqual([{ name: 'Salvia tomentosa', authorship: 'Mill.' }]);
  });

  it('null girdileri yok sayar', () => {
    expect(dedupeSynonyms([null, { name: 'Quercus cerris', authorship: 'L.' }, null])).toEqual([
      { name: 'Quercus cerris', authorship: 'L.' },
    ]);
  });

  it('kararlı (alfabetik) sırada döner', () => {
    const result = dedupeSynonyms([
      { name: 'Zea mays', authorship: null },
      { name: 'Abies nordmanniana', authorship: null },
      { name: 'Malus domestica', authorship: null },
    ]);
    expect(result.map((s) => s.name)).toEqual(['Abies nordmanniana', 'Malus domestica', 'Zea mays']);
  });

  it('boş girdide boş dizi döner', () => {
    expect(dedupeSynonyms([])).toEqual([]);
  });
});
