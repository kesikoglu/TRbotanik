import { create } from 'zustand';
import type { DavisCode } from '@trbotanik/shared';
import { EMPTY_FILTER, type ChoroplethMetric, type FilterState } from '../domain/filter';

export type MapMode = 'davis' | 'points' | 'heatmap';

interface AppState {
  filter: FilterState;
  mapMode: MapMode;
  metric: ChoroplethMetric;
  selectedSpeciesId: number | null;
  selectedSquare: DavisCode | null;
  expandedNodes: Set<number>;

  setQuery: (query: string) => void;
  toggleTaxon: (id: number) => void;
  clearFilter: () => void;
  toggleEndemicOnly: () => void;
  toggleWithRecordsOnly: () => void;
  setMapMode: (mode: MapMode) => void;
  setMetric: (metric: ChoroplethMetric) => void;
  selectSpecies: (id: number | null) => void;
  selectSquare: (code: DavisCode | null) => void;
  toggleExpanded: (id: number) => void;
  expandMany: (ids: Iterable<number>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  filter: EMPTY_FILTER,
  mapMode: 'davis',
  metric: 'species',
  selectedSpeciesId: null,
  selectedSquare: null,
  expandedNodes: new Set<number>(),

  setQuery: (query) => set((state) => ({ filter: { ...state.filter, query } })),

  toggleTaxon: (id) =>
    set((state) => {
      const selected = new Set(state.filter.selectedTaxonIds);
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      return { filter: { ...state.filter, selectedTaxonIds: [...selected] } };
    }),

  clearFilter: () => set({ filter: EMPTY_FILTER, selectedSquare: null }),

  toggleEndemicOnly: () =>
    set((state) => ({ filter: { ...state.filter, endemicOnly: !state.filter.endemicOnly } })),

  toggleWithRecordsOnly: () =>
    set((state) => ({
      filter: { ...state.filter, withRecordsOnly: !state.filter.withRecordsOnly },
    })),

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
}));
