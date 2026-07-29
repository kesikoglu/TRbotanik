# Nuh'un Gemisi Ulusal Biyolojik Çeşitlilik Veritabanı — ham dışa aktarım

Bu klasör, T.C. Tarım ve Orman Bakanlığı'nın **Nuh'un Gemisi Projesi** istatistik
portalından (`nuhungemisi.tarimorman.gov.tr/public/istatistik`) dışa aktarılan resmi
tür envanteri dosyasını tutar.

## Neden burada, `data/raw/` içinde değil

`data/raw/` GBIF gibi **script ile yeniden indirilebilir** ham verinin yeridir ve
`.gitignore`'dadır. Bu dosya ise **manuel portal dışa aktarımı** — otomatik olarak
yeniden üretilemez, bu yüzden `data/nuhungemisi/` altında **commit edilerek** saklanır.

## Bilinen kısıt: koordinat yok

Dışa aktarım yalnızca şu sütunları içerir: `Bölge`, `Şehir`, `Canlı Grubu`, `Tür`,
`Endemizim`, `IUCN`, `İzlenecek`. **Enlem/boylam bulunmuyor.** Bu yüzden bu veri
Davis karesi haritasına nokta olarak işlenemez; yalnızca **öznitelik küratörleme**
kaynağı olarak kullanılır (özellikle resmi endemizm durumu ve IUCN kategorisi —
GBIF'in hiç sağlamadığı alanlar).

## Kapsam durumu — TAMAMLANDI

| Dosya | Bölge Müdürlükleri | İller | Satır |
|---|---|---|---|
| `NuhunGemisiNoktaListesi.xlsx` | I–XV (tamamı) | **81/81 (tüm Türkiye)** | 881.523 |

Damarlı bitkiler: 409.223 satır, 11.949 benzersiz tür; 34.692 "Endemik" +
1.073 "Lokal Endemik" kayıt.

> Önceki `bolge-01-02.xlsx` (yalnızca I-II. Bölge, 10 il) bu dosyayla **tamamen
> kapsandığı** için kaldırıldı — aynı anda tutulması `recordCount` gibi
> toplamlarda çift sayıma yol açardı.

## Yeni bir dışa aktarım gelirse

Portal verisini güncelleyip yeni bir dışa aktarım paylaşırsanız, bu dosyanın üzerine
yazın (veya açıkça farklı bir isimle ekleyin) ve

```bash
npm run data:nuhungemisi
```

çalıştırın. Script bu klasördeki **tüm** `.xlsx` dosyalarını okur, "Damarlı Bitkiler"
satırlarını süzer, tür bazında birleştirir ve `derived.json` üretir (gitignore'da).
Birden fazla dosya varsa ve bunlar ÖRTÜŞÜYORSA (aynı kayıtları farklı dosyalarda
tutuyorsa), `recordCount` şişer — örtüşme varsa eski dosyayı kaldırın.

## Lisans notu

Bu resmi bir devlet veritabanı dışa aktarımıdır; portalda açık bir yeniden dağıtım
lisansı (CC0/CC-BY vb.) beyanına rastlanmadı. `derived.json` çıktısı yalnızca tür
küratörlemesi için dahili olarak kullanılır. Repo herkese açık olduğu için ham dosya
da (ve ondan türetilen veriler) herkese açıktır — bu, proje sahibinin bilgisi
dahilinde kabul edilmiş bir durumdur (bkz. proje geçmişi). Üçüncü taraflarla ayrıca
paylaşım/dağıtım öncesinde Bakanlık ile teyit edilmesi yine de önerilir.
