import { describe, expect, it } from 'vitest';
import {
  isValid,
  previewDavisSquare,
  todayIsoDate,
  validateDraft,
} from './observationDraft';
import type { ObservationDraft } from '../backend/types';

/** Ankara koordinatlı, her alanı geçerli bir taban girdi. */
function draft(overrides: Partial<ObservationDraft> = {}): Partial<ObservationDraft> {
  return {
    scientific_name: 'Astragalus microcephalus',
    lat: 39.9334,
    lon: 32.8597,
    observed_on: '2026-08-01',
    ...overrides,
  };
}

const TODAY = '2026-08-05';

describe('validateDraft — tür adı', () => {
  it('geçerli girdide hata yok', () => {
    expect(isValid(validateDraft(draft(), { today: TODAY }))).toBe(true);
  });

  it('boş tür adını reddeder', () => {
    expect(validateDraft(draft({ scientific_name: '' }), { today: TODAY }).scientific_name)
      .toBe('observation.errorSpeciesRequired');
  });

  it('yalnızca boşluktan oluşan adı reddeder', () => {
    expect(validateDraft(draft({ scientific_name: '   ' }), { today: TODAY }).scientific_name)
      .toBe('observation.errorSpeciesRequired');
  });

  it('200 karakterden uzun adı reddeder', () => {
    expect(validateDraft(draft({ scientific_name: 'A'.repeat(201) }), { today: TODAY }).scientific_name)
      .toBe('observation.errorSpeciesTooLong');
  });
});

describe('validateDraft — koordinat', () => {
  it('koordinatsız girdiyi reddeder', () => {
    expect(validateDraft(draft({ lat: undefined, lon: undefined }), { today: TODAY }).coordinates)
      .toBe('observation.errorCoordinatesRequired');
  });

  it('Türkiye dışındaki koordinatı reddeder (Davis karesi yok)', () => {
    // Paris — geçerli bir koordinat ama hiçbir Davis karesine düşmez.
    expect(validateDraft(draft({ lat: 48.85, lon: 2.35 }), { today: TODAY }).coordinates)
      .toBe('observation.errorOutsideTurkiye');
  });

  it('enlem/boylam ters girildiğinde yakalar', () => {
    // Ankara'nın değerleri ters: lat=32.85 (Türkiye'nin güneyi dışında)
    expect(validateDraft(draft({ lat: 32.8597, lon: 39.9334 }), { today: TODAY }).coordinates)
      .toBe('observation.errorOutsideTurkiye');
  });

  it('geçersiz aralıktaki koordinatı reddeder', () => {
    expect(validateDraft(draft({ lat: 120, lon: 32 }), { today: TODAY }).coordinates)
      .toBe('observation.errorCoordinatesRange');
  });

  it('NaN koordinatı reddeder', () => {
    expect(validateDraft(draft({ lat: NaN, lon: 32 }), { today: TODAY }).coordinates)
      .toBe('observation.errorCoordinatesRequired');
  });

  it('Türkiye içindeki uç noktaları kabul eder', () => {
    // Gökçeada (batı ucu) ve Hakkâri (güneydoğu ucu)
    expect(validateDraft(draft({ lat: 40.19, lon: 25.9 }), { today: TODAY }).coordinates).toBeUndefined();
    expect(validateDraft(draft({ lat: 37.35, lon: 43.74 }), { today: TODAY }).coordinates).toBeUndefined();
  });
});

describe('validateDraft — tarih', () => {
  it('gelecek tarihi reddeder', () => {
    expect(validateDraft(draft({ observed_on: '2026-08-06' }), { today: TODAY }).observed_on)
      .toBe('observation.errorDateFuture');
  });

  it('bugünü kabul eder', () => {
    expect(validateDraft(draft({ observed_on: TODAY }), { today: TODAY }).observed_on).toBeUndefined();
  });

  it('1800 öncesini reddeder', () => {
    expect(validateDraft(draft({ observed_on: '1799-12-31' }), { today: TODAY }).observed_on)
      .toBe('observation.errorDateTooOld');
  });

  it('tarihsiz girdiyi reddeder', () => {
    expect(validateDraft(draft({ observed_on: '' }), { today: TODAY }).observed_on)
      .toBe('observation.errorDateRequired');
  });
});

describe('validateDraft — sayısal alanlar', () => {
  it('aralık dışı rakımı reddeder', () => {
    expect(validateDraft(draft({ elevation_m: 9000 }), { today: TODAY }).elevation_m)
      .toBe('observation.errorElevationRange');
    expect(validateDraft(draft({ elevation_m: -600 }), { today: TODAY }).elevation_m)
      .toBe('observation.errorElevationRange');
  });

  it('Türkiye rakım aralığını kabul eder (Ağrı Dağı 5137 m dahil)', () => {
    expect(validateDraft(draft({ elevation_m: 5137 }), { today: TODAY }).elevation_m).toBeUndefined();
    expect(validateDraft(draft({ elevation_m: 0 }), { today: TODAY }).elevation_m).toBeUndefined();
  });

  it('sıfır veya negatif birey sayısını reddeder', () => {
    expect(validateDraft(draft({ individual_count: 0 }), { today: TODAY }).individual_count)
      .toBe('observation.errorCountPositive');
  });

  it('ondalıklı birey sayısını reddeder', () => {
    expect(validateDraft(draft({ individual_count: 2.5 }), { today: TODAY }).individual_count)
      .toBe('observation.errorCountPositive');
  });

  it('boş bırakılan isteğe bağlı alanları kabul eder', () => {
    const errors = validateDraft(
      draft({ elevation_m: null, individual_count: null, coordinate_uncertainty_m: null }),
      { today: TODAY },
    );
    expect(isValid(errors)).toBe(true);
  });
});

describe('todayIsoDate', () => {
  it('YEREL tarihi verir — akşam saatlerinde ertesi güne kaymaz', () => {
    // 5 Ağustos 23:30 yerel saat. UTC'ye çevrilse 6 Ağustos olurdu ve
    // "gelecek tarih" hatası verirdi.
    const lateEvening = new Date(2026, 7, 5, 23, 30);
    expect(todayIsoDate(lateEvening)).toBe('2026-08-05');
  });

  it('ayı ve günü iki haneye tamamlar', () => {
    expect(todayIsoDate(new Date(2026, 0, 9))).toBe('2026-01-09');
  });
});

describe('previewDavisSquare', () => {
  it('Ankara için B4 döner (sunucudaki hesapla aynı formül)', () => {
    expect(previewDavisSquare(39.9334, 32.8597)).toBe('B4');
  });

  it('koordinat yoksa null', () => {
    expect(previewDavisSquare(null, null)).toBeNull();
  });

  it('Türkiye dışı için null', () => {
    expect(previewDavisSquare(48.85, 2.35)).toBeNull();
  });
});
