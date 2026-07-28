import { useTranslation } from 'react-i18next';
import { useAppStore, type MapMode } from '../state/useAppStore';

const MODES: Array<{ mode: MapMode; labelKey: string }> = [
  { mode: 'davis', labelKey: 'map.modeDavis' },
  { mode: 'points', labelKey: 'map.modePoints' },
  { mode: 'heatmap', labelKey: 'map.modeHeatmap' },
];

export function MapControls() {
  const { t } = useTranslation();
  const mapMode = useAppStore((s) => s.mapMode);
  const setMapMode = useAppStore((s) => s.setMapMode);

  return (
    <div className="mode-switch" role="group" aria-label={t('legend.title')}>
      {MODES.map(({ mode, labelKey }) => (
        <button
          key={mode}
          type="button"
          aria-pressed={mapMode === mode}
          onClick={() => setMapMode(mode)}
          data-testid={`map-mode-${mode}`}
        >
          {t(labelKey)}
        </button>
      ))}
    </div>
  );
}
