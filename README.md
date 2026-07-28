# TRbotanik — Türkiye Botanik Çeşitliliği Haritası

Türkiye'nin bitki çeşitliliğini **Davis kareleme sistemi** üzerinde taksonomik olarak
keşfetmeye yarayan bir web uygulaması. Hedef kitle akademik personel ve üniversite
öğrencileridir.

Kullanıcı bitkileri sınıf → takım → familya → cins → tür hiyerarşisinde filtreler,
eşleşen taksonlar haritada görünür; bir tür seçildiğinde tüm özellikleri kaynak
bilgisiyle birlikte bir tabloda ve görselleriyle açılır.

> ⚠️ **Şu anki veri örnek (fixture) veridir.** Takson adları ve sınıflandırma gerçektir,
> ancak yayılış noktaları sentetik olarak üretilmiştir ve gerçek gözlem kaydı değildir.
> Gerçek veri için aşağıdaki *Gerçek veriye geçiş* bölümüne bakın.

---

## Hızlı başlangıç

```bash
npm install
npm run data:all      # Türkiye sınırı + Davis grid + örnek veri seti üretir
npm run dev           # http://localhost:5173
```

Uygulama **hiçbir dış hosta istek yapmadan** çalışır: altlık harita `offline` modunda,
veriler yerel dosyalardan gelir. Bu, ağ erişimi kısıtlı ortamlarda geliştirmeyi mümkün
kılar ve bir e2e testiyle sürekli doğrulanır.

### Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | Üretim derlemesi |
| `npm run typecheck` | TypeScript denetimi (tüm paketler) |
| `npm test` | Birim testleri (Vitest) |
| `npm run e2e` | Uçtan uca testler (Playwright) |
| `npm run data:border` | Türkiye sınırını `world-atlas`'tan çıkarır |
| `npm run data:grid` | 29 Davis karesini üretip sınıra kırpar |
| `npm run data:fixtures` | Örnek takson/yayılış veri setini üretir |

---

## Davis kareleme sistemi

P. H. Davis'in *Flora of Turkey and the East Aegean Islands* (1965–1988) eserinde
kullanılan ve Türk floristik literatürünün standardı olan sistem. **2 derecelik**
enlem/boylam aralıklarına dayanır ve Türkiye'yi **29 kareye** böler:

- **Satırlar:** `A` = 40–42°N · `B` = 38–40°N · `C` = 36–38°N
- **Sütunlar:** `n` = `(24 + 2n)°E` → `(26 + 2n)°E` (1 = 26–28°E … 10 = 44–46°E)
- **Kareler:** A1–A9 + B1–B10 + C1–C10 = 29 (A10 Türkiye dışında kalır, tanımsızdır)

Grid harici bir veri setinden indirilmez; bu tanımdan üretilir
(`packages/shared/src/davis.ts`) ve `@turf` ile Türkiye kara sınırına kırpılır.
Üretilen karelerin toplam kara alanı ~779.400 km², Türkiye'nin gerçek yüzölçümünün
(~783.562 km²) **%99,5'i** — fark kıyı çizgisi genelleştirmesinden gelir.

Formül, yayınlanmış floristik literatürdeki bilinen kare atamalarının **10/10'unu**
doğru üretir ve bu testle sabitlenmiştir (`packages/shared/src/davis.test.ts`):

> İstanbul A2 · Ankara B4 · İzmir B1 · Van B9 · Antalya C3
> Gaziantep C6 · Tunceli B7 · Osmaneli A3 · Kastamonu A4 · Kars A9

---

## Mimari

Monorepo (npm workspaces):

```
packages/shared/   Tipler, Davis hesabı, DFS taksonomi indeksi — her yerde paylaşılır
packages/web/      React + Vite + MapLibre GL arayüzü
scripts/           Veri üretim scriptleri (grid, sınır, fixture)
docs/              PLAN.md (yol haritası), DATA_SOURCES.md (kaynak ve lisanslar)
```

### Öne çıkan tasarım kararları

**Öznitelik bazlı kaynak (provenance).** GBIF ad, familya ve koordinat verir; yaşam
formu, habitat, yükselti, çiçeklenme dönemi ve endemizm **vermez** — bunlar
literatürden küratörlenir. Her öznitelik `Sourced<T>` içinde kendi kaynağını taşır ve
tabloda kaynak rozeti gösterilir. Akademik bir tabloda bu ikisini ayırt edememek
kabul edilemez.

**Boş alanlar gizlenmez.** Bir öznitelik boşsa satır kaldırılmaz; "veri yok" der ve
*gerekçesini* yazar (`kaynakta yok` / `henüz küratörlenmedi`). Araştırmacı için bu
ikisi arasındaki fark anlamlıdır.

**DFS aralık indeksi.** Taksonomi ağacı derinlik-öncelikli numaralandırılır; bir
düğümün alt ağacı `[id, subtreeEnd)` bitişik aralığıdır. Böylece "Fabaceae'nin tüm
kayıtları" filtresi kayıt başına iki tam sayı karşılaştırmasına iner — ağaç gezintisi
veya recursive sorgu gerekmez.

**Choropleth varsayılanı tür zenginliğidir, ham kayıt sayısı değil.** Kayıt yoğunluğu
büyük ölçüde toplayıcı çabasını (üniversite ve yol yakınlığı) yansıtır; ham sayımı
"biyoçeşitlilik" diye sunmak bilimsel olarak yanıltıcı olur. Ham sayım seçildiğinde
lejantta yöntem uyarısı görünür.

**Topluluk kayıtları ayrıdır.** Kullanıcı katkıları (Faz 3) GBIF/herbaryum kayıtlarıyla
aynı tabloda birleşmez; ayrı katman, ayrı sembol ve "doğrulanmamış" rozetiyle gösterilir.

**Glyph bağımlılığı yok.** Davis kare etiketleri sembol katmanı yerine HTML
işaretçisidir; MapLibre'nin sembol katmanı uzak bir yazı tipi adresi gerektirdiği için
bu tercih uygulamanın tamamen çevrimdışı çalışmasını sağlar.

---

## Altlık harita

`.env` içindeki `VITE_BASEMAP` ile seçilir:

| Değer | Kaynak | Not |
|---|---|---|
| `offline` | Yok (düz arka plan + ülke sınırı) | **Geliştirme varsayılanı**, sıfır ağ |
| `eox-s2cloudless` | EOX Sentinel-2 cloudless | CC BY-NC-SA 4.0 — akademik kullanıma uygun |
| `esri-imagery` | Esri World Imagery | Kullanım koşulları belirsiz, bkz. `docs/DATA_SOURCES.md` |
| `maptiler-satellite` | MapTiler | `VITE_MAPTILER_KEY` gerekir; koşulları en net olan |

Atıf çubuğu kapatılamaz: altlık atfı, veri lisansları ve (gerçek veriye geçildiğinde)
GBIF indirme DOI'si burada gösterilir.

> **Doğrulama notu:** `offline` dışındaki altlıkların karo adresleri, geliştirme
> ortamının ağ politikası nedeniyle test edilememiştir. Üretime almadan önce her birinin
> çalıştığı doğrulanmalıdır.

---

## Gerçek veriye geçiş

Örnek veri, gerçek GBIF verisiyle değiştirilebilir. Veri çekme hattı (`scripts/ingest/`)
**Faz 6'da** yazılacak ve kendi makinenizde çalıştırılacaktır:

1. Ücretsiz bir GBIF hesabı açın.
2. `npm run ingest` — GBIF Download API ile Türkiye damarlı bitki kayıtlarını indirir.
   Bu yol 100.000 kayıt sınırına takılmaz ve **atıf için bir DOI üretir**.
3. Üretilen artefaktlar `packages/web/public/data/` altına yazılır; uygulama kod
   değişikliği olmadan gerçek veriye geçer, örnek veri uyarı bandı kalkar.

Yol haritasının tamamı için `docs/PLAN.md`.

### Resmi il bazlı küratörleme — Nuh'un Gemisi

`data/nuhungemisi/` altında T.C. Tarım ve Orman Bakanlığı'nın Nuh'un Gemisi Ulusal
Biyolojik Çeşitlilik Veritabanı'ndan dışa aktarılan dosyalar bulunur. Bu kaynak
koordinat içermez (haritaya nokta ekleyemez) ama **resmi endemizm durumu ve IUCN
kategorisi** sağlar — GBIF'in hiç vermediği alanlar. `npm run data:nuhungemisi`
bu dosyaları işler; `data:all` zincirine dahildir. Şu an yalnızca 10/81 il kapsanıyor;
yeni bölge dışa aktarımı eklendiğinde kapsam otomatik genişler (bkz.
`data/nuhungemisi/README.md`).

---

## Testler

```bash
npm test      # 55 birim testi: Davis hesabı, grid geometrisi, DFS indeksi, filtreler
npm run e2e   # 11 uçtan uca test: harita, filtreleme, detay tablosu, TR/EN
```

E2E testlerinden biri, uygulamanın **hiçbir dış hosta istek yapmadığını** doğrular —
çevrimdışı çalışma güvencesi böylece regresyona karşı korunur.

---

## Lisans

Kod: MIT (bkz. `LICENSE`). Veri kaynaklarının lisansları ayrıdır ve
`docs/DATA_SOURCES.md` içinde tek tek listelenmiştir.

---

## Tek dosyalık paylaşım sürümü

Uygulamanın tamamı — kod, stiller ve veri seti — tek bir HTML dosyasına gömülebilir.
Bu dosya bir sunucu gerektirmez ve hiçbir dış hosta istek yapmaz:

```bash
npm run artifact     # → dist-artifact/trbotanik.html (~2,6 MB)
```

Demo, sunum ve ağa kapalı ortamlarda paylaşım için kullanışlıdır. Gömülü veri yolu
yalnızca bu derlemede etkindir; normal derlemede koşul statik olarak elenir ve veri
paketi çıktının içine hiç girmez.
