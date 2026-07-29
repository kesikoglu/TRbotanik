/**
 * Ortak HTTP yardımcıları — GBIF ve iNaturalist istemcileri bunu paylaşır.
 *
 * Bu ortamdan (geliştirme konteyneri) dış ağ engellendiği için bu dosya YALNIZCA
 * GitHub Actions runner'ında (gerçek internet erişimi olan) çalıştırılabilir ve
 * test edilebilir — bkz. .github/workflows/refresh-data.yml.
 */

// NOT: Bu değer yalnızca ASCII karakter içermelidir — fetch() başlık değerleri
// ByteString (Latin-1) olmak zorundadır; Türkçe karakter (ş, ç, ğ, ı, ö, ü)
// içeren bir User-Agent burada "ByteString'e dönüştürülemez" hatasıyla patlar.
const DEFAULT_HEADERS = {
  'User-Agent': 'TRbotanik/0.1 (+https://github.com/kesikoglu/TRbotanik; academic biodiversity map of Turkiye)',
  Accept: 'application/json',
};

/** Üstel geri çekilmeli, zaman aşımlı JSON GET. 429/5xx yeniden denenir. */
export async function fetchJsonRetry(url, { retries = 5, timeoutMs = 30000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: DEFAULT_HEADERS, signal: controller.signal });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status} (yeniden denenecek): ${url}`);
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${url}`);
      }
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt === retries) break;
      const backoffMs = Math.min(30000, 500 * 2 ** attempt) + Math.random() * 300;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw lastErr;
}

/** `limit` eşzamanlı işçiyle `items` üzerinde `worker` çalıştırır, sıralı sonuç döner. */
export async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let idx = 0;
  let done = 0;
  const total = items.length;
  const startedAt = Date.now();

  async function run() {
    while (idx < items.length) {
      const current = idx++;
      results[current] = await worker(items[current], current);
      done++;
      if (done % 250 === 0 || done === total) {
        const elapsedS = ((Date.now() - startedAt) / 1000).toFixed(0);
        console.log(`  … ${done}/${total} (${elapsedS}s)`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, run));
  return results;
}

/** Bir dakikada en fazla `perMinute` istek yapılmasını sağlayan sıralı zamanlayıcı. */
export function rateLimiter(perMinute) {
  const minIntervalMs = 60000 / perMinute;
  let lastCallAt = 0;
  return async function wait() {
    const now = Date.now();
    const elapsed = now - lastCallAt;
    if (elapsed < minIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, minIntervalMs - elapsed));
    }
    lastCallAt = Date.now();
  };
}
