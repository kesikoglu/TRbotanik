#!/usr/bin/env node
/**
 * SQL'deki `public.davis_square()` ile JS'deki `davisSquareFor()` aynı sonucu
 * veriyor mu — rastgele ama DETERMİNİSTİK bir nokta kümesi üzerinde karşılaştırır.
 *
 * NEDEN GEREKLİ: Davis karesi iki yerde uygulanmıştır. JS sürümü GBIF kayıtlarını
 * karelere atar (packages/shared/src/davis.ts); SQL sürümü saha gözlemlerini atar
 * (supabase/migrations/0001_init.sql — istemci kendi karesini belirleyemesin diye
 * kasıtlı olarak sunucuda). İkisi ayrışırsa aynı koordinat kaynağına göre farklı
 * kareye düşer; bu, haritada sessizce yanlış dağılıma yol açar ve ancak çok sonra
 * fark edilir. Bu script o ayrışmayı CI'da yakalar.
 *
 * Nokta kümesi Türkiye sınırlayıcı kutusunun DIŞINI da kapsar; böylece null dönen
 * durumlar ve grid kenarına sabitleme (clamp) davranışı da sınanır.
 *
 * Çalıştırma: PG* ortam değişkenleri ayarlıyken `node scripts/verify-davis-sql.mjs`
 */
import { execFile } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { davisSquareFor } from '@trbotanik/shared';

const run = promisify(execFile);
const SAMPLE_SIZE = Number(process.env['DAVIS_SAMPLE_SIZE'] ?? 20000);

/** Tohumlu doğrusal eşleşmeli üreteç — her çalıştırmada aynı noktalar. */
function seededRandom(seed) {
  let state = seed;
  return () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
}

async function main() {
  const rnd = seededRandom(42);
  const lines = [];
  for (let i = 0; i < SAMPLE_SIZE; i++) {
    // Kutunun dışını da tara: 34–44°N, 24–47°E
    const lat = 34 + rnd() * 10;
    const lon = 24 + rnd() * 23;
    lines.push(`${lat.toFixed(6)}|${lon.toFixed(6)}|${davisSquareFor(lat, lon) ?? ''}`);
  }

  const csvPath = join(tmpdir(), `davis-js-${process.pid}.csv`);
  const sqlPath = join(tmpdir(), `davis-check-${process.pid}.sql`);
  await writeFile(csvPath, lines.join('\n'));

  // `\copy` bir psql meta-komutudur ve yalnızca dosyadan (-f) çalışır, -c ile değil.
  await writeFile(
    sqlPath,
    `create temp table js_ref (lat double precision, lon double precision, js_code text);
\\copy js_ref from '${csvPath}' with (format csv, delimiter '|', null '')
select count(*) filter (where public.davis_square(lat, lon) is distinct from js_code) as ayrisan,
       count(*) as toplam
from js_ref;
select lat, lon, js_code, public.davis_square(lat, lon)
from js_ref where public.davis_square(lat, lon) is distinct from js_code limit 10;
`,
  );

  try {
    const { stdout } = await run('psql', ['-v', 'ON_ERROR_STOP=1', '-t', '-A', '-F', '|', '-f', sqlPath]);
    const rows = stdout.trim().split('\n').filter(Boolean);

    // `\copy` çıktıya "COPY 20000" satırı ekler; sayım satırını konuma göre değil
    // biçimine göre buluyoruz. Bulunamazsa SESSİZCE GEÇMEK yerine hata veriyoruz —
    // aksi hâlde çıktı biçimi değiştiğinde test yanlışlıkla "geçti" derdi.
    const countRows = rows.filter((row) => /^\d+\|\d+$/.test(row));
    if (countRows.length !== 1) {
      console.error('✗ psql çıktısı beklenen sayım satırını içermiyor — karşılaştırma yapılamadı.');
      console.error(stdout);
      process.exit(1);
    }
    const [ayrisan, toplam] = countRows[0].split('|').map(Number);

    if (toplam !== SAMPLE_SIZE) {
      console.error(`✗ ${SAMPLE_SIZE} nokta beklenirken ${toplam} nokta karşılaştırıldı.`);
      process.exit(1);
    }

    if (ayrisan !== 0) {
      console.error(`✗ SQL ve JS Davis kare uygulamaları ${ayrisan}/${toplam} noktada AYRIŞIYOR.`);
      console.error('  Örnekler (lat|lon|js|sql):');
      // Yalnızca 4 alanlı veri satırları — "COPY n" ve sayım satırı elenir.
      for (const row of rows.filter((r) => r.split('|').length === 4)) {
        console.error(`    ${row}`);
      }
      process.exit(1);
    }
    console.log(`✓ SQL ve JS Davis kare uygulamaları ${toplam} noktanın tamamında aynı sonucu verdi.`);
  } finally {
    await unlink(csvPath).catch(() => {});
    await unlink(sqlPath).catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
