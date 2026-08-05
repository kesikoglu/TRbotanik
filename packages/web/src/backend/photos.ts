import { PHOTO_BUCKET } from './config';
import { getSupabase } from './client';

/**
 * Fotoğraf hazırlama ve yükleme.
 *
 * NEDEN İSTEMCİDE KÜÇÜLTÜLÜYOR: Modern telefon kameraları 4–12 MB'lık kareler
 * üretir. Ham hâlleriyle yüklenirse (a) arazideki mobil bağlantıda yükleme
 * dakikalar sürer ve sık başarısız olur, (b) ücretsiz katmanın 1 GB depolama
 * sınırı ~100 fotoğrafta dolar. 1600 piksele küçültülmüş JPEG, teşhis için
 * fazlasıyla yeterli ayrıntıyı korurken dosyayı ~10 kat küçültür.
 */

/** Uzun kenar üst sınırı. Teşhis için yeterli, dosya boyutu makul. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;
/** Depolama kovasındaki sınırla aynı (bkz. 0002_storage.sql). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export interface PreparedPhoto {
  blob: Blob;
  width: number;
  height: number;
  /** Formda önizleme için — bileşen sökülürken revokeObjectURL ile serbest bırakılmalı. */
  previewUrl: string;
}

/** Uzun kenarı `MAX_EDGE`'i aşmayacak yeni boyutu hesaplar (oranı korur). */
export function scaledSize(
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const ratio = maxEdge / longest;
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

/**
 * Seçilen dosyayı küçültüp JPEG'e çevirir.
 *
 * `createImageBitmap` EXIF yönlendirmesini uygular, yani yan çekilmiş
 * fotoğraflar düz kaydedilir.
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = scaledSize(bitmap.width, bitmap.height);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Görsel işlenemedi (canvas desteklenmiyor).');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );
  if (!blob) throw new Error('Görsel JPEG olarak kodlanamadı.');
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error('Fotoğraf küçültmeden sonra bile çok büyük (5 MB üstü).');
  }

  return { blob, width, height, previewUrl: URL.createObjectURL(blob) };
}

/**
 * Hazırlanmış fotoğrafı depoya yükler ve veritabanı satırını oluşturur.
 *
 * Yol düzeni `{kullanıcı}/{gözlem}/{sıra}.jpg` — depolama politikaları ilk
 * segmenti oturum sahibiyle karşılaştırır (bkz. 0002_storage.sql).
 */
export async function uploadPhoto(params: {
  userId: string;
  observationId: string;
  index: number;
  photo: PreparedPhoto;
  caption?: string | null;
}): Promise<string> {
  const supabase = await getSupabase();
  const path = `${params.userId}/${params.observationId}/${params.index}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, params.photo.blob, { contentType: 'image/jpeg', upsert: true });
  if (uploadError) throw uploadError;

  const { error: rowError } = await supabase.from('observation_photos').insert({
    observation_id: params.observationId,
    storage_path: path,
    caption: params.caption ?? null,
    sort_order: params.index,
    width: params.photo.width,
    height: params.photo.height,
    bytes: params.photo.blob.size,
  });
  if (rowError) throw rowError;

  return path;
}

/** Depolama yolundan herkese açık görüntüleme adresi üretir. */
export function publicPhotoUrl(supabaseUrl: string, storagePath: string): string {
  return `${supabaseUrl}/storage/v1/object/public/${PHOTO_BUCKET}/${storagePath}`;
}
