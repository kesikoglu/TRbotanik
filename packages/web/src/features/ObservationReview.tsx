import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPABASE_URL } from '../backend/config';
import { describeError } from '../backend/client';
import { canReview, isAdmin, type SessionUser } from '../backend/auth';
import {
  deleteOwnObservation,
  listMyObservations,
  listPendingObservations,
  reviewObservation,
} from '../backend/observations';
import { publicPhotoUrl } from '../backend/photos';
import type { ObservationWithRelations } from '../backend/types';

interface Props {
  user: SessionUser;
  /** `queue`: denetlenecek kayıtlar (küratör/yönetici) · `mine`: kendi kayıtlarım */
  scope: 'queue' | 'mine';
}

/**
 * Gözlem listesi — hem küratörün denetim kuyruğu hem kullanıcının kendi kayıtları.
 *
 * İkisi aynı bileşen çünkü gösterilen bilgi aynı; yalnızca hangi kayıtların
 * çekildiği ve hangi eylemlerin sunulduğu değişiyor.
 */
export function ObservationReview({ user, scope }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ObservationWithRelations[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(scope === 'queue' ? await listPendingObservations() : await listMyObservations());
    } catch (err) {
      setError(describeError(err));
      setRows([]);
    }
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(id: string, action: () => Promise<void>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      setNoteFor(null);
      setNote('');
      await load();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusyId(null);
    }
  }

  if (rows === null) return <p className="empty-note">{t('app.loading')}</p>;

  return (
    <div className="form">
      {error && (
        <p className="form__message form__message--error" role="alert" data-testid="review-error">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="empty-note" data-testid="review-empty">
          {scope === 'queue' ? t('review.emptyQueue') : t('review.emptyMine')}
        </p>
      ) : (
        <ul className="review-list" data-testid="review-list">
          {rows.map((row) => {
            const busy = busyId === row.id;
            const photos = row.observation_photos ?? [];
            return (
              <li className="review-card" key={row.id} data-testid={`review-${row.id}`}>
                <div className="review-card__head">
                  <div>
                    <p className="review-card__sci">{row.scientific_name}</p>
                    {row.vernacular_name && (
                      <p className="review-card__vern">{row.vernacular_name}</p>
                    )}
                  </div>
                  <span
                    className={`badge ${row.status === 'approved' ? 'badge--endemic' : 'badge--rank'}`}
                  >
                    {t(`review.status.${row.status}`)}
                  </span>
                </div>

                {photos.length > 0 && (
                  <div className="photo-strip">
                    {photos.map((photo) => (
                      <a
                        key={photo.id}
                        className="photo-strip__item"
                        href={publicPhotoUrl(SUPABASE_URL, photo.storage_path)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img
                          src={publicPhotoUrl(SUPABASE_URL, photo.storage_path)}
                          alt=""
                          loading="lazy"
                        />
                      </a>
                    ))}
                  </div>
                )}

                <dl className="review-card__facts">
                  <Fact label={t('review.date')} value={row.observed_on} />
                  <Fact
                    label={t('observation.davisSquare')}
                    value={row.davis_square ?? '—'}
                  />
                  <Fact
                    label={t('review.coordinates')}
                    value={`${row.lat.toFixed(5)}, ${row.lon.toFixed(5)}${
                      row.coordinate_uncertainty_m != null ? ` (±${row.coordinate_uncertainty_m} m)` : ''
                    }`}
                  />
                  {row.elevation_m != null && (
                    <Fact label={t('observation.elevation')} value={`${row.elevation_m} m`} />
                  )}
                  {row.individual_count != null && (
                    <Fact label={t('observation.individualCount')} value={String(row.individual_count)} />
                  )}
                  {row.phenology && (
                    <Fact
                      label={t('observation.phenology')}
                      value={t(`observation.phenologyValue.${row.phenology}`)}
                    />
                  )}
                  {row.locality && <Fact label={t('observation.locality')} value={row.locality} />}
                  {row.habitat_note && (
                    <Fact label={t('observation.habitat')} value={row.habitat_note} />
                  )}
                  {row.notes && <Fact label={t('observation.notes')} value={row.notes} />}
                  {scope === 'queue' && row.profiles && (
                    <Fact
                      label={t('review.contributor')}
                      value={[row.profiles.display_name, row.profiles.institution]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                  )}
                  {row.review_note && (
                    <Fact label={t('review.reviewNote')} value={row.review_note} />
                  )}
                </dl>

                {noteFor === row.id ? (
                  <div className="field">
                    <label className="field__label" htmlFor={`note-${row.id}`}>
                      {t('review.rejectReason')}
                    </label>
                    <textarea
                      id={`note-${row.id}`}
                      className="textarea"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={1000}
                      data-testid={`review-note-${row.id}`}
                    />
                    <div className="filter-row">
                      <button
                        type="button"
                        className="button button--danger"
                        disabled={busy}
                        onClick={() => void run(row.id, () => reviewObservation(row.id, 'rejected', note))}
                        data-testid={`review-reject-confirm-${row.id}`}
                      >
                        {t('review.reject')}
                      </button>
                      <button type="button" className="button" onClick={() => setNoteFor(null)}>
                        {t('review.cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="filter-row">
                    {canReview(user) && row.status !== 'approved' && (
                      <button
                        type="button"
                        className="button button--primary"
                        disabled={busy}
                        onClick={() => void run(row.id, () => reviewObservation(row.id, 'approved'))}
                        data-testid={`review-approve-${row.id}`}
                      >
                        {t('review.approve')}
                      </button>
                    )}
                    {canReview(user) && row.status !== 'rejected' && (
                      <button
                        type="button"
                        className="button"
                        disabled={busy}
                        onClick={() => {
                          setNoteFor(row.id);
                          setNote('');
                        }}
                        data-testid={`review-reject-${row.id}`}
                      >
                        {t('review.reject')}
                      </button>
                    )}
                    {/* Silme: yönetici her kaydı, kullanıcı yalnızca kendi
                        onaylanmamış kaydını silebilir (RLS de aynısını zorlar). */}
                    {(isAdmin(user) || (scope === 'mine' && row.status === 'pending')) && (
                      <button
                        type="button"
                        className="button button--danger"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm(t('review.confirmDelete'))) return;
                          void run(row.id, () => deleteOwnObservation(row.id));
                        }}
                        data-testid={`review-delete-${row.id}`}
                      >
                        {t('review.delete')}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="review-card__fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
