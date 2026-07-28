import type {
  DavisCode,
  MissingReason,
  PlantDetail,
  SourceId,
  Sourced,
} from '@trbotanik/shared';

/**
 * Öznitelik tablosunun tanımı.
 *
 * Tablo bu şemadan sürülür; yeni bir öznitelik eklemek bir kayıt + bir i18n metni
 * demektir, JSX değişikliği gerekmez.
 *
 * Tasarım kararı: boş öznitelik satırı GİZLENMEZ. Bir araştırmacı için "bu alan
 * kaynakta yok" ile "bu alan henüz küratörlenmedi" arasındaki fark önemlidir; satırın
 * hiç görünmemesi bu bilgiyi yok eder.
 */

export type AttrValue =
  | { kind: 'text'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'squares'; codes: DavisCode[] }
  | { kind: 'missing'; reason: MissingReason };

export interface AttributeRow {
  key: string;
  labelKey: string;
  value: AttrValue;
  source?: SourceId;
}

export interface AttributeGroup {
  titleKey: string;
  rows: AttributeRow[];
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

function missing(detail: PlantDetail, key: string): AttrValue {
  return { kind: 'missing', reason: detail.missingReasons[key] ?? 'kaynakta-yok' };
}

/** `Sourced<T>` alanını satıra çevirir; değer boşsa gerekçeli "veri yok" üretir. */
function row<T>(
  detail: PlantDetail,
  key: string,
  labelKey: string,
  field: Sourced<T> | undefined,
  format: (value: NonNullable<T>) => AttrValue,
): AttributeRow {
  const value = field?.value;
  const isEmpty =
    value === null ||
    value === undefined ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === 'string' && value.trim() === '');

  return {
    key,
    labelKey,
    value: isEmpty ? missing(detail, key) : format(value as NonNullable<T>),
    source: field?.provenance?.source,
  };
}

const text = (value: string): AttrValue => ({ kind: 'text', text: value });

export function buildAttributeGroups(detail: PlantDetail, t: Translate): AttributeGroup[] {
  const monthRange = (r: { startMonth: number; endMonth: number }): AttrValue =>
    text(
      t('value.monthRange', {
        start: t(`month.${r.startMonth}`),
        end: t(`month.${r.endMonth}`),
      }),
    );

  const classification = detail.classification?.value;

  return [
    {
      titleKey: 'detail.groupNomenclature',
      rows: [
        row(detail, 'acceptedName', 'attr.acceptedName', detail.acceptedName, text),
        row(detail, 'authorship', 'attr.authorship', detail.authorship, text),
        row(detail, 'taxonomicStatus', 'attr.taxonomicStatus', detail.taxonomicStatus, text),
        row(detail, 'synonyms', 'attr.synonyms', detail.synonyms, (list) => ({
          kind: 'list',
          items: list.map((s) => [s.name, s.authorship].filter(Boolean).join(' ')),
        })),
        row(detail, 'publishedIn', 'attr.publishedIn', detail.publishedIn, text),
      ],
    },
    {
      titleKey: 'detail.groupClassification',
      rows: [
        {
          key: 'class',
          labelKey: 'attr.class',
          value: classification?.class ? text(classification.class) : missing(detail, 'class'),
          source: detail.classification?.provenance?.source,
        },
        {
          key: 'order',
          labelKey: 'attr.order',
          value: classification?.order ? text(classification.order) : missing(detail, 'order'),
          source: detail.classification?.provenance?.source,
        },
        {
          key: 'family',
          labelKey: 'attr.family',
          value: classification?.family ? text(classification.family) : missing(detail, 'family'),
          source: detail.classification?.provenance?.source,
        },
        {
          key: 'genus',
          labelKey: 'attr.genus',
          value: classification?.genus ? text(classification.genus) : missing(detail, 'genus'),
          source: detail.classification?.provenance?.source,
        },
        row(detail, 'vernacularTr', 'attr.vernacularTr', detail.vernacularTr, (list) => ({
          kind: 'list',
          items: list.map((v) => (v.region ? `${v.name} (${v.region})` : v.name)),
        })),
        row(detail, 'vernacularEn', 'attr.vernacularEn', detail.vernacularEn, (list) => ({
          kind: 'list',
          items: list,
        })),
      ],
    },
    {
      titleKey: 'detail.groupBiology',
      rows: [
        row(detail, 'habit', 'attr.habit', detail.habit, (h) => text(t(`habit.${h}`))),
        row(detail, 'lifeForm', 'attr.lifeForm', detail.lifeForm, (l) => text(String(l))),
        row(detail, 'habitat', 'attr.habitat', detail.habitat, text),
        row(detail, 'altitudeRange', 'attr.altitudeRange', detail.altitudeRange, (a) =>
          text(t('value.metersRange', { min: a.minM, max: a.maxM })),
        ),
        row(detail, 'floweringPeriod', 'attr.floweringPeriod', detail.floweringPeriod, monthRange),
        row(detail, 'fruitingPeriod', 'attr.fruitingPeriod', detail.fruitingPeriod, monthRange),
        row(detail, 'substrate', 'attr.substrate', detail.substrate, text),
      ],
    },
    {
      titleKey: 'detail.groupConservation',
      rows: [
        {
          key: 'endemism',
          labelKey: 'attr.endemism',
          // Endemizm "bilinmiyor" olabilir; bu durumda false göstermek yanıltıcı olur
          value: detail.missingReasons['endemism']
            ? missing(detail, 'endemism')
            : text(
                detail.endemism?.value?.isEndemicToTurkiye
                  ? t('value.endemicYes')
                  : t('value.endemicNo'),
              ),
          source: detail.endemism?.provenance?.source,
        },
        row(detail, 'iucn', 'attr.iucn', detail.iucn, (i) =>
          text(`${i.category}${i.criteria ? ` ${i.criteria}` : ''} (${i.scope})`),
        ),
        row(detail, 'floristicElement', 'attr.floristicElement', detail.floristicElement, (list) => ({
          kind: 'list',
          items: list,
        })),
        row(detail, 'davisSquares', 'attr.davisSquaresLiterature', detail.davisSquares, (codes) => ({
          kind: 'squares',
          codes,
        })),
      ],
    },
    {
      titleKey: 'detail.groupDistribution',
      rows: [
        {
          key: 'davisSquaresObserved',
          labelKey: 'attr.davisSquaresObserved',
          value:
            detail.observedDavisSquares.length > 0
              ? { kind: 'squares', codes: detail.observedDavisSquares }
              : { kind: 'missing', reason: 'kaynakta-yok' },
          source: 'inferred',
        },
        {
          key: 'occurrenceCount',
          labelKey: 'attr.occurrenceCount',
          value: text(detail.distribution.occurrenceCount.toLocaleString('tr-TR')),
          source: 'inferred',
        },
        {
          key: 'yearRange',
          labelKey: 'attr.yearRange',
          value:
            detail.distribution.firstRecordYear && detail.distribution.lastRecordYear
              ? text(
                  t('value.yearRange', {
                    start: detail.distribution.firstRecordYear,
                    end: detail.distribution.lastRecordYear,
                  }),
                )
              : { kind: 'missing', reason: 'kaynakta-yok' },
          source: 'inferred',
        },
        {
          key: 'elevationObserved',
          labelKey: 'attr.elevationObserved',
          value: detail.distribution.elevationObserved
            ? text(
                t('value.metersRange', {
                  min: detail.distribution.elevationObserved.minM,
                  max: detail.distribution.elevationObserved.maxM,
                }),
              )
            : { kind: 'missing', reason: 'kaynakta-yok' },
          source: 'inferred',
        },
      ],
    },
  ];
}
