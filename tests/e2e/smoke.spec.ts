import { expect, test, type Page } from '@playwright/test';

/** Harita WebGL ile çizildiği için karolar yerleşene kadar kısa bir bekleme gerekir. */
async function waitForMap(page: Page) {
  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-map-ready', 'true', {
    timeout: 30_000,
  });
  await page.waitForTimeout(900);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
});

test('harita yüklenir ve 29 Davis karesi etiketiyle çizilir', async ({ page }) => {
  await expect(page.getByTestId('map-canvas')).toBeVisible();

  // Her karenin HTML etiketi vardır — 29 tanesi de çizilmeli
  await expect(page.locator('.davis-label')).toHaveCount(29);
  await expect(page.locator('.davis-label').filter({ hasText: 'B4' })).toBeVisible();

  await page.screenshot({ path: 'screenshots/01-genel-gorunum.png', fullPage: false });
});

test('örnek veri uyarı bandı görünür', async ({ page }) => {
  const banner = page.getByTestId('fixture-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Örnek veri');
});

test('familya seçimi choropleth ve sayaçları değiştirir', async ({ page }) => {
  const tree = page.getByTestId('taxon-tree');
  await expect(tree).toBeVisible();

  const before = await page.locator('.stat__value').first().innerText();

  // Ağaçtan bir familya seç
  const family = tree.getByRole('button', { name: /Pinaceae/ }).first();
  await family.click();
  await page.waitForTimeout(600);

  const after = await page.locator('.stat__value').first().innerText();
  expect(after).not.toBe(before);

  await page.screenshot({ path: 'screenshots/02-familya-secimi.png' });
});

test('arama Türkçe adla takson bulur', async ({ page }) => {
  await page.getByTestId('taxon-search').fill('gelincik');
  await page.waitForTimeout(500);

  const tree = page.getByTestId('taxon-tree');
  await expect(tree.getByText('Papaver rhoeas')).toBeVisible();
});

test('türe tıklayınca öznitelik tablosu ve görseller açılır', async ({ page }) => {
  await page.getByTestId('taxon-search').fill('Cedrus');
  await page.waitForTimeout(500);

  await page.getByTestId('taxon-tree').getByText('Cedrus libani').click();

  const detail = page.getByTestId('species-detail');
  await expect(detail).toBeVisible();
  await expect(detail.getByRole('heading', { name: /Cedrus libani/ })).toBeVisible();

  // Öznitelik tablosu gerçek değerleri gösterir
  await expect(detail.getByRole('cell', { name: /Toros sediri/ })).toBeVisible();
  await expect(detail.getByRole('cell', { name: /^Pinaceae/ })).toBeVisible();
  await expect(detail.getByRole('cell', { name: /^Ağaç/ })).toBeVisible();
  // Yükselti aralığı küratörlenmiş bir alandır ve değeriyle görünmelidir
  await expect(detail.getByRole('cell', { name: /800–2100 m/ })).toBeVisible();

  // Boş alanlar gizlenmez, gerekçesiyle gösterilir
  await expect(detail.getByText(/henüz küratörlenmedi/).first()).toBeVisible();

  // Galeri
  await expect(detail.locator('.gallery__item img')).toHaveCount(2);

  await page.screenshot({ path: 'screenshots/03-tur-detayi.png' });
});

test('türe tıklayınca harita o türün konumuna odaklanır', async ({ page }) => {
  // window.__trbotanikMap yalnızca VITE_EXPOSE_MAP_DEBUG=1 ile derlenen e2e
  // yapılandırmasında vardır (bkz. playwright.config.ts); üretim derlemesinde yok.
  const getZoom = () => page.evaluate(() => window.__trbotanikMap.getZoom());
  const getHighlightCount = () =>
    page.evaluate(() => {
      const source = window.__trbotanikMap.getSource('species-highlight') as unknown as {
        _data?: { geojson?: { features?: unknown[] } };
      };
      return source?._data?.geojson?.features?.length ?? 0;
    });

  expect(await getHighlightCount()).toBe(0);
  const zoomBefore = await getZoom();

  await page.getByTestId('taxon-search').fill('Cedrus');
  await page.waitForTimeout(400);
  await page.getByTestId('taxon-tree').getByText('Cedrus libani').click();
  await page.waitForTimeout(1000); // fitBounds animasyonu (700ms) + pay

  // Regresyon testi: bu tür haritada seçilmeden önce hiçbir konum göstermiyordu.
  expect(await getHighlightCount()).toBeGreaterThan(0);
  expect(await getZoom()).toBeGreaterThan(zoomBefore);

  await page.screenshot({ path: 'screenshots/09-tur-konumu.png' });

  // Kapatınca vurgu temizlenir
  await page.getByTestId('detail-close').click();
  await page.waitForTimeout(300);
  expect(await getHighlightCount()).toBe(0);
});

test('altlık harita seçenekleri arasında geçiş yapılabilir', async ({ page }) => {
  await expect(page.getByTestId('basemap-offline')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('basemap-eox-s2cloudless').click();
  await expect(page.getByTestId('basemap-eox-s2cloudless')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('basemap-offline')).toHaveAttribute('aria-pressed', 'false');

  // Altlık değişse de kendi katmanlarımız (Davis kareleri) yerinde kalmalı
  await expect(page.locator('.davis-label')).toHaveCount(29);

  await page.getByTestId('basemap-offline').click();
  await expect(page.getByTestId('basemap-offline')).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'screenshots/10-altlik-secici.png' });
});

test('haritada kareye tıklayınca o karedeki türler listelenir', async ({ page }) => {
  const canvas = page.getByTestId('map-canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  // Haritanın ortasına tıkla — İç Anadolu karelerinden birine denk gelir
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

  const panel = page.getByTestId('square-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('square-species-list').locator('li').first()).toBeVisible();

  await page.screenshot({ path: 'screenshots/04-kare-paneli.png' });
});

test('harita modu değiştirilebilir', async ({ page }) => {
  await page.getByTestId('map-mode-points').click();
  await page.waitForTimeout(800);
  await expect(page.getByTestId('map-mode-points')).toHaveAttribute('aria-pressed', 'true');
  // Nokta modunda kare etiketleri gizlenir
  await expect(page.locator('.davis-label').first()).toBeHidden();
  await page.screenshot({ path: 'screenshots/05-nokta-modu.png' });

  await page.getByTestId('map-mode-heatmap').click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'screenshots/06-isi-haritasi.png' });
});

test('choropleth ölçütü değiştirilebilir', async ({ page }) => {
  await page.getByTestId('legend-metric').selectOption('endemic');
  await page.waitForTimeout(600);
  await expect(page.getByTestId('legend-metric')).toHaveValue('endemic');

  // Ham kayıt sayısı seçilince örnekleme yanlılığı notu görünür
  await page.getByTestId('legend-metric').selectOption('records');
  await expect(page.getByText(/toplayıcı çabasını yansıtır/)).toBeVisible();
});

test('yalnızca endemik filtresi çalışır', async ({ page }) => {
  await page.getByTestId('facet-endemic').click();
  await page.waitForTimeout(600);

  const tree = page.getByTestId('taxon-tree');
  await expect(tree.getByText('Centaurea tchihatcheffii')).toBeVisible();
  // Endemik olmadığı bilinen bir tür listede olmamalı
  await expect(tree.getByText('Papaver rhoeas')).toHaveCount(0);
});

test('TR/EN dil geçişi arayüzü değiştirir', async ({ page }) => {
  await expect(page.getByText('Türkiye Botanik Çeşitliliği Haritası')).toBeVisible();

  await page.getByTestId('lang-en').click();
  await expect(page.getByText('Botanical Diversity Map of Türkiye')).toBeVisible();
  await expect(page.getByText('Sample data', { exact: true })).toBeVisible();
  await expect(page.getByTestId('map-mode-davis')).toHaveText('Davis squares');
  await page.screenshot({ path: 'screenshots/07-ingilizce.png' });

  await page.getByTestId('lang-tr').click();
  await expect(page.getByText('Türkiye Botanik Çeşitliliği Haritası')).toBeVisible();
});

test('hiçbir dış hosta istek yapılmaz (ağsız çalışma güvencesi)', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith('http://127.0.0.1') && !url.startsWith('data:') && !url.startsWith('blob:')) {
      external.push(url);
    }
  });

  await page.reload();
  await waitForMap(page);
  await page.getByTestId('map-mode-points').click();
  await page.waitForTimeout(1000);

  expect(external).toEqual([]);
});
