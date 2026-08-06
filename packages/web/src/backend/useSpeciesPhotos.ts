import { useCallback, useEffect, useState } from 'react';
import type { PlantImage, TaxonNode } from '@trbotanik/shared';
import { isBackendConfigured } from './config';
import { loadSpeciesPhotoImages } from './speciesPhotos';
import { describeError } from './client';

export interface SpeciesPhotosState {
  photosByTaxonId: Map<number, PlantImage[]>;
  unmatched: number;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Küratör onayıyla tür galerisine yükseltilmiş topluluk fotoğraflarını çeker.
 *
 * BLOKLAMAZ: useCommunityOccurrences ile aynı desen — uygulama statik veriyle
 * hemen açılır, yükseltilmiş fotoğraflar geldiğinde galeriye eklenir.
 */
export function useSpeciesPhotos(nodes: TaxonNode[]): SpeciesPhotosState {
  const [photosByTaxonId, setPhotosByTaxonId] = useState<Map<number, PlantImage[]>>(new Map());
  const [unmatched, setUnmatched] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isBackendConfigured()) return;
    try {
      const result = await loadSpeciesPhotoImages(nodes);
      setPhotosByTaxonId(result.photosByTaxonId);
      setUnmatched(result.unmatched);
      setError(null);
    } catch (err) {
      console.warn('[TRbotanik] Tür galerisi fotoğrafları yüklenemedi:', err);
      setError(describeError(err));
    }
  }, [nodes]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { photosByTaxonId, unmatched, error, refresh };
}
