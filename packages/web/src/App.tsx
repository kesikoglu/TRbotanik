import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDataset } from './data/useDataset';
import { applyFilter, buildEndemicSet } from './domain/filter';
import { useAppStore } from './state/useAppStore';
import { MapCanvas } from './map/MapCanvas';
import { MapControls } from './map/MapControls';
import { MapLegend } from './map/MapLegend';
import { AttributionBar } from './map/AttributionBar';
import { TaxonomySidebar } from './features/TaxonomySidebar';
import { DetailPane } from './features/DetailPane';
import { setLanguage, SUPPORTED_LANGUAGES, type Language } from './i18n';
import type { Dataset } from './data/dataset';

export default function App() {
  const [reloadKey, setReloadKey] = useState(0);
  const state = useDataset(reloadKey);
  const { t } = useTranslation();

  if (state.status === 'loading') {
    return (
      <div className="center-state" role="status">
        <span>{t('app.loading')}</span>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="center-state" role="alert">
        <strong>{t('app.loadError')}</strong>
        <span>{state.error.message}</span>
        <button type="button" className="chip" onClick={() => setReloadKey((n) => n + 1)}>
          {t('app.retry')}
        </button>
      </div>
    );
  }

  return <Workspace dataset={state.dataset} />;
}

function Workspace({ dataset }: { dataset: Dataset }) {
  const { t, i18n } = useTranslation();
  const filter = useAppStore((s) => s.filter);
  const selectedSpeciesId = useAppStore((s) => s.selectedSpeciesId);
  const selectedSquare = useAppStore((s) => s.selectedSquare);

  const endemicIds = useMemo(() => buildEndemicSet(dataset.details), [dataset.details]);

  const selection = useMemo(
    () => applyFilter(dataset.nodes, dataset.occurrences, endemicIds, filter),
    [dataset.nodes, dataset.occurrences, endemicIds, filter],
  );

  const detailOpen = selectedSpeciesId !== null || selectedSquare !== null;
  const familyCount = dataset.byRank.FAMILY.length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <h1 className="topbar__title">{t('app.title')}</h1>
          <span className="topbar__subtitle">{t('app.subtitle')}</span>
        </div>

        <div className="topbar__spacer" />

        <div className="topbar__stats">
          <Stat value={selection.totals.species} label={t('stats.taxa')} />
          <Stat value={familyCount} label={t('stats.families')} />
          <Stat value={selection.totals.endemic} label={t('stats.endemic')} />
          <Stat value={selection.totals.records} label={t('stats.records')} />
          <Stat value={`${selection.totals.squares}/29`} label={t('stats.squares')} />
        </div>

        <div className="filter-row" role="group" aria-label={t('lang.switch')}>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang}
              type="button"
              className={`chip${i18n.language === lang ? ' chip--on' : ''}`}
              onClick={() => setLanguage(lang as Language)}
              aria-pressed={i18n.language === lang}
              data-testid={`lang-${lang}`}
            >
              {t(`lang.${lang}`)}
            </button>
          ))}
        </div>
      </header>

      {dataset.manifest.mode === 'fixture' && (
        <div className="notice-banner" role="note" data-testid="fixture-banner">
          <span className="notice-banner__icon" aria-hidden="true">
            ⚠
          </span>
          <span>
            <strong>{t('notice.fixtureTitle')}</strong> — {t('notice.fixtureBody')}
          </span>
        </div>
      )}

      <div className={`app__body${detailOpen ? ' app__body--detail-open' : ''}`}>
        <TaxonomySidebar
          nodes={dataset.nodes}
          rootIds={dataset.rootIds}
          endemicIds={endemicIds}
          selection={selection}
        />

        <div className="map-pane">
          <MapCanvas dataset={dataset} selection={selection} />

          <div className="map-overlay map-overlay--top-left">
            <MapControls />
          </div>
          <div className="map-overlay map-overlay--bottom-left" style={{ bottom: 44 }}>
            <MapLegend selection={selection} />
          </div>

          <AttributionBar manifest={dataset.manifest} />
        </div>

        {detailOpen && (
          <DetailPane
            nodes={dataset.nodes}
            details={dataset.details}
            endemicIds={endemicIds}
            selection={selection}
          />
        )}
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="stat">
      <span className="stat__value">
        {typeof value === 'number' ? value.toLocaleString('tr-TR') : value}
      </span>
      <span className="stat__label">{label}</span>
    </div>
  );
}
