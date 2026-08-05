import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { describeError } from '../backend/client';
import { canContribute, isAdmin, signOut, updateOwnProfile, type SessionUser } from '../backend/auth';

interface Props {
  user: SessionUser;
  onClose: () => void;
  onChanged: () => void;
  /** Yönetici panelini açar; yalnızca yöneticide gösterilir. */
  onOpenAdmin: () => void;
}

/**
 * Giriş yapmış kullanıcının hesap kipi: durum bilgisi, ad/kurum düzenleme, çıkış.
 *
 * Hesap onay bekliyorsa bunu AÇIKÇA söyler. Kullanıcının "giriş yaptım ama neden
 * veri giremiyorum" sorusunu, denemesine gerek kalmadan burada yanıtlamak
 * gerekiyor; aksi hâlde sunucudan gelen RLS reddi anlaşılmaz bir hataya dönüşür.
 */
export function AccountPanel({ user, onClose, onChanged, onOpenAdmin }: Props) {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState(user.profile?.display_name ?? '');
  const [institution, setInstitution] = useState(user.profile?.institution ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      await updateOwnProfile({
        display_name: displayName.trim(),
        institution: institution.trim() || null,
      });
      setSaved(true);
      onChanged();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOut();
      onChanged();
      onClose();
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  }

  const status = user.profile?.status ?? 'pending';
  const role = user.profile?.role ?? 'contributor';

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('auth.account')}
      onClick={onClose}
      data-testid="account-panel"
    >
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal__header">
          <div>
            <h2 className="modal__title">{t('auth.account')}</h2>
            <p className="modal__subtitle">{user.email}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={t('detail.close')}
            data-testid="account-close"
          >
            ×
          </button>
        </header>

        <div className="modal__body">
          <div className="form">
            <div className="detail__badges">
              <span className="badge badge--rank">{t(`auth.role.${role}`)}</span>
              <span className={`badge ${status === 'approved' ? 'badge--endemic' : 'badge--rank'}`}>
                {t(`auth.status.${status}`)}
              </span>
            </div>

            {!canContribute(user) && (
              <p className="form__message form__message--info" data-testid="account-pending-notice">
                {status === 'suspended' ? t('auth.suspendedNotice') : t('auth.pendingNotice')}
              </p>
            )}

            {error && (
              <p className="form__message form__message--error" role="alert">
                {error}
              </p>
            )}
            {saved && (
              <p className="form__message form__message--success" role="status">
                {t('auth.profileSaved')}
              </p>
            )}

            <form className="form" onSubmit={handleSave}>
              <div className="field">
                <label className="field__label field__label--required" htmlFor="account-name">
                  {t('auth.displayName')}
                </label>
                <input
                  id="account-name"
                  className="input"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={120}
                  data-testid="account-name"
                />
              </div>

              <div className="field">
                <label className="field__label" htmlFor="account-institution">
                  {t('auth.institution')}
                </label>
                <input
                  id="account-institution"
                  className="input"
                  type="text"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  maxLength={200}
                  data-testid="account-institution"
                />
              </div>

              <button type="submit" className="button button--primary" disabled={busy}>
                {busy ? t('auth.working') : t('auth.saveProfile')}
              </button>
            </form>

            {isAdmin(user) && (
              <button
                type="button"
                className="button button--block"
                onClick={onOpenAdmin}
                data-testid="account-open-admin"
              >
                {t('admin.open')}
              </button>
            )}

            <button
              type="button"
              className="button button--danger button--block"
              onClick={handleSignOut}
              disabled={busy}
              data-testid="account-signout"
            >
              {t('auth.signOut')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
