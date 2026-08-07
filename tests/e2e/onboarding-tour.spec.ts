import { expect, test, type Page } from '@playwright/test';

async function waitForMap(page: Page) {
  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-map-ready', 'true', {
    timeout: 30_000,
  });
}

/**
 * Bu dosya KASITLI olarak smoke.spec.ts'in dışında: o dosyadaki testler turu
 * "daha önce görülmüş" işaretleyip atlıyor (bkz. oradaki beforeEach), burada
 * ise tam tersini — turun ilk ziyarette gerçekten açıldığını — sınıyoruz.
 */
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
});

test('tanıtım turu ilk ziyarette otomatik açılır', async ({ page }) => {
  const tour = page.getByTestId('onboarding-tour');
  await expect(tour).toBeVisible({ timeout: 5_000 });
  await expect(tour).toContainText('TRbotanik');
});

test('İleri/Geri ile adımlar arasında gezinilebilir, hedef doğru vurgulanır', async ({ page }) => {
  const tour = page.getByTestId('onboarding-tour');
  await expect(tour).toBeVisible();

  // 1. adım (karşılama): hedefsiz, tam ekran karartma.
  await expect(page.locator('.tour-backdrop')).toBeVisible();
  await expect(page.locator('.tour-spotlight')).toHaveCount(0);

  // 2. adıma geç: "Harita modları" — mode-switch üzerine spotlight düşmeli.
  await page.getByTestId('tour-next').click();
  await expect(page.locator('.tour-spotlight')).toBeVisible();
  await expect(page.locator('.tour-backdrop')).toHaveCount(0);

  const modeBox = await page.getByTestId('mode-switch').boundingBox();
  const spotBox = await page.locator('.tour-spotlight').boundingBox();
  expect(modeBox).not.toBeNull();
  expect(spotBox).not.toBeNull();
  // Spotlight, hedefi (küçük bir dolgu payıyla) sarmalamalı.
  expect(spotBox!.x).toBeLessThanOrEqual(modeBox!.x + 1);
  expect(spotBox!.y).toBeLessThanOrEqual(modeBox!.y + 1);
  expect(spotBox!.x + spotBox!.width).toBeGreaterThanOrEqual(modeBox!.x + modeBox!.width - 1);

  // "Geri" ile karşılama adımına dönülebilir.
  await page.getByTestId('tour-prev').click();
  await expect(page.locator('.tour-backdrop')).toBeVisible();
});

test('"Atla" turu kapatır ve bir daha otomatik açılmaz', async ({ page }) => {
  const tour = page.getByTestId('onboarding-tour');
  await expect(tour).toBeVisible();

  await page.getByTestId('tour-skip').click();
  await expect(tour).toHaveCount(0);

  // Sayfa yenilenince (aynı tarayıcı depolaması) tur artık otomatik açılmamalı.
  await page.reload();
  await waitForMap(page);
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('onboarding-tour')).toHaveCount(0);
});

test('"?" düğmesi turu istenildiği an yeniden açar', async ({ page }) => {
  await page.getByTestId('tour-skip').click();
  await expect(page.getByTestId('onboarding-tour')).toHaveCount(0);

  await page.getByTestId('tour-help-button').click();
  await expect(page.getByTestId('onboarding-tour')).toBeVisible();
});

test('son adımda "Anladım" turu kapatır', async ({ page }) => {
  const tour = page.getByTestId('onboarding-tour');
  await expect(tour).toBeVisible();

  // "İleri"ye tekrar tekrar bas — düğme son adımda "Anladım"a döner ve kapanır.
  for (let i = 0; i < 10; i++) {
    if ((await tour.count()) === 0) break;
    await page.getByTestId('tour-next').click();
  }
  await expect(tour).toHaveCount(0);
});
