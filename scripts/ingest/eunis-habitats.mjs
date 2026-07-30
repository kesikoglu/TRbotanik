#!/usr/bin/env node
/**
 * EEA'nın EUNIS habitat sınıflandırmasından (eunis.eea.europa.eu /
 * www.eea.europa.eu) tür → habitat kodu eşleşmelerini çıkarır.
 *
 * EUNIS'in tür bazında toplu bir API'si YOK — sınıflandırma, her "seviye 3"
 * habitat tipi için EVA (European Vegetation Archive) veritabanından türetilmiş
 * en fazla ~20 "karakteristik tür" listesi taşıyan, EEA veri kataloğunda
 * yayımlanmış bir Excel dosyasıdır. Bu yüzden burada üretilen eşleşme YÖNÜ
 * habitat → tür'dür (tersi değil) ve kapsam kasıtlı olarak dardır: yalnızca bu
 * listede adı GEÇEN türler kod alır, geri kalan Türkiye florası (listenin
 * Avrupa ağırlıklı olması nedeniyle büyük çoğunluk) "henüz küratörlenmedi"
 * kalır — bkz. docs/DATA_SOURCES.md §4c.
 *
 * Dosyanın tam adı/URL'si EEA'nın sitesinde zaman zaman değişir; bu yüzden
 * sabit bir dosya adı yerine klasör sayfasının HTML'ini çekip içindeki gerçek
 * indirme linklerini (regex ile, DOM ayrıştırıcı olmadan) buluyoruz. Sayfa bir
 * veri kataloğu sonuç listesi: her dosya öğesinin kendi "Direct download"
 * linki var ama href bir dosya uzantısı TAŞIMIYOR (ör.
 * `https://sdi.eea.europa.eu/data/{uuid}` — bir çözücü/yönlendirme linki).
 * Bu yüzden hangi linkin Excel olduğunu href'ten değil, adayları sırayla
 * GERÇEKTEN indirip content-type'a bakarak buluyoruz — bkz. git geçmişi (iki
 * önceki deneme: önce yanlışlıkla Plone REST API varsayıldı, sonra yalnızca
 * `.xlsx`/`@@download` desenine bakıldı, ikisi de bu sayfada eşleşmedi).
 *
 * ÇIKTI: data/raw/eunis/species-habitats.json (gitignore'da).
 *
 * Bu SADECE gerçek internet erişimi olan bir ortamda (GitHub Actions) çalışır —
 * geliştirme konteynerinin egress politikası eea.europa.eu'yu engelliyor. Bu
 * yüzden bu script'in ağ/parse varsayımları burada DOĞRULANAMADI; refresh-data.yml
 * bu adımı `continue-on-error: true` ile çalıştırır ki EEA tarafında bir
 * yapı/URL değişikliği tüm GBIF/iNaturalist zincirini bloke etmesin — bkz. o
 * dosyadaki yorum. build-real-dataset.mjs de bu kontrol noktası yoksa veya
 * boşsa sessizce atlar (tüm türler "henüz küratörlenmedi" kalır).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const here = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = resolve(here, '../../data/raw/eunis');
const OUT = resolve(RAW_DIR, 'species-habitats.json');

const USER_AGENT = 'TRbotanik/0.1 (+https://github.com/kesikoglu/TRbotanik; academic biodiversity map of Turkiye)';

// EEA'nın 2021 revizyonu, seviye 3 habitatlarını EVA'dan türetilmiş
// karakteristik tür listeleriyle tamamlıyor (bkz. bu script'in başlığı).
// Klasör sayfasının kendisini hedefliyoruz — içindeki güncel Excel dosyasını
// (findDownloadCandidates + discoverAndDownloadExcel ile) keşfediyoruz, dosya
// adını sabitlemiyoruz.
const SOURCE_FOLDER_URL =
  'https://www.eea.europa.eu/data-and-maps/data/eunis-habitat-classification-1/eunis-terrestrial-habitat-classification-review-2021';

async function fetchWithRetry(url, options = {}, { retries = 4 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, ...options.headers },
      });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status} (yeniden denenecek): ${url}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt === retries) break;
      await new Promise((r) => setTimeout(r, Math.min(30000, 2000 * 2 ** attempt)));
    }
  }
  throw lastErr;
}

/** Klasör sayfasının HTML'inde (DOM ayrıştırıcı olmadan, regex ile) indirme linki adaylarını bulur. */
function findDownloadCandidates(html) {
  // <a href="...">Bağlantı metni</a> — hem href'i hem de bağlantı metnini
  // birlikte yakala (metin "Direct download" ise href bir dosya uzantısı
  // taşımasa da aday sayılır — bkz. bu dosyanın başlığı).
  const anchorRe = /<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const candidates = [];
  let match;
  while ((match = anchorRe.exec(html))) {
    const href = match[1];
    const text = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const looksRelevant =
      /\.xlsx?(?:[?#]|$)/i.test(href) ||
      /\/(@@download|at_download)\//i.test(href) ||
      /direct download/i.test(text);
    if (looksRelevant) candidates.push({ href, text });
  }
  return candidates;
}

function dumpDiagnostics(html) {
  console.log('ℹ Teşhis: ham HTML\'de anahtar kelime çevresi (en fazla 8 eşleşme):');
  let dumped = 0;
  for (const needle of ['xlsx', 'download', 'crosswalk']) {
    const re = new RegExp(needle, 'gi');
    let m;
    while (dumped < 8 && (m = re.exec(html))) {
      const start = Math.max(0, m.index - 120);
      const end = Math.min(html.length, m.index + needle.length + 120);
      console.log(`  [...${html.slice(start, end).replace(/\s+/g, ' ')}...]`);
      dumped++;
    }
    if (dumped >= 8) break;
  }
  if (dumped === 0) console.log('  (hiçbir anahtar kelime bulunamadı — sayfa muhtemelen JS ile render ediliyor)');
}

/**
 * Klasör sayfasını bulur, indirme linki adaylarını çıkarır ve HER BİRİNİ
 * SIRAYLA GERÇEKTEN İNDİRİP content-type'a bakarak hangisinin Excel olduğunu
 * belirler — adayların href'i dosya türünü göstermiyor (bkz. dosya başlığı).
 */
async function discoverAndDownloadExcel() {
  const pageRes = await fetchWithRetry(SOURCE_FOLDER_URL);
  const html = await pageRes.text();

  const candidates = findDownloadCandidates(html);
  console.log(`ℹ Sayfada (${html.length.toLocaleString('tr-TR')} karakter HTML) ${candidates.length} olası indirme linki bulundu:`);
  for (const c of candidates) console.log(`  - "${c.text}" → ${c.href}`);

  if (candidates.length === 0) {
    dumpDiagnostics(html);
    throw new Error(`Sayfada indirme linki bulunamadı — EEA sayfa yapısı değişmiş olabilir: ${SOURCE_FOLDER_URL}`);
  }

  const attempts = [];
  for (const c of candidates) {
    const url = new URL(c.href, SOURCE_FOLDER_URL).toString();
    let res;
    try {
      res = await fetchWithRetry(url, {}, { retries: 1 });
    } catch (err) {
      attempts.push(`"${c.text}" (${url}): indirilemedi — ${err.message}`);
      continue;
    }
    const contentType = res.headers.get('content-type') ?? '';
    const isExcel = /spreadsheet|ms-excel/i.test(contentType);
    if (!isExcel) {
      attempts.push(`"${c.text}" (${url}): Excel değil (content-type: ${contentType || 'bilinmiyor'})`);
      continue;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    console.log(
      `✓ Seçilen dosya: "${c.text}" → ${url} (${contentType}, ${(buffer.length / 1024 / 1024).toFixed(1)} MB)`,
    );
    return { url, buffer };
  }

  console.log('ℹ Hiçbir aday Excel\'e çözülmedi:');
  for (const a of attempts) console.log(`  - ${a}`);
  throw new Error('Hiçbir aday link gerçek bir Excel dosyasına çözülmedi (content-type kontrolü başarısız).');
}

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

async function parseWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  for (const sheet of workbook.worksheets) {
    // Başlık satırını ilk birkaç satır içinde ara — bazı EEA sayfalarında
    // gerçek başlıktan önce bir başlık/açıklama satırı bulunuyor.
    for (let headerRowNum = 1; headerRowNum <= 5; headerRowNum++) {
      const headerRow = sheet.getRow(headerRowNum);
      const headers = headerRow.values.map((v) => (v ? String(v).trim() : ''));
      const speciesColIdx = headers.findIndex((h) => /species/i.test(h));
      const codeColIdx = headers.findIndex((h) => /\bcode\b/i.test(h));
      const nameColIdx = headers.findIndex((h) => /\bname\b/i.test(h) && !/species/i.test(h));
      if (speciesColIdx === -1 || codeColIdx === -1 || nameColIdx === -1) continue;

      console.log(
        `✓ "${sheet.name}" sayfasında başlık satırı ${headerRowNum}: ` +
          `code=[${headers[codeColIdx]}] name=[${headers[nameColIdx]}] species=[${headers[speciesColIdx]}]`,
      );

      const bySpecies = new Map(); // normalizeKey -> Map<code, {code, name}>
      let habitatRowCount = 0;
      let speciesMentionCount = 0;

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber <= headerRowNum) return;
        const code = row.getCell(codeColIdx).text?.trim();
        const name = row.getCell(nameColIdx).text?.trim();
        const speciesText = row.getCell(speciesColIdx).text?.trim();
        if (!code || !speciesText) return;
        habitatRowCount++;

        for (const rawSpecies of speciesText.split(/[;\n]|,(?=\s*[A-ZÎ])/)) {
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

      if (bySpecies.size === 0) {
        console.log(`⚠ "${sheet.name}" başlığı eşleşti ama hiç tür ayrıştırılamadı, sonraki sayfaya bakılıyor.`);
        continue;
      }

      const species = {};
      for (const [key, matches] of bySpecies) species[key] = [...matches.values()];
      return { species, habitatRowCount, speciesMentionCount, sheetName: sheet.name };
    }
  }
  return null;
}

async function main() {
  console.log('EUNIS habitat crosswalk dosyası indiriliyor…');
  const { url: downloadUrl, buffer } = await discoverAndDownloadExcel();
  console.log('Ayrıştırılıyor…');

  const parsed = await parseWorkbook(buffer);
  if (!parsed) {
    throw new Error(
      'Hiçbir sayfada beklenen (code/name/species) başlık üçlüsü bulunamadı — ' +
        'EEA dosya yapısı değişmiş olabilir; sütun adlarını kontrol edip bu script\'in ' +
        'başlık algılama sezgisini (parseWorkbook) güncelleyin.',
    );
  }

  const output = {
    generatedAt: new Date().toISOString(),
    sourceUrl: downloadUrl,
    sheetName: parsed.sheetName,
    habitatRowCount: parsed.habitatRowCount,
    speciesMentionCount: parsed.speciesMentionCount,
    speciesCount: Object.keys(parsed.species).length,
    species: parsed.species,
  };

  await mkdir(RAW_DIR, { recursive: true });
  await writeFile(OUT, JSON.stringify(output));

  console.log(`✓ ${OUT} yazıldı.`);
  console.log(
    `  ${parsed.habitatRowCount} habitat satırı, ${parsed.speciesMentionCount} tür anımı → ` +
      `${output.speciesCount} benzersiz tür.`,
  );
}

main().catch((err) => {
  console.error('✗ EUNIS habitat ingest başarısız:', err.message);
  process.exit(1);
});
