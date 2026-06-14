import { expect, test, type Page } from '@playwright/test';

const bannedPublicData = [
  /Vil.m/i,
  /Zden/i,
  /Milan/i,
  /Martina/i,
  /Pavla/i,
  /Filip/i,
  /Kozlov/i,
  /nominal-cmms/i,
];

type SmokeRole = {
  name: string;
  pinEnv: string;
  allowedPath: string;
  deniedPath?: string;
};

const roleCases: SmokeRole[] = [
  { name: 'admin', pinEnv: 'SMOKE_ADMIN_PIN', allowedPath: '/admin' },
  { name: 'maintenance', pinEnv: 'SMOKE_MAINTENANCE_PIN', allowedPath: '/tasks', deniedPath: '/admin' },
  { name: 'production', pinEnv: 'SMOKE_PRODUCTION_PIN', allowedPath: '/production', deniedPath: '/admin' },
];

async function loginByPin(page: Page, pin: string) {
  await page.goto('/');
  await expect(page.getByTestId('login-screen')).toBeVisible();
  for (const digit of pin) {
    await page.getByTestId(`pin-${digit}`).click();
  }
  if (pin.length < 6) {
    await page.getByTestId('pin-submit').click();
  }
  await expect(page.getByTestId('login-screen')).toHaveCount(0, { timeout: 20_000 });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
}

async function logoutIfPresent(page: Page) {
  const logoutButton = page.locator('button[aria-label*="Odhl"], a[aria-label*="Odhl"], button:has-text("Odhl"), a:has-text("Odhl")').first();
  if (await logoutButton.isVisible().catch(() => false)) {
    await logoutButton.click();
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  }
}

async function expectNoBannedPublicData(page: Page) {
  const text = await page.locator('body').innerText();
  for (const pattern of bannedPublicData) {
    expect(text, `Public smoke output contains banned production data: ${pattern}`).not.toMatch(pattern);
  }
}

test.describe('white-label smoke', () => {
  test('sandbox login loads dashboard without production identifiers', async ({ page }) => {
    const sandboxPin = process.env.SMOKE_SANDBOX_PIN || (process.env.SMOKE_BASE_URL ? '' : '0000');
    test.skip(!sandboxPin, 'Set SMOKE_SANDBOX_PIN to run sandbox smoke against an external URL.');

    await loginByPin(page, sandboxPin);
    await expect(page.locator('body')).not.toContainText(/invalid-credential|INTERNAL/i);
    await expectNoBannedPublicData(page);
  });

  for (const roleCase of roleCases) {
    test(`${roleCase.name} role can open its primary module`, async ({ page }) => {
      const pin = process.env[roleCase.pinEnv];
      test.skip(!pin, `Set ${roleCase.pinEnv} to run this role smoke.`);

      await loginByPin(page, pin);
      await page.goto(roleCase.allowedPath);
      await expect(page.getByTestId('login-screen')).toHaveCount(0);
      await expect(page.locator('body')).not.toContainText(/Sem nem|Modul je vypnut/i);
      await expectNoBannedPublicData(page);
    });

    if (roleCase.deniedPath) {
      test(`${roleCase.name} role is blocked from admin`, async ({ page }) => {
        const pin = process.env[roleCase.pinEnv];
        test.skip(!pin, `Set ${roleCase.pinEnv} to run this role smoke.`);

        await loginByPin(page, pin);
        await page.goto(roleCase.deniedPath);
        await expect(page.locator('body')).toContainText(/Sem nem|Modul je vypnut/i);
      });
    }
  }

  test('empty instance smoke does not expose seeded production data', async ({ page }) => {
    const pin = process.env.SMOKE_EMPTY_ADMIN_PIN;
    test.skip(!pin, 'Set SMOKE_EMPTY_ADMIN_PIN to run empty-instance smoke.');

    await loginByPin(page, pin);
    await expectNoBannedPublicData(page);
    await expect(page.locator('body')).not.toContainText(/evodovka 1|Extruder 3|IROKOV/i);
    await logoutIfPresent(page);
  });
});
