import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { describeError } from '../backend/client';
import { approveUser, listProfiles, setUserRole, setUserStatus, suspendUser } from '../backend/admin';
import type { SessionUser } from '../backend/auth';
import type { Profile, UserRole } from '../backend/types';

interface Props {
  user: SessionUser;
  onClose: () => void;
}

const ROLES: UserRole[] = ['contributor', 'curator', 'admin'];

/**
 * Yönetici paneli — kullanıcı hesaplarını onaylama, askıya alma, rol atama.
 *
 * Onay bekleyenler listenin başındadır: yöneticinin buraya gelme sebebi odur.
 */
export function AdminPanel({ user, onClose }: Props) {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setProfiles(await listProfiles());
    } catch (err) {
      setError(describeError(err));
      setProfiles([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  /** Bir eylemi çalıştırır ve listeyi tazeler; hata olursa gösterir. */
  async function run(userId: string, action: () => Promise<void>) {
    setBusyId(userId);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusyId(null);
    }
  }

  const pendingCount = profiles?.filter((p) => p.status === 'pending').length ?? 0;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('admin.title')}
      onClick={onClose}
      data-testid="admin-panel"
    >
      <div className="modal modal--wide" onClick={(event) => event.stopPropagation()}>
        <header className="modal__header">
          <div>
            <h2 className="modal__title">{t('admin.title')}</h2>
            <p className="modal__subtitle">
              {pendingCount > 0
                ? t('admin.pendingCount', { count: pendingCount })
                : t('admin.noPending')}
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={t('detail.close')}
            data-testid="admin-close"
          >
            ×
          </button>
        </header>

        <div className="modal__body">
          {error && (
            <p className="form__message form__message--error" role="alert" data-testid="admin-error">
              {error}
            </p>
          )}

          {profiles === null ? (
            <p className="empty-note">{t('app.loading')}</p>
          ) : profiles.length === 0 ? (
            <p className="empty-note">{t('admin.noUsers')}</p>
          ) : (
            <table className="province-table__grid" data-testid="admin-user-table">
              <thead>
                <tr>
                  <th>{t('admin.colName')}</th>
                  <th>{t('admin.colInstitution')}</th>
                  <th>{t('admin.colRole')}</th>
                  <th>{t('admin.colStatus')}</th>
                  <th>{t('admin.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile) => {
                  const isSelf = profile.id === user.id;
                  const busy = busyId === profile.id;
                  return (
                    <tr key={profile.id} data-testid={`admin-row-${profile.id}`}>
                      <td>
                        {profile.display_name}
                        {isSelf && <span className="field__hint"> ({t('admin.you')})</span>}
                      </td>
                      <td>{profile.institution ?? '—'}</td>
                      <td>
                        <select
                          className="input"
                          value={profile.role}
                          /* Yönetici kendi rolünü DEĞİŞTİREMEZ: son yöneticinin
                             kendini yanlışlıkla düşürüp herkesi kilitlemesini
                             engeller. Başka bir yönetici gerekiyorsa onu bu
                             listeden yükseltmek zaten mümkün. */
                          disabled={isSelf || busy}
                          onChange={(e) =>
                            void run(profile.id, () => setUserRole(profile.id, e.target.value as UserRole))
                          }
                          data-testid={`admin-role-${profile.id}`}
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {t(`auth.role.${role}`)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <span
                          className={`badge ${profile.status === 'approved' ? 'badge--endemic' : 'badge--rank'}`}
                        >
                          {t(`auth.status.${profile.status}`)}
                        </span>
                      </td>
                      <td>
                        <div className="filter-row">
                          {profile.status !== 'approved' && (
                            <button
                              type="button"
                              className="button button--primary"
                              disabled={busy}
                              onClick={() => void run(profile.id, () => approveUser(profile.id))}
                              data-testid={`admin-approve-${profile.id}`}
                            >
                              {t('admin.approve')}
                            </button>
                          )}
                          {profile.status !== 'suspended' && !isSelf && (
                            <button
                              type="button"
                              className="button button--danger"
                              disabled={busy}
                              onClick={() => void run(profile.id, () => suspendUser(profile.id))}
                              data-testid={`admin-suspend-${profile.id}`}
                            >
                              {t('admin.suspend')}
                            </button>
                          )}
                          {profile.status === 'suspended' && (
                            <button
                              type="button"
                              className="button"
                              disabled={busy}
                              onClick={() => void run(profile.id, () => setUserStatus(profile.id, 'pending'))}
                            >
                              {t('admin.reinstate')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
