import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { describeError } from '../backend/client';
import {
  requestPasswordReset,
  signIn,
  signUp,
  type SessionUser,
} from '../backend/auth';

/**
 * `done`: kayıt tamamlandı ve kullanıcı ZATEN giriş yapmış durumda.
 *
 * E-posta doğrulaması kapalıyken Supabase kayıt anında oturum döndürür. Bu durumda
 * kullanıcıyı "giriş yap" sekmesine geri atmak yanlış olurdu (zaten girmiş); bunun
 * yerine hesabının onay beklediğini anlatan bir kapanış ekranı gösterilir.
 */
type Mode = 'signin' | 'signup' | 'reset' | 'done';

interface Props {
  onClose: () => void;
  onSignedIn: () => void;
  /** Zaten giriş yapılmışsa panel doğrudan hesap görünümünü açar. */
  user: SessionUser | null;
}

/**
 * Giriş / kayıt / şifre sıfırlama kipi.
 *
 * Kayıt olan hesap `pending` başlar ve yönetici onaylayana kadar veri giremez —
 * bu, arayüzde de açıkça yazılır. Kısıtlamayı asıl zorlayan yer sunucudaki RLS
 * politikalarıdır (bkz. supabase/migrations/0001_init.sql); buradaki metin
 * yalnızca kullanıcıyı bilgilendirir.
 */
export function AuthPanel({ onClose, onSignedIn }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [institution, setInstitution] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
        onSignedIn();
        onClose();
      } else if (mode === 'signup') {
        const { needsEmailConfirmation } = await signUp({
          email,
          password,
          displayName,
          institution,
        });
        if (needsEmailConfirmation) {
          setNotice(t('auth.confirmEmailSent'));
          setMode('signin');
        } else {
          // Doğrulama kapalı: kullanıcı bu noktada zaten giriş yapmış durumda.
          // Üst çubuğun adını göstermesi için oturumu tazeliyor, sonra hesabın
          // onay beklediğini anlatan kapanış ekranına geçiyoruz.
          onSignedIn();
          setMode('done');
        }
      } else {
        await requestPasswordReset(email);
        setNotice(t('auth.resetSent'));
        setMode('signin');
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === 'signin'
      ? t('auth.signIn')
      : mode === 'signup'
        ? t('auth.signUp')
        : mode === 'done'
          ? t('auth.welcomeTitle')
          : t('auth.resetTitle');

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      data-testid="auth-panel"
    >
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal__header">
          <div>
            <h2 className="modal__title">{title}</h2>
            <p className="modal__subtitle">{t('auth.subtitle')}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={t('detail.close')}
            data-testid="auth-close"
          >
            ×
          </button>
        </header>

        {mode !== 'reset' && mode !== 'done' && (
          <div className="modal__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signin'}
              className={`modal__tab${mode === 'signin' ? ' modal__tab--active' : ''}`}
              onClick={() => setMode('signin')}
              data-testid="auth-tab-signin"
            >
              {t('auth.signIn')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              className={`modal__tab${mode === 'signup' ? ' modal__tab--active' : ''}`}
              onClick={() => setMode('signup')}
              data-testid="auth-tab-signup"
            >
              {t('auth.signUp')}
            </button>
          </div>
        )}

        <div className="modal__body">
          {mode === 'done' ? (
            <div className="form" data-testid="auth-done">
              <p className="form__message form__message--success">{t('auth.signedUpPending')}</p>
              <p className="form__message form__message--info">{t('auth.pendingNotice')}</p>
              <button
                type="button"
                className="button button--primary button--block"
                onClick={onClose}
                data-testid="auth-done-close"
              >
                {t('auth.gotIt')}
              </button>
            </div>
          ) : (
          <form className="form" onSubmit={handleSubmit}>
            {error && (
              <p className="form__message form__message--error" role="alert" data-testid="auth-error">
                {error}
              </p>
            )}
            {notice && (
              <p className="form__message form__message--success" role="status" data-testid="auth-notice">
                {notice}
              </p>
            )}

            {mode === 'signup' && (
              <>
                <div className="field">
                  <label className="field__label field__label--required" htmlFor="auth-name">
                    {t('auth.displayName')}
                  </label>
                  <input
                    ref={firstFieldRef}
                    id="auth-name"
                    className="input"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    minLength={2}
                    maxLength={120}
                    autoComplete="name"
                    data-testid="auth-name"
                  />
                  <span className="field__hint">{t('auth.displayNameHint')}</span>
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="auth-institution">
                    {t('auth.institution')}
                  </label>
                  <input
                    id="auth-institution"
                    className="input"
                    type="text"
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    maxLength={200}
                    autoComplete="organization"
                    data-testid="auth-institution"
                  />
                </div>
              </>
            )}

            <div className="field">
              <label className="field__label field__label--required" htmlFor="auth-email">
                {t('auth.email')}
              </label>
              <input
                ref={mode === 'signup' ? undefined : firstFieldRef}
                id="auth-email"
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                data-testid="auth-email"
              />
            </div>

            {mode !== 'reset' && (
              <div className="field">
                <label className="field__label field__label--required" htmlFor="auth-password">
                  {t('auth.password')}
                </label>
                <input
                  id="auth-password"
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  data-testid="auth-password"
                />
                {mode === 'signup' && <span className="field__hint">{t('auth.passwordHint')}</span>}
              </div>
            )}

            {mode === 'signup' && (
              <p className="form__message form__message--info">{t('auth.approvalNotice')}</p>
            )}

            <button
              type="submit"
              className="button button--primary button--block"
              disabled={busy}
              data-testid="auth-submit"
            >
              {busy ? t('auth.working') : title}
            </button>

            {mode === 'signin' && (
              <button
                type="button"
                className="button"
                onClick={() => setMode('reset')}
                data-testid="auth-forgot"
              >
                {t('auth.forgotPassword')}
              </button>
            )}
            {mode === 'reset' && (
              <button type="button" className="button" onClick={() => setMode('signin')}>
                {t('auth.backToSignIn')}
              </button>
            )}
          </form>
          )}
        </div>
      </div>
    </div>
  );
}
