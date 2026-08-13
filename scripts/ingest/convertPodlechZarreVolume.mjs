#!/usr/bin/env node
/**
 * D. Podlech & Sh. Zarre'nin "A taxonomic revision of the genus Astragalus L.
 * in the Old World" (Naturhistorisches Museum Wien, 2013) adlı 3 ciltlik
 * monografisinin OCR'lanmış .docx çıktısını, `floraOfTurkeyParse.mjs`'in
 * beklediği .xlsx şemasına ("Bitki Kayıtları" + "Bilgi Metinleri" sayfaları,
 * bkz. o dosyadaki `parseVolumeWorkbook`) dönüştürür.
 *
 * Bu eser TÜM Eski Dünya'yı kapsar (yalnızca Türkiye değil) — o yüzden
 * yalnızca metninde en az bir geçerli Davis kare atfı geçen türler
 * tutulur (`extractDavisSquares` zaten yalnızca güçlü bağlamda eşleşir,
 * bkz. o dosyadaki bağlam açıklaması). Kalan yüzlerce Eski Dünya türünün
 * (İran, Orta Asya, Kafkasya vb.) tam taksonomik betimlemesini saklamanın
 * bu site için hiçbir değeri yok.
 *
 * Tür başlığı biçimi (Word'de "12.  (2206).  A. brachycarpus M.Bieb., ..."
 * gibi görünür): <cilt-içi no>. (<eserin tamamındaki no>). A. <epitet>
 * [subsp. <ad>] [var. <ad>] <yazar>, ... — cins her zaman "A." kısaltılmış,
 * tam ad `Astragalus <epitet>` olarak yeniden kurulur.
 *
 * Kullanım: node scripts/ingest/convertPodlechZarreVolume.mjs <girdi.docx> <çıktı.xlsx> <cilt no>
 */
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { readFile, writeFile } from 'node:fs/promises';
import { extractDavisSquares } from './floraOfTurkeyParse.mjs';

const HEADER_PATTERN =
  /^\d+\.\s*\(\d+\)\.\s*A\.\s+([a-zà-öø-ÿ×-]+)(?:\s+subsp\.\s+([a-zà-öø-ÿ-]+))?(?:\s+var\.\s+([a-zà-öø-ÿ-]+))?/;

/** `.docx`'in `word/document.xml`'inden paragraf başına düz metni çıkarır. */
async function extractParagraphs(docxPath) {
  const raw = await readFile(docxPath);
  const zip = await JSZip.loadAsync(raw);
  const xml = await zip.file('word/document.xml').async('string');

  const paragraphs = [];
  for (const match of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const texts = [...match[0].matchAll(/<w:t[^>]*>(.*?)<\/w:t>/gs)].map((m) => m[1]);
    paragraphs.push(
      texts
        .join('')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'"),
    );
  }
  return paragraphs;
}

/**
 * Paragrafları tür başlıklarına göre bloklara ayırır ve yalnızca en az bir
 * Davis kare atfı içeren blokları döner.
 *
 * @returns {{ name: string, text: string, squares: string[] }[]}
 */
export function extractTurkishRelevantSpecies(paragraphs) {
  const headers = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const m = HEADER_PATTERN.exec(paragraphs[i].trim());
    if (!m) continue;
    let name = `Astragalus ${m[1]}`;
    if (m[2]) name += ` subsp. ${m[2]}`;
    if (m[3]) name += ` var. ${m[3]}`;
    headers.push({ paraIndex: i, name });
  }

  const results = [];
  for (let h = 0; h < headers.length; h++) {
    const start = headers[h].paraIndex;
    const end = h + 1 < headers.length ? headers[h + 1].paraIndex : paragraphs.length;
    const text = paragraphs.slice(start, end).join('\n');
    const squares = extractDavisSquares(text);
    if (squares.length > 0) {
      results.push({ name: headers[h].name, text, squares });
    }
  }
  return results;
}

async function main() {
  const [, , inputPath, outputPath, volumeArg] = process.argv;
  if (!inputPath || !outputPath) {
    console.error('Kullanım: node convertPodlechZarreVolume.mjs <girdi.docx> <çıktı.xlsx> [cilt no]');
    process.exit(1);
  }
  const volumeNo = Number(volumeArg ?? 3);
  const idPrefix = `TRB9${String(volumeNo).padStart(2, '0')}`; // Davis'in kendi cilt 1-9 numaralarıyla çakışmasın

  const paragraphs = await extractParagraphs(inputPath);
  const species = extractTurkishRelevantSpecies(paragraphs);
  console.log(`${paragraphs.length} paragraf tarandı, ${species.length} tür Türkiye Davis kare atfı içeriyor.`);

  const workbook = new ExcelJS.Workbook();
  const records = workbook.addWorksheet('Bitki Kayıtları');
  const texts = workbook.addWorksheet('Bilgi Metinleri');

  species.forEach((sp, i) => {
    const id = `${idPrefix}-${String(i + 1).padStart(4, '0')}`;
    records.addRow([id, null, sp.name]);
    texts.addRow([id, 1, null, null, null, null, sp.text]);
  });

  await writeFile(outputPath, await workbook.xlsx.writeBuffer());
  console.log(`Yazıldı: ${outputPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
