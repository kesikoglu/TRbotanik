import { describe, expect, it } from 'vitest';
import { normalizeProvinceName, TR_PROVINCES } from './provinces.js';

describe('İl adı normalizasyonu', () => {
  it('tam olarak 81 il tanımlar', () => {
    expect(TR_PROVINCES).toHaveLength(81);
    expect(new Set(TR_PROVINCES).size).toBe(81);
  });

  it('aksansız / eski GBIF yazımlarını kanonik ada çözer', () => {
    expect(normalizeProvinceName('Istanbul')).toBe('İstanbul');
    expect(normalizeProvinceName('Mugla')).toBe('Muğla');
    expect(normalizeProvinceName('Sanliurfa')).toBe('Şanlıurfa');
    expect(normalizeProvinceName('Icel')).toBe('Mersin');
    expect(normalizeProvinceName('Afyon')).toBe('Afyonkarahisar');
  });

  it('parantezli nitelemeleri ayıklar', () => {
    expect(normalizeProvinceName('Çanakkale [Asia]')).toBe('Çanakkale');
  });

  it('"açıklama, il, Turkey." biçimindeki lokalite metninden ili çıkarır', () => {
    expect(normalizeProvinceName('24km SE of Batman, Diyarbakir, Turkey.')).toBe('Diyarbakır');
    expect(
      normalizeProvinceName('3 km North of Saray, between Ankara and Kizilcahamam road, Ankara, Turkey.'),
    ).toBe('Ankara');
  });

  it('hiçbir segment kanonik bir ile karşılık gelmiyorsa null döner (tahmin yürütmez)', () => {
    expect(normalizeProvinceName('40 km south of Ankara along Route 1 in valley near Ahiboz')).toBeNull();
    expect(normalizeProvinceName('24')).toBeNull();
    expect(normalizeProvinceName(null)).toBeNull();
    expect(normalizeProvinceName('')).toBeNull();
  });
});
