import { describe, expect, it } from 'vitest';
import {
  aggregateSpecies,
  mergeEndemismStatuses,
  normalizeEndemism,
  parseIucnColumn,
  parseTurColumn,
  speciesKey,
} from './nuhungemisiParse.mjs';

describe('parseTurColumn', () => {
  it('bilimsel ad ile Türkçe adı ayırır', () => {
    expect(parseTurColumn('Centaurium erythraea - Kırmızı Kantaron')).toEqual({
      scientificName: 'Centaurium erythraea',
      vernacularTr: 'Kırmızı Kantaron',
    });
  });

  it('alt tür (subsp.) içeren adları doğru ayırır', () => {
    expect(parseTurColumn('Ranunculus ficaria subsp. calthifolius - Arpacıksalebi')).toEqual({
      scientificName: 'Ranunculus ficaria subsp. calthifolius',
      vernacularTr: 'Arpacıksalebi',
    });
  });

  it('ayraç yoksa tamamını bilimsel ad sayar', () => {
    expect(parseTurColumn('Astragalus microcephalus')).toEqual({
      scientificName: 'Astragalus microcephalus',
      vernacularTr: null,
    });
  });

  it('boş veya null değeri güvenle işler', () => {
    expect(parseTurColumn('')).toEqual({ scientificName: '', vernacularTr: null });
    expect(parseTurColumn(null)).toEqual({ scientificName: '', vernacularTr: null });
    expect(parseTurColumn(undefined)).toEqual({ scientificName: '', vernacularTr: null });
  });
});

describe('parseIucnColumn', () => {
  it('kod ve açıklamayı ayırır', () => {
    expect(parseIucnColumn('LC - Least Concern (En Az Endişe Verici)')).toEqual({
      code: 'LC',
      label: 'Least Concern (En Az Endişe Verici)',
    });
  });

  it('boş değer için null döner', () => {
    expect(parseIucnColumn('')).toBeNull();
    expect(parseIucnColumn(null)).toBeNull();
  });
});

describe('normalizeEndemism', () => {
  it('bilinen üç durumu doğru eşler', () => {
    expect(normalizeEndemism('Endemik Değil')).toBe('degil');
    expect(normalizeEndemism('Endemik')).toBe('endemik');
    expect(normalizeEndemism('Lokal Endemik')).toBe('lokal-endemik');
  });

  it('boş veya tanınmayan değer için null döner', () => {
    expect(normalizeEndemism('')).toBeNull();
    expect(normalizeEndemism(null)).toBeNull();
    expect(normalizeEndemism('Bilinmiyor')).toBeNull();
  });
});

describe('mergeEndemismStatuses', () => {
  it('tek bir "lokal endemik" oyu diğerlerini ezer', () => {
    expect(mergeEndemismStatuses(['degil', 'lokal-endemik', 'degil'])).toBe('lokal-endemik');
  });

  it('lokal endemik yoksa "endemik" öncelik kazanır', () => {
    expect(mergeEndemismStatuses(['degil', 'endemik'])).toBe('endemik');
  });

  it('hepsi "değil" ise "değil" döner', () => {
    expect(mergeEndemismStatuses(['degil', 'degil'])).toBe('degil');
  });

  it('hepsi bilinmiyorsa null döner', () => {
    expect(mergeEndemismStatuses([null, null])).toBeNull();
  });
});

describe('speciesKey', () => {
  it('büyük/küçük harf ve fazla boşluk farkını yok sayar', () => {
    expect(speciesKey('Astragalus  microcephalus')).toBe(speciesKey('astragalus microcephalus'));
  });

  it('Türkçe İ/ı farkını doğru küçültür', () => {
    // Bu, davis.ts'teki normalizeTr sorunuyla aynı sınıf hata: toLowerCase() İngilizce
    // kurallarına göre çalışır, Türkçe yerel ayar (toLocaleLowerCase('tr')) gerekir.
    expect(speciesKey('İRİS')).toBe('iris');
  });
});

describe('aggregateSpecies', () => {
  const records = [
    {
      scientificName: 'Achillea millefolium', vernacularTr: 'Civanperçemi', province: 'Edirne',
      endemism: 'degil', iucnCode: 'LC', iucnLabel: 'Least Concern', monitored: false,
    },
    {
      scientificName: 'Achillea millefolium', vernacularTr: 'Civanperçemi', province: 'Bursa',
      endemism: 'degil', iucnCode: null, iucnLabel: null, monitored: false,
    },
    {
      scientificName: 'achillea  millefolium', vernacularTr: null, province: 'Edirne',
      endemism: 'degil', iucnCode: null, iucnLabel: null, monitored: true,
    },
    {
      scientificName: 'Centaurea tchihatcheffii', vernacularTr: 'Sevgi çiçeği', province: 'Ankara',
      endemism: 'lokal-endemik', iucnCode: 'CR', iucnLabel: 'Critically Endangered', monitored: true,
    },
  ];

  const result = aggregateSpecies(records);

  it('farklı yazımdaki aynı türü tek kayıtta birleştirir', () => {
    expect(result.size).toBe(2);
    const achillea = result.get(speciesKey('Achillea millefolium'));
    expect(achillea.recordCount).toBe(3);
  });

  it('illeri birleştirir, sıralar ve tekrarları eler', () => {
    const achillea = result.get(speciesKey('Achillea millefolium'));
    expect(achillea.provinces).toEqual(['Bursa', 'Edirne']);
  });

  it('herhangi bir satır izleniyorsa monitored=true olur', () => {
    const achillea = result.get(speciesKey('Achillea millefolium'));
    expect(achillea.monitored).toBe(true);
  });

  it('ilk dolu IUCN değerini korur, sonrakiler boşsa üzerine yazmaz', () => {
    const achillea = result.get(speciesKey('Achillea millefolium'));
    expect(achillea.iucnCode).toBe('LC');
  });

  it('nadir endemizm sınıfını korur', () => {
    const centaurea = result.get(speciesKey('Centaurea tchihatcheffii'));
    expect(centaurea.endemism).toBe('lokal-endemik');
  });

  it('bilimsel adı olmayan satırları yok sayar', () => {
    const withEmpty = aggregateSpecies([...records, { scientificName: '', province: 'X' }]);
    expect(withEmpty.size).toBe(2);
  });
});
