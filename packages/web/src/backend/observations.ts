import { getSupabase } from './client';
import { uploadPhoto, type PreparedPhoto } from './photos';
import type { ObservationDraft, ObservationStatus, ObservationWithRelations } from './types';

/**
 * Gözlem okuma/yazma.
 *
 * TEK YAZMA YOLU: Uygulamadaki her gözlem kaydı `submitObservation`'dan geçer.
 * Bu kasıtlıdır — ikinci aşamada çevrimdışı desteği eklendiğinde, bağlantı
 * yokken kaydı cihazda kuyruğa alma mantığı SADECE bu fonksiyonun içine girecek
 * ve formda hiçbir değişiklik gerekmeyecek.
 */

/**
 * Yeni gözlem gönderir; fotoğraflar varsa kayıt oluştuktan sonra yüklenir.
 *
 * `status`, `created_by` ve `davis_square` GÖNDERİLMEZ: ilk ikisi RLS
 * politikalarınca zorlanır, üçüncüsü koordinattan sunucuda türetilir
 * (bkz. supabase/migrations/0001_init.sql).
 */
export async function submitObservation(
  draft: ObservationDraft,
  photos: PreparedPhoto[] = [],
): Promise<{ id: string; photoErrors: string[] }> {
  const supabase = await getSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('Oturum yok — gözlem gönderilemez.');

  const { data, error } = await supabase
    .from('observations')
    .insert({ ...draft, created_by: userId })
    .select('id')
    .single();
  if (error) throw error;

  const observationId = (data as { id: string }).id;

  // Fotoğraf yükleme hatası kaydı ÇÖPE ATMAZ: arazide zayıf bağlantıda bir
  // fotoğrafın yüklenememesi yüzünden tüm gözlemin kaybolması kabul edilemez.
  // Kayıt durur, başarısız fotoğraflar kullanıcıya bildirilir.
  const photoErrors: string[] = [];
  for (const [index, photo] of photos.entries()) {
    try {
      await uploadPhoto({ userId, observationId, index, photo });
    } catch (err) {
      photoErrors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { id: observationId, photoErrors };
}

/** Oturumdaki kullanıcının kendi gözlemleri (her durumdaki). */
export async function listMyObservations(): Promise<ObservationWithRelations[]> {
  const supabase = await getSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from('observations')
    .select('*, observation_photos(*)')
    .eq('created_by', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ObservationWithRelations[];
}

/**
 * Denetim kuyruğu — onay bekleyen gözlemler.
 * RLS yalnızca küratör/yöneticiye bu satırları döndürür.
 */
export async function listPendingObservations(): Promise<ObservationWithRelations[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('observations')
    .select('*, observation_photos(*), profiles!observations_created_by_fkey(display_name, institution)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ObservationWithRelations[];
}

/**
 * Haritada gösterilecek ONAYLI topluluk gözlemleri.
 *
 * Giriş yapılmamış olsa da çalışır: `observations_select_approved` politikası
 * onaylı kayıtları herkese açar.
 */
export async function listApprovedObservations(): Promise<ObservationWithRelations[]> {
  const supabase = await getSupabase();
  // Fotoğraflar da çekilir: haritada bir topluluk noktasına tıklandığında
  // O GÖZLEMDE çekilmiş fotoğraf gösterilmeli, türün referans görseli değil.
  const { data, error } = await supabase
    .from('observations')
    .select('*, observation_photos(*)')
    .eq('status', 'approved')
    .order('observed_on', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ObservationWithRelations[];
}

/**
 * Onaylı gözlemler — küratörün tür galerisine yükseltilecek fotoğraf aramak
 * için gözden geçirdiği görünüm. `listApprovedObservations`'tan farkı:
 * katkıda bulunanın adını da getirir (galeri atfı için gerekli) ve yalnızca
 * haritanın ihtiyaç duymadığı bir alan ekler diye halka açık harita sorgusuna
 * karıştırılmaz.
 */
export async function listApprovedObservationsForCuration(): Promise<ObservationWithRelations[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('observations')
    .select('*, observation_photos(*), profiles!observations_created_by_fkey(display_name, institution)')
    .eq('status', 'approved')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ObservationWithRelations[];
}

/** Gözlemi denetler (onayla/reddet/askıya al). Küratör ve yönetici yetkisi gerekir. */
export async function reviewObservation(
  observationId: string,
  status: Exclude<ObservationStatus, 'pending'>,
  reviewNote?: string,
): Promise<void> {
  const supabase = await getSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const { error } = await supabase
    .from('observations')
    .update({
      status,
      reviewed_by: sessionData.session?.user.id ?? null,
      reviewed_at: new Date().toISOString(),
      review_note: reviewNote?.trim() || null,
    })
    .eq('id', observationId);
  if (error) throw error;
}

/** Kullanıcı kendi onaylanmamış kaydını siler. */
export async function deleteOwnObservation(observationId: string): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase.from('observations').delete().eq('id', observationId);
  if (error) throw error;
}
