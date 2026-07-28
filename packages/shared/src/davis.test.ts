import { describe, expect, it } from 'vitest';
import {
  DAVIS_CODES,
  davisSquareBounds,
  davisSquareCentroid,
  davisSquareFor,
  isDavisCode,
  parseDavisCode,
} from './davis.js';

describe('Davis kareleme sistemi', () => {
  it('tam olarak 29 kare tanımlar', () => {
    expect(DAVIS_CODES).toHaveLength(29);
  });

  it('A bandı 9, B ve C bantları 10 sütun içerir (A10 tanımlı değil)', () => {
    const counts = { A: 0, B: 0, C: 0 };
    for (const code of DAVIS_CODES) counts[parseDavisCode(code).band]++;
    expect(counts).toEqual({ A: 9, B: 10, C: 10 });
    expect(isDavisCode('A10')).toBe(false);
  });

  it('kare kodları benzersizdir', () => {
    expect(new Set(DAVIS_CODES).size).toBe(DAVIS_CODES.length);
  });

  /**
   * Kritik doğrulama: türetilen formül, yayınlanmış floristik literatürdeki bilinen
   * kare atamalarıyla eşleşmelidir. Bu tablo değişirse Davis mantığı bozulmuş demektir.
   */
  describe('literatürde bildirilen kare atamaları', () => {
    const cases: Array<[string, number, number, string]> = [
      ['İstanbul', 41.0082, 28.9784, 'A2'],
      ['Ankara', 39.9334, 32.8597, 'B4'],
      ['İzmir', 38.4237, 27.1428, 'B1'],
      ['Van', 38.4891, 43.4089, 'B9'],
      ['Antalya', 36.8969, 30.7133, 'C3'],
      ['Gaziantep', 37.0662, 37.3833, 'C6'],
      ['Tunceli', 39.1079, 39.5401, 'B7'],
      ['Osmaneli', 40.3564, 30.0169, 'A3'],
      ['Kastamonu (güneydoğu)', 41.3, 33.7, 'A4'],
      ['Kars', 40.6013, 43.0975, 'A9'],
    ];

    for (const [name, lat, lon, expected] of cases) {
      it(`${name} → ${expected}`, () => {
        expect(davisSquareFor(lat, lon)).toBe(expected);
      });
    }
  });

  describe('sınır davranışı', () => {
    it('Türkiye kutusunun dışındaki koordinatlar için null döner', () => {
      expect(davisSquareFor(48.2, 16.4)).toBeNull(); // Viyana
      expect(davisSquareFor(30.0, 31.2)).toBeNull(); // Kahire
      expect(davisSquareFor(41.0, 12.5)).toBeNull(); // Roma
    });

    it('geçersiz sayılar için null döner', () => {
      expect(davisSquareFor(Number.NaN, 30)).toBeNull();
      expect(davisSquareFor(39, Number.POSITIVE_INFINITY)).toBeNull();
    });

    it('grid dışına taşan uç noktaları en yakın kareye sabitler', () => {
      // Gökçeada 25.9°E — grid 26°E'de başlar, A1'e sabitlenmeli
      expect(davisSquareFor(40.17, 25.9)).toBe('A1');
      // Hatay'ın güney ucu 35.9°N — grid 36°N'de başlar, C6'ya sabitlenmeli
      expect(davisSquareFor(35.9, 36.1)).toBe('C6');
    });

    it('A bandının doğu ucunu A9 ile sınırlar (A10 yoktur)', () => {
      expect(davisSquareFor(40.5, 44.5)).toBe('A9');
    });

    it('kare sınırındaki nokta kuzeydeki/doğudaki kareye düşer', () => {
      // 40°N tam sınırı: B → A geçişi
      expect(davisSquareFor(39.999, 32.5)).toBe('B4');
      expect(davisSquareFor(40.0, 32.5)).toBe('A4');
      // 28°E tam sınırı: sütun 1 → 2 geçişi
      expect(davisSquareFor(39.0, 27.999)).toBe('B1');
      expect(davisSquareFor(39.0, 28.0)).toBe('B2');
    });
  });

  describe('geometri', () => {
    it('kare sınırları 2°×2° ve doğru konumdadır', () => {
      expect(davisSquareBounds('A1')).toEqual([26, 40, 28, 42]);
      expect(davisSquareBounds('B4')).toEqual([32, 38, 34, 40]);
      expect(davisSquareBounds('C10')).toEqual([44, 36, 46, 38]);
    });

    it('merkez noktası sınırların ortasındadır', () => {
      expect(davisSquareCentroid('B4')).toEqual([33, 39]);
    });

    it('her karenin merkezi kendi koduna geri eşlenir', () => {
      for (const code of DAVIS_CODES) {
        const [lon, lat] = davisSquareCentroid(code);
        // A9 dışındaki tüm kareler Türkiye kutusu içinde kalır
        const result = davisSquareFor(lat, lon);
        if (result !== null) expect(result).toBe(code);
      }
    });
  });
});
