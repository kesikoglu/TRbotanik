# TRbotanik — Türkiye Botanik Çeşitliliği Haritası

## Context

Akademik personel ve üniversite öğrencileri için, Türkiye'nin uydu haritası üzerinde
botanik çeşitliliğini gösteren bir web uygulaması. Kullanıcı bitkileri taksonomik
sınıflarına göre (sınıf → takım → familya → cins → tür) filtreler, eşleşen taksonlar
haritada görünür; bir takson seçilince tüm özellikleri görselleriyle birlikte bir
tabloda açılır. Etkileşim modeli blueplanetmonitor.com'daki yaklaşımı izler.

`/home/user/TRbotanik` tamamen boş — hiç commit yok. Sıfırdan kurulum.

### Onaylanmış kararlar

| Konu | Karar |
|---|---|
| Harita birimi | **Davis kareleri (A1–C10)** — Flora of Turkey'in akademik standardı |
| Veri stratejisi | **Hibrit** — repoda çekirdek veri + tarayıcıda canlı GBIF |
| Dil | **İki dilli TR/EN**, varsayılan TR |
| Yığın | **React + Vite + MapLibre GL** |

---

## Kritik ortam kısıtı

Bu geliştirme konteynerinin egress proxy'si **npm/PyPI/GitHub dışındaki tüm hostları
403 ile engelliyor.** Doğrulandı: `api.gbif.org`, `api.inaturalist.org`,
`tile.openstreetmap.org`, `server.arcgisonline.com`, `demotiles.maplibre.org` — hepsi
CONNECT aşamasında reddediliyor. WebFetch de aynı politikaya tabi.

Sonuç: **burada hiçbir occurrence verisi, harita karosu veya bitki fotoğrafı
indiremem.** Uygulama son kullanıcının tarayıcısında bunların hepsine erişir. Mimari bu
yüzden baştan "ağsız geliştirilebilir, çevrimiçi zenginleşen" olarak kurgulanıyor.

İki şey bu kısıtı çalışılabilir kılıyor:

1. **npm bir coğrafi veri kanalıdır.** `world-atlas` paketi gerçek ülke poligonlarını
   paket içeriği olarak taşır → gri dikdörtgen yerine gerçek Türkiye sınırı.
2. **MSW (Mock Service Worker)** GBIF/iNaturalist uç noktalarını yerelde taklit eder →
   sayfalama, zod ayrıştırma ve hata yönetimi dahil **canlı kod yolu burada yazılıp
   test edilebilir.** Bu olmadan `GbifLiveSource` bu konteynerde geliştirilemez.
   Aynı handler'lar hem tarayıcı dev sunucusunu hem Vitest'i besler.

---

## Kilit teknik bulgu: Davis grid'i türetilebilir (risk kalktı)

Literatür taraması netleştirdi: Davis kareleme sistemi **2 derecelik enlem/boylam
aralıklarına** dayanıyor ve Türkiye'yi **29 kareye** bölüyor. Harici shapefile
gerekmiyor — geometri deterministik olarak üretilebilir:

- **Satırlar (enlem):** `A` = 40–42°N, `B` = 38–40°N, `C` = 36–38°N
- **Sütunlar (boylam):** `n` = `(24 + 2n)°E` → `(26 + 2n)°E`, yani 1 = 26–28°E … 10 = 44–46°E
- **Kareler:** A1–A9 (9) + B1–B10 (10) + C1–C10 (10) = **29** ✓

```
kare = ["C","B","A"][floor((lat - 36) / 2)] + (floor((lon - 26) / 2) + 1)
```

**Doğrulandı.** Formül, yayınlanmış floristik literatürden alınan bilinen kare
atamalarının **10/10'unu** doğru üretiyor:

> İstanbul A2 · Ankara B4 · İzmir B1 · Van B9 · Antalya C3
> Gaziantep C6 · Tunceli B7 · Osmaneli A3 · Kastamonu A4 · Kars A9

Gerekli npm paketleri de erişilebilir: `maplibre-gl@6.0.0`, `@turf/turf@7.3.5`,
`world-atlas@2.0.2`.

`scripts/build-davis-grid.mjs` bu tanımdan `public/data/geo/davis-grid.geojson` üretir
ve `@turf/turf` ile Türkiye kara sınırına kırpar. **Kalan tek belirsizlik kıyı/sınır
kırpmasının görsel detayı** — bir koordinatın hangi kareye düştüğü belirsiz değil.
Yine de her karede `isApproximate` bayrağı taşınır ve `03-davis-assign` adımı, türetilen
kareleri literatürde bildirilen karelerle çapraz kontrol eder; uyuşmazlıklar QC
raporunda listelenir (bunlar gerçek yayılış genişlemesi veya teşhis hatası sinyali
olabilir, gizlenmemeli).

---

## Mimari

**Statik SPA. React + Vite + TypeScript + MapLibre GL. Backend yok.**

GBIF ve iNaturalist API'leri CORS-açık, dolayısıyla tarayıcı doğrudan çağırır. Backend
hem barındırma maliyeti hem akademik ekip için işletme yükü olurdu. GitHub Pages'e
yayınlanır. Kaçış kapısı belgelenir: ileride hız sınırı sorun olursa aynı `DataSource`
arayüzünü uygulayan bir Cloudflare Worker devreye alınır, uygulama farkı bilmez.

**MapLibre neden Leaflet değil:** choropleth'in her filtre değişiminde yeniden renklenmesi
`setFeatureState` + `feature-state` paint ifadesi ile geometri yeniden yüklenmeden olur;
occurrence noktaları GPU'da rasterlenir ve kümeleme kaynağın içinde yerleşiktir
(Leaflet'in DOM tabanlı `markercluster`'ı 100k'dan çok önce çöker); basemap, kod yolu
değil takas edilebilir bir veri nesnesi olur — ki bu bizim Esri/EOX/MapTiler ödünleşimimiz
için tam gerekli olan şey.

### Bağımlılıklar (hepsi npm'den doğrulandı)

`react` · `vite` · `typescript` · `maplibre-gl` · `react-map-gl` (maplibre girişi) ·
`zustand` (istemci durumu) · `@tanstack/react-query` (+ IndexedDB kalıcılık) ·
`@tanstack/react-table` (öznitelik tablosu, headless) · `flexsearch` (takson arama) ·
`@turf/turf` · `world-atlas` + `topojson-client` · `zod` (GBIF yanıt doğrulama) ·
`i18next` + `react-i18next` · `msw` · `vitest` · `@playwright/test`

Stil: CSS Modules + CSS custom properties. Tailwind yok — ~30 bileşenlik üç panelli bir
araştırma arayüzünde tek bir token dosyası, botanikçi bir bakımcı için daha kolay.

---

## Dizin yapısı

```
TRbotanik/
├─ README.md · DATA_SOURCES.md · CITATION.cff · LICENSE
├─ .env.example                    VITE_DATA_MODE, VITE_BASEMAP, VITE_MAPTILER_KEY
├─ .env.development                commit'lenir: DATA_MODE=fixture, BASEMAP=offline
├─ public/data/                    build çıktıları, çalışma anında fetch edilir
│  ├─ manifest.json                sürüm, tarih, GBIF DOI, kayıt sayıları, hash'ler
│  ├─ taxonomy.json                takson ağacı + DFS aralık indeksi
│  ├─ taxonomy-search.json         serileştirilmiş FlexSearch indeksi
│  ├─ species-summary.json         tür × 29 kare seyrek matrisi + özetler
│  ├─ davis-index.json             kare → o karedeki tür id'leri
│  ├─ details/shard-*.json         PlantDetail kayıtları, ~200 takson/parça
│  └─ geo/{turkiye,davis-grid,provinces}.geojson
├─ data/
│  ├─ raw/                         .gitignore — GBIF DwC-A dökümleri, önbellek
│  ├─ curated/                     COMMIT EDİLİR — projenin akademik katma değeri
│  │  ├─ taxa-overrides.yaml       habitat, yükselti, çiçeklenme, yaşam formu
│  │  ├─ endemism.csv · iucn.csv · vernacular-tr.csv · references.yaml
│  └─ schema/*.json                CI'da artefakt doğrulama şemaları
├─ scripts/
│  ├─ build-davis-grid.mjs         2°×2° graticule → sınırla kırpılmış GeoJSON
│  ├─ extract-turkiye-border.mjs   world-atlas TopoJSON → GeoJSON
│  ├─ make-fixtures.ts             tohumlu PRNG → deterministik fixture korpusu
│  ├─ verify-artifacts.ts          CI: public/data şema doğrulaması
│  └─ ingest/                      01-taxonomy · 02-occurrences · 03-davis-assign
│     ├─ ...                       04-images · 05-merge-curated · 06-build-indexes
│     └─ lib/                      gbif-client · inat-client · checkpoint · normalize
└─ src/
   ├─ app/                         Providers · queryClient · config · AppLayout
   ├─ data/
   │  ├─ types/                    taxon · occurrence · davis · detail · media · provenance
   │  ├─ sources/                  DataSource · StaticBundle · GbifLive · InatMedia
   │  │                            · Fixture · resolveSource (geri düşüş zinciri)
   │  ├─ fixtures/                 taxonomy · occurrences · details · images (SVG üretici)
   │  ├─ mocks/                    MSW handlers · browser · server
   │  └─ hooks/                    useTaxonomy · useOccurrences · usePlantDetail · useDavisStats
   ├─ domain/                      taxonomyIndex · filterEngine · davisAssign · attributeSchema
   ├─ state/                       filterStore · mapStore · uiStore
   ├─ map/
   │  ├─ MapCanvas.tsx             tek harita örneği, tüm kaynak ve katmanların sahibi
   │  ├─ basemaps/                 registry · offline · esriImagery · eoxSentinel2 · maptiler
   │  ├─ layers/                   occurrenceCluster · Heatmap · Points
   │  │                            · davisGridFill · davisGridLine · turkiyeOutline
   │  ├─ hooks/                    useDavisFeatureState · useMapInteractions · useFitTurkiye
   │  └─ MapControls · MapLegend · AttributionBar
   ├─ features/
   │  ├─ taxonomy-filter/          TaxonomySidebar · TaxonTree · TaxonSearchBox
   │  │                            · FacetFilters · ActiveFilterChips
   │  ├─ plant-detail/             PlantDetailPanel · AttributeTable · AttributeRow
   │  │                            · ImageGallery · ImageCredit · DavisSquareChips
   │  │                            · SynonymList · ReferenceList · CitationBlock
   │  ├─ davis-explorer/           DavisSquarePanel · DavisLegend
   │  └─ export/                   exportCsv · ExportButton
   ├─ components/                  ui/* · DataModeBanner · OfflineNotice · ErrorBoundary
   ├─ i18n/                        index · tr.json · en.json
   └─ lib/                         columnar · bitset · licenses · format · idb
```

---

## Veri modeli — öznitelik bazlı provenance

Belirleyici karar: **her bilimsel öznitelik kendi kaynağını taşır.** GBIF ad, familya ve
koordinat verir; ama yaşam formu, habitat, yükselti aralığı, çiçeklenme dönemi,
floristik element ve Türkiye endemizmi **vermez** — bunlar Flora of Turkey,
bizimbitkiler veya küratörün uzmanlığından gelir. Akademik bir kitleye bunları sessizce
karıştıran bir tablo sunmak güvenilir değildir.

```ts
export type SourceId = 'gbif' | 'powo' | 'inaturalist' | 'euromed'
  | 'bizimbitkiler' | 'flora-of-turkey' | 'iucn' | 'curated' | 'inferred' | 'fixture';

export interface DataSourceRef {
  source: SourceId; sourceRecordId?: string; url?: string;
  retrievedAt?: string; citation?: string; license?: LicenseId;
}

/** Herhangi bir öznitelik değerini kaynağıyla sarmalar. */
export interface Sourced<T> {
  value: T; provenance: DataSourceRef;
  confidence?: 'high' | 'medium' | 'low';
  note?: string;            // "Davis 1965–1988, cilt 4, s. 122"
}
```

```ts
export type DavisCode = `A${1|2|3|4|5|6|7|8|9}` | `B${1|…|10}` | `C${1|…|10}`;

/** Taksonomi ağacı düğümü. Her istemciye gittiği için kompakt. */
export interface TaxonNode {
  id: number;               // yoğun iç kimlik == DFS ön-sıra indeksi
  gbifKey: number; parentId: number | null;
  rank: 'CLASS'|'ORDER'|'FAMILY'|'GENUS'|'SPECIES'|'SUBSPECIES'|'VARIETY';
  name: string;             // yetkisiz kanonik ad
  authorship: string | null;
  subtreeEnd: number;       // alt ağaç == [id, subtreeEnd) — O(1) filtreleme
  childIds: number[];
  occurrenceCount: number; speciesCount: number; endemicCount: number;
  vernacularTr?: string;    // ağaçta tanıdıklık için
  detailShard?: number;
}

export interface PlantDetail {
  taxonId: number; gbifTaxonKey: number;

  // Nomenklatür
  acceptedName: Sourced<string>;
  authorship: Sourced<string | null>;
  taxonomicStatus: Sourced<'ACCEPTED'|'SYNONYM'|'DOUBTFUL'>;
  synonyms: Sourced<Array<{ name: string; authorship: string | null }>>;
  basionym: Sourced<string | null>;
  publishedIn: Sourced<string | null>;          // protolog atfı
  classification: Sourced<{ class: string; order: string; family: string; genus: string }>;

  // Yerel adlar
  vernacularTr: Sourced<Array<{ name: string; region?: string }>>;
  vernacularEn: Sourced<string[]>;

  // Biyoloji / ekoloji — küratörlü, GBIF sağlamaz
  lifeForm: Sourced<LifeForm | null>;           // terofit, hemikriptofit…
  habit: Sourced<Habit | null>;                 // ağaç, çalı, ot, geofit, tırmanıcı
  habitat: Sourced<string | null>;
  altitudeRange: Sourced<{ minM: number; maxM: number } | null>;
  floweringPeriod: Sourced<{ startMonth: number; endMonth: number } | null>;
  fruitingPeriod: Sourced<{ startMonth: number; endMonth: number } | null>;
  substrate: Sourced<string | null>;            // serpantin, jips, kalker

  // Koruma / biyocoğrafya
  endemism: Sourced<{ isEndemicToTurkiye: boolean; scope?: 'ulusal'|'bölgesel'|'yerel' }>;
  iucn: Sourced<{ category: 'EX'|'EW'|'CR'|'EN'|'VU'|'NT'|'LC'|'DD'|'NE';
                  criteria?: string; assessmentYear?: number;
                  scope: 'global' | 'ulusal' } | null>;   // Kırmızı Kitap ≠ IUCN global
  floristicElement: Sourced<FloristicElement[]>; // İran-Turan | Avrupa-Sibirya
                                                 // | Akdeniz | Öksin | kozmopolit
  davisSquares: Sourced<DavisCode[]>;            // literatürde bildirilen yayılış
  observedDavisSquares: DavisCode[];             // occurrence'lardan türetilen — FARKLI olabilir

  distribution: {
    occurrenceCount: number; bbox: [number,number,number,number];
    centroid: [number, number]; provinces: string[];
    firstRecordYear: number | null; lastRecordYear: number | null;
    elevationObserved: { minM: number; maxM: number } | null;
  };

  images: PlantImage[];
  identifiers: { gbifTaxonKey: number; powoId?: string; ipniId?: string;
                 wfoId?: string; bizimBitkilerId?: string; iNaturalistTaxonId?: number };
  references: Reference[];
  dataCompleteness: number;      // 0..1 — gerçek değeri olan öznitelik oranı
}

export interface PlantImage {
  id: string; url: string; thumbnailUrl: string;
  photographer: string | null;
  license: 'CC0'|'CC-BY'|'CC-BY-SA'|'CC-BY-NC'|'CC-BY-NC-SA'|'PD'|'UNKNOWN';
  licenseUrl: string | null;
  attributionText: string;       // önceden oluşturulmuş, gösterilmesi zorunlu metin
  source: 'inaturalist'|'gbif'|'curated'|'placeholder';
  sourceUrl: string; isPlaceholder: boolean;
}
```

**Öznitelik tablosu `domain/attributeSchema.ts` tarafından sürülür** — sıralı bir
`{ key, group, labelKey, format, unit }` dizisi. `AttributeTable` bunun üzerinde map'ler.
Yeni öznitelik eklemek = bir kayıt + bir i18n metni, JSX değişikliği yok. Tablo **her
zaman tüm öznitelikleri gösterir**; boş olan "veri yok" der ve *nedenini* belirtir
(`kaynakta-yok` / `henüz-küratörlenmedi`) — bu, satırın hiç olmamasından bir araştırmacı
için çok daha bilgilendiricidir.

---

## Taksonomik filtreleme — DFS aralık indeksi

**Ana numara: DFS ön-sıra numaralandırması her alt ağacı bitişik bir tam sayı aralığı
yapar.** Ingest sırasında ağaç derinlik-öncelikli gezilir, `id = ziyaretSırası` atanır ve
`subtreeEnd` kaydedilir. Böylece:

```
takson T, seçili düğüm S'nin içinde  ⟺  S.id ≤ T.id < S.subtreeEnd
```

"Fabaceae" seçmek, occurrence başına **iki tam sayı karşılaştırmasına** iner — küme
üyeliği, hash araması veya ağaç gezintisi yok. 500.000 occurrence tek bir `Uint32Array`
taraması, ~2 ms.

Filtre hattı üç katman:

1. **Rank yolu seçimi** (birincil arayüz): çoklu seçim aralık dizisi üretir, sıralanıp
   birleştirilir; test ≤N aralık üzerinde ikili arama.
2. **Faset filtreleri** (endemizm, IUCN, floristik element, yaşam formu, yıl aralığı):
   ağaç yapılı olmadıkları için yükleme anında değer başına `Uint32Array` bitset
   önceden hesaplanır — 11.000 takson = 344 word = faset değeri başına 1,4 KB.
   Kesişim = 344 word'lük bitwise AND.
3. **Metin arama**: FlexSearch takson id'leri döner, aynı hatta kesişir.

Çıktı tek bir `SelectionMask`; nokta katmanı, heatmap, choropleth ve kenar çubuğu
sayaçları hepsi bunu tüketir.

**Kenar çubuğu sayaçları** ingest'te denormalize edilir. Faset filtresi aktifken DFS
dizisi *ters* sırada tek geçişte yeniden toplanır (ön-sırada çocukların id'si ebeveynden
büyüktür, dolayısıyla tek ters süpürme doğru birikir) — O(n), ~11k adım, anlık.

**Render:** ağaç 11.000+ düğüm olabilir; genişletme durumundan türetilen düzleştirilmiş
görünür-satır dizisi ile sanallaştırılır. Filtre uygulaması 120 ms debounce edilir;
overview tamponu ~300k kaydı aşarsa maske geçişi Web Worker'a taşınır.

**Yük:** ~11k takson için `taxonomy.json` ham ~3 MB, gzip ~700–900 KB. Tek seferlik
yükleme olarak kabul edilebilir; büyürse familya/cins seviyesi hemen, türler cins başına
tembel yüklenir.

---

## Harita katmanları

Üç **harita modu** (`mapStore.mapMode`), hepsi aynı `SelectionMask`'i okur:

| Mod | Katman | Ne zaman |
|---|---|---|
| `davis` | 29 poligon üzerinde `fill` choropleth | **Varsayılan** — akademik görünüm |
| `cluster` | kümelenmiş GeoJSON kaynağı üzerinde `circle` | "kayıtlar nerede" sorusu |
| `heatmap` | `heatmap` + z9 üstünde noktalar | Yoğunluk okuması, geniş seçimler |

**Davis choropleth.** Sadece 29 poligon → düz GeoJSON, karo yok. Kilit nokta yeniden
renklendirmenin geometriye dokunmaması: kaynak `promoteId: 'code'` ile bir kez yüklenir,
`fill-color` bir `feature-state` interpolasyonudur, `useDavisFeatureState` filtre
değişiminde 29 `setFeatureState` çağrısı yapar — tek kare.

- **Sınıflandırma yöntemi kullanıcı seçimli** (kantil / Jenks / eşit aralık / logaritmik)
  ve seçim lejantta yazar. Bilimsel kitle için önemli, 29 değer üzerinde ucuz.
- **Normalizasyon anahtarı:** ham occurrence sayısı · **tür zenginliği** · endemik tür
  sayısı · endemizm oranı. Ham sayımlar toplayıcı çabasına ağır biçimde yanlıdır;
  **varsayılan tür zenginliğidir** ve lejantta yöntem notu bulunur (bkz. R6).
- Hover → ikinci bir `line` katmanı ile vurgulama + sayaç ipucu. Tıklama →
  `DavisSquarePanel`, o karedeki tür listesi (`davis-index.json`) ve CSV dışa aktarma.

**Occurrence noktaları.** Bir milyon feature'ı GeoJSON kaynağına koymayız; `useOccurrences`
seçim boyutuna göre kademelendirir:

- **≤ 50.000** (bir familya/cins — baskın durum): worker'da GeoJSON kurulur, `cluster: true`,
  `clusterRadius: 50`, `clusterMaxZoom: 12`.
- **50–300 bin**: aynı kaynak, daha geniş yarıçap, z8 altında kümesiz sembol yok, altta heatmap.
- **> 300 bin / tüm Türkiye**: önceden pişirilmiş `overview.bin` örneklemi (Davis karesi ×
  familya katmanlı, ~200k ile sınırlı) kullanılır; kesin noktalar yalnızca kullanıcı bbox'a
  yakınlaştığında yüklenir.

**Mod değişimi haritayı yeniden monte etmez** — tüm katmanlar baştan vardır, mod yalnızca
`layout.visibility` değiştirir.

**Basemap.** `map/basemaps/registry.ts` her girdiyi `{ id, labelKey, sources, layers,
attributionHtml, requiresKey, licenseNote }` olarak tutar; değişim `setStyle` ile
uygulama katmanlarını basemap'in *üstüne* yeniden ekler.

| id | Kaynak | Not |
|---|---|---|
| `offline` | uzak karo yok; `background` + yerel `turkiye.geojson` | **Bu konteynerde varsayılan** |
| `eox-s2cloudless` | EOX Sentinel-2 cloudless WMTS | CC BY-NC-SA 4.0 — akademik kullanıma uygun, **üretim varsayılanı** |
| `esri-imagery` | Esri World Imagery legacy karo | ToS belirsizliği `DATA_SOURCES.md`'de not edilir |
| `maptiler-satellite` | `VITE_MAPTILER_KEY` gerekir | Koşulları tek net olan seçenek; üniversite fonlarsa önerilir |

`AttributionBar` isteğe bağlı arayüz değildir: basemap atfı + GBIF DOI + veri seti
lisanslarını kapatılamaz biçimde gösterir. CC-BY-NC veri tüketen bir projede bu yasal
gerekliliktir.

---

## Offline-first strateji

`VITE_DATA_MODE` ile üç mod, `app/config.ts`'de bir kez çözümlenir:

| Mod | Davranış | Kullanım |
|---|---|---|
| `fixture` | yalnızca `src/data/fixtures/*`; MSW tüm dış istekleri yakalar; sıfır ağ | **bu konteyner**, CI, e2e |
| `static` | `public/data/*` artefaktları; canlı çağrı yok | demo, hava-boşluklu kurulum |
| `live` | statik artefakt + talep üzerine canlı GBIF/iNat zenginleştirme | üretim |

**`resolveSource.ts` geri düşüş zinciri** — uygulama ağ hatasında asla boş ekran vermez:

```
StaticBundleSource   (önce denenir — anlık, ağsız çalışır)
      ↓ eksik / daha taze veya derin veri gerekiyor
GbifLiveSource       (6 sn timeout, 2 deneme, AbortController)
      ↓ hata, ya da mod ≠ 'live'
FixtureSource        (son çare; degraded = true)
```

Her hook `{ data, sourceUsed, degraded }` döner. `degraded` iken `DataModeBanner` kalıcı
ve dürüst bir uyarı gösterir: *"Canlı GBIF verisine ulaşılamadı — yerel anlık görüntü
gösteriliyor (oluşturulma: …)"*. Bayat veriye sessizce düşmek araştırma kullanımında
kabul edilemez.

Son kullanıcı için `persistQueryClient` React Query önbelleğini IndexedDB'ye 7 günlük
azami yaşla yazar; bağlantısı kopan araştırmacı çalışmaya devam eder.

### Fixture verisi ve dürüstlük

Fixture'lar `scripts/make-fixtures.ts` tarafından **tohumlu PRNG** ile üretilir
(deterministik ve diff'lenebilir):

- 12 familyaya yayılmış **~60 gerçek takson** — gerçek adlar ve gerçek sınıflandırma,
  Türkiye endemik vitrinleri dahil (*Astragalus*, *Verbascum*, *Centaurea*, *Salvia*,
  *Origanum*). Ekran görüntüleri utandırıcı olmasın.
- ~3.000 sentetik nokta, **`world-atlas`'tan gelen gerçek Türkiye poligonu içinde**
  reddetme-örneklemesi ile, kare bazlı yoğunluk ağırlıklarıyla.
- Her fixture taksonu için tam dolu `PlantDetail`, artı **kasıtlı olarak eksik 3 takson**
  ("veri yok" yollarını test etmek için).
- Görseller `images.fixture.ts` tarafından SVG data-URI olarak üretilir — git'te ikili
  dosya yok, galeri ve lisans-kredisi arayüzü yine de tam test edilir.

**Sentetik yayılış haritasının ekran görüntüsü alınıp gerçek sanılması gerçek bir
risktir.** Bu yüzden: `isPlaceholder: true`, `provenance.source = 'fixture'`, kalıcı sarı
banner, fixture modunda harita üzerinde çapraz filigran ve sayfa başlığında veri modu.
Emin olunmayan hiçbir alan tahmin edilmez, `null` bırakılır.

---

## Veri çekme hattı (sizin makinenizde `npm run ingest`)

Adımlar idempotent, `data/raw/.checkpoints/` ile devam ettirilebilir.

**`01-taxonomy`** — GBIF Backbone `Tracheophyta`'yı çıpa alır, ardından
`/v1/occurrence/search/facet?country=TR&facet=familyKey` → familya başına `genusKey` →
cins başına `speciesKey` ile Türkiye ile ilgili alt kümeyi keşfeder. Faceting, backbone'u
tamamen saymaktan çok daha ucuzdur ve tam olarak Türkiye kaydı olan taksonları verir.
`/v1/species/{key}` + `/synonyms` + `/vernacularNames` ile zenginleştirir.

**`02-occurrences`** — iki yol, seçim önemli:
- **Birincil: GBIF Download API.** `POST /v1/occurrence/download/request` ile predicate
  (`country=TR`, `taxonKey=7707728`, `hasCoordinate=true`, `hasGeospatialIssue=false`),
  ücretsiz GBIF hesabıyla Basic auth, `SUCCEEDED` olana dek yoklama, DwC-A ZIP indirme.
  **100.000 sınırı yoktur ve bir DOI üretir** — akademik projenin atıf yapması gereken
  şey tam da budur. DOI `manifest.json`'a yazılır ve `CitationBlock`'ta gösterilir.
- **Yedek (hesapsız): sayfalama.** `/v1/occurrence/search&limit=300`. 100k offset duvarı
  sert olduğu için sorgu uzayı **familyaya göre bölünür**, 100k'yı aşan familya `year`
  ve gerekirse `month` ile alt bölünür. Eşzamanlılık 5 ile sınırlı, 429/503'te üstel
  geri çekilme, ETag disk önbelleği.

**`03-davis-assign`** — yukarıdaki aritmetikle atama (nokta-poligon gerekmiyor); sınır
kırpması için `@turf/booleanPointInPolygon` doğrulaması. Hiçbir kareye düşmeyen kayıtlar
(açık deniz, bozuk koordinat) `null` + issue bayrağı alır, **sessizce atılmaz**. QC
raporu: atanmamış sayısı, kare başına sayımlar ve `observedDavisSquares` ile literatür
karelerinin çapraz kontrolü. Aynı fonksiyon `domain/davisAssign.ts` olarak tarayıcıya da
export edilir.

**`04-images`** — iNaturalist `/v1/observations?photo_license=cc0,cc-by,cc-by-nc&
quality_grade=research&order_by=votes`, dakikada 60 istek nezaket sınırı, açıklayıcı
`User-Agent`. **Lisansı ve fotoğrafçısı çözülemeyen görsel alınmaz.** İki mod:
`--link-only` (varsayılan; uzak URL saklar, bant genişliği ve barındırma yok) ve
`--download` (`sharp` ile 320px/1200px türevler, kendine yeten dağıtım için).

**`05-merge-curated`** — GBIF tabanını `data/curated/*` ile sol-birleştirir, her alanı
`Sourced<T>` ile sarar; küratör değeri GBIF'i ezer, çakışmalar loglanır. **Projenin uzun
vadeli bilimsel değeri burada:** bir yüksek lisans öğrencisi 200 tür için
`taxa-overrides.yaml` doldurabilir, TypeScript'e dokunmadan.

**`06-build-indexes`** — DFS numaralandırma, `subtreeEnd`, sayaçların aşağıdan yukarı
toplanması; `taxonomy.json`, `species-summary.json`, `davis-index.json`, `details/`
parçaları, FlexSearch indeksi, `overview.bin` (kare × familya katmanlı örnekleme) ve
`manifest.json` (sürüm, GBIF DOI, artefakt başına SHA-256).

`.github/workflows/refresh-data.yml` bu hattı zamanlanmış olarak çalıştırır ve yenilenen
artefaktlarla **PR açar** — veri tazeleme incelenebilir olur, gizemli bir dağıtım değil.

---

## Fazlar

**Faz 1 — Yürüyen iskelet (bu konteynerde uçtan uca çalışır).**
Vite+React+TS iskelesi · üç panelli düzen · `world-atlas`'tan gerçek Türkiye sınırı ile
`offline` basemap · üretilen 29 Davis karesi, choropleth + kare etiketleri · 60 taksonluk
fixture ağacı üzerinde DFS aralık filtresi · kümelenmiş fixture noktaları · takson
tıklaması → tam `AttributeTable` + görsel galerisi · `DataModeBanner` · TR/EN.
**Her gereksinim sıfır ağ ile gösterilebilir olacak** — mimariyi kanıtlayan faz budur.

**Faz 2 — Gerçek veri yolu.** MSW handler'ları karşısında `GbifLiveSource` · geri düşüş
zinciri · `01`, `02`, `06` ingest adımları · `manifest.json` · statik artefakt yükleme.
Siz kendi makinenizde ingest çalıştırıp artefaktları bırakırsınız; uygulama **kod
değişikliği olmadan** gerçek veriye geçer.

**Faz 3 — Bilimsel derinlik.** Küratörlü öznitelik katmanı (`05-merge-curated`) ·
endemizm ve IUCN fasetleri · `DavisSquarePanel` · choropleth normalizasyon ve
sınıflandırma seçenekleri · CSV/GeoJSON dışa aktarma · gerçek GBIF DOI ile
`CitationBlock` · uydu basemap'lerinin etkinleştirilmesi ve atıfları.

**Faz 4 — Medya ve cila.** iNaturalist görsel hattı · lightbox · zorunlu krediler ·
heatmap modu · derin bağlanabilir URL durumu (`?taxon=…&square=B4&mode=davis`) ki
araştırmacılar belirli bir görünüme atıf yapabilsin · yazdırma/PDF stil sayfası ·
erişilebilirlik ve mobil düzen.

---

## Doğrulama

- `npm run build` — TypeScript hatasız derlenir; `npm run verify:data` artefaktları
  şemaya karşı doğrular.
- `npm run test` (Vitest) — birim: `davisAssign` (yukarıdaki 10 şehir eşleşmesi teste
  sabitlenir), grid üretiminin **29 kare** vermesi, `taxonomyIndex` DFS aralık
  doğruluğu, `filterEngine` bitset kesişimi, `normalize` koordinat QC'si; entegrasyon:
  `resolveSource` geri düşüş zinciri MSW ile (canlı yol ağsız test edilir).
- `npx playwright test` — konteynerde kurulu Chromium ile, `VITE_DATA_MODE=fixture`
  zorlanarak: harita yükleniyor · 29 kare çiziliyor · familya seçimi choropleth'i ve
  kenar çubuğu sayaçlarını değiştiriyor · kareye tıklayınca tür listesi açılıyor ·
  taksona tıklayınca öznitelik tablosu ve galeri geliyor · TR/EN metinleri değiştiriyor ·
  fixture banner'ı görünür. **Ekran görüntüleri size iletilir.**
- Ağsız doğrulama zaten tek mümkün mod olduğundan sürekli test edilir.

---

## Riskler

| # | Risk | Etki | Azaltma |
|---|---|---|---|
| R1 | **GBIF tek başına öznitelik tablosunu dolduramaz** (habitat, yükselti, çiçeklenme, endemizm yok) → tablo %70 boş görünür | Yüksek | `Sourced<T>` + `data/curated/` katmanı 1. günden tasarımda; `dataCompleteness` gösterilir; boş hücre *nedenini* yazar. Küratörlemeye 11.000 taksonla değil, birkaç yüz öne çıkan endemikle başlanır |
| R2 | **Sentetik fixture verisinin gerçek sanılması** | Yüksek | Kalıcı banner + harita filigranı + `isPlaceholder` + sayfa başlığında mod |
| R3 | **Örnekleme yanlılığının biyoçeşitlilik diye sunulması** — kayıt yoğunluğu büyük ölçüde toplayıcı çabasını (üniversite ve yol yakınlığı) yansıtır | Yüksek | Choropleth varsayılanı ham sayım değil **tür zenginliği**; çabaya göre normalize seçenekleri; lejantta yöntem notu |
| R4 | **GBIF ↔ Türkiye Bitkileri Listesi taksonomik uyuşmazlığı** (*Astragalus*, *Verbascum*, *Centaurea*'da yaygın); Türk botanikçiler ulusal listeye güvenir | Orta | GBIF *mekânsal* anahtardır (occurrence'lar onu taşır); kabul edilen Türkçe ad ayrı ve açıkça etiketli bir öznitelik olarak yan yana gösterilir. Biri diğerine zorlanmaz |
| R5 | Uydu karo lisansları (Esri ToS, EOX NC) | Orta | Eklentili registry → yapılandırma değişikliği, yeniden yazım değil; `DATA_SOURCES.md`'de ödünleşimler; ticarileşme ihtimalinde MapTiler |
| R6 | Veri hacmi (10⁶ occurrence) | Orta | Önce-toplulaştırma: choropleth ve sayaçlar `species-summary.json`'dan; ham noktalar yalnızca aktif seçim için; karolama ertelenir |
| R7 | Davis kare **kıyı/sınır kırpmasının** görsel detayı | Düşük | 2°×2° / 29 kare tanımı ve 10/10 şehir eşleşmesi doğrulandı; kare ataması belirsiz değil. `isApproximate` bayrağı + literatür çapraz kontrolü |
| R8 | GBIF CORS/hız sınırını buradan doğrulayamıyorum | Düşük | `GbifLiveSource` `DataSource` arayüzü arkasında → gerekirse Worker proxy özellik koduna dokunmadan takılır |
| R9 | bizimbitkiler.org.tr'de açık API yok | Düşük | Faz 1–3 GBIF+POWO ile ilerler; Türkçe adlar için NGBB ile izinli veri paylaşımı ayrıca görüşülmeli (kazıma yapılmayacak) |

---

## Çalışma akışı

Tüm geliştirme `claude/turkiye-botanik-haritasi-di1550` dalında, anlamlı commit'lerle
yapılacak ve tamamlandığında push edilecek. PR yalnızca siz isterseniz açılır.

**Faz 1'in tamamı bu oturumda teslim edilebilir.** Faz 2+ gerçek veri gerektirdiği için
sizin makinenizde ingest çalıştırmanıza bağlıdır; kod ve scriptler burada yazılıp MSW ile
test edilir.
