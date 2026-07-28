import { useEffect, useMemo, useRef } from 'react';
import maplibregl, { type Map as MapLibreMap, type StyleSpecification } from 'maplibre-gl';
import { DAVIS_CODES, davisSquareBounds, type DavisCode } from '@trbotanik/shared';
import type { Dataset } from '../data/dataset';
import { metricValue, type SelectionResult } from '../domain/filter';
import { useAppStore } from '../state/useAppStore';
import { resolveBasemap } from './basemaps';
import { CHOROPLETH_RAMP, MAP_COLORS, NO_DATA_COLOR, TURKIYE_VIEW_BOUNDS } from './theme';

const SRC_TURKIYE = 'turkiye';
const SRC_DAVIS = 'davis';
const SRC_POINTS = 'points';

const L_LAND = 'turkiye-land';
const L_LAND_LINE = 'turkiye-outline';
const L_DAVIS_FILL = 'davis-fill';
const L_DAVIS_LINE = 'davis-line';
const L_DAVIS_SELECTED = 'davis-selected';
const L_CLUSTERS = 'point-clusters';
const L_POINTS = 'point-single';
const L_HEATMAP = 'point-heatmap';

interface Props {
  dataset: Dataset;
  selection: SelectionResult;
}

/**
 * Tek MapLibre örneği; tüm kaynak ve katmanların sahibi.
 *
 * Tasarım kararları:
 * - Choropleth yeniden renklendirmesi `setFeatureState` ile yapılır; geometri asla
 *   yeniden yüklenmez, filtre değişimi tek karede uygulanır.
 * - Mod değişimi katmanları yeniden oluşturmaz, yalnızca `visibility` değiştirir.
 * - Kare etiketleri sembol katmanı yerine HTML işaretçisidir. Sembol katmanı MapLibre'de
 *   uzak bir `glyphs` adresi gerektirir; HTML işaretçisi bu ağ bağımlılığını tamamen
 *   ortadan kaldırır ve uygulama çevrimdışı da tam çalışır.
 */
export function MapCanvas({ dataset, selection }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);
  const labelMarkersRef = useRef<maplibregl.Marker[]>([]);
  const hoveredRef = useRef<DavisCode | null>(null);
  /** Kullanıcı haritayı elle kaydırdı/yakınlaştırdı mı — yeniden boyutlanmada görünümü korumak için */
  const userMovedRef = useRef(false);

  const mapMode = useAppStore((s) => s.mapMode);
  const metric = useAppStore((s) => s.metric);
  const selectedSquare = useAppStore((s) => s.selectedSquare);
  const selectSquare = useAppStore((s) => s.selectSquare);
  const selectSpecies = useAppStore((s) => s.selectSpecies);

  const basemap = useMemo(() => resolveBasemap(), []);

  /* ── Harita kurulumu (bir kez) ──────────────────────────────────── */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const style: StyleSpecification = {
      version: 8,
      // Sembol katmanı kullanmıyoruz; glyph adresi gerekmez (bkz. bileşen açıklaması).
      sources: { ...basemap.sources },
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': MAP_COLORS.background } },
        ...basemap.layers,
      ],
    };

    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      bounds: TURKIYE_VIEW_BOUNDS,
      fitBoundsOptions: { padding: 24 },
      maxZoom: basemap.maxZoom,
      minZoom: 4,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      /* Ülke sınırı */
      map.addSource(SRC_TURKIYE, { type: 'geojson', data: dataset.turkiye });
      if (basemap.drawLandFill) {
        map.addLayer({
          id: L_LAND,
          type: 'fill',
          source: SRC_TURKIYE,
          paint: { 'fill-color': MAP_COLORS.land },
        });
      }

      /* Davis kareleri — promoteId ile feature-state anahtarı `code` olur */
      map.addSource(SRC_DAVIS, {
        type: 'geojson',
        data: dataset.davisGrid,
        promoteId: 'code',
      });

      map.addLayer({
        id: L_DAVIS_FILL,
        type: 'fill',
        source: SRC_DAVIS,
        paint: {
          'fill-color': [
            'case',
            ['<', ['coalesce', ['feature-state', 'value'], 0], 1],
            NO_DATA_COLOR,
            [
              'interpolate',
              ['linear'],
              ['coalesce', ['feature-state', 'norm'], 0],
              ...CHOROPLETH_RAMP.flatMap((color, i) => [i / (CHOROPLETH_RAMP.length - 1), color]),
            ],
          ],
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            0.92,
            basemap.drawLandFill ? 0.85 : 0.62,
          ],
        },
      });

      map.addLayer({
        id: L_DAVIS_LINE,
        type: 'line',
        source: SRC_DAVIS,
        paint: { 'line-color': MAP_COLORS.gridLine, 'line-width': 1 },
      });

      map.addLayer({
        id: L_DAVIS_SELECTED,
        type: 'line',
        source: SRC_DAVIS,
        paint: {
          'line-color': MAP_COLORS.gridLineSelected,
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            2.5,
            ['boolean', ['feature-state', 'hover'], false],
            1.6,
            0,
          ],
        },
      });

      map.addLayer({
        id: L_LAND_LINE,
        type: 'line',
        source: SRC_TURKIYE,
        paint: { 'line-color': MAP_COLORS.landOutline, 'line-width': 1.2 },
      });

      /* Nokta katmanları */
      map.addSource(SRC_POINTS, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterRadius: 46,
        clusterMaxZoom: 11,
      });

      map.addLayer({
        id: L_HEATMAP,
        type: 'heatmap',
        source: SRC_POINTS,
        layout: { visibility: 'none' },
        paint: {
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 4, 14, 10, 40],
          'heatmap-opacity': 0.8,
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(0,0,0,0)',
            0.2, CHOROPLETH_RAMP[1]!,
            0.45, CHOROPLETH_RAMP[3]!,
            0.7, CHOROPLETH_RAMP[5]!,
            1, CHOROPLETH_RAMP[7]!,
          ],
        },
      });

      map.addLayer({
        id: L_CLUSTERS,
        type: 'circle',
        source: SRC_POINTS,
        filter: ['has', 'point_count'],
        layout: { visibility: 'none' },
        paint: {
          'circle-color': MAP_COLORS.cluster,
          'circle-opacity': 0.72,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': 'rgba(255,255,255,0.55)',
          // Kümedeki nokta sayısına göre yarıçap — sayı etiketi için glyph gerekmez
          'circle-radius': ['step', ['get', 'point_count'], 9, 10, 13, 50, 18, 200, 24, 800, 30],
        },
      });

      map.addLayer({
        id: L_POINTS,
        type: 'circle',
        source: SRC_POINTS,
        filter: ['!', ['has', 'point_count']],
        layout: { visibility: 'none' },
        paint: {
          'circle-color': [
            'match',
            ['get', 'src'],
            'community', MAP_COLORS.pointCommunity,
            MAP_COLORS.pointGbif,
          ],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2.6, 10, 6],
          'circle-opacity': 0.85,
          'circle-stroke-width': 0.6,
          'circle-stroke-color': 'rgba(0,0,0,0.5)',
        },
      });

      /* Etkileşim */
      map.on('mousemove', L_DAVIS_FILL, (event) => {
        const code = event.features?.[0]?.properties?.['code'] as DavisCode | undefined;
        if (!code || code === hoveredRef.current) return;
        if (hoveredRef.current) {
          map.setFeatureState({ source: SRC_DAVIS, id: hoveredRef.current }, { hover: false });
        }
        hoveredRef.current = code;
        map.setFeatureState({ source: SRC_DAVIS, id: code }, { hover: true });
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', L_DAVIS_FILL, () => {
        if (hoveredRef.current) {
          map.setFeatureState({ source: SRC_DAVIS, id: hoveredRef.current }, { hover: false });
          hoveredRef.current = null;
        }
        map.getCanvas().style.cursor = '';
      });

      map.on('click', L_DAVIS_FILL, (event) => {
        const code = event.features?.[0]?.properties?.['code'] as DavisCode | undefined;
        if (code) {
          selectSquare(code);
          selectSpecies(null);
        }
      });

      map.on('click', L_POINTS, (event) => {
        const taxonId = event.features?.[0]?.properties?.['taxonId'];
        if (typeof taxonId === 'number') selectSpecies(taxonId);
      });

      map.on('click', L_CLUSTERS, (event) => {
        const feature = event.features?.[0];
        if (!feature) return;
        map.easeTo({
          center: (feature.geometry as GeoJSON.Point).coordinates as [number, number],
          zoom: Math.min(map.getZoom() + 2, basemap.maxZoom),
        });
      });

      for (const layer of [L_POINTS, L_CLUSTERS]) {
        map.on('mouseenter', layer, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layer, () => {
          map.getCanvas().style.cursor = '';
        });
      }

      /* Kare etiketleri — HTML işaretçisi, glyph gerekmez */
      for (const feature of dataset.davisGrid.features) {
        const code = feature.properties?.['code'] as DavisCode | undefined;
        const labelPoint = feature.properties?.['labelPoint'] as [number, number] | undefined;
        if (!code || !labelPoint) continue;
        const element = document.createElement('span');
        element.className = 'davis-label';
        element.textContent = code;
        const marker = new maplibregl.Marker({ element, anchor: 'center' })
          .setLngLat(labelPoint)
          .addTo(map);
        labelMarkersRef.current.push(marker);
      }

      readyRef.current = true;
      map.fire('trbotanik.ready');
      containerRef.current?.setAttribute('data-map-ready', 'true');
    });

    mapRef.current = map;

    /**
     * Detay paneli açılıp kapandığında harita bölmesinin genişliği değişir.
     *
     * MapLibre kendi kendine yeniden boyutlanmaz ve `resize()` merkez ile
     * yakınlaştırmayı koruduğu için bölme daraldığında ülkenin bir kısmı görünürden
     * çıkar. Kullanıcı haritayı henüz elle oynatmadıysa Türkiye görünümüne geri
     * oturtuyoruz; oynattıysa onun seçtiği görünüme dokunmuyoruz.
     */
    map.on('dragstart', () => {
      userMovedRef.current = true;
    });
    map.on('zoomstart', (event) => {
      // `originalEvent` yalnızca kullanıcı etkileşimlerinde bulunur; programatik
      // fitBounds çağrıları bayrağı tetiklemez.
      if ((event as { originalEvent?: unknown }).originalEvent) userMovedRef.current = true;
    });

    const observer = new ResizeObserver(() => {
      map.resize();
      if (!userMovedRef.current) {
        map.fitBounds(TURKIYE_VIEW_BOUNDS, { padding: 24, duration: 0 });
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      for (const marker of labelMarkersRef.current) marker.remove();
      labelMarkersRef.current = [];
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // dataset ve basemap oturum boyunca sabittir; harita yalnızca bir kez kurulur
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Choropleth: filtre veya ölçüt değişince feature-state güncelle ─ */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const update = () => {
      const values = new Map<DavisCode, number>();
      let max = 0;
      for (const code of DAVIS_CODES) {
        const stats = selection.statsBySquare.get(code);
        const value = stats ? metricValue(stats, metric) : 0;
        values.set(code, value);
        if (value > max) max = value;
      }

      for (const code of DAVIS_CODES) {
        const value = values.get(code) ?? 0;
        // Karekök ölçekleme: birkaç yoğun karenin geri kalanı ezmesini engeller
        const norm = max > 0 ? Math.sqrt(value / max) : 0;
        map.setFeatureState({ source: SRC_DAVIS, id: code }, { value, norm });
      }
    };

    if (readyRef.current) update();
    else map.once('trbotanik.ready', update);
  }, [selection, metric]);

  /* ── Nokta verisi ────────────────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const update = () => {
      const source = map.getSource(SRC_POINTS) as maplibregl.GeoJSONSource | undefined;
      if (!source) return;
      source.setData({
        type: 'FeatureCollection',
        features: selection.occurrences.map((occ) => ({
          type: 'Feature' as const,
          properties: {
            id: occ.id,
            taxonId: occ.taxonId,
            src: occ.source === 'community' ? 'community' : 'gbif',
          },
          geometry: { type: 'Point' as const, coordinates: [occ.lon, occ.lat] },
        })),
      });
    };

    if (readyRef.current) update();
    else map.once('trbotanik.ready', update);
  }, [selection]);

  /* ── Mod değişimi: katmanları yeniden kurmadan görünürlük değiştir ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const update = () => {
      const show = (layer: string, visible: boolean) => {
        if (map.getLayer(layer)) {
          map.setLayoutProperty(layer, 'visibility', visible ? 'visible' : 'none');
        }
      };
      const isDavis = mapMode === 'davis';
      show(L_DAVIS_FILL, isDavis);
      show(L_DAVIS_LINE, true);
      show(L_CLUSTERS, mapMode === 'points');
      show(L_POINTS, mapMode === 'points');
      show(L_HEATMAP, mapMode === 'heatmap');
      for (const marker of labelMarkersRef.current) {
        marker.getElement().style.display = isDavis ? '' : 'none';
      }
    };

    if (readyRef.current) update();
    else map.once('trbotanik.ready', update);
  }, [mapMode]);

  /* ── Seçili kare vurgusu ─────────────────────────────────────────── */
  const previousSquareRef = useRef<DavisCode | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const update = () => {
      if (previousSquareRef.current) {
        map.setFeatureState(
          { source: SRC_DAVIS, id: previousSquareRef.current },
          { selected: false },
        );
      }
      if (selectedSquare) {
        map.setFeatureState({ source: SRC_DAVIS, id: selectedSquare }, { selected: true });
      }
      previousSquareRef.current = selectedSquare;
    };

    if (readyRef.current) update();
    else map.once('trbotanik.ready', update);
  }, [selectedSquare]);

  return <div ref={containerRef} className="map-canvas" data-testid="map-canvas" />;
}

/** Harita görünümünü bir Davis karesine yakınlaştırır. */
export function useZoomToSquare() {
  return (map: MapLibreMap | null, code: DavisCode) => {
    if (!map) return;
    const [west, south, east, north] = davisSquareBounds(code);
    map.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: 60, duration: 600 },
    );
  };
}
