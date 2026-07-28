# TRbotanik — Türkiye Botanik Çeşitliliği Haritası

## Context

Akademik personel ve üniversite öğrencileri için, Türkiye'nin uydu haritası üzerinde
botanik çeşitliliğini gösteren bir web uygulaması. Kullanıcı bitkileri taksonomik
sınıflarına göre filtreler, eşleşen taksonlar haritada görünür; bir takson seçilince tüm
özellikleri görselleriyle birlikte bir tabloda açılır.

**Ayrıca bir katkı platformu:** kayıtlı kullanıcılar sisteme yeni tür kaydı girebilir
(tekil form veya Excel şablonu ile toplu), her kayıtta ekleyenin bilgisi görünür, admin
hatalı verileri kaldırabilir.

### Onaylanmış kararlar

| Konu | Karar |
|---|---|
| Harita birimi | **Davis kareleri (A1–C10)** — Flora of Turkey'in akademik standardı |
| Referans veri | **Hibrit** — repoda GBIF türevi statik veri + tarayıcıda canlı GBIF |
| Dil | **İki dilli TR/EN**, varsayılan TR |
| Frontend | **React + Vite + MapLibre GL** |
| Backend | **Hostinger VPS** — kendi kurulumumuz (Node + PostgreSQL/PostGIS, Docker) |
| Moderasyon | **Anında yayınla, admin siler** |
| Üyelik | **Herkese açık kayıt + `.edu.tr` doğrulamalı akademik rozet** |
| Fotoğraf | **Kullanıcı yükleyebilir** (boyut, lisans ve yeniden kodlama zorunlu) |

---

## Kritik ortam kısıtı (geliştirme)

Bu geliştirme konteynerinin egress proxy'si **npm/PyPI/GitHub dışındaki tüm hostları 403
ile engelliyor.** Doğrulandı: `api.gbif.org`, `api.inaturalist.org`,
`tile.openstreetmap.org`, `server.arcgisonline.com` — hepsi CONNECT aşamasında
reddediliyor. WebFetch de aynı politikaya tabi.

Sonuç: burada hiçbir occurrence verisi, harita karosu veya bitki fotoğrafı indiremem.
Uygulama son kullanıcının tarayıcısında bunların hepsine erişir. İki şey bu kısıtı
çalışılabilir kılıyor:

1. **npm bir coğrafi veri kanalıdır.** `world-atlas` paketi gerçek ülke poligonlarını
   paket içeriği olarak taşır → gri dikdörtgen yerine gerçek Türkiye sınırı.
2. **MSW (Mock Service Worker)** hem GBIF/iNaturalist hem *kendi* API'mizi yerelde taklit
   eder → sayfalama, zod ayrıştırma ve hata yönetimi dahil canlı kod yolu burada yazılıp
   test edilebilir. Backend ise **Docker Compose ile yerelde** çalışır; canlıya alma
   VPS erişimi gerektirir.

---

## Kilit teknik bulgu: Davis grid'i türetilebilir

Davis kareleme sistemi **2 derecelik enlem/boylam aralıklarına** dayanıyor ve Türkiye'yi
**29 kareye** bölüyor. Harici shapefile gerekmiyor:

- **Satırlar:** `A` = 40–42°N, `B` = 38–40°N, `C` = 36–38°N
- **Sütunlar:** `n` = `(24 + 2n)°E` → `(26 + 2n)°E` (1 = 26–28°E … 10 = 44–46°E)
- **Kareler:** A1–A9 + B1–B10 + C1–C10 = **29** ✓

```
kare = ["C","B","A"][floor((lat - 36) / 2)] + (floor((lon - 26) / 2) + 1)
```

**Doğrulandı** — yayınlanmış floristik literatürdeki bilinen kare atamalarının 10/10'u:
İstanbul A2 · Ankara B4 · İzmir B1 · Van B9 · Antalya C3 · Gaziantep C6 · Tunceli B7 ·
Osmaneli A3 · Kastamonu A4 · Kars A9.

`scripts/build-davis-grid.mjs` bu tanımdan GeoJSON üretir ve `@turf/turf` ile kara
sınırına kırpar. Aynı fonksiyon hem tarayıcıda hem PostgreSQL tarafında (generated
column) kullanılır.

---

## Mimari

Tek origin, tek sunucu. Hostinger VPS üzerinde Docker Compose:

```
              ┌──────────── Hostinger VPS (KVM 2 önerilir: 2 vCPU / 8 GB) ─────────┐
 tarayıcı ─TLS─▶ nginx ──/──────▶ React SPA (statik build)                          │
              │       ──/api───▶ Fastify API (Node 22, TypeScript)                  │
              │       ──/media─▶ yüklenen fotoğraflar (disk)                        │
              │                          │                                          │
              │                          ▼                                          │
              │                PostgreSQL 16 + PostGIS                              │
              └────────────────────────────────────────────────────────────────────┘
```

**SPA ve API aynı origin'den servis edilir.** Bu bilinçli bir karar: CORS yok,
`httpOnly` + `SameSite=Strict` çerezleri sorunsuz çalışır ve token'ı `localStorage`'da
tutmak zorunda kalmayız (XSS'e karşı belirgin biçimde daha güvenli). Hostinger web
hosting hesabı alan adı/DNS ve isterseniz tanıtım sayfası için kullanılır; uygulamanın
tamamı VPS'te durur.

**Veri iki hızda akar:**

| Veri | Nereden | Neden |
|---|---|---|
| Taksonomi ağacı, GBIF özetleri, Davis grid, sınırlar | **statik artefakt** (`/data/*.json`), önbelleklenebilir | ~1 MB, her istekte sorgulanması anlamsız |
| Topluluk kayıtları, kullanıcılar, fotoğraflar, moderasyon | **API + PostgreSQL** | değişken, yetkilendirme gerektirir |

### Bağımlılıklar (npm'de erişilebilirliği doğrulandı)

**Frontend** — `react` · `vite` · `typescript` · `maplibre-gl@6` · `react-map-gl` ·
`zustand` · `@tanstack/react-query` · `@tanstack/react-table` · `flexsearch` ·
`@turf/turf@7.3.5` · `world-atlas@2.0.2` + `topojson-client` · `zod@4` ·
`i18next` + `react-i18next` · `msw` · `vitest` · `@playwright/test`

**Backend** — `fastify` · `@fastify/cookie` · `@fastify/multipart` ·
`@fastify/rate-limit` · `@fastify/helmet` · `drizzle-orm` + `postgres` (SQL-öncelikli,
PostGIS ile raw SQL uyumu Prisma'dan iyi) · `argon2` · `sharp` · `exceljs@4.4.0` ·
`nodemailer` · `pino`

> **Not:** Excel için `xlsx` (SheetJS) değil **`exceljs`** seçildi. npm'deki `xlsx@0.18.5`
> eski sürüm ve bilinen prototype-pollution zafiyetleri taşıyor; SheetJS güncel
> sürümlerini npm dışına taşıdı. `exceljs` hem okuma hem *veri doğrulamalı şablon üretme*
> yapabildiği için tek kütüphaneyle iki işi görüyor.

Stil: CSS Modules + CSS custom properties.

---

## Konum girdisi (karar)

**Kanonik saklanan değer her zaman `geography(Point, 4326)`.** Kullanıcı üç yoldan
girebilir; hangisini kullandığı kayda yazılır:

| Yöntem | `coordinateUncertaintyInMeters` | Not |
|---|---|---|
| Haritaya iğne bırakma | 10–100 (yakınlaştırmaya göre otomatik) | Varsayılan ve teşvik edilen yol |
| Elle koordinat (ondalık **veya** DMS) | kullanıcı girer, boşsa 100 | Saha GPS notlarından giriş |
| İl → İlçe seçimi | ilçe ~5.000, il ~25.000 | Koordinatı olmayan eski kayıtlar için |
| Fotoğrafın EXIF GPS'i | 10 | Yüklenen fotoğraftan önerilir, kullanıcı onaylar |

Neden böyle: `coordinateUncertaintyInMeters` Darwin Core'un standart alanı ve ileride
GBIF'e veri paylaşımının önkoşulu. Bu alan olmadan il merkezinden girilmiş bir kayıt,
GPS'le alınmış bir kayıtla aynı ağırlıkta görünür — bu bilimsel olarak kabul edilemez.
Harita bunu görselleştirir: belirsizliği büyük kayıtlar nokta değil **yarıçap dairesi**
olarak çizilir.

**Davis karesi ve il/ilçe koordinattan otomatik türetilir**, kullanıcı elle girmez —
PostgreSQL `GENERATED ALWAYS AS ... STORED` sütunu ile, dolayısıyla tutarsız olamazlar.

---

## Veri modeli

### Referans katmanı (statik artefakt — değişmez)

Öznitelik bazlı provenance korunuyor: **her bilimsel öznitelik kendi kaynağını taşır.**
GBIF ad, familya ve koordinat verir; yaşam formu, habitat, yükselti, çiçeklenme dönemi,
floristik element ve endemizm **vermez** — bunlar Flora of Turkey'den küratörlenir.

```ts
export interface Sourced<T> {
  value: T;
  provenance: { source: SourceId; sourceRecordId?: string; url?: string;
                retrievedAt?: string; citation?: string; license?: LicenseId };
  confidence?: 'high' | 'medium' | 'low';
  note?: string;                 // "Davis 1965–1988, cilt 4, s. 122"
}

export interface TaxonNode {
  id: number;                    // yoğun iç kimlik == DFS ön-sıra indeksi
  gbifKey: number | null;        // null → kullanıcı eklemiş, henüz eşleşmemiş
  parentId: number | null;
  rank: 'CLASS'|'ORDER'|'FAMILY'|'GENUS'|'SPECIES'|'SUBSPECIES'|'VARIETY';
  name: string; authorship: string | null;
  subtreeEnd: number;            // alt ağaç == [id, subtreeEnd) — O(1) filtreleme
  childIds: number[];
  occurrenceCount: number; speciesCount: number; endemicCount: number;
  vernacularTr?: string;
  status: 'accepted' | 'user_submitted' | 'merged';
}
```

`PlantDetail` (nomenklatür, sinonimler, yaşam formu, habitat, yükselti, çiçeklenme,
substrat, endemizm, IUCN, floristik element, Davis kareleri, görseller, dış kimlikler,
kaynakça, `dataCompleteness`) tüm bilimsel alanları `Sourced<T>` sarmalı içinde tutar.
Öznitelik tablosu `domain/attributeSchema.ts` tarafından sürülür; boş alan gizlenmez,
**nedeniyle birlikte** "veri yok" der (`kaynakta-yok` / `henüz-küratörlenmedi`).

### İşlemsel katman (PostgreSQL)

```sql
users            id · email(uniq) · email_verified_at · password_hash(argon2id)
                 full_name · institution · orcid · title
                 role: 'user'|'moderator'|'admin'
                 academic_verified bool          -- .edu.tr doğrulanmış
                 is_active · created_at · last_login_at

sessions         id · user_id · expires_at · ip · user_agent    -- httpOnly çerez

taxa             id · dfs_id · subtree_end · scientific_name · authorship · rank
                 parent_id · gbif_key
                 status('accepted'|'user_submitted'|'merged') · merged_into_id
                 created_by · created_at

observations     id · taxon_id · user_id
                 geom geography(Point,4326)
                 coordinate_uncertainty_m int NOT NULL
                 location_method('pin'|'manual'|'admin_area'|'exif')
                 davis_square   GENERATED ALWAYS AS (...) STORED
                 province · district · locality · elevation_m
                 observed_on date NOT NULL · phenology · individual_count
                 habitat · substrate · notes
                 identified_by · herbarium_code · catalog_number
                 license · import_batch_id · verified_by_admin
                 status('published'|'removed') · created_at · updated_at
                 deleted_at · deleted_by · deletion_reason      -- yumuşak silme

observation_photos  id · observation_id · storage_path · thumb_path
                    width · height · bytes · license · photographer
                    exif_stripped bool · created_at · deleted_at

import_batches   id · user_id · filename · row_count · accepted · rejected
                 status('validating'|'committed'|'reverted') · created_at

audit_log        id · actor_user_id · action · entity_type · entity_id
                 before jsonb · after jsonb · reason · ip · created_at
```

**Topluluk kayıtları (`observations`) ile GBIF/herbaryum kayıtları yapısal olarak ayrıdır
ve asla aynı tabloda birleşmez.** Bu tartışılabilir bir tercih değil: bir araştırmacı, bir
öğrencinin doğrulanmamış iğnesini herbaryum örneğiyle karıştırmamalı. Haritada da ayrı
katman, ayrı sembol ve "doğrulanmamış topluluk kaydı" rozetiyle görünür.

**Silme = yumuşak silme.** `deleted_at` + `deleted_by` + `deletion_reason` + `audit_log`
kaydı. Fiziksel silme yalnızca ayrı bir admin işlemiyle ve N gün sonra. Akademik veri
kökeni geri alınabilirlik gerektirir; "yanlışlıkla sildim" senaryosu kurtarılabilir olmalı.

---

## Kullanıcı akışları

### Kayıt ve kimlik doğrulama

- E-posta + parola (argon2id). **E-posta doğrulaması yapılmadan hiçbir yazma işlemi yok.**
- `.edu.tr` ile biten adres doğrulanınca `academic_verified = true` → profilde ve
  kayıtlarda **"Doğrulanmış Akademisyen"** rozeti, daha yüksek günlük kota.
- Oturum: `httpOnly` + `Secure` + `SameSite=Strict` çerez, sunucu tarafında `sessions`
  tablosunda; çıkışta gerçekten iptal edilir.
- Parola sıfırlama, e-posta değişikliği, hesap silme (KVKK) uçları.

### Tekil kayıt girişi

Sihirbaz: **tür seçimi → konum → tarih ve gözlem detayı → fotoğraf → önizleme.**

- Tür alanı yerel taksonomi indeksine karşı otomatik tamamlama (Latince + Türkçe ad).
- Listede yoksa "yeni takson öner" → `taxa.status = 'user_submitted'`. Bu taksonlar
  ağaçta ayrı işaretle görünür ve admin bunları GBIF karşılığıyla **birleştirebilir**
  (`merged_into_id`). Böylece rastgele yazımlar taksonomi ağacını kirletmez.
- Konum: yukarıdaki dört yöntem; harita üzerinde canlı önizleme ve hesaplanan Davis
  karesinin anında gösterimi.
- Kaydedince anında yayınlanır ve haritada **ekleyenin adı, unvanı, kurumu ve rozeti**
  ile görünür.

### Excel ile toplu giriş

**Tek şablon, hem kullanıcı hem admin için aynı.** `GET /api/template.xlsx` her indirişte
sunucuda `exceljs` ile üretilir — açılır listeler o anki taksonomiden ve kontrollü
sözlüklerden dolar, yani şablon hiçbir zaman bayatlamaz.

Şablon üç sayfa:
1. **Kayıtlar** — veri girişi; zorunlu sütunlar renkli başlık, hücre doğrulama açılır
   listeleri, tarih ve sayı formatları önceden tanımlı.
2. **Sözlük** — Davis kareleri, il/ilçe listesi, IUCN kategorileri, fenoloji, yaşam
   formu, lisans seçenekleri, koordinat formatı örnekleri.
3. **Açıklama** — her sütunun anlamı, zorunluluk durumu, örnek satır.

Sütunlar: `scientificName*` · `taxonRank` · `vernacularNameTr` · `latitude` · `longitude` ·
`coordinateUncertaintyM` · `il` · `ilce` · `locality` · `elevationM` · `observedOn*` ·
`phenology` · `individualCount` · `habitat` · `substrate` · `identifiedBy` ·
`herbariumCode` · `catalogNumber` · `photoFileName` · `license` · `notes`
— (`latitude`+`longitude` **veya** `il`+`ilce` zorunlu; biri yeterli.)

**İki aşamalı yükleme — bu akışın en önemli parçası:**

```
1. Yükle   → sunucu satır satır doğrular (zod + taksonomi eşleştirme + coğrafi kontrol)
2. Önizleme: kaç satır geçerli, kaç satır hatalı, harita üzerinde önizleme
3. İndir:  "hatalar işaretli" Excel — her hatalı satırın yanında gerekçe sütunu
4. Kullanıcı düzeltip yeniden yükler → onaylayınca tek bir batch olarak yazılır
```

Hatalı dosyayı **açıklamalı Excel olarak geri vermek**, akademik kullanıcı için tek tek
form doldurmaktan kat kat verimli ve bu tasarımın kilit ayrıntısı. Her yükleme bir
`import_batches` kaydıdır; **admin tüm partiyi tek tıkla geri alabilir.**

Fotoğraflar isteğe bağlı bir ZIP ile yüklenir; `photoFileName` sütunu ZIP içindeki
dosyayla eşleştirilir.

### Fotoğraf yükleme

- Sunucu MIME'ı içerikten *sniff* eder (uzantıya güvenmez), boyut sınırı uygular
  (varsayılan 10 MB/dosya, 20 dosya/kayıt).
- **`sharp` ile yeniden kodlanır** — hem 320px küçük resim + 1600px görüntüleme türevleri
  üretilir hem de dosyaya gömülü olası zararlı yük yok edilir.
- **EXIF GPS okunup koordinat önerisi olarak kullanılır, sonra EXIF tamamen silinir**
  (fotoğrafçının ev adresi, cihaz seri numarası gibi kişisel veri sızmasın).
- Yükleyen lisans seçmek zorundadır (CC0 / CC-BY / CC-BY-NC / CC-BY-SA); lisans ve
  fotoğrafçı adı görselin altında **her zaman** gösterilir.

### Admin paneli

- **Moderasyon kuyruğu:** en yeni kayıtlar ve şüpheli kayıtlar (Türkiye dışı koordinat,
  gelecek tarihli gözlem, aşırı yüksek belirsizlik, aynı kullanıcıdan kısa sürede çok
  kayıt) üste çıkar.
- **Silme** gerekçe girilerek yapılır → yumuşak silme + `audit_log`.
- **Toplu işlemler:** bir `import_batch`'i geri alma, bir kullanıcının tüm kayıtlarını
  geri alma (vandalizm senaryosu), kullanıcı askıya alma.
- **Aynı Excel formatıyla admin toplu girişi** — tek fark, admin yüklemesi
  `verified_by_admin` bayrağı taşıyabilir ve kota kontrolüne takılmaz.
- **Takson birleştirme:** `user_submitted` taksonları kabul edilen taksona bağlama.
- **Denetim kaydı görüntüleyici:** kim, ne zaman, neyi değiştirdi.

---

## Taksonomik filtreleme — DFS aralık indeksi

Ağaç ingest sırasında derinlik-öncelikli gezilir, `id = ziyaretSırası` atanır ve
`subtreeEnd` kaydedilir:

```
takson T, seçili düğüm S'nin içinde  ⟺  S.id ≤ T.id < S.subtreeEnd
```

"Fabaceae" seçmek, occurrence başına **iki tam sayı karşılaştırmasına** iner. 500.000
kayıt tek bir `Uint32Array` taraması, ~2 ms. Faset filtreleri (endemizm, IUCN, floristik
element, yaşam formu, **kayıt kaynağı: GBIF / topluluk**) yükleme anında hazırlanan
`Uint32Array` bitset'leri ile bitwise AND'lenir. Metin araması FlexSearch üzerinden aynı
hatta girer. Çıktı tek bir `SelectionMask`; tüm katmanlar ve sayaçlar bunu tüketir.

Aynı aralık mantığı **SQL tarafında da** kullanılır: `taxa` tablosundaki `dfs_id` ve
`subtree_end` sayesinde "bu familyanın tüm topluluk kayıtları" sorgusu
`WHERE dfs_id >= $1 AND dfs_id < $2` olur — recursive CTE gerekmez.

---

## Harita katmanları

| Mod | Katman | Ne zaman |
|---|---|---|
| `davis` | 29 poligon üzerinde `fill` choropleth | **Varsayılan** — akademik görünüm |
| `cluster` | kümelenmiş GeoJSON üzerinde `circle` | "kayıtlar nerede" |
| `heatmap` | `heatmap` + z9 üstünde noktalar | yoğunluk okuması |

**Choropleth:** kaynak `promoteId: 'code'` ile bir kez yüklenir, `fill-color` bir
`feature-state` interpolasyonudur; filtre değişiminde 29 `setFeatureState` çağrısı yapılır
— geometri yeniden yüklenmez. Sınıflandırma yöntemi (kantil / Jenks / eşit aralık /
logaritmik) kullanıcı seçimlidir ve lejantta yazar.

**Normalizasyon varsayılanı ham kayıt sayısı değil, tür zenginliğidir.** Kayıt yoğunluğu
büyük ölçüde toplayıcı çabasını (üniversite ve yol yakınlığı) yansıtır; ham sayımı
"biyoçeşitlilik" diye sunmak bilimsel olarak yanıltıcı olurdu. Lejantta yöntem notu bulunur.

**Topluluk kayıtları ayrı bir katmandır** — farklı sembol (içi boş üçgen), farklı renk ve
belirsizlik yarıçapı dairesi. Lejantta "GBIF / herbaryum" ile "topluluk katkısı" ayrı
satırlar; kullanıcı katmanları bağımsız açıp kapatabilir ve **yalnızca herbaryum kayıtları**
görünümüne geçebilir. Bir noktaya tıklandığında ekleyenin adı, kurumu, rozeti, kayıt
tarihi ve lisansı görünür.

**Occurrence noktaları** seçim boyutuna göre kademelenir: ≤50k → istemci kümeleme;
50–300k → geniş yarıçap + heatmap; >300k → önceden pişirilmiş `overview.bin` örneklemi,
kesin noktalar yalnızca bbox yakınlaştırmasında.

**Basemap** takas edilebilir: `offline` (dev varsayılanı, uzak karo yok) ·
`eox-s2cloudless` (CC BY-NC-SA, **üretim varsayılanı**) · `esri-imagery` (ToS belirsiz) ·
`maptiler-satellite` (anahtar gerekir, koşulları en net olan). `AttributionBar` isteğe
bağlı değildir: basemap atfı + GBIF DOI + veri lisansları kapatılamaz biçimde gösterilir.

---

## Güvenlik ve kötüye kullanım

Seçilen kombinasyon — **açık kayıt + anında yayın** — katkıyı en çok teşvik eden, veri
kalitesi riski en yüksek olanıdır. Sizin kararınız; aşağıdaki önlemlerle uygulanacak:

- **E-posta doğrulaması olmadan yazma yok.** Tek başına en etkili spam filtresi.
- **Kota:** doğrulanmamış kullanıcı 50 kayıt/gün, `.edu.tr` doğrulanmış 500/gün, toplu
  yükleme dosya başına 5.000 satır. Değerler yapılandırılabilir.
- **`@fastify/rate-limit`** giriş, kayıt, parola sıfırlama ve yükleme uçlarında.
- **Otomatik şüphe işaretleri:** Türkiye bbox dışı koordinat, gelecek tarihli gözlem,
  aynı koordinatta yığılma, çok kısa sürede çok kayıt → moderasyon kuyruğunda üste çıkar.
- **Tek tıkla geri alma:** parti ve kullanıcı bazında. Vandalizm dakikalar içinde
  temizlenebilir olmalı.
- **`audit_log` hiçbir zaman silinmez.**
- Parola argon2id; oturum çerezleri `httpOnly`/`Secure`/`SameSite=Strict`;
  `@fastify/helmet` ile güvenlik başlıkları ve sıkı CSP; tüm girdiler zod şema
  doğrulamasından geçer; Drizzle parametreli sorgu kullanır (SQL enjeksiyon yüzeyi yok).
- Yüklenen dosyalar ayrı bir yolda, `X-Content-Type-Options: nosniff` ile servis edilir.

### KVKK

Kullanıcı adı, e-posta, kurum ve fotoğraf konum verisi işlendiği için: aydınlatma metni,
fotoğraf yüklemede açık rıza, hesap ve veri silme (`DELETE /api/me`), veri dışa aktarma
ucu ve `docs/KVKK.md` gerekir. **Hostinger'ın Türkiye veri merkezi bulunduğunu
doğrulayamadım** — yurt dışına veri aktarımı KVKK açısından ek yükümlülük doğurur. VPS'i
kurmadan önce bölge seçimini kontrol etmeniz ve gerekirse üniversitenizin hukuk / veri
sorumlusu birimine danışmanız gerekir. Bu, kod tarafında çözülebilecek bir konu değil.

---

## Dizin yapısı

```
TRbotanik/
├─ docs/          PLAN.md · DATA_SOURCES.md · KVKK.md · DEPLOY.md · API.md
├─ docker-compose.yml · docker-compose.dev.yml · .env.example
├─ deploy/        nginx.conf · Dockerfile.api · Dockerfile.web · certbot · backup.sh
├─ packages/
│  ├─ shared/     iki tarafın paylaştığı zod şemaları, tipler, davisAssign, sabitler
│  ├─ web/        React SPA (src/: app · data · domain · state · map · features · i18n · lib)
│  └─ api/
│     ├─ src/routes/    auth · observations · taxa · imports · media · admin · export
│     ├─ src/services/  excelTemplate · excelImport · photoProcess · audit · mailer · quota
│     ├─ src/db/        schema.ts · migrations/ · seed.ts
│     └─ src/plugins/   auth · rateLimit · errorHandler
├─ scripts/
│  ├─ build-davis-grid.mjs · extract-turkiye-border.mjs · make-fixtures.ts
│  └─ ingest/   01-taxonomy · 02-occurrences · 03-davis-assign
│                04-images · 05-merge-curated · 06-build-indexes
├─ data/         raw/(gitignore) · curated/(commit) · schema/
└─ public/data/  manifest · taxonomy · species-summary · davis-index · details/ · geo/
```

Monorepo (npm workspaces) — `packages/shared` sayesinde Davis hesabı, zod şemaları ve
Excel sütun tanımları **tek yerde** durur; frontend, backend ve ingest aynı kaynağı
kullanır. Aynı doğrulama kuralının üç yerde farklı yazılması, bu tür projelerde en yaygın
hata kaynağıdır.

---

## Veri çekme hattı (sizin makinenizde `npm run ingest`)

**`01-taxonomy`** — GBIF Backbone `Tracheophyta`'yı çıpa alır,
`/v1/occurrence/search/facet?country=TR&facet=familyKey` → `genusKey` → `speciesKey` ile
Türkiye alt kümesini keşfeder (backbone'u tamamen saymaktan çok daha ucuz).

**`02-occurrences`** — **Birincil: GBIF Download API.**
`POST /v1/occurrence/download/request` (predicate: `country=TR`, `taxonKey=7707728`,
`hasCoordinate=true`, `hasGeospatialIssue=false`), ücretsiz hesapla Basic auth, DwC-A ZIP.
**100.000 sınırı yoktur ve DOI üretir** — akademik atıf için gereken tam olarak budur;
DOI `manifest.json`'a yazılır ve arayüzde `CitationBlock`'ta gösterilir.
*Yedek (hesapsız):* `/v1/occurrence/search&limit=300`, sorgu uzayı familyaya, gerekirse
yıla bölünerek 100k offset duvarı aşılır.

**`03-davis-assign`** — aritmetik atama + `@turf` sınır doğrulaması. Hiçbir kareye
düşmeyen kayıtlar `null` + issue bayrağı alır, **sessizce atılmaz**. QC raporu literatürde
bildirilen karelerle çapraz kontrol yapar; uyuşmazlıklar gerçek yayılış genişlemesi veya
teşhis hatası sinyali olabilir, gizlenmez.

**`04-images`** — iNaturalist, yalnızca `photo_license=cc0,cc-by,cc-by-nc` +
`quality_grade=research`; lisansı veya fotoğrafçısı çözülemeyen görsel alınmaz.

**`05-merge-curated`** — GBIF tabanını `data/curated/*` ile birleştirir, her alanı
`Sourced<T>` ile sarar. **Projenin uzun vadeli bilimsel değeri burada:** bir yüksek lisans
öğrencisi 200 tür için `taxa-overrides.yaml` doldurabilir, TypeScript'e dokunmadan.

**`06-build-indexes`** — DFS numaralandırma, sayaç toplama, `taxonomy.json`,
`species-summary.json`, `davis-index.json`, `details/` parçaları, FlexSearch indeksi,
`overview.bin` ve artefakt başına SHA-256 içeren `manifest.json`.

---

## Fazlar

**Faz 1 — Yürüyen iskelet (bu konteynerde uçtan uca, sıfır ağ).**
Monorepo iskelesi · `world-atlas`'tan gerçek Türkiye sınırı ile `offline` basemap ·
üretilen 29 Davis karesi + choropleth + etiketler · 60 taksonluk fixture ağacı üzerinde
DFS aralık filtresi · kümelenmiş fixture noktaları · takson tıklaması → tam
`AttributeTable` + galeri · `DataModeBanner` · TR/EN. *Mimariyi kanıtlayan faz.*

**Faz 2 — Backend temeli.** Docker Compose (Postgres+PostGIS+API) · Drizzle şeması ve
migration'lar · kayıt/giriş/e-posta doğrulama/parola sıfırlama · oturum çerezleri ·
`.edu.tr` rozeti · rate limit · `audit_log` · MSW ile frontend entegrasyonu.

**Faz 3 — Tekil kayıt girişi.** Kayıt sihirbazı · dört konum yöntemi · takson otomatik
tamamlama ve `user_submitted` takson önerisi · fotoğraf yükleme (sharp, EXIF GPS okuma +
temizleme, lisans zorunlu) · haritada ayrı topluluk katmanı ve **ekleyen bilgisi**.

**Faz 4 — Excel toplu giriş.** Sunucuda üretilen şablon (canlı açılır listelerle) · iki
aşamalı doğrulama · hata işaretli Excel geri dönüşü · ZIP ile toplu fotoğraf ·
`import_batches` ve parti geri alma.

**Faz 5 — Admin paneli.** Moderasyon kuyruğu ve şüphe işaretleri · gerekçeli yumuşak
silme · parti/kullanıcı bazlı toplu geri alma · admin Excel girişi · takson birleştirme ·
denetim kaydı görüntüleyici · kullanıcı yönetimi.

**Faz 6 — Gerçek GBIF verisi.** Ingest hattı (`01`–`06`) · siz kendi makinenizde
çalıştırıp artefaktları bırakırsınız · fixture banner'ı kalkar · gerçek DOI ile
`CitationBlock` · uydu basemap'lerinin etkinleştirilmesi.

**Faz 7 — Dağıtım ve cila.** VPS kurulumu, nginx + Let's Encrypt, gecelik `pg_dump` +
medya yedeği, GitHub Actions ile SSH dağıtımı · CSV/GeoJSON/Darwin Core dışa aktarma ·
derin bağlanabilir URL (`?taxon=…&square=B4&mode=davis`) · yazdırma stil sayfası ·
erişilebilirlik ve mobil düzen.

---

## Doğrulama

- `npm run build` (tüm workspace'ler) · `npm run verify:data` artefakt şema doğrulaması.
- **Vitest birim:** `davisAssign` (10 şehir eşleşmesi teste sabitlenir) · grid üretiminin
  **29 kare** vermesi · `taxonomyIndex` DFS aralıkları · `filterEngine` bitset kesişimi ·
  Excel şablon üretimi ve **hatalı satır ayrıştırması** (bozuk tarih, eksik koordinat,
  bilinmeyen takson, Türkiye dışı nokta) · `coordinateUncertainty` türetimi.
- **API entegrasyon** (gerçek Postgres+PostGIS konteynerine karşı): kayıt/giriş akışı ·
  yetkilendirme (kullanıcı başkasının kaydını silemez) · kota aşımı · yumuşak silme ve
  `audit_log` yazımı · parti geri alma · `davis_square` generated column doğruluğu.
- **Playwright e2e** (`VITE_DATA_MODE=fixture`): harita yükleniyor · 29 kare çiziliyor ·
  familya seçimi choropleth'i ve sayaçları değiştiriyor · kareye tıklayınca tür listesi ·
  taksona tıklayınca öznitelik tablosu ve galeri · TR/EN geçişi · **giriş → kayıt ekleme →
  haritada ekleyen adıyla görünme** · **Excel indir → bozuk satırla yükle → hata raporu →
  düzelt → kaydet** · **admin silince kayıt haritadan kalkıyor, audit'e düşüyor.**
  Ekran görüntüleri size iletilir.
- **Güvenlik:** yükleme uçlarında MIME sahteciliği, aşırı boyut, ZIP bombası ve yol
  geçişi (`../`) senaryoları test edilir.

---

## Riskler

| # | Risk | Etki | Azaltma |
|---|---|---|---|
| R1 | **Açık kayıt + anında yayın** → hatalı/kötü niyetli veri yayında kalır | Yüksek | E-posta doğrulaması, kotalar, otomatik şüphe işaretleri, parti/kullanıcı bazlı tek tıkla geri alma, `audit_log`. Tepki süresini dakikalara indirir. Yük artarsa "rol bazlı onay"a geçiş **tek konfigürasyon değişikliği** olacak şekilde tasarlanacak |
| R2 | **Topluluk kaydının herbaryum kaydıyla karıştırılması** | Yüksek | Ayrı tablo, ayrı harita katmanı, ayrı sembol, "doğrulanmamış" rozeti, yalnızca-herbaryum görünümü, dışa aktarmada ayrı sütun |
| R3 | **GBIF tek başına öznitelik tablosunu dolduramaz** (habitat, yükselti, çiçeklenme, endemizm yok) | Yüksek | `Sourced<T>` + `data/curated/` katmanı; `dataCompleteness` gösterilir; boş hücre nedenini yazar; küratörlemeye öne çıkan endemiklerle başlanır |
| R4 | **Örnekleme yanlılığının biyoçeşitlilik diye sunulması** | Yüksek | Choropleth varsayılanı tür zenginliği; çabaya göre normalize seçenekleri; lejantta yöntem notu |
| R5 | **KVKK / yurt dışı veri aktarımı** — Hostinger'ın Türkiye DC'si doğrulanamadı | Orta | Bölge seçimi kurulumdan önce kontrol edilmeli; aydınlatma metni, açık rıza, veri silme/dışa aktarma uçları; hukuk birimine danışılmalı |
| R6 | **Kendi kendine barındırmanın işletme yükü** — yedek, TLS yenileme, güvenlik yaması artık sizde | Orta | `deploy/` altında Docker Compose, otomatik certbot yenileme, gecelik `pg_dump` + medya yedeği ve **geri yükleme provası** belgelenir (`docs/DEPLOY.md`) |
| R7 | **Kullanıcı taksonlarının taksonomiyi kirletmesi** | Orta | `status='user_submitted'` ayrı kova, ağaçta işaretli, admin birleştirme aracı, otomatik tamamlama yeni kayıt açmayı zorlaştırır |
| R8 | **Fotoğrafta telif ve zararlı içerik** | Orta | Zorunlu lisans seçimi, `sharp` ile yeniden kodlama (gömülü yükü yok eder), MIME sniff, boyut sınırı, EXIF temizleme, ihbar-kaldır akışı |
| R9 | GBIF ↔ Türkiye Bitkileri Listesi taksonomik uyuşmazlığı | Orta | GBIF *mekânsal* anahtar; kabul edilen Türkçe ad ayrı ve etiketli öznitelik olarak yan yana gösterilir, biri diğerine zorlanmaz |
| R10 | Veri hacmi (10⁶ occurrence) | Orta | Önce-toplulaştırma; ham noktalar yalnızca aktif seçim için; karolama ertelenir |
| R11 | Davis kare kıyı/sınır kırpmasının görsel detayı | Düşük | 2°×2° / 29 kare ve 10/10 şehir eşleşmesi doğrulandı; atama belirsiz değil. `isApproximate` bayrağı + literatür çapraz kontrolü |
| R12 | bizimbitkiler.org.tr'de açık API yok | Düşük | GBIF+POWO ile ilerlenir; Türkçe adlar için NGBB ile izinli paylaşım ayrıca görüşülmeli — **kazıma yapılmayacak** |

---

## Çalışma akışı

Tüm geliştirme `claude/turkiye-botanik-haritasi-di1550` dalında, anlamlı commit'lerle
yapılacak ve tamamlandığında push edilecek. PR yalnızca siz isterseniz açılır.

**Faz 1 bu oturumda uçtan uca teslim edilebilir.** Faz 2–5 (backend, katkı, Excel, admin)
bu konteynerde yazılıp Docker Compose ile yerelde test edilebilir; canlıya alınması VPS
erişimi gerektirir. Faz 6 sizin makinenizde GBIF ingest çalıştırmanıza bağlıdır.
