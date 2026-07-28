# Veri kaynakları, lisanslar ve atıf

Bu belge projenin kullandığı her dış kaynağı, lisansını ve gösterilmesi zorunlu atıf
metnini listeler. Atıf yükümlülüğü olan veri kullanan bir projede bu bir nezaket değil,
yasal gerekliliktir.

---

## 1. Sınır verisi — Natural Earth

| | |
|---|---|
| **Ne** | Türkiye kara sınırı poligonu (1:10m) |
| **Nereden** | `world-atlas` npm paketi (TopoJSON) |
| **Lisans** | Kamu malı (public domain) |
| **Atıf** | Zorunlu değil; yine de "Sınır verisi: Natural Earth" olarak gösteriliyor |
| **Kullanım** | `scripts/extract-turkiye-border.mjs` → `public/data/geo/turkiye.geojson` |

npm paketi olarak geldiği için harici bir indirme gerektirmez; ağ erişimi kısıtlı
ortamlarda da çalışır.

---

## 2. Davis kareleme sistemi

| | |
|---|---|
| **Ne** | Türkiye'yi 29 kareye bölen floristik kareleme sistemi |
| **Kaynak** | Davis, P. H. (ed.) (1965–1988) *Flora of Turkey and the East Aegean Islands*, cilt 1–10. Edinburgh University Press |
| **Lisans** | Sistemin kendisi (2°×2° graticule tanımı) bir olgudur, telif konusu değildir |
| **Kullanım** | `packages/shared/src/davis.ts` — geometri bu tanımdan üretilir |

Kare geometrisi hiçbir üçüncü taraf veri setinden kopyalanmamıştır; 2 derecelik
enlem/boylam tanımından hesaplanır. Doğruluğu, yayınlanmış literatürdeki bilinen kare
atamalarıyla test edilerek sabitlenmiştir.

---

## 3. Occurrence verisi — GBIF *(Faz 6)*

| | |
|---|---|
| **Ne** | Türkiye damarlı bitki (Tracheophyta) kayıtları |
| **Uç nokta** | `https://api.gbif.org/v1/occurrence/download/request` |
| **Lisans** | Veri seti başına CC0 / CC-BY / CC-BY-NC |
| **Atıf** | **İndirme DOI'si zorunludur** ve arayüzdeki atıf çubuğunda gösterilir |

GBIF Download API tercih edilir çünkü (a) 100.000 kayıt offset sınırına takılmaz,
(b) atıf yapılabilir bir DOI üretir. Akademik kullanımda DOI olmadan veri paylaşmak
kabul edilebilir değildir.

Örnek atıf biçimi:

> GBIF.org (erişim tarihi), GBIF Occurrence Download, https://doi.org/10.15468/dl.XXXXXX

CC-BY-NC lisanslı veri setleri içeren bir indirme, projenin ticari kullanımını kısıtlar.
Ticarileşme düşünülüyorsa indirme sırasında `license=CC0,CC_BY` süzgeci uygulanmalıdır.

---

## 4. Görseller — iNaturalist *(Faz 4)*

| | |
|---|---|
| **Uç nokta** | `https://api.inaturalist.org/v1/observations` |
| **Süzgeç** | `photo_license=cc0,cc-by,cc-by-nc` ve `quality_grade=research` |
| **Atıf** | Fotoğrafçı adı ve lisans her görselin altında zorunlu |

Lisansı veya fotoğrafçısı çözülemeyen görsel alınmaz. Hız sınırı dakikada 60 istektir
ve açıklayıcı bir `User-Agent` gönderilmelidir.

---

## 5. Taksonomi ve tür bilgisi

| Kaynak | Kullanım | Not |
|---|---|---|
| **GBIF Backbone** | Mekânsal anahtar — occurrence kayıtları bunu taşır | `api.gbif.org/v1/species` |
| **POWO (Kew)** | Kabul edilen ad, sinonim, protolog | `powo.science.kew.org` |
| **Euro+Med PlantBase** | Avrupa/Akdeniz taksonomisi | |
| **Flora of Turkey** | Habitat, yükselti, çiçeklenme, Davis kareleri, endemizm | Küratörlü giriş |
| **Türkiye Bitkileri Listesi** (Nezahat Gökyiğit Botanik Bahçesi) | Türkçe adlar, ulusal kabul edilen adlandırma | **Açık API'si yok** |

**bizimbitkiler.org.tr için not:** Sitenin açık bir API'si bulunmamaktadır ve
**kazıma (scraping) yapılmayacaktır.** Türkçe adlar ve ulusal taksonomi için NGBB ile
izinli veri paylaşımı ayrıca görüşülmelidir.

**Taksonomik uyuşmazlık:** GBIF Backbone ile Türkiye Bitkileri Listesi özellikle
*Astragalus*, *Verbascum* ve *Centaurea* cinslerinde ayrışır. Proje GBIF'i *mekânsal*
anahtar olarak kullanır; ulusal kabul edilen ad ayrı ve açıkça etiketli bir öznitelik
olarak yan yana gösterilir. Biri diğerine zorlanmaz.

---

## 6. Altlık haritalar

### `offline` *(geliştirme varsayılanı)*
Uzak karo yoktur. Yalnızca yerel ülke poligonu çizilir. Sıfır dış istek.

### `eox-s2cloudless` *(üretim için önerilen)*
| | |
|---|---|
| **Ne** | Sentinel-2 cloudless bulutsuz mozaik |
| **Lisans** | **CC BY-NC-SA 4.0** (2024 katmanı) |
| **Atıf (zorunlu)** | `Sentinel-2 cloudless — https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)` |

Ticari olmayan akademik kullanıma uygundur. **Projenin ticarileşmesi hâlinde bu altlık
kullanılamaz.**

### `esri-imagery`
| | |
|---|---|
| **Ne** | Esri World Imagery |
| **Lisans** | ⚠️ **Belirsiz.** Esri, bu uç noktanın kullanımını vektör veri sayısallaştırma ve düzenleme doğrulaması için açıkça izinli kılar; diğer kullanımlar Esri Master Agreement'a tabidir. |
| **Atıf** | `Esri, Maxar, Earthstar Geographics ve GIS kullanıcı topluluğu` |

Bu altlık bilinçli bir tercih gerektirir. Kurumsal bir dağıtımdan önce Esri ile lisans
durumu netleştirilmelidir.

### `maptiler-satellite`
| | |
|---|---|
| **Lisans** | Ücretsiz kademe mevcut, API anahtarı gerekir |
| **Atıf** | `© MapTiler © OpenStreetMap katkıcıları` |

Kullanım koşulları en net olan seçenektir. Üniversite bir anahtar finanse edebiliyorsa
üretim için önerilir.

> **Doğrulama notu:** `offline` dışındaki altlıkların karo adresleri, geliştirme
> ortamının ağ politikası (tüm harici hostlar engelli) nedeniyle **test edilememiştir.**
> Üretime almadan önce her birinin çalıştığı doğrulanmalıdır.

---

## 7. Örnek (fixture) veri

`scripts/fixtures/taxa.mjs` ve `scripts/make-fixtures.mjs`.

- **Takson adları ve sınıflandırma gerçektir** — Türkiye florasında bulunan gerçek
  taksonlardır.
- **Yayılış noktaları tamamen sentetiktir** — tohumlu bir rastgele sayı üretecinden
  gelir, gerçek gözlem kaydı değildir.
- Öznitelikler yalnızca güvenilir biçimde bilindiğinde doldurulmuştur; emin olunmayan
  hiçbir alan tahmin edilmemiş, `null` bırakılmıştır.
- Görseller yerel üretilmiş SVG yer tutuculardır, fotoğraf değildir.

Uygulama bu modda kalıcı bir uyarı bandı gösterir ve `manifest.json` içinde
`mode: "fixture"` taşır. **Bilimsel amaçla kullanılamaz.**
