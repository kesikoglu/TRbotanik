import { useCallback, useEffect, useState } from 'react';
import type { OccurrenceRecord, TaxonNode } from '@trbotanik/shared';
import { isBackendConfigured } from './config';
import { loadCommunityOccurrences } from './communityOccurrences';
import { describeError } from './client';

export interface CommunityState {
  occurrences: OccurrenceRecord[];
  /** Taksonomi ağacında karşılığı bulunamadığı için gösterilemeyen kayıt sayısı. */
  unmatched: number;
  /**
   * Yükleme başarısız olduysa açıklaması.
   *
   * GÖRÜNÜR OLMALI: Bu hata yalnızca konsola yazıldığında, katkı katmanı sessizce
   * boş kalıyordu — kullanıcı ne bir nokta ne bir uyarı görüyor, "kayıtlarım
   * nerede?" sorusunun cevabını hiçbir yerde bulamıyordu. Arayüz bunu göstermeli.
   */
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Onaylı topluluk gözlemlerini çeker.
 *
 * BLOKLAMAZ: Uygulama statik veri setiyle hemen açılır; topluluk kayıtları
 * geldiğinde haritaya eklenir. Sunucuya ulaşılamazsa (çevrimdışı, arka uç
 * kapalı) harita referans veriyle eksiksiz çalışmaya devam eder — katkı katmanı
 * bir ek, bir bağımlılık değil.
 */
export function useCommunityOccurrences(nodes: TaxonNode[]): CommunityState {
  const [occurrences, setOccurrences] = useState<OccurrenceRecord[]>([]);
  const [unmatched, setUnmatched] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isBackendConfigured()) return;
    try {
      const result = await loadCommunityOccurrences(nodes);
      setOccurrences(result.occurrences);
      setUnmatched(result.unmatched);
      setError(null);
      if (result.unmatched > 0) {
        console.warn(
          `[TRbotanik] ${result.unmatched} onaylı topluluk gözlemi taksonomi ağacında ` +
            'eşleşmediği için haritada gösterilemiyor.',
        );
      }
    } catch (err) {
      // Harita referans veriyle çalışmaya devam eder, ama hata GÖRÜNÜR olmalı:
      // sessiz kalırsa kullanıcı katkılarının neden görünmediğini anlayamaz.
      console.warn('[TRbotanik] Topluluk gözlemleri yüklenemedi:', err);
      setError(describeError(err));
    }
  }, [nodes]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { occurrences, unmatched, error, refresh };
}
