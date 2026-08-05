import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { TaxonNode } from '@trbotanik/shared';
import { describeError } from '../backend/client';
import type { SessionUser } from '../backend/auth';
import { submitObservation } from '../backend/observations';
import { PHENOLOGY_VALUES, type ObservationDraft, type Phenology } from '../backend/types';
import {
  GeolocationFailure,
  formatCoordinate,
  getCurrentFix,
  type Fix,
} from '../backend/geolocation';
import { preparePhoto, type PreparedPhoto } from '../backend/photos';
import { normalizeTr } from '../domain/filter';
import { displayVernacular } from '../domain/vernacular';
import {
  isValid,
  previewDavisSquare,
  todayIsoDate,
  validateDraft,
  type DraftErrors,
} from '../domain/observationDraft';

interface Props {
  user: SessionUser;
  nodes: TaxonNode[];
  onClose: () => void;
}

/** Tür arama sonucunda gösterilecek en fazla satır — mobilde liste uzamasın. */
const MAX_SUGGESTIONS = 12;
const MAX_PHOTOS = 4;

/**
 * Arazi gözlemi giriş formu.
 *
 * MOBİL ÖNCELİKLİ: Asıl kullanım telefondan, arazide olacak. Bu yüzden alanlar
 * tek sütun, dokunma hedefleri büyük, zorunlu alanlar en üstte ve isteğe bağlı
 * ayrıntılar katlanabilir bir bölümde — küçük ekranda kullanıcı üç alan doldurup
 * gönderebilsin.
 *
 * Gönderim `submitObservation`'dan geçer; ikinci aşamada çevrimdışı kuyruk
 * oradaki tek noktaya eklenecek ve bu bileşen değişmeyecek.
 */
export function ObservationForm({ user, nodes, onClose }: Props) {
  const { t, i18n } = useTranslation();

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<TaxonNode | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [manualLat, setManualLat] = useState('');
  const [manualLon, setManualLon] = useState('');
  const [observedOn, setObservedOn] = useState(todayIsoDate());
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [elevation, setElevation] = useState('');
  const [count, setCount] = useState('');
  const [phenology, setPhenology] = useState<Phenology | ''>('');
  const [locality, setLocality] = useState('');
  const [habitatNote, setHabitatNote] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ square: string | null; photoErrors: string[] } | null>(null);
  const [touched, setTouched] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Yalnızca TÜR düzeyindeki düğümler aranır; familya/cins seçmek anlamsız olurdu.
  const speciesNodes = useMemo(() => nodes.filter((n) => n.rank === 'SPECIES'), [nodes]);

  const suggestions = useMemo(() => {
    const needle = normalizeTr(query.trim());
    if (needle.length < 2) return [];
    const out: TaxonNode[] = [];
    for (const node of speciesNodes) {
      const haystack = normalizeTr(
        `${node.name} ${node.vernacularTr ?? ''} ${node.vernacularEn ?? ''}`,
      );
      if (haystack.includes(needle)) {
        out.push(node);
        if (out.length >= MAX_SUGGESTIONS) break;
      }
    }
    return out;
  }, [query, speciesNodes]);

  // Önizleme adresleri tarayıcı belleğinde tutulur; bileşen sökülürken bırakılmalı.
  useEffect(() => {
    return () => {
      for (const photo of photos) URL.revokeObjectURL(photo.previewUrl);
    };
  }, [photos]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const lat = fix ? fix.lat : manualLat.trim() ? Number(manualLat.replace(',', '.')) : null;
  const lon = fix ? fix.lon : manualLon.trim() ? Number(manualLon.replace(',', '.')) : null;

  const draft: ObservationDraft = {
    gbif_key: selected?.gbifKey ?? null,
    scientific_name: selected ? selected.name : query.trim(),
    vernacular_name: selected ? (displayVernacular(selected, i18n.language) ?? null) : null,
    lat: lat as number,
    lon: lon as number,
    coordinate_uncertainty_m: fix?.accuracyM ?? null,
    elevation_m: elevation.trim() ? Number(elevation) : null,
    province: null,
    locality: locality.trim() || null,
    observed_on: observedOn,
    individual_count: count.trim() ? Number(count) : null,
    phenology: phenology || null,
    habitat_note: habitatNote.trim() || null,
    notes: notes.trim() || null,
  };

  const errors: DraftErrors = validateDraft(draft);
  const square = previewDavisSquare(lat, lon);

  async function handleLocate() {
    setLocating(true);
    setLocationError(null);
    try {
      const result = await getCurrentFix();
      setFix(result);
      // GPS rakımı telefonlarda güvenilmezdir; yine de doldurup kullanıcıya
      // düzeltme imkânı bırakıyoruz — boş bırakmaktan iyidir.
      if (result.altitudeM != null && !elevation.trim()) setElevation(String(result.altitudeM));
    } catch (err) {
      const code = err instanceof GeolocationFailure ? err.code : 'unavailable';
      setLocationError(t(`observation.geo.${code}`));
    } finally {
      setLocating(false);
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setPhotoError(null);
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      setPhotoError(t('observation.errorTooManyPhotos', { max: MAX_PHOTOS }));
      return;
    }
    const chosen = [...files].slice(0, room);
    const prepared: PreparedPhoto[] = [];
    for (const file of chosen) {
      try {
        prepared.push(await preparePhoto(file));
      } catch (err) {
        setPhotoError(describeError(err));
      }
    }
    setPhotos((current) => [...current, ...prepared]);
    // Aynı dosyayı tekrar seçebilmek için girdiyi sıfırla.
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removePhoto(index: number) {
    setPhotos((current) => {
      const photo = current[index];
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      return current.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!isValid(errors)) return;
    setError(null);
    setBusy(true);
    try {
      const result = await submitObservation(draft, photos);
      setDone({ square, photoErrors: result.photoErrors });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="modal-overlay" role="dialog" aria-modal="true" data-testid="observation-done">
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <header className="modal__header">
            <h2 className="modal__title">{t('observation.sentTitle')}</h2>
          </header>
          <div className="modal__body">
            <div className="form">
              <p className="form__message form__message--success">
                {t('observation.sentBody', { square: done.square ?? '—' })}
              </p>
              {done.photoErrors.length > 0 && (
                <p className="form__message form__message--error">
                  {t('observation.photoPartialFail', { count: done.photoErrors.length })}
                </p>
              )}
              <button
                type="button"
                className="button button--primary button--block"
                onClick={onClose}
                data-testid="observation-done-close"
              >
                {t('auth.gotIt')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('observation.title')}
      data-testid="observation-form"
    >
      <div className="modal modal--form" onClick={(e) => e.stopPropagation()}>
        <header className="modal__header">
          <div>
            <h2 className="modal__title">{t('observation.title')}</h2>
            <p className="modal__subtitle">{t('observation.subtitle')}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={t('detail.close')}
            data-testid="observation-close"
          >
            ×
          </button>
        </header>

        <div className="modal__body">
          <form className="form" onSubmit={handleSubmit}>
            {error && (
              <p className="form__message form__message--error" role="alert" data-testid="observation-error">
                {error}
              </p>
            )}

            {/* ── Tür ───────────────────────────────────────────────── */}
            <div className="field">
              <label className="field__label field__label--required" htmlFor="obs-species">
                {t('observation.species')}
              </label>
              {selected ? (
                <div className="picked">
                  <span className="picked__name">{selected.name}</span>
                  {displayVernacular(selected, i18n.language) && (
                    <span className="picked__vernacular">
                      {displayVernacular(selected, i18n.language)}
                    </span>
                  )}
                  <button
                    type="button"
                    className="chip chip--clear"
                    onClick={() => {
                      setSelected(null);
                      setQuery('');
                    }}
                    data-testid="obs-species-clear"
                  >
                    {t('observation.change')}
                  </button>
                </div>
              ) : (
                <>
                  <input
                    id="obs-species"
                    className={`input${touched && errors.scientific_name ? ' input--invalid' : ''}`}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('observation.speciesPlaceholder')}
                    autoComplete="off"
                    data-testid="obs-species"
                  />
                  {suggestions.length > 0 && (
                    <ul className="suggestions" data-testid="obs-suggestions">
                      {suggestions.map((node) => (
                        <li key={node.id}>
                          <button
                            type="button"
                            className="suggestions__item"
                            onClick={() => setSelected(node)}
                            data-testid={`obs-suggestion-${node.id}`}
                          >
                            <span className="suggestions__sci">{node.name}</span>
                            {displayVernacular(node, i18n.language) && (
                              <span className="suggestions__vern">
                                {displayVernacular(node, i18n.language)}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <span className="field__hint">{t('observation.speciesHint')}</span>
                </>
              )}
              {touched && errors.scientific_name && (
                <span className="field__error">{t(errors.scientific_name)}</span>
              )}
            </div>

            {/* ── Konum ─────────────────────────────────────────────── */}
            <div className="field">
              <span className="field__label field__label--required">{t('observation.location')}</span>
              <button
                type="button"
                className="button button--primary button--block"
                onClick={handleLocate}
                disabled={locating}
                data-testid="obs-locate"
              >
                {locating ? t('observation.locating') : t('observation.useMyLocation')}
              </button>

              {locationError && (
                <p className="form__message form__message--error" data-testid="obs-geo-error">
                  {locationError}
                </p>
              )}

              {fix && (
                <p className="form__message form__message--info" data-testid="obs-fix">
                  {formatCoordinate(fix.lat)}, {formatCoordinate(fix.lon)}
                  {fix.accuracyM != null && ` · ±${fix.accuracyM} m`}
                  {square && ` · ${t('observation.davisSquare')}: ${square}`}
                </p>
              )}

              {!fix && (
                <>
                  <span className="field__hint">{t('observation.manualHint')}</span>
                  <div className="form__row">
                    <input
                      className="input"
                      type="text"
                      inputMode="decimal"
                      value={manualLat}
                      onChange={(e) => setManualLat(e.target.value)}
                      placeholder={t('observation.latitude')}
                      aria-label={t('observation.latitude')}
                      data-testid="obs-lat"
                    />
                    <input
                      className="input"
                      type="text"
                      inputMode="decimal"
                      value={manualLon}
                      onChange={(e) => setManualLon(e.target.value)}
                      placeholder={t('observation.longitude')}
                      aria-label={t('observation.longitude')}
                      data-testid="obs-lon"
                    />
                  </div>
                  {square && (
                    <span className="field__hint" data-testid="obs-square-preview">
                      {t('observation.davisSquare')}: {square}
                    </span>
                  )}
                </>
              )}

              {touched && errors.coordinates && (
                <span className="field__error" data-testid="obs-coord-error">
                  {t(errors.coordinates)}
                </span>
              )}
            </div>

            {/* ── Tarih ─────────────────────────────────────────────── */}
            <div className="field">
              <label className="field__label field__label--required" htmlFor="obs-date">
                {t('observation.date')}
              </label>
              <input
                id="obs-date"
                className={`input${touched && errors.observed_on ? ' input--invalid' : ''}`}
                type="date"
                value={observedOn}
                max={todayIsoDate()}
                onChange={(e) => setObservedOn(e.target.value)}
                data-testid="obs-date"
              />
              {touched && errors.observed_on && (
                <span className="field__error">{t(errors.observed_on)}</span>
              )}
            </div>

            {/* ── Fotoğraflar ───────────────────────────────────────── */}
            <div className="field">
              <span className="field__label">{t('observation.photos')}</span>
              <input
                ref={fileInputRef}
                className="input"
                type="file"
                accept="image/*"
                /* `capture="environment"`: telefonda doğrudan arka kamerayı açar. */
                capture="environment"
                multiple
                onChange={(e) => void handleFiles(e.target.files)}
                data-testid="obs-photos"
              />
              <span className="field__hint">{t('observation.photosHint', { max: MAX_PHOTOS })}</span>
              {photoError && <span className="field__error">{photoError}</span>}
              {photos.length > 0 && (
                <div className="photo-strip" data-testid="obs-photo-strip">
                  {photos.map((photo, index) => (
                    <div className="photo-strip__item" key={photo.previewUrl}>
                      <img src={photo.previewUrl} alt="" />
                      <button
                        type="button"
                        className="icon-button photo-strip__remove"
                        onClick={() => removePhoto(index)}
                        aria-label={t('observation.removePhoto')}
                        data-testid={`obs-photo-remove-${index}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── İsteğe bağlı ayrıntılar ───────────────────────────── */}
            <button
              type="button"
              className="button button--block"
              onClick={() => setShowDetails((v) => !v)}
              aria-expanded={showDetails}
              data-testid="obs-toggle-details"
            >
              {showDetails ? t('observation.hideDetails') : t('observation.showDetails')}
            </button>

            {showDetails && (
              <>
                <div className="form__row">
                  <div className="field">
                    <label className="field__label" htmlFor="obs-elevation">
                      {t('observation.elevation')}
                    </label>
                    <input
                      id="obs-elevation"
                      className={`input${touched && errors.elevation_m ? ' input--invalid' : ''}`}
                      type="number"
                      inputMode="numeric"
                      value={elevation}
                      onChange={(e) => setElevation(e.target.value)}
                      data-testid="obs-elevation"
                    />
                    {touched && errors.elevation_m && (
                      <span className="field__error">{t(errors.elevation_m)}</span>
                    )}
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="obs-count">
                      {t('observation.individualCount')}
                    </label>
                    <input
                      id="obs-count"
                      className={`input${touched && errors.individual_count ? ' input--invalid' : ''}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={count}
                      onChange={(e) => setCount(e.target.value)}
                      data-testid="obs-count"
                    />
                    {touched && errors.individual_count && (
                      <span className="field__error">{t(errors.individual_count)}</span>
                    )}
                  </div>
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="obs-phenology">
                    {t('observation.phenology')}
                  </label>
                  <select
                    id="obs-phenology"
                    className="input"
                    value={phenology}
                    onChange={(e) => setPhenology(e.target.value as Phenology | '')}
                    data-testid="obs-phenology"
                  >
                    <option value="">{t('observation.notSpecified')}</option>
                    {PHENOLOGY_VALUES.map((value) => (
                      <option key={value} value={value}>
                        {t(`observation.phenologyValue.${value}`)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="obs-locality">
                    {t('observation.locality')}
                  </label>
                  <input
                    id="obs-locality"
                    className="input"
                    type="text"
                    maxLength={300}
                    value={locality}
                    onChange={(e) => setLocality(e.target.value)}
                    placeholder={t('observation.localityPlaceholder')}
                    data-testid="obs-locality"
                  />
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="obs-habitat">
                    {t('observation.habitat')}
                  </label>
                  <textarea
                    id="obs-habitat"
                    className="textarea"
                    maxLength={1000}
                    value={habitatNote}
                    onChange={(e) => setHabitatNote(e.target.value)}
                    data-testid="obs-habitat"
                  />
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="obs-notes">
                    {t('observation.notes')}
                  </label>
                  <textarea
                    id="obs-notes"
                    className="textarea"
                    maxLength={2000}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    data-testid="obs-notes"
                  />
                </div>
              </>
            )}

            <p className="form__message form__message--info">{t('observation.reviewNotice')}</p>

            <button
              type="submit"
              className="button button--primary button--block"
              disabled={busy}
              data-testid="obs-submit"
            >
              {busy ? t('observation.sending') : t('observation.submit')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
