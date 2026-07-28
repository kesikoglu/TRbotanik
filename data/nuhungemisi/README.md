# Nuh'un Gemisi Ulusal Biyolojik Çeşitlilik Veritabanı — ham dışa aktarımlar

Bu klasör, T.C. Tarım ve Orman Bakanlığı'nın **Nuh'un Gemisi Projesi** istatistik
portalından (`nuhungemisi.tarimorman.gov.tr/public/istatistik`) dışa aktarılan resmi
tür envanteri dosyalarını tutar.

## Neden burada, `data/raw/` içinde değil

`data/raw/` GBIF gibi **script ile yeniden indirilebilir** ham verinin yeridir ve
`.gitignore`'dadır. Bu dosyalar ise **manuel portal dışa aktarımı** — otomatik olarak
yeniden üretilemez, bu yüzden `data/nuhungemisi/` altında **commit edilerek** saklanır.

## Bilinen kısıt: koordinat yok

Dışa aktarım yalnızca şu sütunları içerir: `Bölge`, `Şehir`, `Canlı Grubu`, `Tür`,
`Endemizim`, `IUCN`, `İzlenecek`. **Enlem/boylam bulunmuyor.** Bu yüzden bu veri
Davis karesi haritasına nokta olarak işlenemez; yalnızca **öznitelik küratörleme**
kaynağı olarak kullanılır (özellikle resmi endemizm durumu ve IUCN kategorisi —
GBIF'in hiç sağlamadığı alanlar).

## Kapsam durumu

| Dosya | Bölge Müdürlükleri | İller |
|---|---|---|
| `bolge-01-02.xlsx` | I. ve II. Bölge Müdürlüğü | Edirne, Kırklareli, Tekirdağ, İstanbul, Kocaeli, Sakarya, Balıkesir, Bilecik, Bursa, Çanakkale |

Türkiye'de toplam 9 Bölge Müdürlüğü bulunuyor (81 ili kapsayacak şekilde). **Bu klasörde
şu anda yalnızca 2/9 bölge var.**

### Yeni bölge eklerken

Portaldan yeni bir bölge/il seti dışa aktardığınızda, dosyayı bu klasöre
`bolge-XX-YY.xlsx` deseniyle (kapsadığı bölge numaralarını belirterek) ekleyin ve

```bash
npm run data:nuhungemisi
```

çalıştırın. Script bu klasördeki **tüm** `.xlsx` dosyalarını okur, "Damarlı Bitkiler"
satırlarını süzer, tür bazında birleştirir ve `derived.json` üretir — zaten var olan
dosyalara dokunmanız gerekmez, script birikimli çalışır.

## Lisans notu

Bu resmi bir devlet veritabanı dışa aktarımıdır; portalda açık bir yeniden dağıtım
lisansı (CC0/CC-BY vb.) beyanına rastlanmadı. `derived.json` çıktısı yalnızca tür
küratörlemesi için dahili olarak kullanılır; ham dosyanın veya türetilmiş verinin
üçüncü taraflarla paylaşılması öncesinde Bakanlık ile teyit edilmesi önerilir.
