import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { describeError } from '../backend/client';
import { signOut, updatePassword } from '../backend/auth';

interface Props {
  onDone: () => void;
}

/**
 * Şifre sıfırlama e-postasındaki linke tıklandıktan sonra AÇILMASI ZORUNLU adım.
 *
 * Supabase, sıfırlama linkine tıklandığında kullanıcı için geçerli bir oturum
 * kurar (`PASSWORD_RECOVERY` olayı, bkz. useSession.ts). Bu ekran olmadan
 * kullanıcı yeni bir şifre belirlemeden doğrudan giriş yapmış gibi görünürdü —
 * eski şifresi hâlâ geçerli kalırdı ve sıfırlama işe yaramazdı. Kapatılamaz:
 * ya yeni şifre belirlenir ya da "vazgeç" ile oturum tamamen kapatılır.
 */
export function ResetPasswordPanel({ onDone }: Props) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    setBusy(true);
    try {
      await updatePassword(password);
      onDone();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    setBusy(true);
    try {
      await signOut();
    } catch {
      /* çıkış başarısız olsa da paneli kapatıp normal akışa dönülür */
    } finally {
      setBusy(false);
      onDone();
    }
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('auth.resetPasswordTitle')}
      data-testid="reset-password-panel"
    >
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal__header">
          <div>
            <h2 className="modal__title">{t('auth.resetPasswordTitle')}</h2>
            <p className="modal__subtitle">{t('auth.resetPasswordSubtitle')}</p>
          </div>
        </header>

        <div className="modal__body">
          <form className="form" onSubmit={handleSubmit}>
            {error && (
              <p className="form__message form__message--error" role="alert" data-testid="reset-password-error">
                {error}
              </p>
            )}

            <div className="field">
              <label className="field__label field__label--required" htmlFor="reset-password">
                {t('auth.newPassword')}
              </label>
              <input
                ref={firstFieldRef}
                id="reset-password"
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                data-testid="reset-password-input"
              />
              <span className="field__hint">{t('auth.passwordHint')}</span>
            </div>

            <div className="field">
              <label className="field__label field__label--required" htmlFor="reset-password-confirm">
                {t('auth.confirmPassword')}
              </label>
              <input
                id="reset-password-confirm"
                className="input"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                data-testid="reset-password-confirm"
              />
            </div>

            <button
              type="submit"
              className="button button--primary button--block"
              disabled={busy}
              data-testid="reset-password-submit"
            >
              {busy ? t('auth.working') : t('auth.savePassword')}
            </button>

            <button
              type="button"
              className="button button--block"
              disabled={busy}
              onClick={() => void handleCancel()}
              data-testid="reset-password-cancel"
            >
              {t('auth.cancelSignOut')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
