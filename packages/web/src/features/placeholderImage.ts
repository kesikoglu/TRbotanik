/**
 * Yer tutucu görsel üreteci.
 *
 * Fixture modunda gerçek fotoğraf yoktur. Galerinin, lisans satırının ve düzenin yine
 * de test edilebilmesi için görsel çalışma anında SVG olarak üretilir — veri setine
 * gömülü data-URI taşımak dosyayı yüzlerce kilobayt şişirirdi.
 *
 * Görselin üzerinde "gerçek fotoğraf değildir" uyarısı yer alır; ekran görüntüsü
 * alındığında bile gerçek bir bitki fotoğrafıyla karıştırılamaz.
 */
export function placeholderImageUrl(scientificName: string, index: number): string {
  const hue = (scientificName.length * 37 + index * 61) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
<stop offset="0%" stop-color="hsl(${hue} 42% 68%)"/>
<stop offset="100%" stop-color="hsl(${(hue + 40) % 360} 38% 38%)"/>
</linearGradient></defs>
<rect width="400" height="300" fill="url(#g)"/>
<circle cx="200" cy="132" r="50" fill="rgba(255,255,255,.38)"/>
<path d="M200 182 L200 248 M200 206 Q168 191 152 206 M200 226 Q232 211 248 226" stroke="rgba(255,255,255,.75)" stroke-width="6" fill="none" stroke-linecap="round"/>
<text x="200" y="276" font-family="Georgia,serif" font-size="17" font-style="italic" fill="#fff" text-anchor="middle">${escapeXml(scientificName)}</text>
<text x="200" y="26" font-family="system-ui,sans-serif" font-size="11.5" fill="rgba(255,255,255,.92)" text-anchor="middle">ÖRNEK GÖRSEL — GERÇEK FOTOĞRAF DEĞİL</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** `<kaynak>-<isim>-<sıra>` biçimindeki görsel id'sinden sıra numarasını çıkarır. */
export function imageIndex(id: string): number {
  const parsed = Number(id.slice(id.lastIndexOf('-') + 1));
  return Number.isFinite(parsed) ? parsed : 0;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (char) => {
    switch (char) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&apos;';
      default: return '&quot;';
    }
  });
}
