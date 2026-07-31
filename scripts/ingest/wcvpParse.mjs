/**
 * WCVP (World Checklist of Vascular Plants, Kew) Türkiye alt kümesini
 * (data/curated/wcvp-turkey.csv) ayrıştırır ve isim bazlı bir arama tablosu
 * üretir.
 *
 * Kaynak dosya, kullanıcının kendi makinesinde wcvp_dwca_v15 paketinden
 * (Kew, WCVP) `wcvp_distribution.csv`'de TDWG:TUR / TDWG:TUE (Türkiye /
 * Türkiye-in-Europe) bölgesine atanan taksonların `wcvp_taxon.csv`'den
 * filtrelenmesiyle üretildi. Pipe (`|`) ile ayrılır, RFC4180 tırnaklamaya
 * uyar (ör. `dynamicproperties` sütunundaki JSON, iç içe çift tırnaklarla
 * kaçışlanmış hâlde).
 */

export function parseWcvpCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return [];

  const header = splitCsvLine(lines[0], '|');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i], '|');
    if (fields.length !== header.length) continue;
    const row = {};
    for (let j = 0; j < header.length; j++) row[header[j]] = fields[j];
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line, delimiter) {
  const fields = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === delimiter) {
      fields.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

/**
 * WCVP'nin serbest metin `lifeform` özelliğini bizim Habit sözlüğümüze
 * (agac/cali/calimsi/cok-yillik-ot/iki-yillik-ot/tek-yillik-ot/geofit/
 * tirmanici/parazit/sukkulent) eşler.
 *
 * "perennial or rhizomatous geophyte" gibi bileşik ifadeler için, SABİT BİR
 * ÖNCELİK sırasıyla ilk eşleşen anahtar kelime kazanır: parazitlik, tırmanma,
 * geofit, sukkulentlik gibi daha AYIRT EDİCİ özellikler; jenerik "yıllık
 * ömür" kategorilerinden (annual/biennial/perennial) önce gelir — bir
 * kullanıcı için "geofit" bilgisi "çok yıllık ot"tan çok daha bilgilendirici.
 * "subshrub", listede "shrub"tan ÖNCE kontrol edilir ki "subshrub" metninin
 * içindeki "shrub" alt dizesiyle yanlış eşleşmesin.
 */
const LIFEFORM_KEYWORDS = [
  ['holoparasit', 'parazit'],
  ['hemiparasit', 'parazit'],
  ['parasit', 'parazit'],
  ['climbing', 'tirmanici'],
  ['climber', 'tirmanici'],
  ['scrambl', 'tirmanici'],
  ['liana', 'tirmanici'],
  ['geophyte', 'geofit'],
  ['semisucculent', 'sukkulent'],
  ['succulent', 'sukkulent'],
  ['subshrub', 'calimsi'],
  ['bamboo', 'cali'],
  ['shrub', 'cali'],
  ['tree', 'agac'],
  ['biennial', 'iki-yillik-ot'],
  ['annual', 'tek-yillik-ot'],
  ['perennial', 'cok-yillik-ot'],
];

export function mapLifeformToHabit(lifeform) {
  if (!lifeform) return null;
  const text = lifeform.toLowerCase();

  for (const [keyword, habit] of LIFEFORM_KEYWORDS) {
    if (text.includes(keyword)) return habit;
  }
  return null;
}

const ACCEPTED_STATUSES = new Set(['Accepted', 'Provisionally Accepted']);
const RELEVANT_RANKS = new Set(['Species', 'Subspecies', 'Variety', 'Form', 'nothosubsp.', 'nothovar.']);

/**
 * Satırlardan, kabul edilen tür/alttür seviyesindeki taksonlar için bilimsel
 * ada göre bir arama tablosu üretir. Anahtar, WCVP'nin `scientfiicname`
 * sütunu (yazarsız kanonik ad — dosyadaki gerçek sütun adı böyle, kaynakta
 * bir yazım hatası) — bizim `TaxonNode.name` ile birebir karşılaştırılabilir.
 */
export function buildWcvpIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    if (!ACCEPTED_STATUSES.has(row.taxonomicstatus)) continue;
    if (!RELEVANT_RANKS.has(row.taxonrank)) continue;

    const name = (row.scientfiicname || '').trim();
    if (!name) continue;

    let lifeform = '';
    try {
      const props = JSON.parse(row.dynamicproperties || '{}');
      lifeform = props.lifeform || '';
    } catch {
      lifeform = '';
    }

    index.set(name, {
      habit: mapLifeformToHabit(lifeform),
      publishedIn: (row.namepublishedin || '').trim() || null,
    });
  }
  return index;
}
