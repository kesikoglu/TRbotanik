import { describe, expect, it } from 'vitest';
import { categoryTitleFor, normalizeLicense, stripHtml } from './wikimedia-images.mjs';

describe('Wikimedia Commons lisans eşlemesi', () => {
  it('bilinen lisans kısa adlarını eşler', () => {
    expect(normalizeLicense('CC0')).toBe('CC0');
    expect(normalizeLicense('CC BY 4.0')).toBe('CC-BY');
    expect(normalizeLicense('CC BY 3.0')).toBe('CC-BY');
    expect(normalizeLicense('CC BY-SA 4.0')).toBe('CC-BY-SA');
    expect(normalizeLicense('CC BY-SA 2.5')).toBe('CC-BY-SA');
    expect(normalizeLicense('Public domain')).toBe('PD');
    expect(normalizeLicense('PD-self')).toBe('PD');
  });

  it('eşlenemeyen lisanslar için null döner (ör. yalnızca GFDL)', () => {
    expect(normalizeLicense('GFDL')).toBeNull();
    expect(normalizeLicense('')).toBeNull();
    expect(normalizeLicense(undefined)).toBeNull();
    expect(normalizeLicense(null)).toBeNull();
  });
});

describe('HTML temizleme (Artist/Credit alanları)', () => {
  it('bağlantılı kullanıcı adından HTML etiketlerini kaldırır', () => {
    expect(stripHtml('<a href="//commons.wikimedia.org/wiki/User:Jane">Jane Doe</a>')).toBe('Jane Doe');
  });

  it('düz metni değiştirmeden bırakır', () => {
    expect(stripHtml('Jane Doe')).toBe('Jane Doe');
  });

  it('boş/yalnızca etiketli girdi için null döner', () => {
    expect(stripHtml('')).toBeNull();
    expect(stripHtml(null)).toBeNull();
    expect(stripHtml('<span></span>')).toBeNull();
  });
});

describe('Commons kategori adı üretimi', () => {
  it('boşlukları alt çizgiyle değiştirir', () => {
    expect(categoryTitleFor('Cyclamen hederifolium')).toBe('Category:Cyclamen_hederifolium');
  });

  it('baştaki/sondaki boşlukları temizler', () => {
    expect(categoryTitleFor('  Pinus brutia  ')).toBe('Category:Pinus_brutia');
  });
});
