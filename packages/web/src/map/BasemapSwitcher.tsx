import { useTranslation } from 'react-i18next';
import { useAppStore } from '../state/useAppStore';
import { listAvailableBasemaps } from './basemaps';

/**
 * Altlık harita seçici — uydu / gerçek renk görünümü arasında geçiş.
 *
 * DOĞRULAMA NOTU: `offline` dışındaki seçeneklerin karo sunucuları bu uygulamanın
 * geliştirildiği ortamdan test edilemedi. Karolar yüklenemezse `MapCanvas` bunu algılar
 * ve altında bir uyarı gösterir — sessizce boş/gri bir harita bırakmak yerine.
 */
export function BasemapSwitcher() {
  const { t } = useTranslation();
  const basemapId = useAppStore((s) => s.basemapId);
  const setBasemap = useAppStore((s) => s.setBasemap);
  const tileError = useAppStore((s) => s.basemapTileError);

  const basemaps = listAvailableBasemaps();
  if (basemaps.length <= 1) return null;

  return (
    <div>
      <div className="mode-switch" role="group" aria-label={t('map.basemapGroup')}>
        {basemaps.map((def) => (
          <button
            key={def.id}
            type="button"
            aria-pressed={basemapId === def.id}
            onClick={() => setBasemap(def.id)}
            data-testid={`basemap-${def.id}`}
          >
            {t(def.labelKey)}
          </button>
        ))}
      </div>
      {tileError && (
        <p className="basemap-error" role="alert" data-testid="basemap-error">
          {t('map.tileLoadError')}
        </p>
      )}
    </div>
  );
}
