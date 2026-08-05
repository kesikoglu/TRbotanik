import { useCallback, useEffect, useState } from 'react';
import { isBackendConfigured } from './config';
import { getSessionUser, onAuthChange, type SessionUser } from './auth';

export interface SessionState {
  user: SessionUser | null;
  /** İlk oturum sorgusu sürerken true — arayüz "giriş yap" düğmesini erken göstermesin. */
  loading: boolean;
  /** Profil güncellendikten veya onay alındıktan sonra elle tazelemek için. */
  refresh: () => Promise<void>;
}

/**
 * Oturumdaki kullanıcıyı izler.
 *
 * Arka uç yapılandırılmamışsa hiçbir istek yapılmaz ve `user` daima null kalır —
 * uygulama bu durumda katkı özelliklerini gizleyip salt-okunur harita olarak
 * çalışır (e2e testleri ve çevrimdışı gösterimler buna dayanır).
 */
export function useSession(): SessionState {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(isBackendConfigured());

  const refresh = useCallback(async () => {
    if (!isBackendConfigured()) return;
    try {
      setUser(await getSessionUser());
    } catch (err) {
      // Ağ hatası oturumu düşürmez; kullanıcı çevrimdışıysa arayüz bozulmasın.
      console.warn('[TRbotanik] Oturum okunamadı:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isBackendConfigured()) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    void refresh();
    void onAuthChange(() => {
      if (!cancelled) void refresh();
    }).then((fn) => {
      // Abonelik kurulmadan bileşen söküldüyse hemen iptal et.
      if (cancelled) fn();
      else unsubscribe = fn;
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [refresh]);

  return { user, loading, refresh };
}
