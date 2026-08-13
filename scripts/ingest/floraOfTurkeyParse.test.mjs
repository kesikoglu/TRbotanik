import { describe, expect, it } from 'vitest';
import { extractDavisSquares } from './floraOfTurkeyParse.mjs';

describe('Flora of Turkey OCR metninden Davis kare çıkarımı', () => {
  it('temiz kodları çıkarır', () => {
    expect(extractDavisSquares('C6 Adana: nr. Osmaniye, 250 m, Wagenitz 427.')).toEqual(['C6']);
  });

  it('parantezli alt kodları (Avrupa/Asya yakası gibi) göz ardı edip kodu yakalar', () => {
    expect(extractDavisSquares('A2(A) Istanbul: Prinkipo, 1903, Azn.!')).toEqual(['A2']);
  });

  it("OCR karışıklığını normalize eder ('S'->'5', 'l'/'I'->'1')", () => {
    expect(extractDavisSquares('AS Amasya: Kyras De., nr. Amasya, 400 m, Bornm.!')).toEqual(['A5']);
    expect(extractDavisSquares('Bl Balik~ir: Zeytinli, nr. Edremit, Sint. 1883:529!')).toEqual(['B1']);
  });

  it('geçersiz karelere (ör. A10 yok) düşen normalize sonuçları reddeder', () => {
    expect(extractDavisSquares('AIO Agri: bir yerde, D. 123.')).toEqual([]);
  });

  it('sayfa sütun genişliği yüzünden ikiye bölünmüş yer adlarını birleştirir', () => {
    expect(extractDavisSquares('A3 Zon\n      guldak: Devrek to Dirgine.')).toEqual(['A3']);
    expect(extractDavisSquares('C3 An\ntalya: between Manavgat and Alanya.')).toEqual(['C3']);
  });

  it('sıradan cümle kırılmalarını (iki ayrı kelime arası) birleştirmez', () => {
    // "Fixed" ":" ile bitmiyor, bu yüzden dehyphenate tetiklenmemeli.
    expect(extractDavisSquares('A2 Istanbul: some place. Fixed\ndunes, macchie.')).toEqual(['A2']);
  });

  it('gerçek (uzun, OCR gürültülü) bir paragraftan birden çok kareyi çıkarır', () => {
    const text = `
      Outer Anatolia. A2(E) Istanbul: Therapia, 26 vi 1890, Azn.! A2(A) Kocaeli:
      Rereke, 100 m, D. 42014! Bursa: 5 km E of Gemlik, 150 m, D. 47791! A3 Zon
      guldak: Devrek to Dirgine, 100 m, D. 37678! A4 Zonguldak: Karabiik, gorge
      of Filyos <;ay, 250 m, D. 38932! AS Amasya: Kyras De., nr. Amasya, 400 m,
      Bornm. 1890:2656! Bl Balik~ir: Zeytinli, nr. Edremit, Sint. 1883:529! C2
      Mugla: d. Marmaris, Risar6nii to Tiirgut, 50-100 m, D. 41139! C3 An
      talya: d. Manavgat, Sekis to Manavgat, 10m, D. 25764! C6Adana: Raruniye to Fevzi
      p~a, 700 m, D. 26804!
    `;
    const squares = extractDavisSquares(text);
    expect(new Set(squares)).toEqual(new Set(['A2', 'A3', 'A4', 'A5', 'B1', 'C2', 'C3', 'C6']));
  });

  it('metin yoksa boş dizi döner', () => {
    expect(extractDavisSquares('')).toEqual([]);
    expect(extractDavisSquares(null)).toEqual([]);
  });

  it('tekrarlayan kod atıflarını tekilleştirir', () => {
    expect(extractDavisSquares('C2 Mugla: filanca! C2 Mugla: falanca!')).toEqual(['C2']);
  });

  it('köşeli parantezli kodları yakalar (Podlech & Zarre biçimi: "İl: [KOD] yer")', () => {
    expect(extractDavisSquares('Kayseri: [B5] above Talas, Agida mt., 1900 m, Balls 1234!')).toEqual(['B5']);
  });

  it('köşeli parantez içindeki OCR karışıklığını da normalize eder', () => {
    expect(extractDavisSquares('Konya: [CS] Seydişehir, Tinaz Dagi, 1500 m.')).toEqual(['C5']);
  });

  it('parantez içinde kod dışında metin varsa eşleştirmez (belirsiz bağlam)', () => {
    expect(extractDavisSquares('[C5 Ratay] Akra Da., bir yerde.')).toEqual([]);
  });

  it('aynı paragrafta hem iki nokta üst üste hem köşeli parantez biçimini birlikte çıkarır', () => {
    const text = 'Specimens examined: Turkey. Konya: [C4] Seydişehir; K. Maraş: [C4] above Koraslin. C6 Adana: nr. Osmaniye.';
    expect(new Set(extractDavisSquares(text))).toEqual(new Set(['C4', 'C6']));
  });
});
