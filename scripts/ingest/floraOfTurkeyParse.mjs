/**
 * Flora of Turkey (P. H. Davis, 1965–1988) ciltlerinden OCR ile çıkarılmış
 * tür kayıtlarını (`data/curated/flora-of-turkey/*.xlsx`) ayrıştırır ve
 * metindeki Davis kare atıflarını (ör. "A2(A) Istanbul:", "C6 Adana:")
 * çıkarır.
 *
 * Bu ciltler Davis kareleme sisteminin BİZZAT kaynağıdır (bkz. davis.ts
 * başlık yorumu) — dolayısıyla `PlantDetail.davisSquares` ("literatürde
 * bildirilen yayılış") alanı için mümkün olan en yetkili kaynaktır.
 *
 * Kaynak dosyalar bir PDF taramasının OCR çıktısından üretildi; metin
 * kaçınılmaz OCR gürültüsü içerir (satır içi tire bölünmeleri, "5"↔"S",
 * "1"↔"l"/"I" karışıklığı, sayfa başlığı/numarası sızıntıları). Bu yüzden
 * kare kodları yalnızca "KOD(alt-kod)? İl-adı:" biçimindeki güçlü bir
 * bağlamda aranır VE normalize edildikten sonra 29 geçerli Davis karesinden
 * biri değilse atılır — tahmin yürütülmez.
 */
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { DAVIS_CODES } from '@trbotanik/shared';

const VALID_CODES = new Set(DAVIS_CODES);

// Yer adı bölümü kasıtlı olarak GEVŞEK tutulur (yalnızca ilk harfin büyük
// olması ve iki nokta üst üste ile bitmesi şartı) — OCR, yer adının içine
// "~" gibi çöp karakterler sokabiliyor (ör. "Balik~ir") veya kod ile yer
// adı arasındaki boşluğu tamamen düşürebiliyor (ör. "C6Adana:"). Asıl
// güvenlik, baştaki KESİN "[ABC]+rakam" eşleşmesinden gelir.
const CODE_PATTERN = /\b([ABC])([\dSslIO]{1,2})(\([A-Z]\))?\s*([A-ZÇĞİÖŞÜ][^\s:]{0,30}):/g;

function normalizeDigits(text) {
  return text.replace(/S/g, '5').replace(/s/g, '5').replace(/[lI]/g, '1').replace(/O/g, '0');
}

/**
 * Basılı sayfanın dar sütun genişliği yüzünden bir yer adının ortadan ikiye
 * bölündüğü satır kırılmalarını birleştirir (ör. "Zon\n      guldak:" ->
 * "Zonguldak:"). Yalnızca büyük harfle başlayan bir parça, ardından satır
 * sonu, ardından ":" ile biten küçük harfli bir devam parçası görüldüğünde
 * uygulanır — bu dar bağlam yüzünden metindeki sıradan cümle kırılmalarını
 * (iki ayrı kelime arasında olur, ikincisi ":" ile bitmez) etkilemez.
 */
function dehyphenateWraps(text) {
  return text.replace(/([A-ZÇĞİÖŞÜ][a-zçğıöşü]*)\s*\n\s*([a-zçğıöşü]+:)/g, '$1$2');
}

/** Serbest metinden geçerli Davis kare kodlarını çıkarır (sırasız, tekrarsız). */
export function extractDavisSquares(text) {
  if (!text) return [];
  const cleaned = dehyphenateWraps(text);
  const codes = new Set();
  for (const match of cleaned.matchAll(CODE_PATTERN)) {
    const code = match[1] + normalizeDigits(match[2]);
    if (VALID_CODES.has(code)) codes.add(code);
  }
  return [...codes];
}

/** Kayıt ID'lerinin bu ciltlerde izlediği önek (ör. "TRB3-0001") — başlık/boş satırları eler. */
const RECORD_ID_PATTERN = /^TRB\d+-/;

/**
 * Bir cilt çalışma kitabını (ExcelJS Workbook) ayrıştırır.
 *
 * "Bitki Kayıtları" sayfası Kayıt ID -> Bilimsel Ad eşlemesini, "Bilgi
 * Metinleri" sayfası Kayıt ID -> tam metni (birden çok parçaya
 * bölünmüşse Parça No sırasıyla birleştirilir) verir.
 *
 * @returns {Map<string, Set<string>>} bilimsel ad -> Davis kare kodları
 */
export function parseVolumeWorkbook(workbook) {
  const recordsSheet = workbook.getWorksheet('Bitki Kayıtları');
  const textSheet = workbook.getWorksheet('Bilgi Metinleri');
  if (!recordsSheet || !textSheet) return new Map();

  const idToName = new Map();
  recordsSheet.eachRow((row) => {
    const id = row.getCell(1).value;
    const name = row.getCell(3).value;
    if (typeof id === 'string' && RECORD_ID_PATTERN.test(id) && typeof name === 'string' && name.trim()) {
      idToName.set(id, name.trim());
    }
  });

  const textParts = new Map(); // Kayıt ID -> [{ partNo, text }]
  textSheet.eachRow((row) => {
    const id = row.getCell(1).value;
    const partNo = row.getCell(2).value;
    const text = row.getCell(7).value;
    if (typeof id !== 'string' || !RECORD_ID_PATTERN.test(id) || typeof text !== 'string') return;
    const list = textParts.get(id) ?? [];
    list.push({ partNo: typeof partNo === 'number' ? partNo : 0, text });
    textParts.set(id, list);
  });

  const nameToSquares = new Map();
  for (const [id, parts] of textParts) {
    const name = idToName.get(id);
    if (!name) continue;
    const fullText = parts
      .sort((a, b) => a.partNo - b.partNo)
      .map((p) => p.text)
      .join('\n');
    const squares = extractDavisSquares(fullText);
    if (squares.length === 0) continue;

    const existing = nameToSquares.get(name) ?? new Set();
    for (const code of squares) existing.add(code);
    nameToSquares.set(name, existing);
  }
  return nameToSquares;
}

/**
 * Ciltleri üreten araç, standart Excel/LibreOffice yerine OOXML'i her yerde
 * "x:" ad alanı önekiyle ve ExcelJS'in çökmesine yol açan bir Tablo (Table)
 * tanımıyla yazıyor. ExcelJS bunu doğrudan okuyamıyor ("Cannot read
 * properties of undefined (reading 'sheets'/'name')"). Bu yüzden dosya
 * ExcelJS'e verilmeden önce: (1) tablo tanımları ve referansları tamamen
 * kaldırılır (yalnızca ham hücre değerleri lazım, tablo biçimlendirmesi
 * değil), (2) "x:" öneki tüm XML parçalarından ayıklanır.
 */
async function normalizeWorkbookBuffer(buffer) {
  const zip = await JSZip.loadAsync(buffer);

  for (const path of Object.keys(zip.files)) {
    if (path.startsWith('xl/tables/') || /xl\/worksheets\/_rels\/.*\.rels$/.test(path)) {
      zip.remove(path);
    }
  }

  for (const path of Object.keys(zip.files)) {
    const file = zip.files[path];
    if (file.dir || !(path.endsWith('.xml') || path.endsWith('.rels'))) continue;

    let text = await file.async('string');
    let changed = false;

    if (text.includes('xmlns:x=')) {
      text = text.replace(/xmlns:x="([^"]+)"/g, 'xmlns="$1"').replace(/<x:/g, '<').replace(/<\/x:/g, '</');
      changed = true;
    }
    if (text.includes('tableParts')) {
      text = text.replace(/<tableParts[\s\S]*?<\/tableParts>/g, '');
      changed = true;
    }
    if (path.endsWith('[Content_Types].xml') && text.includes('/xl/tables/')) {
      text = text.replace(/<Override PartName="\/xl\/tables\/[^"]*"[^/]*\/>/g, '');
      changed = true;
    }

    if (changed) zip.file(path, text);
  }

  return zip.generateAsync({ type: 'nodebuffer' });
}

/** Bir cilt `.xlsx` dosyasını yolundan okuyup ayrıştırır — bkz. {@link parseVolumeWorkbook}. */
export async function parseVolumeFile(filePath) {
  const raw = await readFile(filePath);
  const normalized = await normalizeWorkbookBuffer(raw);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(normalized);
  return parseVolumeWorkbook(workbook);
}
