import { getSupabase } from './client';
import type { Profile } from './types';

/**
 * Kimlik doğrulama işlemleri.
 *
 * Uygulamanın geri kalanı Supabase'i doğrudan çağırmaz, bu modülden geçer —
 * kurum kendi sunucusuna geçtiğinde değişecek yüzey burasıyla sınırlı kalsın diye.
 */

export interface SessionUser {
  id: string;
  email: string;
  profile: Profile | null;
}

/** Kayıt. Hesap `pending` başlar; veri girişi için yönetici onayı gerekir. */
export async function signUp(params: {
  email: string;
  password: string;
  displayName: string;
  institution?: string;
}): Promise<{ needsEmailConfirmation: boolean }> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.signUp({
    email: params.email.trim(),
    password: params.password,
    options: {
      // Bu üstveriyi veritabanındaki `handle_new_user` tetikleyicisi okuyup
      // profile yazar (bkz. 0001_init.sql) — istemci profiles'a insert etmez.
      data: {
        display_name: params.displayName.trim(),
        institution: params.institution?.trim() || null,
      },
    },
  });
  if (error) throw error;
  // Oturum yoksa Supabase e-posta doğrulaması bekliyor demektir.
  return { needsEmailConfirmation: !data.session };
}

export async function signIn(email: string, password: string): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: window.location.origin + window.location.pathname,
  });
  if (error) throw error;
}

/**
 * Şifre sıfırlama e-postasındaki linke tıklandıktan sonra yeni şifreyi kaydeder.
 * Yalnızca `PASSWORD_RECOVERY` oturumunda (bkz. useSession) anlamlıdır — bkz.
 * o hook'taki not.
 */
export async function updatePassword(newPassword: string): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/** Oturumdaki kullanıcıyı profiliyle birlikte döner; oturum yoksa null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await getSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return null;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  // Profil okunamazsa oturumu düşürmüyoruz: kullanıcı giriş YAPMIŞTIR, yalnızca
  // yetkileri bilinmiyordur. Arayüz bu durumda katkı özelliklerini kapalı tutar.
  if (error) console.warn('[TRbotanik] Profil okunamadı:', error.message);

  return {
    id: user.id,
    email: user.email ?? '',
    profile: (profile as Profile | null) ?? null,
  };
}

/** Kendi profilini günceller (yalnızca ad ve kurum — rol/durum RLS ile korunur). */
export async function updateOwnProfile(patch: {
  display_name?: string;
  institution?: string | null;
}): Promise<void> {
  const supabase = await getSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('Oturum yok.');

  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) throw error;
}

/**
 * Oturum değişikliklerini dinler (giriş, çıkış, sekmeler arası eşitleme,
 * jeton yenileme, şifre kurtarma). Aboneliği iptal eden fonksiyonu döner.
 *
 * Olay adı çağırana geçirilir — `PASSWORD_RECOVERY` özel olarak önemlidir:
 * kullanıcı e-postadaki sıfırlama linkine tıkladığında Supabase bu olayla
 * birlikte GEÇERLİ bir oturum kurar. Bu olay ayrıca ele alınmazsa kullanıcı
 * yeni bir şifre belirlemeden doğrudan giriş yapmış gibi görünür — gerçekte
 * yaşanan bir hataydı (bkz. useSession.ts'teki `passwordRecovery`).
 */
export async function onAuthChange(callback: (event: string) => void): Promise<() => void> {
  const supabase = await getSupabase();
  const { data } = supabase.auth.onAuthStateChange((event) => callback(event));
  return () => data.subscription.unsubscribe();
}

/** Veri girebilir mi — onaylanmış olmak şart (sunucuda RLS de aynısını zorlar). */
export function canContribute(user: SessionUser | null): boolean {
  return user?.profile?.status === 'approved';
}

/** Gözlem denetleyebilir mi (onaylama/reddetme). */
export function canReview(user: SessionUser | null): boolean {
  const p = user?.profile;
  return p?.status === 'approved' && (p.role === 'admin' || p.role === 'curator');
}

/** Kullanıcı hesaplarını yönetebilir mi. */
export function isAdmin(user: SessionUser | null): boolean {
  const p = user?.profile;
  return p?.status === 'approved' && p.role === 'admin';
}
