import { useTranslation } from 'react-i18next';
import { DAVIS_CODES } from '@trbotanik/shared';
import { metricValue, type ChoroplethMetric, type SelectionResult } from '../domain/filter';
import { useAppStore } from '../state/useAppStore';
import { CHOROPLETH_RAMP, MAP_COLORS } from './theme';

const METRICS: Array<{ value: ChoroplethMetric; labelKey: string }> = [
  { value: 'species', labelKey: 'legend.metricSpecies' },
  { value: 'endemic', labelKey: 'legend.metricEndemic' },
  { value: 'records', labelKey: 'legend.metricRecords' },
  { value: 'endemismRate', labelKey: 'legend.metricEndemismRate' },
];

export function MapLegend({ selection }: { selection: SelectionResult }) {
  const { t } = useTranslation();
  const mapMode = useAppStore((s) => s.mapMode);
  const metric = useAppStore((s) => s.metric);
  const setMetric = useAppStore((s) => s.setMetric);

  let max = 0;
  for (const code of DAVIS_CODES) {
    const stats = selection.statsBySquare.get(code);
    if (stats) max = Math.max(max, metricValue(stats, metric));
  }

  return (
    <div className="map-panel" data-testid="map-legend">
      <p className="legend__title">{t('legend.title')}</p>

      {mapMode === 'davis' ? (
        <>
          <select
            className="legend__select"
            value={metric}
            onChange={(event) => setMetric(event.target.value as ChoroplethMetric)}
            aria-label={t('legend.metric')}
            data-testid="legend-metric"
          >
            {METRICS.map(({ value, labelKey }) => (
              <option key={value} value={value}>
                {t(labelKey)}
              </option>
            ))}
          </select>

          <div className="legend__ramp" aria-hidden="true">
            {CHOROPLETH_RAMP.map((color) => (
              <span key={color} style={{ background: color }} />
            ))}
          </div>
          <div className="legend__scale">
            <span>0</span>
            <span>{max.toLocaleString('tr-TR')}</span>
          </div>

          {/* Yöntem notu: ham kayıt sayısı örnekleme yanlılığı taşır */}
          {metric === 'records' && <p className="legend__note">{t('legend.methodNote')}</p>}
        </>
      ) : (
        <>
          <div className="legend__key">
            <span className="legend__swatch" style={{ background: MAP_COLORS.pointGbif }} />
            {t('legend.pointsGbif')}
          </div>
          <div className="legend__key">
            <span className="legend__swatch" style={{ background: MAP_COLORS.pointCommunity }} />
            {t('legend.pointsCommunity')}
          </div>
        </>
      )}
    </div>
  );
}
