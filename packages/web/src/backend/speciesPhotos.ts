import type { PlantDetail, PlantImage, TaxonNode } from '@trbotanik/shared';
import { getSupabase } from './client';
import { SPECIES_PHOTO_BUCKET, SUPABASE_URL } from './config';
import { publicPhotoUrl, publicStorageUrl } from './photos';
import { buildTaxonIndex } from './communityOccurrences';
import type { ObservationPhoto, SpeciesPhoto } from './types';

/**
 * Onaylı topluluk gözlem fotoğraflarının küratör kararıyla tür referans
 * galerisine yükseltilmesi.
 *
 * Tür detay panelindeki galeri (`PlantDetail.images`) statik bir artefakttan
 * (public/data/details/shard-*.json) gelir; bu modül, topluluk katmanı gibi
 * (bkz. communityOccurrences.ts) canlı bir ek katman olarak istemci tarafında
 * birleştirilecek fotoğrafları yönetir — statik veriyi yeniden derlemeden.
 *
 * KAYNAK AYRIMI KORUNUR: dönen `PlantImage`ler `source: 'community'` taşır ve
 * galeri kartında ayrı bir rozetle işaretlenir — akademik referans veriyle
 * aynı görsel ağırlıkta sunulmaz (bkz. DetailPane.tsx).
 */

export function publicSpeciesPhotoUrl(storagePath: string): string {
  return publicStorageUrl(SUPABASE_URL, SPECIES_PHOTO_BUCKET, storagePath);
}

function extensionFromPath(path: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(path);
  return match ? match[1]!.toLowerCase() : 'jpg';
}

/**
 * Onaylı bir gözlem fotoğrafını tür galerisine yükseltir (yalnızca küratör —
 * RLS bunu da zorlar, bkz. species_photos_curator_write).
 *
 * Dosya KOPYALANIR, referans verilmez: özgün fotoğrafın sahibi kendi
 * klasöründeki dosyayı istediği an silebilir (bkz. 0002_storage.sql), ama tür
 * galerisi kalıcı, atıf yapılabilir referans veridir ve bundan bağımsız olmalı.
 */
export async function promotePhotoToGallery(params: {
  observation: { id: string; gbif_key: number | null; scientific_name: string };
  photo: ObservationPhoto;
  contributorName: string | null;
}): Promise<void> {
  const { observation, photo, contributorName } = params;
  const supabase = await getSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const curatorId = sessionData.session?.user.id;
  if (!curatorId) throw new Error('Oturum yok.');

  const sourceUrl = publicPhotoUrl(SUPABASE_URL, photo.storage_path);
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`Özgün fotoğraf indirilemedi (${res.status}).`);
  const blob = await res.blob();

  const ext = extensionFromPath(photo.storage_path);
  const slug = observation.gbif_key != null ? String(observation.gbif_key) : 'unkeyed';
  const path = `${slug}/${photo.id}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(SPECIES_PHOTO_BUCKET)
    .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from('species_photos').insert({
    gbif_key: observation.gbif_key,
    scientific_name: observation.scientific_name,
    source_observation_id: observation.id,
    source_photo_id: photo.id,
    storage_path: path,
    caption: photo.caption,
    width: photo.width,
    height: photo.height,
    bytes: photo.bytes,
    contributor_name: contributorName,
    promoted_by: curatorId,
  });
  if (insertError) throw insertError;
}

/** Bir küratör kararını geri alır: galeri kaydını ve kopyalanmış dosyayı siler. */
export async function removeSpeciesPhoto(speciesPhotoId: string): Promise<void> {
  const supabase = await getSupabase();
  const { data, error: selectError } = await supabase
    .from('species_photos')
    .select('storage_path')
    .eq('id', speciesPhotoId)
    .single();
  if (selectError) throw selectError;
  const storagePath = (data as Pick<SpeciesPhoto, 'storage_path'>).storage_path;

  const { error: deleteRowError } = await supabase
    .from('species_photos')
    .delete()
    .eq('id', speciesPhotoId);
  if (deleteRowError) throw deleteRowError;
  // Depo temizliği en iyi çabadır: satır zaten silindi ve artık kimseye
  // gösterilmiyor; kalıntı dosya burada hata fırlatıp kullanıcıyı engellemez.
  await supabase.storage.from(SPECIES_PHOTO_BUCKET).remove([storagePath]);
}

/**
 * Zaten galeriye yükseltilmiş özgün fotoğraflar: özgün fotoğraf id'sinden
 * galeri satırının id'sine eşleme. Denetim panelinde "galeriye ekle"
 * düğmesini o fotoğraflar için devre dışı bırakmak VE "kaldır" eylemi için
 * hangi galeri satırının silineceğini bilmek amacıyla kullanılır.
 */
export async function listPromotedPhotosBySourceId(): Promise<Map<string, string>> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('species_photos')
    .select('id, source_photo_id')
    .not('source_photo_id', 'is', null);
  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of (data ?? []) as { id: string; source_photo_id: string | null }[]) {
    if (row.source_photo_id) map.set(row.source_photo_id, row.id);
  }
  return map;
}

/** Tüm tür galerisi fotoğraflarını çeker — herkese açık, giriş gerekmez. */
export async function listSpeciesPhotos(): Promise<SpeciesPhoto[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('species_photos')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as SpeciesPhoto[];
}

/** Ada göre eşleştirme normalleştirmesi — communityOccurrences.ts ile aynı desen. */
function nameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface SpeciesPhotoResult {
  photosByTaxonId: Map<number, PlantImage[]>;
  /** Taksonomi ağacında karşılığı bulunamadığı için gösterilemeyen kayıt sayısı. */
  unmatched: number;
}

/**
 * `species_photos` satırlarını, taksona göre gruplanmış `PlantImage[]`
 * listelerine çevirir. Eşleştirme communityOccurrences.ts'teki ile birebir
 * aynı desen: önce GBIF anahtarı, sonra ad. Hiçbiri tutmazsa kayıt ATLANIR ve
 * sayılır — sessiz kayıp yok.
 */
export function toSpeciesPhotoImages(rows: SpeciesPhoto[], nodes: TaxonNode[]): SpeciesPhotoResult {
  const { byGbifKey, byName } = buildTaxonIndex(nodes);
  const photosByTaxonId = new Map<number, PlantImage[]>();
  let unmatched = 0;

  for (const row of rows) {
    const taxonId =
      (row.gbif_key != null ? byGbifKey.get(row.gbif_key) : undefined) ??
      byName.get(nameKey(row.scientific_name));

    if (taxonId === undefined) {
      unmatched++;
      continue;
    }

    const url = publicSpeciesPhotoUrl(row.storage_path);
    const photographer = row.contributor_name ?? null;
    const image: PlantImage = {
      id: `community-${row.id}`,
      url,
      thumbnailUrl: url,
      width: row.width ?? undefined,
      height: row.height ?? undefined,
      caption: row.caption ?? undefined,
      photographer,
      license: (row.license as PlantImage['license']) || 'CC-BY',
      licenseUrl: null,
      attributionText: `© ${photographer ?? 'bilinmeyen katkıcı'} — ${row.license} — TRbotanik topluluk katkısı`,
      source: 'community',
      sourceUrl: url,
      isPlaceholder: false,
    };

    const list = photosByTaxonId.get(taxonId);
    if (list) list.push(image);
    else photosByTaxonId.set(taxonId, [image]);
  }

  return { photosByTaxonId, unmatched };
}

/** Çeker ve çevirir. */
export async function loadSpeciesPhotoImages(nodes: TaxonNode[]): Promise<SpeciesPhotoResult> {
  const rows = await listSpeciesPhotos();
  return toSpeciesPhotoImages(rows, nodes);
}

/**
 * Yükseltilmiş fotoğrafları `dataset.details`'e ekler. Özgün nesneler
 * DEĞİŞTİRİLMEZ (yalnızca etkilenen taksonlar için yeni obje kurulur) —
 * statik veri setinin geri kalanı referans eşitliğini korur.
 */
export function mergeSpeciesPhotosIntoDetails(
  details: Record<number, PlantDetail>,
  photosByTaxonId: Map<number, PlantImage[]>,
): Record<number, PlantDetail> {
  if (photosByTaxonId.size === 0) return details;
  const merged: Record<number, PlantDetail> = { ...details };
  for (const [taxonId, images] of photosByTaxonId) {
    const detail = merged[taxonId];
    if (!detail) continue;
    merged[taxonId] = { ...detail, images: [...detail.images, ...images] };
  }
  return merged;
}
