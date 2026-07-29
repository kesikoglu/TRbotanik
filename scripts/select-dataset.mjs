#!/usr/bin/env node
/**
 * `data:all` zincirinin son adımı: gerçek GBIF veri anlık görüntüsü
 * (`data/gbif-snapshot/`, commit edilir — bkz. build-real-dataset.mjs) varsa
 * onu `packages/web/public/data/`'ya kopyalar; yoksa örnek (fixture) veri
 * üretimine döner. Böylece:
 *
 *   - Gerçek veri henüz üretilmediyse (bugünkü durum) hiçbir şey değişmez.
 *   - `refresh-data.yml` gerçek veriyi bir kez üretip commit ettiğinde, bir
 *     sonraki normal deploy (`npm run data:all` çağıran her push) otomatik
 *     olarak gerçek veriye geçer — kod değişikliği gerekmez.
 */
import { existsSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = resolve(here, '../data/gbif-snapshot');
const DATA_DIR = resolve(here, '../packages/web/public/data');
const SNAPSHOT_MANIFEST = resolve(SNAPSHOT_DIR, 'manifest.json');

async function main() {
  if (existsSync(SNAPSHOT_MANIFEST)) {
    console.log("ℹ Gerçek GBIF veri anlık görüntüsü bulundu — örnek (fixture) veri yerine bu kullanılacak.");
    await mkdir(DATA_DIR, { recursive: true });
    for (const file of ['manifest.json', 'taxonomy.json', 'occurrences.json', 'details.json']) {
      await copyFile(resolve(SNAPSHOT_DIR, file), resolve(DATA_DIR, file));
    }
    console.log('✓ data/gbif-snapshot/ → packages/web/public/data/ kopyalandı.');
  } else {
    console.log('ℹ Gerçek veri anlık görüntüsü yok — örnek (fixture) veri üretiliyor.');
    execFileSync('node', [resolve(here, 'make-fixtures.mjs')], { stdio: 'inherit' });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
