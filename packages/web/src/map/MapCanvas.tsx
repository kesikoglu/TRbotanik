import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import maplibregl, {
  type Map as MapLibreMap,
  type PropertyValueSpecification,
  type StyleSpecification,
} from 'maplibre-gl';
import {
  DAVIS_CODES,
  davisSquareBounds,
  davisSquareFor,
  type DavisCode,
  type OccurrenceRecord,
  type PlantImage,
} from '@trbotanik/shared';
import type { Dataset } from '../data/dataset';
import { metricValue, type SelectionResult } from '../domain/filter';
import { displayVernacular } from '../domain/vernacular';
import { imageIndex, placeholderImageUrl } from '../features/placeholderImage';
import { useAppStore } from '../state/useAppStore';
import { getBasemap, sampleTileUrl, type BasemapDefinition } from './basemaps';
import { CHOROPLETH_RAMP, MAP_COLORS, NO_DATA_COLOR, TURKIYE_VIEW_BOUNDS } from './theme';

const HTML_ESCAPE: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (ch) => HTML_ESCAPE[ch] ?? ch);
}

const OPEN_DETAIL_ATTR = 'data-open-detail';

/**
 * Bir türün ilk görselinin popup'ta gösterilecek adresini döner.
 * Yer tutucu görseller veri setinde taşınmaz, SVG olarak burada üretilir
 * (bkz. placeholderImage.ts) — DetailPane'in galeri kartlarındaki mantıkla aynı.
 */
function firstImageUrl(images: PlantImage[] | undefined, scientificName: string | null): string | null {
  const image = images?.[0];
  if (!image) return null;
  if (image.isPlaceholder) {
    return scientificName ? placeholderImageUrl(scientificName, imageIndex(image.id)) : null;
  }
  return image.thumbnailUrl;
}

/** Bir yayılış noktasının popup içeriğini üretir. */
function occurrencePopupHtml(
  props: Record<string, unknown>,
  t: (key: string, options?: Record<string, unknown>) => string,
  { showOpenDetail = false }: { showOpenDetail?: boolean } = {},
): string {
  const species = props['species'] as string | null | undefined;
  const vernacular = props['vernacular'] as string | null | undefined;
  const province = props['province'] as string | null | undefined;
  const year = props['year'] as number | null | undefined;
  const elevationM = props['elevationM'] as number | null | undefined;
  const basisOfRecord = props['basisOfRecord'] as string | undefined;
  const source = props['source'] as string | undefined;
  const imageUrl = props['imageUrl'] as string | null | undefined;
  const contributor = props['contributor'] as string | null | undefined;
  const locality = props['locality'] as string | null | undefined;
  const note = props['note'] as string | null | undefined;

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

  // Topluluk kaydının kimden geldiği görünmeli: katkı, kaynağıyla birlikte
  // anlam kazanır ve katkıda bulunana atıf verilmesi gerekir.
  if (source === 'community') {
    // Topluluk kaydının KENDİ alanları: kullanıcı o gözlemi görmek için tıkladı,
    // türün genel bilgilerini değil.
    if (locality) rows.push([t('observation.locality'), escapeHtml(locality)]);
    if (note) rows.push([t('observation.notes'), escapeHtml(note)]);
    if (contributor) rows.push([t('popup.fieldContributor'), escapeHtml(contributor)]);
  }

  // Bu katmandaki her nokta AYNI türe ait (seçili tür), ama kullanıcı detay
  // panelini kaydırmış/unutmuş olabilir — bitki adı popup'ta da tekrarlanır.
  const heading = species
    ? `<p class="popup__title" style="font-family:var(--font-serif);font-style:italic;">${escapeHtml(species)}</p>` +
      (vernacular ? `<p class="popup__meta">${escapeHtml(vernacular)}</p>` : '')
    : `<p class="popup__title">${escapeHtml(t('popup.occurrenceTitle'))}</p>`;

  const openDetailButton =
    showOpenDetail && species
      ? `<button type="button" class="popup__item popup__action" ${OPEN_DETAIL_ATTR}="1">${escapeHtml(t('popup.openDetail'))}</button>`
      : '';

  const imageHtml = imageUrl
    ? `<img class="popup__image" src="${escapeHtml(imageUrl)}" alt="" />`
    : '';

  return (
    imageHtml +
    heading +
    rows
      .map(([label, value]) => `<p class="popup__meta"><strong>${escapeHtml(label)}:</strong> ${value}</p>`)
      .join('') +
    openDetailButton
  );
}

/** Bir küme (yeşil daire) noktasının popup içeriğini üretir. */
function clusterPopupHtml(
  count: number,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  return (
    `<p class="popup__title">${escapeHtml(t('popup.clusterTitle'))}</p>` +
    `<p class="popup__meta">${escapeHtml(t('popup.clusterCount', { count }))}</p>` +
    `<p class="popup__meta">${escapeHtml(t('popup.clusterHint'))}</p>`
  );
}

const SRC_TURKIYE = 'turkiye';
const SRC_DAVIS = 'davis';
const SRC_POINTS = 'points';
const SRC_SPECIES = 'species-highlight';
const SRC_BASEMAP_RASTER = 'basemap-raster';
const SRC_BASEMAP_LABELS = 'basemap-labels';

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
  /**
   * Referans veri + onaylı topluluk gözlemlerinin birleşimi.
   *
   * `dataset.occurrences` YERİNE bu kullanılır: seçili türün vurgulanan noktaları
   * aktif filtreden bağımsız olarak tüm kayıtlardan gelir ve topluluk katkıları
   * da bu bütüne dahildir.
   */
  occurrences: OccurrenceRecord[];
}

function davisFillOpacity(drawLandFill: boolean): PropertyValueSpecification<number> {
  // Uydu altlıklarında (drawLandFill=false) karo görüntüsü zaten kendi zeminini
  // sağlıyor — choropleth dolgusu belirgin biçimde soluk tutulur ki altındaki
  // uydu görüntüsü (özellikle rampanın parlak sarı ucundaki renklerde, %38
  // opaklıkta bile hâlâ baskındı) rahatça seçilebilsin. Çevrimdışı altlıkta
  // (kendi sentetik zemini) dolgu belirgin kalabilir çünkü altında gösterilecek
  // gerçek bir karo yok.
  return [
    'case',
    ['boolean', ['feature-state', 'hover'], false],
    drawLandFill ? 0.85 : 0.5,
    drawLandFill ? 0.85 : 0.2,
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
export function MapCanvas({ dataset, selection, occurrences: allOccurrences }: Props) {
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
  /**
   * `load` geri çağrısı yalnızca BİR KEZ kurulur — ısı haritası modundaki tıklama
   * işleyicisi (aşağıda) `mapMode`'u doğrudan yakalarsa mod değiştiğinde güncellenmez.
   * `tRef` ile aynı desen.
   */
  const mapModeRef = useRef(mapMode);
  useEffect(() => {
    mapModeRef.current = mapMode;
  }, [mapMode]);
  const metric = useAppStore((s) => s.metric);
  const homeRequestId = useAppStore((s) => s.homeRequestId);
  const selectedSquare = useAppStore((s) => s.selectedSquare);
  const selectedSpeciesId = useAppStore((s) => s.selectedSpeciesId);
  const communityOnly = useAppStore((s) => s.filter.communityOnly);
  const selectSquare = useAppStore((s) => s.selectSquare);
  const selectSpecies = useAppStore((s) => s.selectSpecies);
  const basemapId = useAppStore((s) => s.basemapId);
  const setBasemapTileError = useAppStore((s) => s.setBasemapTileError);

  // 'load' geri çağrısı yalnızca BİR KEZ kurulur (bkz. aşağıdaki useEffect([])) — bu
  // yüzden içindeki tıklama işleyicisi `t`'yi doğrudan yakalarsa dil değişiminde
  // güncellenmez. Ref üzerinden en güncel çeviri fonksiyonuna erişiyoruz.
  const { t, i18n } = useTranslation();
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
          // Topluluk katkıları bu katmanda da AYRI renkte çizilir. Aksi hâlde
          // bir tür seçildiğinde doğrulanmamış arazi kaydı, küratörlü referans
          // kayıtlarla aynı görsel ağırlığa kavuşur ve ayrım kaybolurdu.
          'circle-color': [
            'match',
            ['get', 'source'],
            'community', MAP_COLORS.pointCommunity,
            MAP_COLORS.speciesHighlight,
          ],
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

      /**
       * Isı haritası modunda tıklanabilir ayrı bir katman yok — L_HEATMAP sürekli
       * bir yoğunluk gölgesi çiziyor, altındaki noktalar/kare dolgusu gizli
       * (bkz. mod değişimi effect'i). Bu yüzden tıklama hiçbir şeye isabet etmiyor
       * gibi görünüyordu (bkz. kullanıcı geri bildirimi). Tıklanan koordinatı
       * doğrudan Davis karesine çevirip aynı kare panelini (tür listesi) açarak
       * bu modda da "burada ne var" sorusuna cevap veriyoruz.
       */
      map.on('click', (event) => {
        if (mapModeRef.current !== 'heatmap') return;
        const hitHighlight = map.queryRenderedFeatures(event.point, { layers: [L_SPECIES_HL] }).length > 0;
        if (hitHighlight) return;
        const code = davisSquareFor(event.lngLat.lat, event.lngLat.lng);
        if (!code) return;
        selectSquare(code);
        selectSpecies(null);
      });

      map.on('click', L_POINTS, (event) => {
        const feature = event.features?.[0];
        if (!feature) return;
        // Tür otomatik SEÇİLMEZ (önceki davranış "haritanın aniden uzaklaşması" gibi
        // algılanıyordu, bkz. kullanıcı geri bildirimi) — yalnızca bu kaydın bilgisi
        // popup'ta gösterilir; tam tür sayfasına geçmek isteyen "Ayrıntıyı aç"a basar.
        // NOT: selectSpecies burada çağrılırsa "Seçili tür vurgusu" effect'i (aşağıda)
        // selectedSpeciesId değiştiği an bu popup'ı hemen kapatır — bkz. o effect'teki
        // "eski türün popup'ını kapat" mantığı.
        const taxonId = feature.properties?.['taxonId'];
        const coordinates = (feature.geometry as GeoJSON.Point).coordinates.slice() as [number, number];

        popupRef.current?.remove();
        const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '240px' })
          .setLngLat(coordinates)
          .setHTML(occurrencePopupHtml(feature.properties ?? {}, tRef.current, { showOpenDetail: true }))
          .addTo(map);
        popupRef.current = popup;

        if (typeof taxonId === 'number') {
          popup
            .getElement()
            .querySelector(`[${OPEN_DETAIL_ATTR}]`)
            ?.addEventListener('click', () => selectSpecies(taxonId));
        }
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
        const coordinates = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
        const count = Number(feature.properties?.['point_count'] ?? 0);

        popupRef.current?.remove();
        popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '220px' })
          .setLngLat(coordinates)
          .setHTML(clusterPopupHtml(count, tRef.current))
          .addTo(map);

        map.easeTo({
          center: coordinates,
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
        if (sourceId === SRC_BASEMAP_RASTER || sourceId === SRC_BASEMAP_LABELS) {
          setBasemapTileError(true);
        }
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
        features: selection.occurrences.map((occ) => {
          const node = dataset.nodes[occ.taxonId];
          return {
            type: 'Feature' as const,
            properties: {
              id: occ.id,
              taxonId: occ.taxonId,
              src: occ.source === 'community' ? 'community' : 'gbif',
              species: node?.name ?? null,
              vernacular: node ? displayVernacular(node, i18n.language) ?? null : null,
              province: occ.province,
              year: occ.year,
              elevationM: occ.elevationM,
              basisOfRecord: occ.basisOfRecord,
              source: occ.source,
              contributor: occ.contributor?.displayName ?? null,
              locality: occ.locality ?? null,
              note: occ.note ?? null,
              // Topluluk kaydı KENDİ fotoğrafını gösterir; türün referans
              // görseline DÜŞMEZ — o kare o gözlemde çekilmedi.
              imageUrl:
                occ.source === 'community'
                  ? (occ.photoUrl ?? null)
                  : firstImageUrl(dataset.details[occ.taxonId]?.images, node?.name ?? null),
            },
            geometry: { type: 'Point' as const, coordinates: [occ.lon, occ.lat] },
          };
        }),
      });
    };

    if (readyRef.current) update();
    else map.once('trbotanik.ready', update);
  }, [selection, dataset.nodes, dataset.details, i18n.language]);

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
      // Isı haritasının tamamı tıklanabilir (bkz. yukarıdaki genel click işleyicisi) —
      // imleç bunu davis modundaki kare dolgusuyla aynı şekilde işaret eder.
      map.getCanvas().style.cursor = mapMode === 'heatmap' ? 'pointer' : '';
    };

    if (readyRef.current) update();
    else map.once('trbotanik.ready', update);
  }, [mapMode]);

  /**
   * ── "Eve dön" — üst çubuktaki başlığa tıklanınca ────────────────────
   *
   * `homeRequestId` başlangıçta 0'dır ve yalnızca `goHome()` çağrılınca artar,
   * bu yüzden ilk kurulumdaki (zaten kendi fitBounds'unu yapan) render bu effect'i
   * tetiklemez. `userMovedRef` bilerek false'a çekilir — aksi hâlde kullanıcı daha
   * önce haritayı elle oynattıysa, panel kapanınca tetiklenen ResizeObserver bu
   * sıfırlamayı görmezden gelirdi (bkz. yukarıdaki ResizeObserver açıklaması).
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || homeRequestId === 0) return;

    const update = () => {
      userMovedRef.current = false;
      map.fitBounds(TURKIYE_VIEW_BOUNDS, { padding: 24, duration: 600 });
    };

    if (readyRef.current) update();
    else map.once('trbotanik.ready', update);
  }, [homeRequestId]);

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

      // Bir tür seçiliyken aktif filtrenin TÜM kayıtlarını gösteren genel kümeler/
      // nokta/ısı katmanı soluklaştırılır — aksi hâlde binlerce alakasız kayıt
      // arasında türe özel pembe vurgu (aşağıda) fark edilmiyordu (bkz. kullanıcı
      // geri bildirimi: "bu daireler Acorus calamus ile ne ilişkisi var?").
      const hasSelection = selectedSpeciesId !== null;
      if (map.getLayer(L_CLUSTERS)) {
        map.setPaintProperty(L_CLUSTERS, 'circle-opacity', hasSelection ? 0.12 : 0.72);
      }
      if (map.getLayer(L_POINTS)) {
        map.setPaintProperty(L_POINTS, 'circle-opacity', hasSelection ? 0.18 : 0.85);
      }
      if (map.getLayer(L_HEATMAP)) {
        map.setPaintProperty(L_HEATMAP, 'heatmap-opacity', hasSelection ? 0.25 : 0.8);
      }

      // Tür değişince eski türün noktasına ait açık popup varsa (artık haritada
      // karşılığı olmayan bir noktaya bağlı) kapat.
      popupRef.current?.remove();
      popupRef.current = null;

      for (const code of previousSpeciesSquaresRef.current) {
        map.setFeatureState({ source: SRC_DAVIS, id: code }, { speciesMember: false });
      }
      previousSpeciesSquaresRef.current = new Set();

      if (!hasSelection) {
        source.setData({ type: 'FeatureCollection', features: [] });
        return;
      }

      // Aktif taksonomi/faset filtresinden BAĞIMSIZ olarak, veri setinin tamamından bu
      // taksonun kayıtlarını alıyoruz — kullanıcı dar bir filtre uygulasa bile "bu tür
      // nerede?" sorusunun yanıtı her zaman eksiksiz olsun. TEK İSTİSNA "topluluk
      // katkıları" filtresidir: bu filtrenin AMACI zaten sadece topluluk kayıtlarını
      // göstermektir, dolayısıyla burada uygulanmazsa binlerce GBIF noktası arasında
      // tek bir topluluk noktası kaybolur (bkz. kullanıcı geri bildirimi: "filtre
      // topluluk katkı olunca sadece onlar gözüksün").
      const occurrences = allOccurrences.filter(
        (o) => o.taxonId === selectedSpeciesId && (!communityOnly || o.source === 'community'),
      );
      // Katmandaki her nokta aynı türe ait; adı ve görseli popup'ta göstermek için bir kez alınır.
      const speciesNode = dataset.nodes[selectedSpeciesId];
      const speciesImageUrl = firstImageUrl(
        dataset.details[selectedSpeciesId]?.images,
        speciesNode?.name ?? null,
      );
      const speciesVernacular = speciesNode ? displayVernacular(speciesNode, i18n.language) ?? null : null;

      source.setData({
        type: 'FeatureCollection',
        features: occurrences.map((occ) => ({
          type: 'Feature' as const,
          properties: {
            id: occ.id,
            species: speciesNode?.name ?? null,
            vernacular: speciesVernacular,
            province: occ.province,
            year: occ.year,
            elevationM: occ.elevationM,
            basisOfRecord: occ.basisOfRecord,
            source: occ.source,
            contributor: occ.contributor?.displayName ?? null,
            locality: occ.locality ?? null,
            note: occ.note ?? null,
            imageUrl: occ.source === 'community' ? (occ.photoUrl ?? null) : speciesImageUrl,
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
  }, [selectedSpeciesId, communityOnly, allOccurrences, dataset.details, dataset.nodes, i18n.language]);

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
