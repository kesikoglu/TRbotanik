#!/usr/bin/env node
/**
 * Tek dosyalık derlemeyi paylaşılabilir bir sayfa gövdesine dönüştürür.
 *
 * Yayın ortamı dosyayı kendi `<!doctype html><head>…</head><body>` iskeletine sardığı
 * için burada yalnızca gövde içeriği üretilir: başlık, stiller, kök düğüm ve betik.
 *
 * Uygulama zaten hiçbir dış hosta istek yapmadığından (offline altlık, gömülü veri)
 * katı içerik güvenliği politikası altında da olduğu gibi çalışır.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(here, '../packages/web/dist-single/index.html');
const OUT = resolve(here, '../dist-artifact/trbotanik.html');

const html = await readFile(SOURCE, 'utf8');

const pick = (tag) => {
  const parts = [];
  const pattern = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, 'g');
  for (const match of html.matchAll(pattern)) parts.push(match[0]);
  return parts;
};

const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? 'TRbotanik';
const styles = pick('style');
const scripts = pick('script');

if (styles.length === 0 || scripts.length === 0) {
  console.error('HATA: tek dosyalık derlemede stil veya betik bulunamadı.');
  process.exit(1);
}

const page = [
  `<title>${title}</title>`,
  ...styles,
  '<div id="root"></div>',
  ...scripts,
].join('\n');

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, page);

const sizeMb = (Buffer.byteLength(page) / 1024 / 1024).toFixed(2);
console.log(`✓ Paylaşılabilir sayfa yazıldı: ${OUT}`);
console.log(`  ${styles.length} stil, ${scripts.length} betik, ${sizeMb} MB`);
