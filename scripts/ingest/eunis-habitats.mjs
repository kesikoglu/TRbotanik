#!/usr/bin/env node
/**
 * EEA'nın EUNIS habitat sınıflandırmasından (eunis.eea.europa.eu) tür → habitat
 * kodu eşleşmelerini çıkarır.
 *
 * EUNIS'in tür bazında toplu bir API'si YOK — sınıflandırma, her "seviye 3/4"
 * habitat tipi için EVA (European Vegetation Archive) veritabanından türetilmiş
 * en fazla ~20 karakteristik türü üç ayrı sütunda (Diagnostic/Constant/Dominant
 * species) taşıyan bir Excel dosyasıdır. Bu yüzden burada üretilen eşleşme YÖNÜ
 * habitat → tür'dür (tersi değil) ve kapsam kasıtlı olarak dardır: yalnızca bu
 * listelerde adı GEÇEN türler kod alır, geri kalan Türkiye florası (liste Avrupa
 * ağırlıklı olduğu için büyük çoğunluk) "henüz küratörlenmedi" kalır — bkz.
 * docs/DATA_SOURCES.md §4c.
 *
 * KAYNAK DOSYA: data/eunis/*.xlsx (commit edilir — nuhungemisi ile aynı desen,
 * bkz. data/nuhungemisi/README.md). Bu dosya EEA'nın veri kataloğundan (CC-BY
 * 4.0) MANUEL indirildi: sdi.eea.europa.eu hem bu geliştirme ortamının ağ
 * politikasınca (eea.europa.eu/doi.org tamamen engelli) hem de GitHub Actions
 * runner'ından (gerçek internet erişimiyle bile — muhtemelen bot/IP koruması,
 * dört farklı otomatik indirme denemesi 403 ile sonuçlandı) OTOMATİK
 * SCRAPE EDİLEMEDİ. Bu yüzden ağdan indirme koddan tamamen çıkarıldı;
 * bu script SADECE data/eunis/ altındaki commit'li dosyayı ayrıştırır.
 *
 * ÇIKTI: data/raw/eunis/species-habitats.json (gitignore'da, yeniden üretilebilir).
 *
 * Yeni bir EEA dışa aktarımı gelirse: data/eunis/ altındaki .xlsx'in üzerine
 * yazıp `npm run data:eunis-habitats` çalıştırmak yeterli, kod değişikliği
 * gerekmez (bkz. data/eunis/README.md).
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = resolve(here, '../../data/eunis');
const RAW_DIR = resolve(here, '../../data/raw/eunis');
const OUT = resolve(RAW_DIR, 'species-habitats.json');

const SPECIES_COLUMNS = ['diagnostic species', 'constant species', 'dominant species'];

/** "Genus species (Author) subsp. epithet" gibi metinlerden düz binom çıkarır. */
function extractBinomial(raw) {
  const cleaned = raw
    .replace(/\([^)]*\)/g, ' ') // parantez içi (genelde yazar) at
    .replace(/[.,;]+$/g, '')
    .trim();
  if (!cleaned) return null;
  // Melez işareti ("×", çarpma işareti) ayrı bir jeton (ör. "Centaurea × moesiaca")
  // ya da bir sonraki kelimeye bitişik (ör. "Centaurea ×moesiaca") gelebilir; her
  // iki durumda da at ki genus/epithet seçimini kaydırmasın. Yalnızca gerçek "×"
  // atılır — harf "x"/"X" ile başlayan gerçek adlar (ör. Xanthium) dokunulmaz.
  const tokens = cleaned
    .split(/\s+/)
    .map((tok) => tok.replace(/^×/, ''))
    .filter((tok) => tok.length > 0);
  if (tokens.length < 2) return null;
  const [genus, epithet] = tokens;
  if (!/^[A-ZÎ][a-zçğıöşü-]+$/.test(genus) || !/^[a-zçğıöşü-]{2,}$/i.test(epithet)) return null;
  return `${genus} ${epithet}`;
}

function normalizeKey(name) {
  return name.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
}

/**
 * Bir sayfanın başlık satırını bulur; "code"/"name"/tür sütunlarından en az
 * biri yoksa null döner (ör. "Read me" sayfası — bu bir veri sayfası değil).
 */
function findColumns(sheet) {
  const header = sheet.getRow(1).values.map((v) => (v ? String(v).trim().toLowerCase() : ''));
  // Çoğu sayfada "Code "/"Name ", "Man-made" sayfasında "Code 2018"/"Name 2018" —
  // her ikisini de kapsamak için başlangıç eşleşmesi kullanılıyor (başka hiçbir
  // sütun "code"/"name" ile BAŞLAMIYOR, ör. "Red List code" veya "EUNIS 2012 name").
  // `header` bir seyrek (sparse) dizi olabilir (exceljs `row.values`'ten); `.map`
  // boşlukları atlar ama `findIndex` atlamaz (ES spec farkı) — bu yüzden `h &&`
  // ile boşluk konumlarında `undefined.startsWith` patlamasını önlüyoruz.
  const codeColIdx = header.findIndex((h) => h && h.startsWith('code'));
  const nameColIdx = header.findIndex((h) => h && h.startsWith('name'));
  const speciesColIdxs = SPECIES_COLUMNS.map((label) => header.findIndex((h) => h === label)).filter(
    (i) => i !== -1,
  );
  if (codeColIdx === -1 || nameColIdx === -1 || speciesColIdxs.length === 0) return null;
  return { codeColIdx, nameColIdx, speciesColIdxs };
}

/** Bir sayfadaki tüm habitat satırlarını işler; bySpecies Map'ine ekler (çağıran paylaşır). */
function parseSheet(sheet, bySpecies) {
  const cols = findColumns(sheet);
  if (!cols) return null;

  let habitatRowCount = 0;
  let speciesMentionCount = 0;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const code = row.getCell(cols.codeColIdx).text?.trim();
    const name = row.getCell(cols.nameColIdx).text?.trim();
    const speciesText = cols.speciesColIdxs
      .map((idx) => row.getCell(idx).text?.trim())
      .filter(Boolean)
      .join(';\n');
    if (!code || !speciesText) return;
    habitatRowCount++;

    for (const rawSpecies of speciesText.split(/[;\n]/)) {
      const binomial = extractBinomial(rawSpecies);
      if (!binomial) continue;
      speciesMentionCount++;
      const key = normalizeKey(binomial);
      let matches = bySpecies.get(key);
      if (!matches) {
        matches = new Map();
        bySpecies.set(key, matches);
      }
      matches.set(code, { code, name: name || code });
    }
  });

  return { habitatRowCount, speciesMentionCount };
}

async function main() {
  if (!existsSync(SOURCE_DIR)) {
    console.error(`HATA: ${SOURCE_DIR} yok — EEA'dan indirilen .xlsx dosyasını oraya koyun (bkz. data/eunis/README.md).`);
    process.exit(1);
  }
  const files = (await readdir(SOURCE_DIR)).filter((f) => f.toLowerCase().endsWith('.xlsx'));
  if (files.length === 0) {
    console.error(`HATA: ${SOURCE_DIR} altında .xlsx dosyası bulunamadı.`);
    process.exit(1);
  }

  const bySpecies = new Map(); // normalizeKey -> Map<code, {code, name}>
  let totalHabitatRows = 0;
  let totalSpeciesMentions = 0;
  let totalSheetsUsed = 0;

  for (const file of files) {
    const filePath = resolve(SOURCE_DIR, file);
    console.log(`Okunuyor: ${file}`);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    for (const sheet of workbook.worksheets) {
      const result = parseSheet(sheet, bySpecies);
      if (!result) {
        console.log(`  ⏭ "${sheet.name}" atlandı (code/name/tür sütunu yok — veri sayfası değil).`);
        continue;
      }
      totalSheetsUsed++;
      totalHabitatRows += result.habitatRowCount;
      totalSpeciesMentions += result.speciesMentionCount;
      console.log(
        `  ✓ "${sheet.name}": ${result.habitatRowCount} habitat satırı, ${result.speciesMentionCount} tür anımı`,
      );
    }
  }

  const species = {};
  for (const [key, matches] of bySpecies) species[key] = [...matches.values()];

  const output = {
    generatedAt: new Date().toISOString(),
    sourceFiles: files,
    sheetsUsed: totalSheetsUsed,
    habitatRowCount: totalHabitatRows,
    speciesMentionCount: totalSpeciesMentions,
    speciesCount: Object.keys(species).length,
    species,
  };

  await mkdir(RAW_DIR, { recursive: true });
  await writeFile(OUT, JSON.stringify(output));

  console.log();
  console.log(`✓ ${OUT} yazıldı.`);
  console.log(
    `  ${totalSheetsUsed} sayfa, ${totalHabitatRows} habitat satırı, ${totalSpeciesMentions} tür anımı → ` +
      `${output.speciesCount} benzersiz tür.`,
  );
}

main().catch((err) => {
  console.error('✗ EUNIS habitat ingest başarısız:', err);
  process.exit(1);
});
