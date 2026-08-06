import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TaxonNode } from '@trbotanik/shared';
import { useDataset } from './data/useDataset';
import { applyFilter, buildEndemicSet } from './domain/filter';
import { useAppStore } from './state/useAppStore';
import { MapCanvas } from './map/MapCanvas';
import { MapControls } from './map/MapControls';
import { MapLegend } from './map/MapLegend';
import { BasemapSwitcher } from './map/BasemapSwitcher';
import { AttributionBar } from './map/AttributionBar';
import { TaxonomySidebar } from './features/TaxonomySidebar';
import { DetailPane } from './features/DetailPane';
import { ProvinceTable } from './features/ProvinceTable';
import { AuthPanel } from './features/AuthPanel';
import { ResetPasswordPanel } from './features/ResetPasswordPanel';
import { AccountPanel } from './features/AccountPanel';
import { AdminPanel } from './features/AdminPanel';
import { ObservationForm } from './features/ObservationForm';
import { ObservationReview } from './features/ObservationReview';
import { canContribute, type SessionUser } from './backend/auth';
import { isBackendConfigured } from './backend/config';
import { useSession, type SessionState } from './backend/useSession';
import { useCommunityOccurrences } from './backend/useCommunityOccurrences';
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
  const provinceTableOpen = useAppStore((s) => s.provinceTableOpen);

  const endemicIds = useMemo(() => buildEndemicSet(dataset.details), [dataset.details]);

  // Bu ortamdan bilinen türü olan (occurrence kaydında province dolu) tüm iller —
  // kullanıcının seçmesi için; sonucu boş çıkacak bir il listede görünmez.
  const provinces = useMemo(() => {
    const set = new Set<string>();
    for (const occ of dataset.occurrences) {
      if (occ.province) set.add(occ.province);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'tr'));
  }, [dataset.occurrences]);

  // Onaylı topluluk gözlemleri referans veriye EKLENİR, onun yerine geçmez.
  // Haritada `source: 'community'` sayesinde ayrı renkte çizilirler.
  const community = useCommunityOccurrences(dataset.nodes);
  const occurrences = useMemo(
    () =>
      community.occurrences.length > 0
        ? [...dataset.occurrences, ...community.occurrences]
        : dataset.occurrences,
    [dataset.occurrences, community.occurrences],
  );

  const selection = useMemo(
    () => applyFilter(dataset.nodes, occurrences, endemicIds, filter),
    [dataset.nodes, occurrences, endemicIds, filter],
  );

  const detailOpen = selectedSpeciesId !== null || selectedSquare !== null;
  const familyCount = dataset.byRank.FAMILY.length;
  const session = useSession();

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

        <AccountButton session={session} nodes={dataset.nodes} />
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
          provinces={provinces}
          hasCommunity={community.occurrences.length > 0}
          communityError={community.error}
          communityUnmatched={community.unmatched}
        />

        <div className="map-pane">
          <MapCanvas dataset={dataset} selection={selection} occurrences={occurrences} />

          <div className="map-overlay map-overlay--top-left map-overlay--stack">
            <MapControls />
            <BasemapSwitcher />
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

      {provinceTableOpen && filter.province && (
        <ProvinceTable
          province={filter.province}
          nodes={dataset.nodes}
          details={dataset.details}
          endemicIds={endemicIds}
          selection={selection}
        />
      )}
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

/**
 * Üst çubuktaki hesap düğmesi ve açtığı kipler.
 *
 * Arka uç yapılandırılmamışsa HİÇBİR ŞEY göstermez — uygulama o hâlde salt-okunur
 * bir harita olarak eksiksiz çalışmaya devam eder (e2e testleri ve çevrimdışı
 * gösterimler bu yola dayanır).
 */
function AccountButton({ session, nodes }: { session: SessionState; nodes: TaxonNode[] }) {
  const { t } = useTranslation();
  const [panel, setPanel] = useState<'none' | 'auth' | 'account' | 'admin' | 'observation' | 'mine'>('none');

  if (!isBackendConfigured()) return null;
  // İlk oturum sorgusu sürerken düğmeyi çizmiyoruz: aksi hâlde giriş yapmış bir
  // kullanıcıya bir an "Giriş yap" yazısı görünüp hemen değişirdi.
  if (session.loading) return null;

  const user = session.user;
  const pending = Boolean(user) && user?.profile?.status !== 'approved';

  return (
    <>
      {/* Gözlem ekleme yalnızca ONAYLI kullanıcıda görünür — onay bekleyene
          çalışmayacak bir düğme göstermenin anlamı yok, gerekçesi hesap
          kipinde zaten yazıyor. */}
      {canContribute(user) && (
        <button
          type="button"
          className="account-button"
          onClick={() => setPanel('observation')}
          data-testid="add-observation-button"
        >
          + {t('observation.open')}
        </button>
      )}

      <button
        type="button"
        className={`account-button${pending ? ' account-button--pending' : ''}`}
        onClick={() => setPanel(user ? 'account' : 'auth')}
        data-testid="account-button"
      >
        {user && <span className="account-button__dot" aria-hidden="true" />}
        {user ? user.profile?.display_name || user.email : t('auth.signIn')}
      </button>

      {panel === 'auth' && (
        <AuthPanel
          user={user}
          onClose={() => setPanel('none')}
          onSignedIn={() => void session.refresh()}
        />
      )}
      {panel === 'account' && user && (
        <AccountPanel
          user={user}
          onClose={() => setPanel('none')}
          onChanged={() => void session.refresh()}
          onOpenAdmin={() => setPanel('admin')}
          onOpenMine={() => setPanel('mine')}
        />
      )}
      {panel === 'admin' && user && (
        <AdminPanel user={user} onClose={() => setPanel('none')} />
      )}
      {panel === 'observation' && user && (
        <ObservationForm user={user} nodes={nodes} onClose={() => setPanel('none')} />
      )}
      {panel === 'mine' && user && (
        <MyObservationsPanel user={user} onClose={() => setPanel('none')} />
      )}

      {/* En üstte render edilir: şifre sıfırlama oturumu sürerken kullanıcı normal
          giriş yapmış gibi haritayla veya diğer panellerle etkileşemesin — yeni
          şifre belirlemeden geçmenin yolu olmamalı (bkz. useSession.passwordRecovery). */}
      {session.passwordRecovery && (
        <ResetPasswordPanel
          onDone={() => {
            session.clearPasswordRecovery();
            void session.refresh();
            setPanel('none');
          }}
        />
      )}
    </>
  );
}

/** Kullanıcının kendi gözlemleri — durumlarını görür, bekleyenleri silebilir. */
function MyObservationsPanel({ user, onClose }: { user: SessionUser; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('review.myObservations')}
      onClick={onClose}
      data-testid="my-observations-panel"
    >
      <div className="modal modal--wide" onClick={(event) => event.stopPropagation()}>
        <header className="modal__header">
          <div>
            <h2 className="modal__title">{t('review.myObservations')}</h2>
            <p className="modal__subtitle">{t('review.myObservationsSubtitle')}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={t('detail.close')}
            data-testid="my-observations-close"
          >
            ×
          </button>
        </header>
        <div className="modal__body">
          <ObservationReview user={user} scope="mine" />
        </div>
      </div>
    </div>
  );
}
