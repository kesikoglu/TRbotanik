import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlantDetail, TaxonNode } from '@trbotanik/shared';
import type { SelectionResult } from '../domain/filter';
import { displayVernacular } from '../domain/vernacular';
import { useAppStore } from '../state/useAppStore';
import { placeholderImageUrl } from './placeholderImage';

interface Props {
  province: string;
  nodes: TaxonNode[];
  details: Record<number, PlantDetail>;
  endemicIds: Set<number>;
  selection: SelectionResult;
}

export interface TableRow {
  node: TaxonNode;
  imageUrl: string;
  isPlaceholder: boolean;
  fullImageUrl: string | null;
  family: string | null;
  habit: string | null;
  isEndemic: boolean;
  iucn: string | null;
  flowering: string | null;
  records: number;
}

function familyOf(node: TaxonNode, nodes: TaxonNode[]): string | null {
  let current: TaxonNode | undefined = node;
  while (current) {
    if (current.rank === 'FAMILY') return current.name;
    current = current.parentId === null ? undefined : nodes[current.parentId];
  }
  return null;
}

function imageIndex(id: string): number {
  const parsed = Number(id.slice(id.lastIndexOf('-') + 1));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function ProvinceTable({ province, nodes, details, endemicIds, selection }: Props) {
  const { t, i18n } = useTranslation();
  const selectSpecies = useAppStore((s) => s.selectSpecies);
  const closeProvinceTable = useAppStore((s) => s.closeProvinceTable);
  const [exporting, setExporting] = useState(false);

  const rows = useMemo<TableRow[]>(() => {
    const recordsByTaxon = new Map<number, number>();
    for (const occ of selection.occurrences) {
      recordsByTaxon.set(occ.taxonId, (recordsByTaxon.get(occ.taxonId) ?? 0) + 1);
    }

    return [...selection.speciesIds]
      .map((id) => nodes[id])
      .filter((node): node is TaxonNode => Boolean(node))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
      .map((node) => {
        const detail = details[node.id];
        const image = detail?.images[0];
        const flowering = detail?.floweringPeriod.value
          ? t('value.monthRange', {
              start: t(`month.${detail.floweringPeriod.value.startMonth}`),
              end: t(`month.${detail.floweringPeriod.value.endMonth}`),
            })
          : null;

        return {
          node,
          imageUrl: image
            ? image.isPlaceholder
              ? placeholderImageUrl(node.name, imageIndex(image.id))
              : image.thumbnailUrl
            : placeholderImageUrl(node.name, 0),
          isPlaceholder: image ? image.isPlaceholder : true,
          fullImageUrl: image && !image.isPlaceholder ? image.url : null,
          family: familyOf(node, nodes),
          habit: detail?.habit.value ? t(`habit.${detail.habit.value}`) : null,
          isEndemic: endemicIds.has(node.id),
          iucn: detail?.iucn.value?.category ?? null,
          flowering,
          records: recordsByTaxon.get(node.id) ?? 0,
        };
      });
  }, [selection.speciesIds, selection.occurrences, nodes, details, endemicIds, t]);

  async function handleExport() {
    setExporting(true);
    try {
      const { buildProvinceWorkbook } = await import('./provinceExport');
      await buildProvinceWorkbook(province, rows, {
        sciName: t('provinceTable.colName'),
        vernacular: t('provinceTable.colVernacular'),
        family: t('provinceTable.colFamily'),
        habit: t('provinceTable.colHabit'),
        endemic: t('provinceTable.colEndemic'),
        iucn: t('provinceTable.colIucn'),
        flowering: t('provinceTable.colFlowering'),
        records: t('provinceTable.colRecords', { province }),
        image: t('provinceTable.colImageLink'),
        yes: t('value.yes'),
        no: t('value.no'),
        missing: t('value.missing'),
        openImage: t('provinceTable.openImage'),
        placeholder: t('image.placeholder'),
      }, i18n.language);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="province-table-overlay" role="dialog" aria-modal="true" data-testid="province-table">
      <div className="province-table">
        <header className="province-table__header">
          <div>
            <h2 className="province-table__title">{t('provinceTable.title', { province })}</h2>
            <p className="province-table__subtitle">
              {t('provinceTable.subtitle', { count: rows.length })}
            </p>
          </div>
          <div className="province-table__actions">
            <button
              type="button"
              className="chip"
              onClick={handleExport}
              disabled={exporting || rows.length === 0}
              data-testid="province-table-export"
            >
              {exporting ? t('provinceTable.exporting') : t('provinceTable.exportExcel')}
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={closeProvinceTable}
              aria-label={t('provinceTable.close')}
              data-testid="province-table-close"
            >
              ×
            </button>
          </div>
        </header>

        <div className="province-table__scroll">
          {rows.length === 0 ? (
            <p className="empty-note">{t('provinceTable.empty')}</p>
          ) : (
            <table className="province-table__grid">
              <thead>
                <tr>
                  <th>{t('provinceTable.colImage')}</th>
                  <th>{t('provinceTable.colName')}</th>
                  <th>{t('provinceTable.colVernacular')}</th>
                  <th>{t('provinceTable.colFamily')}</th>
                  <th>{t('provinceTable.colHabit')}</th>
                  <th>{t('provinceTable.colEndemic')}</th>
                  <th>{t('provinceTable.colIucn')}</th>
                  <th>{t('provinceTable.colFlowering')}</th>
                  <th>{t('provinceTable.colRecords', { province })}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ node, imageUrl, family, habit, isEndemic, iucn, flowering, records }) => (
                  <tr
                    key={node.id}
                    className="province-table__row"
                    onClick={() => {
                      selectSpecies(node.id);
                      closeProvinceTable();
                    }}
                    data-testid={`province-row-${node.id}`}
                  >
                    <td>
                      <img className="province-table__thumb" src={imageUrl} alt="" loading="lazy" />
                    </td>
                    <td className="province-table__sci">
                      {node.name}
                      {node.authorship && <span className="detail__author"> {node.authorship}</span>}
                    </td>
                    <td>{displayVernacular(node, i18n.language) ?? '—'}</td>
                    <td>{family ?? '—'}</td>
                    <td>{habit ?? t('value.missing')}</td>
                    <td>{isEndemic ? t('value.yes') : t('value.no')}</td>
                    <td>{iucn ?? t('value.missing')}</td>
                    <td>{flowering ?? t('value.missing')}</td>
                    <td>{records.toLocaleString('tr-TR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
