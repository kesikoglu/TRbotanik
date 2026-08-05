import { useCallback, useEffect, useState } from 'react';
import type { OccurrenceRecord, TaxonNode } from '@trbotanik/shared';
import { isBackendConfigured } from './config';
import { loadCommunityOccurrences } from './communityOccurrences';

export interface CommunityState {
  occurrences: OccurrenceRecord[];
  /** Taksonomi ağacında karşılığı bulunamadığı için gösterilemeyen kayıt sayısı. */
  unmatched: number;
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

  const refresh = useCallback(async () => {
    if (!isBackendConfigured()) return;
    try {
      const result = await loadCommunityOccurrences(nodes);
      setOccurrences(result.occurrences);
      setUnmatched(result.unmatched);
      if (result.unmatched > 0) {
        console.warn(
          `[TRbotanik] ${result.unmatched} onaylı topluluk gözlemi taksonomi ağacında ` +
            'eşleşmediği için haritada gösterilemiyor.',
        );
      }
    } catch (err) {
      // Sessizce yutmuyoruz ama kullanıcıyı da rahatsız etmiyoruz: referans
      // harita çalışmaya devam ediyor, eksik olan yalnızca katkı katmanı.
      console.warn('[TRbotanik] Topluluk gözlemleri yüklenemedi:', err);
    }
  }, [nodes]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { occurrences, unmatched, refresh };
}
