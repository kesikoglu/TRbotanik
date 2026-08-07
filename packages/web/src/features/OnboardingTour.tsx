import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { canContribute } from '../backend/auth';
import { isBackendConfigured } from '../backend/config';
import { useSession } from '../backend/useSession';
import { useAppStore } from '../state/useAppStore';

/**
 * Yeni ziyaretçiye siteyi tanıtan kısa, atlanabilir bir "spotlight" turu.
 *
 * HERKESE gösterilir, yalnızca üye olanlara değil — çoğu ziyaretçi hiç hesap
 * açmadan sadece haritaya bakacak, turu üyeliğe bağlarsak onları kaçırırdık.
 * İlk ziyarette otomatik açılır (localStorage bayrağıyla bir daha gösterilmez);
 * üst çubuktaki "?" düğmesiyle istenildiği zaman tekrar açılabilir.
 *
 * Harici bir tur kütüphanesi eklenmedi — dört adımlık sabit bir dizi için CSS
 * `box-shadow` ile "spotlight" kesimi (hedefin dışını karartma) yeterli ve
 * bağımlılık eklemeden çalışır.
 */

const TOUR_SEEN_KEY = 'trbotanik.tour.seen';

export function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) === '1';
  } catch {
    return true; // localStorage yoksa (gizli sekme vb.) her seferinde göstermek yerine hiç gösterme
  }
}

function markTourSeen(): void {
  try {
    localStorage.setItem(TOUR_SEEN_KEY, '1');
  } catch {
    /* yoksayılabilir */
  }
}

interface Step {
  /** null: hedefsiz, ekran ortasında karşılama kartı. */
  targetSelector: string | null;
  titleKey: string;
  bodyKey: string;
}

const PAD = 8;

function useTargetRect(selector: string | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    function update() {
      const el = document.querySelector(selector as string);
      setRect(el ? el.getBoundingClientRect() : null);
    }
    update();
    // Harita geç yerleşebilir (asenkron döşeme); kısa aralıklarla yeniden ölçüyoruz.
    const interval = window.setInterval(update, 250);
    window.addEventListener('resize', update);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('resize', update);
    };
  }, [selector]);

  return rect;
}

export function OnboardingTour() {
  const { t } = useTranslation();
  const tourOpen = useAppStore((s) => s.tourOpen);
  const closeTour = useAppStore((s) => s.closeTour);
  const session = useSession();
  const [stepIndex, setStepIndex] = useState(0);

  const steps: Step[] = useMemo(() => {
    const base: Step[] = [
      { targetSelector: null, titleKey: 'tour.welcomeTitle', bodyKey: 'tour.welcomeBody' },
      { targetSelector: '[data-testid="mode-switch"]', titleKey: 'tour.modesTitle', bodyKey: 'tour.modesBody' },
      { targetSelector: '[data-testid="taxon-search"]', titleKey: 'tour.searchTitle', bodyKey: 'tour.searchBody' },
      { targetSelector: '[data-testid="taxon-tree"]', titleKey: 'tour.treeTitle', bodyKey: 'tour.treeBody' },
    ];

    // Katkı adımı yalnızca arka uç varsa gösterilir — yoksa böyle bir düğme
    // hiç yok, hedefsiz bir adım eklemek kafa karıştırır.
    if (!isBackendConfigured()) return base;

    const contributeTarget = canContribute(session.user)
      ? '[data-testid="add-observation-button"]'
      : '[data-testid="account-button"]';
    const contributeBodyKey = session.user
      ? canContribute(session.user)
        ? 'tour.contributeBodyApproved'
        : 'tour.contributeBodyPending'
      : 'tour.contributeBodyAnon';

    return [
      ...base,
      { targetSelector: contributeTarget, titleKey: 'tour.contributeTitle', bodyKey: contributeBodyKey },
    ];
  }, [session.user]);

  // Adım sayısı (arka uç durumuna göre) değişirse taşmayı önle.
  useEffect(() => {
    if (stepIndex >= steps.length) setStepIndex(0);
  }, [steps.length, stepIndex]);

  const step = steps[stepIndex];
  const rect = useTargetRect(tourOpen ? (step?.targetSelector ?? null) : null);

  useEffect(() => {
    if (!tourOpen) setStepIndex(0);
  }, [tourOpen]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') handleClose();
    }
    if (tourOpen) window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourOpen]);

  if (!tourOpen || !step) return null;

  function handleClose() {
    markTourSeen();
    closeTour();
  }

  function handleNext() {
    if (stepIndex + 1 >= steps.length) handleClose();
    else setStepIndex((i) => i + 1);
  }

  function handlePrev() {
    setStepIndex((i) => Math.max(0, i - 1));
  }

  const isLast = stepIndex === steps.length - 1;

  // Kart konumu: hedef varsa altına (sığmazsa üstüne), yoksa ekran ortasına.
  const cardStyle: CSSProperties = rect
    ? {
        position: 'fixed',
        left: Math.min(Math.max(rect.left, 12), window.innerWidth - 336),
        top:
          rect.bottom + PAD + 180 < window.innerHeight
            ? rect.bottom + PAD * 2
            : Math.max(12, rect.top - PAD * 2 - 180),
      }
    : { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };

  return (
    <div className="tour-layer" role="dialog" aria-modal="true" aria-label={t(step.titleKey)} data-testid="onboarding-tour">
      {rect && (
        <div
          className="tour-spotlight"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
          }}
        />
      )}
      {!rect && <div className="tour-backdrop" />}

      <div className="tour-card" style={cardStyle}>
        <p className="tour-card__step">{t('tour.stepOf', { current: stepIndex + 1, total: steps.length })}</p>
        <h3 className="tour-card__title">{t(step.titleKey)}</h3>
        <p className="tour-card__body">{t(step.bodyKey)}</p>
        <div className="tour-card__actions">
          <button type="button" className="button" onClick={handleClose} data-testid="tour-skip">
            {t('tour.skip')}
          </button>
          <div className="tour-card__nav">
            {stepIndex > 0 && (
              <button type="button" className="button" onClick={handlePrev} data-testid="tour-prev">
                {t('tour.back')}
              </button>
            )}
            <button type="button" className="button button--primary" onClick={handleNext} data-testid="tour-next">
              {isLast ? t('tour.finish') : t('tour.next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
