import { getSupabase } from './client';
import type { Profile, UserRole, UserStatus } from './types';

/**
 * Yönetici işlemleri — kullanıcı hesaplarını onaylama, askıya alma, rol atama.
 *
 * Buradaki hiçbir çağrı yetki KONTROLÜ yapmaz; yalnızca isteği gönderir. Asıl
 * yetki denetimi sunucudaki `profiles_admin_all` politikasındadır (bkz.
 * supabase/migrations/0001_init.sql). Arayüzdeki kontroller sadece yetkisiz
 * kullanıcıya çalışmayacak düğmeler göstermemek içindir.
 */

/** Tüm profiller — önce onay bekleyenler, sonra en yeni kayıtlar. */
export async function listProfiles(): Promise<Profile[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as Profile[];
  // Onay bekleyenler listenin başına alınır: yöneticinin yapması gereken iş bu.
  return rows.sort((a, b) => {
    const aPending = a.status === 'pending' ? 0 : 1;
    const bPending = b.status === 'pending' ? 0 : 1;
    if (aPending !== bPending) return aPending - bPending;
    return b.created_at.localeCompare(a.created_at);
  });
}

/** Hesabı onaylar — bu andan itibaren kullanıcı gözlem girebilir. */
export async function approveUser(userId: string): Promise<void> {
  const supabase = await getSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const { error } = await supabase
    .from('profiles')
    .update({
      status: 'approved' satisfies UserStatus,
      approved_at: new Date().toISOString(),
      approved_by: sessionData.session?.user.id ?? null,
    })
    .eq('id', userId);
  if (error) throw error;
}

/**
 * Hesabı askıya alır. Kayıtları SİLİNMEZ — yalnızca yeni veri giremez.
 * Geçmiş kayıtların ayrıca denetlenmesi gerekirse gözlem panelinden yapılır.
 */
export async function suspendUser(userId: string): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from('profiles')
    .update({ status: 'suspended' satisfies UserStatus })
    .eq('id', userId);
  if (error) throw error;
}

/** Askıdaki veya onaylı bir hesabı yeniden onay bekler duruma çevirir. */
export async function setUserStatus(userId: string, status: UserStatus): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase.from('profiles').update({ status }).eq('id', userId);
  if (error) throw error;
}

export async function setUserRole(userId: string, role: UserRole): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
  if (error) throw error;
}
