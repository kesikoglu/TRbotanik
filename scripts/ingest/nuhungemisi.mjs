#!/usr/bin/env node
/**
 * Nuh'un Gemisi Ulusal Biyolojik Çeşitlilik Veritabanı dışa aktarımlarını işler.
 *
 * `data/nuhungemisi/*.xlsx` altındaki TÜM dosyaları okur (birikimli — yeni bir bölge
 * dosyası eklendiğinde script otomatik olarak onu da işler, kod değişikliği gerekmez),
 * "Damarlı Bitkiler" satırlarını süzer, tür bazında birleştirir ve
 * `data/nuhungemisi/derived.json` üretir.
 *
 * Bu çıktı DOĞRUDAN yayınlanan uygulamaya gitmez — `make-fixtures.mjs` bunu okur ve
 * yalnızca zaten bilinen taksonlar için, "henüz küratörlenmedi" alanlarını doldurmak
 * amacıyla kullanır (bkz. o dosyadaki ilgili yorum).
 *
 * ÖNEMLİ KISIT: Kaynak veri koordinat içermez, yalnızca il adı verir. Bu yüzden
 * `derived.json` haritaya nokta veya Davis karesi eklemez — yalnızca öznitelik
 * küratörlemesi (resmi endemizm durumu, IUCN kategorisi, kayıtlı iller) için kullanılır.
 */
import ExcelJS from 'exceljs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregateSpecies, normalizeEndemism, parseIucnColumn, parseTurColumn, PLANT_GROUP_LABEL } from './nuhungemisiParse.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = resolve(here, '../../data/nuhungemisi');
const OUT = resolve(SOURCE_DIR, 'derived.json');

async function readWorkbookRows(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // başlık satırı
    const values = row.values; // 1-indeksli, values[0] boş
    rows.push({
      bolge: values[1]?.toString().trim() ?? '',
      sehir: values[2]?.toString().trim() ?? '',
      grup: values[3]?.toString().trim() ?? '',
      tur: values[4]?.toString().trim() ?? '',
      endemizim: values[5]?.toString().trim() ?? '',
      iucn: values[6]?.toString().trim() ?? '',
      izlenecek: values[7]?.toString().trim() ?? '',
    });
  });
  return rows;
}

const files = (await readdir(SOURCE_DIR)).filter((f) => f.toLowerCase().endsWith('.xlsx'));

if (files.length === 0) {
  console.error(`HATA: ${SOURCE_DIR} altında .xlsx dosyası bulunamadı.`);
  process.exit(1);
}

const plantRecords = [];
const regionsCovered = new Set();
const provincesCovered = new Set();
let totalRows = 0;

for (const file of files) {
  const filePath = resolve(SOURCE_DIR, file);
  console.log(`Okunuyor: ${file}`);
  const rows = await readWorkbookRows(filePath);
  totalRows += rows.length;

  for (const row of rows) {
    if (row.bolge) regionsCovered.add(row.bolge);
    if (row.sehir) provincesCovered.add(row.sehir);
    if (row.grup !== PLANT_GROUP_LABEL) continue;

    const { scientificName, vernacularTr } = parseTurColumn(row.tur);
    const iucn = parseIucnColumn(row.iucn);

    plantRecords.push({
      scientificName,
      vernacularTr,
      province: row.sehir,
      endemism: normalizeEndemism(row.endemizim),
      iucnCode: iucn?.code ?? null,
      iucnLabel: iucn?.label ?? null,
      monitored: row.izlenecek === 'Evet',
    });
  }
}

const aggregated = aggregateSpecies(plantRecords);

const species = {};
for (const [key, entry] of aggregated) species[key] = entry;

const output = {
  generatedAt: new Date().toISOString(),
  sourceFiles: files,
  regionsCovered: [...regionsCovered].sort((a, b) => a.localeCompare(b, 'tr')),
  provincesCovered: [...provincesCovered].sort((a, b) => a.localeCompare(b, 'tr')),
  plantRecordCount: plantRecords.length,
  speciesCount: aggregated.size,
  species,
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(output, null, 2));

console.log();
console.log(`✓ derived.json yazıldı: ${OUT}`);
console.log(`  ${files.length} dosya, ${totalRows.toLocaleString('tr-TR')} toplam satır`);
console.log(`  ${output.regionsCovered.length} bölge müdürlüğü, ${output.provincesCovered.length} il kapsanıyor`);
console.log(`  ${output.provincesCovered.join(', ')}`);
console.log(`  ${plantRecords.length.toLocaleString('tr-TR')} damarlı bitki satırı → ${aggregated.size.toLocaleString('tr-TR')} benzersiz tür`);

if (output.provincesCovered.length < 81) {
  console.log();
  console.log(
    `⚠  Bu yalnızca ${output.provincesCovered.length}/81 ili kapsıyor. Kalan bölgeleri ` +
      `data/nuhungemisi/ altına ekleyip bu scripti yeniden çalıştırdığınızda kapsam otomatik genişler.`,
  );
}
