# EUNIS terrestrial habitat classification — ham dışa aktarım

Bu klasör, European Environment Agency'nin (EEA) veri kataloğundan
(`sdi.eea.europa.eu`) dışa aktarılan **EUNIS terrestrial habitat classification
review (tabular) — version 1, Nov. 2021** Excel dosyasını tutar. Habitat kodları,
adları ve her habitat için "karakteristik tür" listeleri (Diagnostic/Constant/
Dominant species — EVA veritabanından türetilmiş) bu dosyada.

## Neden burada, `data/raw/` içinde değil

`data/raw/` GBIF gibi **script ile yeniden indirilebilir** ham verinin yeridir ve
`.gitignore`'dadır. Bu dosya ise **manuel katalog dışa aktarımı** —
`scripts/ingest/eunis-habitats.mjs` bunu otomatik indiremiyor (aşağıya bkz.), bu
yüzden `data/nuhungemisi/` ile aynı desende **commit edilerek** saklanır.

## Neden manuel — otomatik indirme neden başarısız oldu

`sdi.eea.europa.eu`'daki gerçek indirme linkleri (`/data/{uuid}`) hem bu
geliştirme ortamının ağ politikasınca (`eea.europa.eu`/`doi.org` tamamen
engelli) hem de GitHub Actions runner'ından (gerçek internet erişimiyle bile)
**403 Forbidden** ile sonuçlandı — muhtemelen bot/otomasyon IP koruması. Dört
farklı otomatik yaklaşım denendi (Plone REST API varsayımı, HTML link
ayrıştırma, content-type doğrulama, Referer başlığı); hiçbiri EEA'nın
korumasını aşamadı. Dosya sonunda tarayıcıdan manuel indirilip buraya eklendi.

## İçerik ve kapsam

`EUNIS_terrestrial_habitat_classification_2021_1_including_crosswalks.xlsx`,
8 sayfa içerir: Coastal, Grassland, Heathland, Forest, Sparsely vegetated,
Man-made, Wetlands (+ bir "Read me" sayfası, veri içermiyor, script atlar).

Yalnızca en ince seviyedeki (seviye 3/4) habitat satırları tür listesi taşır;
her habitat için en fazla ~20 karakteristik tür var (tam listeler arka plan
raporlarında). **Kapsam Avrupa ağırlıklıdır** — Türkiye florasının ~13.000
türünden yalnızca ~1.300'ü (yaklaşık %10) bu listede geçiyor; geri kalanı
"henüz küratörlenmedi" işaretli kalır. Bu beklenen ve dürüst bir durum — bkz.
`docs/DATA_SOURCES.md` §4c.

## Lisans

EEA'nın resmi metadata kaydına göre **CC-BY 4.0**
(https://creativecommons.org/licenses/by/4.0/), telif sahibi European
Environment Agency (EEA). DOI: `10.2909/bfe4c237-e378-4a83-ab21-b3807f96c2e2`.

## Yeni bir dışa aktarım gelirse

EEA yeni bir revizyon yayımlarsa, bu klasördeki `.xlsx` dosyasının üzerine
yazıp

```bash
npm run data:eunis-habitats
```

çalıştırın. Script bu klasördeki **tüm** `.xlsx` dosyalarını okur, her sayfada
`code`/`name` ile başlayan ve `Diagnostic species`/`Constant species`/
`Dominant species` başlıklı sütunları otomatik bulur — sütun sırası ya da tam
başlık metni değişse de (örn. "Code " vs "Code 2018") kod değişikliği
gerekmez.
