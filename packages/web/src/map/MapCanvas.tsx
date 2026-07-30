import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import maplibregl, {
  type Map as MapLibreMap,
  type PropertyValueSpecification,
  type StyleSpecification,
} from 'maplibre-gl';
import { DAVIS_CODES, davisSquareBounds, type DavisCode } from '@trbotanik/shared';
import type { Dataset } from '../data/dataset';
import { metricValue, type SelectionResult } from '../domain/filter';
import { useAppStore } from '../state/useAppStore';
import { getBasemap, sampleTileUrl, type BasemapDefinition } from './basemaps';
import { CHOROPLETH_RAMP, MAP_COLORS, NO_DATA_COLOR, TURKIYE_VIEW_BOUNDS } from './theme';

const HTML_ESCAPE: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (ch) => HTML_ESCAPE[ch] ?? ch);
}

/** Bir yayılış noktasının (tür vurgusu katmanındaki pembe nokta) popup içeriğini üretir. */
function occurrencePopupHtml(
  props: Record<string, unknown>,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const province = props['province'] as string | null | undefined;
  const year = props['year'] as number | null | undefined;
  const elevationM = props['elevationM'] as number | null | undefined;
  const basisOfRecord = props['basisOfRecord'] as string | undefined;
  const source = props['source'] as string | undefined;

  const missing = t('value.missing');
  const rows: Array<[string, string]> = [
    [t('popup.fieldProvince'), province ? escapeHtml(province) : missing],
    [t('popup.fieldYear'), year != null ? String(year) : missing],
    [t('popup.fieldElevation'), elevationM != null ? `${elevationM} m` : missing],
    [
      t('popup.fieldBasis'),
      basisOfRecord ? escapeHtml(t(`basisOfRecord.${basisOfRecord}`)) : missing,
    ],
    [t('popup.fieldSource'), t(source === 'community' ? 'legend.pointsCommunity' : 'legend.pointsGbif')],
  ];

  return (
    `<p class="popup__title">${escapeHtml(t('popup.occurrenceTitle'))}</p>` +
    rows
      .map(([label, value]) => `<p class="popup__meta"><strong>${escapeHtml(label)}:</strong> ${value}</p>`)
      .join('')
  );
}

const SRC_TURKIYE = 'turkiye';
const SRC_DAVIS = 'davis';
const SRC_POINTS = 'points';
const SRC_SPECIES = 'species-highlight';
const SRC_BASEMAP_RASTER = 'basemap-raster';

const L_LAND = 'turkiye-land';
const L_LAND_LINE = 'turkiye-outline';
const L_DAVIS_FILL = 'davis-fill';
const L_DAVIS_LINE = 'davis-line';
const L_DAVIS_SELECTED = 'davis-selected';
const L_CLUSTERS = 'point-clusters';
const L_POINTS = 'point-single';
const L_HEATMAP = 'point-heatmap';
const L_SPECIES_HL = 'species-highlight-points';

interface Props {
  dataset: Dataset;
  selection: SelectionResult;
}

function davisFillOpacity(drawLandFill: boolean): PropertyValueSpecification<number> {
  return [
    'case',
    ['boolean', ['feature-state', 'hover'], false],
    0.92,
    drawLandFill ? 0.85 : 0.62,
  ];
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
 * - Altlık değişimi `map.setStyle()` ile TÜM katmanları silmez: yalnızca karo
 *   kaynağı/katmanı sökülüp yeniden takılır (bkz. `applyBasemap`). Bu, choropleth
 *   feature-state'lerini ve etkileşim dinleyicilerini korur.
 */
export function MapCanvas({ dataset, selection }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);
  const labelMarkersRef = useRef<maplibregl.Marker[]>([]);
  const hoveredRef = useRef<DavisCode | null>(null);
  /** Kullanıcı haritayı elle kaydırdı/yakınlaştırdı mı — yeniden boyutlanmada görünümü korumak için */
  const userMovedRef = useRef(false);
  /** Şu an takılı olan altlık tanımı — değişimde önce bunun katman/kaynakları sökülür */
  const currentBasemapRef = useRef<BasemapDefinition | null>(null);
  /** Yarışan erişilebilirlik denemelerinde yalnızca en sonuncusunun sonucu sayılır */
  const probeGenerationRef = useRef(0);
  /** Tür vurgusu noktasına tıklanınca açılan tekil popup — yenisi eskisinin yerini alır */
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const mapMode = useAppStore((s) => s.mapMode);
  const metric = useAppStore((s) => s.metric);
  const selectedSquare = useAppStore((s) => s.selectedSquare);
  const selectedSpeciesId = useAppStore((s) => s.selectedSpeciesId);
  const selectSquare = useAppStore((s) => s.selectSquare);
  const selectSpecies = useAppStore((s) => s.selectSpecies);
  const basemapId = useAppStore((s) => s.basemapId);
  const setBasemapTileError = useAppStore((s) => s.setBasemapTileError);

  // 'load' geri çağrısı yalnızca BİR KEZ kurulur (bkz. aşağıdaki useEffect([])) — bu
  // yüzden içindeki tıklama işleyicisi `t`'yi doğrudan yakalarsa dil değişiminde
  // güncellenmez. Ref üzerinden en güncel çeviri fonksiyonuna erişiyoruz.
  const { t } = useTranslation();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  /**
   * Etkin altlığın karo kaynağını/katmanını takar.
   *
   * Önceki altlığın katman ve kaynakları önce sökülür; yeni raster katmanı `L_LAND`'in
   * hemen altına eklenir (görsel olarak Davis/sınır katmanlarının altında kalır).
   * `map.setStyle()` KULLANILMAZ — o, tüm choropleth feature-state'lerini ve bizim
   * eklediğimiz her şeyi sıfırlardı.
   */
  function applyBasemap(map: MapLibreMap, def: BasemapDefinition) {
    const previous = currentBasemapRef.current;
    if (previous) {
      for (const layer of previous.layers) {
        if (map.getLayer(layer.id)) map.removeLayer(layer.id);
      }
      for (const sourceId of Object.keys(previous.sources)) {
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      }
    }

    for (const [sourceId, source] of Object.entries(def.sources)) {
      if (!map.getSource(sourceId)) map.addSource(sourceId, source);
    }
    for (const layer of def.layers) {
      if (!map.getLayer(layer.id) && map.getLayer(L_LAND)) map.addLayer(layer, L_LAND);
    }

    if (map.getLayer(L_LAND)) {
      map.setLayoutProperty(L_LAND, 'visibility', def.drawLandFill ? 'visible' : 'none');
    }
    if (map.getLayer(L_DAVIS_FILL)) {
      map.setPaintProperty(L_DAVIS_FILL, 'fill-opacity', davisFillOpacity(def.drawLandFill));
    }
    map.setMaxZoom(def.maxZoom);

    currentBasemapRef.current = def;
    setBasemapTileError(false);
    checkBasemapReachability(def);
  }

  /**
   * Karo sunucusuna bağımsız bir erişilebilirlik kontrolü.
   *
   * MapLibre'nin kendi olaylarına güvenilemediği için (yukarıdaki not) burada kendi
   * `fetch()` isteğimizi yapıyoruz. `mode: 'cors'` kasıtlıdır: sunucu CORS başlığı
   * göndermiyorsa bu istek de tıpkı MapLibre'nin WebGL doku yüklemesi gibi
   * reddedilir — yani gerçekte haritada göreceğimiz sorunu burada da yakalarız.
   * Kullanıcı hızlıca birden fazla altlık arasında geçiş yaparsa yalnızca en son
   * denemenin sonucu sayılır (`probeGenerationRef`).
   */
  function checkBasemapReachability(def: BasemapDefinition) {
    const url = sampleTileUrl(def);
    if (!url) return; // çevrimdışı altlığın karo kaynağı yok, kontrol edilecek bir şey yok

    const generation = ++probeGenerationRef.current;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    fetch(url, { mode: 'cors', cache: 'no-store', signal: controller.signal })
      .then((response) => {
        if (probeGenerationRef.current !== generation) return; // eskimiş deneme
        if (!response.ok) {
          console.warn(
            `[TRbotanik] "${def.id}" karo sunucusu HTTP ${response.status} döndü: ${url}`,
          );
          setBasemapTileError(true);
        } else {
          console.info(`[TRbotanik] "${def.id}" karo sunucusuna erişildi (HTTP ${response.status}): ${url}`);
        }
      })
      .catch((error: unknown) => {
        if (probeGenerationRef.current !== generation) return;
        // Tarayıcı burada CORS engeli ile DNS/ağ hatasını aynı jenerik
        // "Failed to fetch" TypeError'ıyla bildirir; ayırt etmenin tek yolu
        // Ağ (Network) sekmesinde isteğin gerçekten gidip gitmediğine bakmaktır.
        console.warn(
          `[TRbotanik] "${def.id}" karo sunucusuna ulaşılamadı (CORS engeli veya ağ hatası olabilir): ${url}`,
          error,
        );
        setBasemapTileError(true);
      })
      .finally(() => clearTimeout(timeoutId));
  }

  /* ── Harita kurulumu (bir kez) ──────────────────────────────────── */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialBasemap = getBasemap(useAppStore.getState().basemapId);

    const style: StyleSpecification = {
      version: 8,
      // Sembol katmanı kullanmıyoruz; glyph adresi gerekmez (bkz. bileşen açıklaması).
      // Altlık karoları burada değil, 'load' sonrası applyBasemap() ile eklenir —
      // böylece basemap değişimi de aynı kod yolunu kullanır.
      sources: {},
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': MAP_COLORS.background } }],
    };

    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      bounds: TURKIYE_VIEW_BOUNDS,
      fitBoundsOptions: { padding: 24 },
      maxZoom: initialBasemap.maxZoom,
      minZoom: 4,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      /* Ülke sınırı */
      map.addSource(SRC_TURKIYE, { type: 'geojson', data: dataset.turkiye });
      map.addLayer({
        id: L_LAND,
        type: 'fill',
        source: SRC_TURKIYE,
        layout: { visibility: initialBasemap.drawLandFill ? 'visible' : 'none' },
        paint: { 'fill-color': MAP_COLORS.land },
      });

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
          'fill-opacity': davisFillOpacity(initialBasemap.drawLandFill),
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
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'speciesMember'], false],
            MAP_COLORS.speciesHighlight,
            MAP_COLORS.gridLineSelected,
          ],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            2.5,
            ['boolean', ['feature-state', 'speciesMember'], false],
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

      /* Kenar çubuğundan seçilen türün konum vurgusu — mod ne olursa olsun görünür */
      map.addSource(SRC_SPECIES, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: L_SPECIES_HL,
        type: 'circle',
        source: SRC_SPECIES,
        paint: {
          'circle-color': MAP_COLORS.speciesHighlight,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 4.5, 10, 9],
          'circle-opacity': 0.95,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': 'rgba(10, 14, 12, 0.8)',
        },
      });

      /* Altlık karoları — L_LAND'in altına eklenir */
      applyBasemap(map, initialBasemap);

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
        if (!code) return;
        // Tür vurgusu (pembe nokta) her modda görünür ve bu dolgunun üzerinde durur;
        // tam o noktaya tıklanmışsa kare seçimine/tür temizlemeye geçme — L_SPECIES_HL
        // kendi işleyicisinde popup açacak, burada onu geçersiz kılmayalım.
        const hitHighlight = map.queryRenderedFeatures(event.point, { layers: [L_SPECIES_HL] }).length > 0;
        if (hitHighlight) return;
        selectSquare(code);
        selectSpecies(null);
      });

      map.on('click', L_POINTS, (event) => {
        const taxonId = event.features?.[0]?.properties?.['taxonId'];
        if (typeof taxonId === 'number') selectSpecies(taxonId);
      });

      map.on('click', L_SPECIES_HL, (event) => {
        const feature = event.features?.[0];
        if (!feature) return;
        const coordinates = (feature.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
        popupRef.current?.remove();
        popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '240px' })
          .setLngLat(coordinates)
          .setHTML(occurrencePopupHtml(feature.properties ?? {}, tRef.current))
          .addTo(map);
      });

      map.on('click', L_CLUSTERS, (event) => {
        const feature = event.features?.[0];
        if (!feature) return;
        map.easeTo({
          center: (feature.geometry as GeoJSON.Point).coordinates as [number, number],
          zoom: Math.min(map.getZoom() + 2, currentBasemapRef.current?.maxZoom ?? 12),
        });
      });

      for (const layer of [L_POINTS, L_CLUSTERS, L_SPECIES_HL]) {
        map.on('mouseenter', layer, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layer, () => {
          map.getCanvas().style.cursor = '';
        });
      }

      /**
       * Karo yükleme hatası — sessizce boş/gri harita bırakmak yerine kullanıcıya
       * bildirilir. Bu ortamdan doğrulanamayan uydu altlıklarının (bkz. basemaps.ts)
       * gerçek bir tarayıcıda çalışıp çalışmadığını da bu yoldan görebiliriz.
       */
      map.on('error', (event) => {
        const sourceId = (event as unknown as { sourceId?: string }).sourceId;
        if (sourceId === SRC_BASEMAP_RASTER) setBasemapTileError(true);
      });

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

      // Yalnızca e2e testleri için: harita örneğini pencereye açar, böylece Playwright
      // konum vurgusu / zoom davranışını DOM dışından da doğrulayabilir. Üretim
      // derlemesinde bu bayrak tanımlı değildir ve blok tamamen elenir.
      if (import.meta.env['VITE_EXPOSE_MAP_DEBUG'] === '1') {
        (window as unknown as { __trbotanikMap: MapLibreMap }).__trbotanikMap = map;
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
     * çıkar. Kullanıcı haritayı henüz elle oynatmadıysa (ya da bir türe/kareye
     * odaklanma gibi kasıtlı bir gezinme yapılmadıysa) Türkiye görünümüne geri
     * oturtuyoruz; aksi halde kullanıcının/uygulamanın seçtiği görünüme dokunmuyoruz.
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
      popupRef.current?.remove();
      popupRef.current = null;
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // dataset oturum boyunca sabittir; harita yalnızca bir kez kurulur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Altlık değişimi ─────────────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const update = () => applyBasemap(map, getBasemap(basemapId));

    if (readyRef.current) update();
    else map.once('trbotanik.ready', update);
    // applyBasemap her render'da yeniden oluşur ama yalnızca burada çağrılır;
    // eklenmesi gereken bağımlılık yalnızca hangi altlığın istendiğidir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemapId]);

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

  /* ── Seçili tür vurgusu — kenar çubuğundan bir tür seçilince yerini göster ── */
  const previousSpeciesSquaresRef = useRef<Set<DavisCode>>(new Set());
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const update = () => {
      const source = map.getSource(SRC_SPECIES) as maplibregl.GeoJSONSource | undefined;
      if (!source) return;

      // Tür değişince eski türün noktasına ait açık popup varsa (artık haritada
      // karşılığı olmayan bir noktaya bağlı) kapat.
      popupRef.current?.remove();
      popupRef.current = null;

      for (const code of previousSpeciesSquaresRef.current) {
        map.setFeatureState({ source: SRC_DAVIS, id: code }, { speciesMember: false });
      }
      previousSpeciesSquaresRef.current = new Set();

      if (selectedSpeciesId === null) {
        source.setData({ type: 'FeatureCollection', features: [] });
        return;
      }

      // Aktif taksonomi/faset filtresinden BAĞIMSIZ olarak, veri setinin tamamından bu
      // taksonun kayıtlarını alıyoruz — kullanıcı dar bir filtre uygulasa bile "bu tür
      // nerede?" sorusunun yanıtı her zaman eksiksiz olsun.
      const occurrences = dataset.occurrences.filter((o) => o.taxonId === selectedSpeciesId);

      source.setData({
        type: 'FeatureCollection',
        features: occurrences.map((occ) => ({
          type: 'Feature' as const,
          properties: {
            id: occ.id,
            province: occ.province,
            year: occ.year,
            elevationM: occ.elevationM,
            basisOfRecord: occ.basisOfRecord,
            source: occ.source,
          },
          geometry: { type: 'Point' as const, coordinates: [occ.lon, occ.lat] },
        })),
      });

      const squares = new Set<DavisCode>();
      let minLon = Infinity;
      let minLat = Infinity;
      let maxLon = -Infinity;
      let maxLat = -Infinity;
      for (const occ of occurrences) {
        if (occ.davisSquare) squares.add(occ.davisSquare);
        minLon = Math.min(minLon, occ.lon);
        maxLon = Math.max(maxLon, occ.lon);
        minLat = Math.min(minLat, occ.lat);
        maxLat = Math.max(maxLat, occ.lat);
      }

      // Georeferanslı kaydı olmayan bir takson için, literatürde bildirilen Davis
      // karelerine düşülür (Faz 6'da GBIF verisiyle bu durum gerçekten oluşabilir).
      if (occurrences.length === 0) {
        const literatureSquares = dataset.details[selectedSpeciesId]?.davisSquares.value ?? [];
        for (const code of literatureSquares) {
          squares.add(code);
          const [w, s, e, n] = davisSquareBounds(code);
          minLon = Math.min(minLon, w);
          maxLon = Math.max(maxLon, e);
          minLat = Math.min(minLat, s);
          maxLat = Math.max(maxLat, n);
        }
      }

      for (const code of squares) {
        map.setFeatureState({ source: SRC_DAVIS, id: code }, { speciesMember: true });
      }
      previousSpeciesSquaresRef.current = squares;

      if (Number.isFinite(minLon) && Number.isFinite(minLat)) {
        // Kasıtlı bir odaklanma; sonraki panel-yeniden-boyutlandırmada Türkiye
        // görünümüne sıfırlanmasın (bkz. ResizeObserver açıklaması yukarıda).
        userMovedRef.current = true;
        map.fitBounds(
          [
            [minLon, minLat],
            [maxLon, maxLat],
          ],
          { padding: 90, maxZoom: 9, duration: 700 },
        );
      }
    };

    if (readyRef.current) update();
    else map.once('trbotanik.ready', update);
  }, [selectedSpeciesId, dataset.occurrences, dataset.details]);

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
