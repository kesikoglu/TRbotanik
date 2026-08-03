import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DAVIS_SQUARE_PROVINCES,
  type DavisCode,
  type PlantDetail,
  type PlantImage,
  type TaxonNode,
} from '@trbotanik/shared';
import { buildAttributeGroups, type AttrValue } from '../domain/attributeSchema';
import type { SelectionResult } from '../domain/filter';
import { imageIndex, placeholderImageUrl } from './placeholderImage';
import { useAppStore } from '../state/useAppStore';

interface Props {
  nodes: TaxonNode[];
  details: Record<number, PlantDetail>;
  endemicIds: Set<number>;
  selection: SelectionResult;
}

export function DetailPane({ nodes, details, endemicIds, selection }: Props) {
  const selectedSpeciesId = useAppStore((s) => s.selectedSpeciesId);
  const selectedSquare = useAppStore((s) => s.selectedSquare);

  if (selectedSpeciesId !== null) {
    const detail = details[selectedSpeciesId];
    const node = nodes[selectedSpeciesId];
    if (detail && node) {
      return <SpeciesDetail node={node} detail={detail} isEndemic={endemicIds.has(node.id)} />;
    }
  }

  if (selectedSquare) {
    return <SquarePanel code={selectedSquare} nodes={nodes} selection={selection} endemicIds={endemicIds} />;
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * Tür ayrıntısı — öznitelik tablosu ve görsel galerisi
 * ------------------------------------------------------------------ */

function SpeciesDetail({
  node,
  detail,
  isEndemic,
}: {
  node: TaxonNode;
  detail: PlantDetail;
  isEndemic: boolean;
}) {
  const { t } = useTranslation();
  const selectSpecies = useAppStore((s) => s.selectSpecies);
  const selectSquare = useAppStore((s) => s.selectSquare);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const groups = buildAttributeGroups(detail, t as never);
  const vernacular = detail.vernacularTr.value.map((v) => v.name).join(', ');

  return (
    <section className="detail" data-testid="species-detail" aria-label={node.name}>
      <header className="detail__header">
        <div className="detail__names">
          <h2 className="detail__sci">
            {node.name}
            {node.authorship && <span className="detail__author"> {node.authorship}</span>}
          </h2>
          {vernacular && <p className="detail__vernacular">{vernacular}</p>}
          <div className="detail__badges">
            <span className="badge badge--rank">{t(`rank.${node.rank}`)}</span>
            {isEndemic && <span className="badge badge--endemic">{t('value.endemicYes')}</span>}
            <span className="badge badge--completeness">
              {t('detail.completeness', { percent: Math.round(detail.dataCompleteness * 100) })}
            </span>
          </div>
        </div>
        {detail.images[0] && (
          <button
            type="button"
            className="detail__thumb"
            onClick={() => setLightboxIndex(0)}
            aria-label={t('image.open')}
          >
            <img
              src={
                detail.images[0].isPlaceholder
                  ? placeholderImageUrl(node.name, imageIndex(detail.images[0].id))
                  : detail.images[0].thumbnailUrl
              }
              alt={detail.images[0].caption ?? ''}
            />
          </button>
        )}
        <button
          type="button"
          className="icon-button"
          onClick={() => selectSpecies(null)}
          aria-label={t('detail.close')}
          data-testid="detail-close"
        >
          ×
        </button>
      </header>

      <div className="detail__scroll">
        {groups.map((group) => (
          <div className="detail__group" key={group.titleKey}>
            <h3 className="detail__group-title">{t(group.titleKey)}</h3>
            <table className="attr-table">
              <tbody>
                {group.rows.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">{t(row.labelKey)}</th>
                    <td>
                      <AttributeValue value={row.value} onSquareClick={selectSquare} />
                      {row.source && row.value.kind !== 'missing' && (
                        <span
                          className="attr-provenance"
                          title={`${t('provenance.label')}: ${t(`provenance.${row.source}`)}`}
                        >
                          {t(`provenance.${row.source}`)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <div className="detail__group">
          <h3 className="detail__group-title">{t('detail.groupImages')}</h3>
          <div className="gallery">
            {detail.images.map((image, index) => (
              <ImageCard
                key={image.id}
                image={image}
                scientificName={node.name}
                onOpen={() => setLightboxIndex(index)}
              />
            ))}
          </div>
        </div>
      </div>

      {lightboxIndex !== null && (
        <ImageLightbox
          images={detail.images}
          index={lightboxIndex}
          scientificName={node.name}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </section>
  );
}

/**
 * Öznitelik değerini gösterir.
 *
 * Boş değer satırı gizlemez; "veri yok" der ve GEREKÇESİNİ yazar. Bir araştırmacı için
 * "kaynakta yok" ile "henüz küratörlenmedi" arasındaki fark anlamlıdır.
 */
function AttributeValue({
  value,
  onSquareClick,
}: {
  value: AttrValue;
  onSquareClick: (code: DavisCode) => void;
}) {
  const { t } = useTranslation();

  switch (value.kind) {
    case 'text':
      return <>{value.text}</>;
    case 'list':
      return <>{value.items.join(', ')}</>;
    case 'squares':
      return (
        <span className="square-chips">
          {value.codes.map((code) => (
            <button
              key={code}
              type="button"
              className="square-chip"
              onClick={() => onSquareClick(code)}
              title={DAVIS_SQUARE_PROVINCES[code]?.join(', ')}
            >
              {code}
            </button>
          ))}
        </span>
      );
    case 'missing':
      return (
        <span className="attr-value--missing">
          {t('value.missing')} — {t(`value.missingReason.${value.reason}`)}
        </span>
      );
  }
}

function ImageCard({
  image,
  scientificName,
  onOpen,
}: {
  image: PlantImage;
  scientificName: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  // Yer tutucu görseller veri setinde taşınmaz, burada üretilir (bkz. placeholderImage.ts)
  const source = image.isPlaceholder
    ? placeholderImageUrl(scientificName, imageIndex(image.id))
    : image.thumbnailUrl;

  return (
    <figure className="gallery__item">
      <button type="button" className="gallery__item-button" onClick={onOpen} aria-label={t('image.open')}>
        <img src={source} alt={image.caption ?? ''} loading="lazy" />
      </button>
      <figcaption>
        {/* Lisans ve fotoğrafçı bilgisi her görselin altında zorunludur */}
        {image.isPlaceholder
          ? t('image.placeholder')
          : `${image.photographer ?? '—'} · ${image.license}`}
      </figcaption>
    </figure>
  );
}

/**
 * Görsel galerisi büyüteci — bir görsele tıklanınca açılır, ok tuşlarıyla/oklarla
 * diğer görseller arasında gezilir. `image.url` (thumbnailUrl değil) kullanılır.
 */
function ImageLightbox({
  images,
  index,
  scientificName,
  onClose,
  onNavigate,
}: {
  images: PlantImage[];
  index: number;
  scientificName: string;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const { t } = useTranslation();
  const image = images[index];
  const hasMultiple = images.length > 1;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowRight') onNavigate((index + 1) % images.length);
      else if (event.key === 'ArrowLeft') onNavigate((index - 1 + images.length) % images.length);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [index, images.length, onClose, onNavigate]);

  if (!image) return null;
  const source = image.isPlaceholder
    ? placeholderImageUrl(scientificName, imageIndex(image.id))
    : image.url;

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={t('image.open')}
      onClick={onClose}
      data-testid="image-lightbox"
    >
      <button
        type="button"
        className="lightbox__close"
        onClick={onClose}
        aria-label={t('detail.close')}
        data-testid="lightbox-close"
      >
        ×
      </button>

      {hasMultiple && (
        <button
          type="button"
          className="lightbox__nav lightbox__nav--prev"
          onClick={(event) => {
            event.stopPropagation();
            onNavigate((index - 1 + images.length) % images.length);
          }}
          aria-label={t('image.prev')}
        >
          ‹
        </button>
      )}

      <figure className="lightbox__figure" onClick={(event) => event.stopPropagation()}>
        <img src={source} alt={image.caption ?? ''} />
        <figcaption>
          {image.isPlaceholder ? t('image.placeholder') : image.attributionText}
          {hasMultiple && (
            <span className="lightbox__count">
              {' '}
              · {t('image.countOf', { current: index + 1, total: images.length })}
            </span>
          )}
        </figcaption>
      </figure>

      {hasMultiple && (
        <button
          type="button"
          className="lightbox__nav lightbox__nav--next"
          onClick={(event) => {
            event.stopPropagation();
            onNavigate((index + 1) % images.length);
          }}
          aria-label={t('image.next')}
        >
          ›
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Davis karesi paneli
 * ------------------------------------------------------------------ */

function SquarePanel({
  code,
  nodes,
  selection,
  endemicIds,
}: {
  code: DavisCode;
  nodes: TaxonNode[];
  selection: SelectionResult;
  endemicIds: Set<number>;
}) {
  const { t } = useTranslation();
  const selectSquare = useAppStore((s) => s.selectSquare);
  const selectSpecies = useAppStore((s) => s.selectSpecies);

  const stats = selection.statsBySquare.get(code);
  const speciesInSquare = [
    ...new Set(
      selection.occurrences.filter((o) => o.davisSquare === code).map((o) => o.taxonId),
    ),
  ]
    .map((id) => nodes[id])
    .filter((n): n is TaxonNode => Boolean(n))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));

  return (
    <section className="detail" data-testid="square-panel" aria-label={`${t('map.squareLabel')} ${code}`}>
      <header className="detail__header">
        <div className="detail__names">
          <h2 className="detail__sci" style={{ fontFamily: 'var(--font-mono)', fontStyle: 'normal' }}>
            {code}
          </h2>
          <p className="detail__vernacular">{DAVIS_SQUARE_PROVINCES[code]?.join(', ')}</p>
          <div className="detail__badges">
            <span className="badge badge--rank">
              {t('popup.speciesInSquare', { count: stats?.speciesCount ?? 0 })}
            </span>
            <span className="badge badge--rank">
              {t('popup.recordsInSquare', { count: stats?.occurrenceCount ?? 0 })}
            </span>
            {(stats?.endemicSpeciesCount ?? 0) > 0 && (
              <span className="badge badge--endemic">
                {t('popup.endemicInSquare', { count: stats?.endemicSpeciesCount ?? 0 })}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={() => selectSquare(null)}
          aria-label={t('detail.close')}
          data-testid="square-close"
        >
          ×
        </button>
      </header>

      <div className="detail__scroll">
        {speciesInSquare.length === 0 ? (
          <p className="empty-note">{t('legend.noData')}</p>
        ) : (
          <ul className="popup__list" data-testid="square-species-list">
            {speciesInSquare.map((node) => (
              <li key={node.id}>
                <button
                  type="button"
                  className="popup__item"
                  onClick={() => selectSpecies(node.id)}
                >
                  {node.name}
                  {endemicIds.has(node.id) && <span className="tree__endemic"> ●</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
