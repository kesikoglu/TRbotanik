import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isBackendConfigured } from './config';

/**
 * Supabase istemcisi — TEMBEL yüklenir.
 *
 * NEDEN TEMBEL: `@supabase/supabase-js` sıkıştırılmış ~40 KB'dır ve haritayı
 * gezen ziyaretçilerin çoğu hiç giriş yapmaz. Kütüphane yalnızca kimlik/katkı
 * özelliklerine ilk dokunulduğunda indirilir; halka açık harita bunun bedelini
 * ödemez. Bu, uygulamanın "önce salt-okunur harita, katkı isteğe bağlı"
 * mimarisiyle de tutarlıdır.
 */
let clientPromise: Promise<SupabaseClient> | null = null;

export async function getSupabase(): Promise<SupabaseClient> {
  if (!isBackendConfigured()) {
    throw new Error('Arka uç yapılandırılmamış (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
  }
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          // Oturum localStorage'da saklanır ve sekme yenilense de sürer —
          // arazide form doldururken sayfa tazelenirse kullanıcı atılmasın.
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }),
    );
  }
  return clientPromise;
}

/**
 * PostgREST/GoTrue hatalarını kullanıcıya gösterilebilir bir metne çevirir.
 *
 * Ham hata metinleri İngilizce ve teknik olduğu için (ör. "new row violates
 * row-level security policy") doğrudan gösterilmez; en sık karşılaşılanlar
 * anlamlı Türkçe karşılıklarına eşlenir. Eşleşmeyen hata GİZLENMEZ, olduğu gibi
 * gösterilir — sessizce yutmak, sorunu teşhis edilemez hâle getirirdi.
 */
/**
 * Hata değerinden okunabilir bir metin çıkarır.
 *
 * PostgREST/GoTrue hataları `Error` ÖRNEĞİ DEĞİLDİR; `{ message, code, details,
 * hint }` biçiminde düz nesnelerdir. Bunlara `String()` uygulamak "[object Object]"
 * üretir ve asıl sorunu tamamen gizler — bu gerçekten yaşandı: eksik bir yabancı
 * anahtar yüzünden başarısız olan bir sorgu, ekranda yalnızca "[object Object]"
 * olarak göründü ve teşhis edilemedi.
 */
function toMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const e = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [e.message, e.details, e.hint]
      .filter((p): p is string => typeof p === 'string' && p.length > 0);
    if (parts.length > 0) {
      return e.code ? `${parts.join(' — ')} (${String(e.code)})` : parts.join(' — ');
    }
    try {
      return JSON.stringify(error);
    } catch {
      /* döngüsel nesne — aşağıdaki String()'e düşer */
    }
  }
  return String(error);
}

export function describeError(error: unknown): string {
  const message = toMessage(error);
  const lower = message.toLowerCase();

  if (lower.includes('row-level security')) {
    return 'Bu işlem için yetkiniz yok. Hesabınız henüz yönetici tarafından onaylanmamış olabilir.';
  }
  if (lower.includes('invalid login credentials')) {
    return 'E-posta veya şifre hatalı.';
  }
  if (lower.includes('email not confirmed')) {
    return 'E-posta adresiniz henüz doğrulanmamış. Gelen kutunuzu kontrol edin.';
  }
  if (lower.includes('user already registered')) {
    return 'Bu e-posta adresiyle zaten bir hesap var.';
  }
  if (lower.includes('password should be at least')) {
    return 'Şifre en az 6 karakter olmalı.';
  }
  if (lower.includes('failed to fetch') || lower.includes('networkerror')) {
    return 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.';
  }
  if (lower.includes('could not find a relationship')) {
    return `Veritabanı ilişkisi çözülemedi — şema güncellemesi gerekiyor olabilir. (${message})`;
  }
  return message;
}
