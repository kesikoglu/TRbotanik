import type { DavisCode } from '@trbotanik/shared';

/**
 * Veritabanı satır tipleri.
 *
 * Alan adları SQL'deki gibi snake_case bırakıldı — PostgREST satırları olduğu gibi
 * döndürür ve burada isim çevirisi yapmak, şema ile kod arasında sessizce
 * kayabilecek ikinci bir eşleme katmanı yaratırdı. Dönüşüm yalnızca uygulamanın
 * kendi modeline (OccurrenceRecord) geçerken, tek bir yerde yapılır.
 *
 * Kaynak: supabase/migrations/0001_init.sql
 */

export type UserRole = 'admin' | 'curator' | 'contributor';
export type UserStatus = 'pending' | 'approved' | 'suspended';
export type ObservationStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

/** Fenoloji (bitkinin gözlem anındaki evresi) — SQL'deki CHECK listesiyle aynı. */
export const PHENOLOGY_VALUES = [
  'vejetatif',
  'tomurcuk',
  'cicekli',
  'meyveli',
  'tohumlu',
  'kurumus',
] as const;
export type Phenology = (typeof PHENOLOGY_VALUES)[number];

export interface Profile {
  id: string;
  display_name: string;
  institution: string | null;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
}

export interface Observation {
  id: string;
  gbif_key: number | null;
  scientific_name: string;
  vernacular_name: string | null;
  lat: number;
  lon: number;
  coordinate_uncertainty_m: number | null;
  elevation_m: number | null;
  province: string | null;
  locality: string | null;
  /** Sunucuda koordinattan türetilir; istemci göndermez (generated column). */
  davis_square: DavisCode | null;
  observed_on: string;
  individual_count: number | null;
  phenology: Phenology | null;
  habitat_note: string | null;
  notes: string | null;
  status: ObservationStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
}

export interface ObservationPhoto {
  id: string;
  observation_id: string;
  storage_path: string;
  caption: string | null;
  sort_order: number;
  width: number | null;
  height: number | null;
  bytes: number | null;
  created_at: string;
}

/** Gözlem + ilişkili fotoğraflar + katkıda bulunanın profili (listelerde kullanılır). */
export interface ObservationWithRelations extends Observation {
  observation_photos: ObservationPhoto[];
  profiles: Pick<Profile, 'display_name' | 'institution'> | null;
}

/**
 * Yeni gözlem girdisi — formun ürettiği, sunucuya gidecek alanlar.
 *
 * `davis_square`, `status`, `created_by` KASITLI olarak yok: ilki sunucuda
 * türetilir, diğer ikisi RLS politikaları tarafından zorlanır (bkz. 0001_init.sql).
 */
export interface ObservationDraft {
  gbif_key: number | null;
  scientific_name: string;
  vernacular_name: string | null;
  lat: number;
  lon: number;
  coordinate_uncertainty_m: number | null;
  elevation_m: number | null;
  province: string | null;
  locality: string | null;
  observed_on: string;
  individual_count: number | null;
  phenology: Phenology | null;
  habitat_note: string | null;
  notes: string | null;
}
