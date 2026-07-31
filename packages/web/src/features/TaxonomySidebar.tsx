import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { TaxonNode } from '@trbotanik/shared';
import { normalizeTr, type SelectionResult } from '../domain/filter';
import { useAppStore } from '../state/useAppStore';

interface Props {
  nodes: TaxonNode[];
  rootIds: number[];
  endemicIds: Set<number>;
  selection: SelectionResult;
  /** En az bir kaydı olan iller — il filtresi seçeneklerini doldurur */
  provinces: string[];
}

interface Row {
  node: TaxonNode;
  depth: number;
  hasChildren: boolean;
}

/** Bu tür sayısının altında kalan sonuçlarda ağaç kendiliğinden açılır. */
const AUTO_EXPAND_THRESHOLD = 25;

/**
 * Görünür ağaç satırlarını düzleştirir.
 *
 * Yalnızca genişletilmiş alt ağaçlar satır üretir; 11.000 düğümlük gerçek taksonomide
 * de aynı yaklaşım çalışır çünkü kapalı dalların maliyeti yoktur.
 */
function flatten(
  nodes: TaxonNode[],
  rootIds: number[],
  expanded: Set<number>,
  visible: Set<number>,
): Row[] {
  const rows: Row[] = [];

  const walk = (id: number, depth: number) => {
    const node = nodes[id];
    if (!node || !visible.has(id)) return;

    const children = node.childIds.filter((childId) => visible.has(childId));
    rows.push({ node, depth, hasChildren: children.length > 0 });

    if (expanded.has(id)) {
      for (const childId of children) walk(childId, depth + 1);
    }
  };

  for (const rootId of rootIds) walk(rootId, 0);
  return rows;
}

export function TaxonomySidebar({ nodes, rootIds, endemicIds, selection, provinces }: Props) {
  const { t } = useTranslation();

  const filter = useAppStore((s) => s.filter);
  const expandedNodes = useAppStore((s) => s.expandedNodes);
  const selectedSpeciesId = useAppStore((s) => s.selectedSpeciesId);
  const setQuery = useAppStore((s) => s.setQuery);
  const toggleTaxon = useAppStore((s) => s.toggleTaxon);
  const clearFilter = useAppStore((s) => s.clearFilter);
  const toggleEndemicOnly = useAppStore((s) => s.toggleEndemicOnly);
  const toggleWithRecordsOnly = useAppStore((s) => s.toggleWithRecordsOnly);
  const setProvince = useAppStore((s) => s.setProvince);
  const toggleExpanded = useAppStore((s) => s.toggleExpanded);
  const expandMany = useAppStore((s) => s.expandMany);
  const selectSpecies = useAppStore((s) => s.selectSpecies);
  const selectSquare = useAppStore((s) => s.selectSquare);

  const treeRef = useRef<HTMLUListElement>(null);
  const rowRefs = useRef(new Map<number, HTMLLIElement>());

  /**
   * Sonuç kümesi yeterince daraldığında eşleşenlerin yolunu otomatik aç.
   *
   * Arama veya faset filtresi sonucu bir avuç türe indiğinde, kullanıcının sonucu
   * görmek için ağacı elle açması gereksiz bir engeldir. Eşik tür sayısına bağlıdır,
   * düğüm sayısına değil: 11.000 taksonluk gerçek veri setinde de aynı davranış
   * geçerli olur ve geniş seçimlerde ağaç kendiliğinden açılmaz.
   */
  useEffect(() => {
    if (selection.totals.species === 0 || selection.totals.species > AUTO_EXPAND_THRESHOLD) return;
    const toExpand: number[] = [];
    for (const id of selection.visibleTaxonIds) {
      const node = nodes[id];
      if (node && node.rank !== 'SPECIES') toExpand.push(id);
    }
    if (toExpand.length > 0) expandMany(toExpand);
  }, [selection.totals.species, selection.visibleTaxonIds, nodes, expandMany]);

  // Açılışta sınıf ve takım düzeyini açık göster
  useEffect(() => {
    const initial = nodes.filter((n) => n.rank === 'CLASS' || n.rank === 'ORDER').map((n) => n.id);
    expandMany(initial);
  }, [nodes, expandMany]);

  const rows = useMemo(
    () => flatten(nodes, rootIds, expandedNodes, selection.visibleTaxonIds),
    [nodes, rootIds, expandedNodes, selection.visibleTaxonIds],
  );

  /**
   * Arama sorgusuna DOĞRUDAN uyan düğümler (atalar üzerinden değil, kendi adı/
   * Türkçe adıyla) — bunlar `tree__row--match` ile vurgulanır ve ilki otomatik
   * görünür alana kaydırılır. `visibleTaxonIds` eşleşen türlerin TÜM atalarını
   * da içerdiği için (bkz. filter.ts), bu ayrım olmadan "eşleşme nerede?"
   * sorusu kullanıcı için ağacın derinliklerinde kaybolabiliyordu.
   */
  const query = filter.query.trim();
  const matchedIds = useMemo(() => {
    if (!query) return null;
    const needle = normalizeTr(query);
    const matched = new Set<number>();
    for (const id of selection.visibleTaxonIds) {
      const node = nodes[id];
      if (!node) continue;
      if (normalizeTr(`${node.name} ${node.vernacularTr ?? ''}`).includes(needle)) {
        matched.add(id);
      }
    }
    return matched;
  }, [query, selection.visibleTaxonIds, nodes]);

  useEffect(() => {
    if (!matchedIds || matchedIds.size === 0) return;
    const firstMatchId = rows.find((row) => matchedIds.has(row.node.id))?.node.id;
    if (firstMatchId === undefined) return;
    const element = rowRefs.current.get(firstMatchId);
    element?.scrollIntoView({ block: 'center' });
    // Yalnızca yeni bir arama sonucunda kaydır — kullanıcı elle kaydırınca tekrar
    // zıplamasın diye `rows` bağımlılıklara BİLEREK eklenmiyor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedIds]);

  const selectedIds = new Set(filter.selectedTaxonIds);
  const hasFilter =
    filter.selectedTaxonIds.length > 0 ||
    filter.query.trim() !== '' ||
    filter.endemicOnly ||
    filter.withRecordsOnly ||
    filter.province !== null;

  /**
   * Ağaçta bir üst taksonu (ör. sınıf) tekrar tıklamak seçimi genişletebilir
   * (DFS aralık birleşmesi sayesinde), ama bu görünmez bir davranıştır ve
   * kullanıcı üç ana başlığa (sınıflar) nasıl geri döneceğini bilemez —
   * gerçek kullanıcı geri bildirimiyle doğrulandı. Bu yüzden bir taksonomi
   * seçimi aktifken, kaydırma gerektirmeyen sabit bölgede her zaman görünür,
   * tek tıkla "tümünü göster" düğmesi eklendi.
   */
  const totalSpeciesCount = rootIds.reduce((sum, id) => sum + (nodes[id]?.speciesCount ?? 0), 0);

  return (
    <aside className="sidebar" data-testid="sidebar">
      <div className="sidebar__section">
        <label className="visually-hidden" htmlFor="taxon-search">
          {t('filter.searchLabel')}
        </label>
        <input
          id="taxon-search"
          className="search-box"
          type="search"
          value={filter.query}
          placeholder={t('filter.searchPlaceholder')}
          onChange={(event) => setQuery(event.target.value)}
          data-testid="taxon-search"
        />

        <label className="visually-hidden" htmlFor="province-filter">
          {t('filter.provinceLabel')}
        </label>
        <select
          id="province-filter"
          className="search-box select-box"
          value={filter.province ?? ''}
          onChange={(event) => setProvince(event.target.value || null)}
          data-testid="province-filter"
        >
          <option value="">{t('filter.provinceAll')}</option>
          {provinces.map((province) => (
            <option key={province} value={province}>
              {province}
            </option>
          ))}
        </select>

        <div className="filter-row">
          <button
            type="button"
            className={`chip${filter.endemicOnly ? ' chip--on' : ''}`}
            onClick={toggleEndemicOnly}
            aria-pressed={filter.endemicOnly}
            data-testid="facet-endemic"
          >
            {t('filter.endemicOnly')}
          </button>
          <button
            type="button"
            className={`chip${filter.withRecordsOnly ? ' chip--on' : ''}`}
            onClick={toggleWithRecordsOnly}
            aria-pressed={filter.withRecordsOnly}
          >
            {t('filter.withRecords')}
          </button>
          {hasFilter && (
            <button type="button" className="chip chip--clear" onClick={clearFilter} data-testid="clear-filter">
              {t('filter.clear')}
            </button>
          )}
        </div>
      </div>

      <div className="sidebar__section">
        <p className="sidebar__heading">
          {t('filter.taxonomy')} · {t('filter.resultCount', { count: selection.totals.species })}
        </p>
        {hasFilter && (
          <button
            type="button"
            className="back-to-all"
            onClick={clearFilter}
            data-testid="back-to-all"
          >
            {t('filter.backToAll', { count: totalSpeciesCount })}
          </button>
        )}
      </div>

      <div className="sidebar__section sidebar__section--grow">
        {rows.length === 0 ? (
          <p className="empty-note">{t('filter.noResults')}</p>
        ) : (
          <ul className="tree" data-testid="taxon-tree" ref={treeRef}>
            {rows.map(({ node, depth, hasChildren }) => {
              const isSpecies = node.rank === 'SPECIES';
              const isSelected = selectedIds.has(node.id) || selectedSpeciesId === node.id;
              const isExpanded = expandedNodes.has(node.id);
              const isMatch = matchedIds?.has(node.id) ?? false;

              return (
                <li
                  key={node.id}
                  ref={(element) => {
                    if (element) rowRefs.current.set(node.id, element);
                    else rowRefs.current.delete(node.id);
                  }}
                >
                  <button
                    type="button"
                    className={`tree__row${isSelected ? ' tree__row--selected' : ''}${isMatch ? ' tree__row--match' : ''}`}
                    style={{ paddingLeft: `${depth * 12 + 8}px` }}
                    data-testid={`taxon-${node.id}`}
                    onClick={() => {
                      if (isSpecies) {
                        selectSpecies(node.id);
                        selectSquare(null);
                      } else {
                        toggleTaxon(node.id);
                        if (!isExpanded) toggleExpanded(node.id);
                      }
                    }}
                  >
                    <span
                      className="tree__toggle"
                      onClick={(event) => {
                        if (!hasChildren) return;
                        event.stopPropagation();
                        toggleExpanded(node.id);
                      }}
                      role="presentation"
                    >
                      {hasChildren ? (isExpanded ? '▾' : '▸') : ''}
                    </span>

                    <span className={`tree__name${isSpecies ? ' tree__name--species' : ''}`}>
                      {node.name}
                      {node.vernacularTr && (
                        <span className="tree__vernacular"> · {node.vernacularTr}</span>
                      )}
                    </span>

                    {endemicIds.has(node.id) && (
                      <span className="tree__endemic" title={t('value.endemicYes')}>
                        ●
                      </span>
                    )}

                    {!isSpecies && <span className="tree__rank">{t(`rank.${node.rank}`)}</span>}

                    <span className="tree__count">{node.occurrenceCount.toLocaleString('tr-TR')}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
