import { davisSquareFor, type DavisCode } from '@trbotanik/shared';
import type { ObservationDraft } from '../backend/types';

/**
 * Gözlem girdisinin doğrulanması.
 *
 * Kurallar veritabanındaki CHECK kısıtlarıyla KASITLI olarak aynıdır
 * (bkz. supabase/migrations/0001_init.sql). İki yerde olmasının sebebi:
 * sunucu son sözü söyler ve atlatılamaz, ama ham bir kısıt ihlali kullanıcıya
 * anlaşılmaz bir hata olarak döner. Buradaki kontroller alanın yanında anlamlı
 * bir mesaj gösterebilmek içindir — sunucudakinin yerine geçmez.
 */

export type FieldKey =
  | 'scientific_name'
  | 'coordinates'
  | 'observed_on'
  | 'elevation_m'
  | 'individual_count'
  | 'coordinate_uncertainty_m';

/** Alan → i18n anahtarı (hata mesajı). Boşsa geçerli. */
export type DraftErrors = Partial<Record<FieldKey, string>>;

export const MIN_OBSERVED_ON = '1800-01-01';

/** Bugünün tarihi, `<input type="date">` biçiminde (YYYY-AA-GG), YEREL saatle. */
export function todayIsoDate(now: Date = new Date()): string {
  // toISOString() UTC'ye çevirir; Türkiye'de akşam saatlerinde bu bir sonraki
  // güne kayar ve "gelecek tarih" hatası verirdi. Yerel bileşenler kullanılıyor.
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function validateDraft(
  draft: Partial<ObservationDraft>,
  { today = todayIsoDate() }: { today?: string } = {},
): DraftErrors {
  const errors: DraftErrors = {};

  const name = draft.scientific_name?.trim() ?? '';
  if (name.length < 2) {
    errors.scientific_name = 'observation.errorSpeciesRequired';
  } else if (name.length > 200) {
    errors.scientific_name = 'observation.errorSpeciesTooLong';
  }

  const { lat, lon } = draft;
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    errors.coordinates = 'observation.errorCoordinatesRequired';
  } else if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    errors.coordinates = 'observation.errorCoordinatesRange';
  } else if (davisSquareFor(lat, lon) === null) {
    // Davis karesi hesaplanamayan kayıt haritada hiçbir yere düşmez; kullanıcı
    // koordinatı yanlış girmiş demektir (ör. enlem/boylam ters).
    errors.coordinates = 'observation.errorOutsideTurkiye';
  }

  const date = draft.observed_on ?? '';
  if (!date) {
    errors.observed_on = 'observation.errorDateRequired';
  } else if (date > today) {
    errors.observed_on = 'observation.errorDateFuture';
  } else if (date < MIN_OBSERVED_ON) {
    errors.observed_on = 'observation.errorDateTooOld';
  }

  const elevation = draft.elevation_m;
  if (elevation != null && (elevation < -500 || elevation > 6000)) {
    errors.elevation_m = 'observation.errorElevationRange';
  }

  const count = draft.individual_count;
  if (count != null && (!Number.isInteger(count) || count < 1)) {
    errors.individual_count = 'observation.errorCountPositive';
  }

  const uncertainty = draft.coordinate_uncertainty_m;
  if (uncertainty != null && (uncertainty < 0 || uncertainty > 100000)) {
    errors.coordinate_uncertainty_m = 'observation.errorUncertaintyRange';
  }

  return errors;
}

export function isValid(errors: DraftErrors): boolean {
  return Object.keys(errors).length === 0;
}

/**
 * Girdinin düşeceği Davis karesini önizler.
 *
 * Sunucu bu değeri kendisi türetir ve istemciden almaz (generated column);
 * burada yalnızca kullanıcıya "kaydınız B4 karesine düşecek" diye göstermek için
 * hesaplanır — aynı formül olduğu için sonuç birebir aynıdır.
 */
export function previewDavisSquare(
  lat: number | null,
  lon: number | null,
): DavisCode | null {
  if (lat == null || lon == null) return null;
  return davisSquareFor(lat, lon);
}
