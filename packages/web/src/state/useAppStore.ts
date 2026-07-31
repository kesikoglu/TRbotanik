import { create } from 'zustand';
import type { DavisCode } from '@trbotanik/shared';
import { EMPTY_FILTER, type ChoroplethMetric, type FilterState } from '../domain/filter';
import { resolveBasemap } from '../map/basemaps';

export type MapMode = 'davis' | 'points' | 'heatmap';

const BASEMAP_STORAGE_KEY = 'trbotanik.basemap';

function initialBasemapId(): string {
  try {
    const stored = localStorage.getItem(BASEMAP_STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // localStorage erişilemiyor olabilir (gizli sekme, katı çerez politikası)
  }
  return resolveBasemap().id;
}

interface AppState {
  filter: FilterState;
  mapMode: MapMode;
  metric: ChoroplethMetric;
  selectedSpeciesId: number | null;
  selectedSquare: DavisCode | null;
  expandedNodes: Set<number>;
  basemapId: string;
  /** Etkin altlığın karoları yüklenemedi mi — kullanıcıya sessizce boş harita gösterilmez */
  basemapTileError: boolean;
  /** İl seçilince açılan takson tablosu görünür mü */
  provinceTableOpen: boolean;

  setQuery: (query: string) => void;
  toggleTaxon: (id: number) => void;
  clearFilter: () => void;
  toggleEndemicOnly: () => void;
  toggleWithRecordsOnly: () => void;
  setProvince: (province: string | null) => void;
  openProvinceTable: () => void;
  closeProvinceTable: () => void;
  setMapMode: (mode: MapMode) => void;
  setMetric: (metric: ChoroplethMetric) => void;
  selectSpecies: (id: number | null) => void;
  selectSquare: (code: DavisCode | null) => void;
  toggleExpanded: (id: number) => void;
  expandMany: (ids: Iterable<number>) => void;
  setBasemap: (id: string) => void;
  setBasemapTileError: (hasError: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  filter: EMPTY_FILTER,
  mapMode: 'davis',
  metric: 'species',
  selectedSpeciesId: null,
  selectedSquare: null,
  expandedNodes: new Set<number>(),
  basemapId: initialBasemapId(),
  basemapTileError: false,
  provinceTableOpen: false,

  setQuery: (query) => set((state) => ({ filter: { ...state.filter, query } })),

  toggleTaxon: (id) =>
    set((state) => {
      const selected = new Set(state.filter.selectedTaxonIds);
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      return { filter: { ...state.filter, selectedTaxonIds: [...selected] } };
    }),

  clearFilter: () => set({ filter: EMPTY_FILTER, selectedSquare: null, provinceTableOpen: false }),

  toggleEndemicOnly: () =>
    set((state) => ({ filter: { ...state.filter, endemicOnly: !state.filter.endemicOnly } })),

  toggleWithRecordsOnly: () =>
    set((state) => ({
      filter: { ...state.filter, withRecordsOnly: !state.filter.withRecordsOnly },
    })),

  setProvince: (province) =>
    set((state) => ({
      filter: { ...state.filter, province },
      // İl seçilince tablo kendiliğinden açılır; temizlenince kapanır.
      provinceTableOpen: province !== null,
    })),
  openProvinceTable: () => set({ provinceTableOpen: true }),
  closeProvinceTable: () => set({ provinceTableOpen: false }),

  setMapMode: (mapMode) => set({ mapMode }),
  setMetric: (metric) => set({ metric }),
  selectSpecies: (selectedSpeciesId) => set({ selectedSpeciesId }),
  selectSquare: (selectedSquare) => set({ selectedSquare }),

  toggleExpanded: (id) =>
    set((state) => {
      const expanded = new Set(state.expandedNodes);
      if (expanded.has(id)) expanded.delete(id);
      else expanded.add(id);
      return { expandedNodes: expanded };
    }),

  expandMany: (ids) =>
    set((state) => {
      const expanded = new Set(state.expandedNodes);
      for (const id of ids) expanded.add(id);
      return { expandedNodes: expanded };
    }),

  setBasemap: (id) => {
    try {
      localStorage.setItem(BASEMAP_STORAGE_KEY, id);
    } catch {
      // yoksayılabilir
    }
    set({ basemapId: id, basemapTileError: false });
  },

  setBasemapTileError: (basemapTileError) => set({ basemapTileError }),
}));
