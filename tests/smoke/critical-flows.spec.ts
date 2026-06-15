import { expect, test, type Page } from '@playwright/test';

const mutationTestsEnabled = process.env.SMOKE_MUTATION_TESTS === '1';

function requireEnv(name: string): string {
  const value = process.env[name];
  test.skip(!value, `Set ${name} to run this smoke test.`);
  return value || '';
}

async function loginByPin(page: Page, pin: string, options: { expectTokenCallable?: boolean } = {}) {
  await page.goto('/');
  await expect(page.getByTestId('login-screen')).toBeVisible();

  const tokenResponsePromise = options.expectTokenCallable
    ? page.waitForResponse(
        (response) => response.url().includes('loginWithPin') && response.request().method() === 'POST',
        { timeout: 20_000 },
      )
    : undefined;

  for (const digit of pin) {
    await page.getByTestId(`pin-${digit}`).click();
  }
  if (pin.length < 6) {
    await page.getByTestId('pin-submit').click();
  }

  if (tokenResponsePromise) {
    const tokenResponse = await tokenResponsePromise;
    expect(tokenResponse.status(), 'PIN login must call loginWithPin successfully').toBeLessThan(400);
  }

  await expect(page.getByTestId('login-screen')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator('body')).not.toContainText(/INTERNAL|invalid-credential|Token login is disabled/i);
}

async function logout(page: Page) {
  await page.goto('/');
  const dashboardLogout = page.getByTestId('dashboard-logout').first();
  if (await dashboardLogout.isVisible().catch(() => false)) {
    await dashboardLogout.click();
    await expect(page.getByTestId('login-screen')).toBeVisible({ timeout: 15_000 });
    return;
  }

  const kioskLogout = page.getByRole('button', { name: /Odhl/i }).first();
  if (await kioskLogout.isVisible().catch(() => false)) {
    await kioskLogout.click();
    await expect(page.getByTestId('login-screen')).toBeVisible({ timeout: 15_000 });
  }
}

async function openAndAssert(page: Page, path: string, expected: RegExp) {
  await page.goto(path);
  await expect(page.getByTestId('login-screen')).toHaveCount(0);
  await expect(page.locator('body')).toContainText(expected);
  await expect(page.locator('body')).not.toContainText(/Sem nem|Modul je vypnut|INTERNAL|invalid-credential/i);
}

test.describe('critical production smoke', () => {
  test('token PIN login opens critical modules', async ({ page }) => {
    test.skip(!process.env.SMOKE_BASE_URL, 'Set SMOKE_BASE_URL to run deployed token-login smoke.');
    const adminPin = requireEnv('SMOKE_ADMIN_PIN');

    await loginByPin(page, adminPin, { expectTokenCallable: true });
    await openAndAssert(page, '/admin', /Administrace/);
    await openAndAssert(page, '/tasks', /Úkoly|Nový úkol|Moje úkoly/);
    await openAndAssert(page, '/inspections', /Kontroly|Hotové kontroly|Archiv/);
    await openAndAssert(page, '/gearboxes', /Převodovky|V servisu|Ve skladu/);
  });

  test('critical action surfaces render without mutation', async ({ page }) => {
    test.skip(!process.env.SMOKE_BASE_URL, 'Set SMOKE_BASE_URL to run deployed action-surface smoke.');
    const adminPin = requireEnv('SMOKE_ADMIN_PIN');

    await loginByPin(page, adminPin, { expectTokenCallable: true });

    await page.goto('/admin');
    await expect(page.getByTestId('admin-new-user')).toBeVisible();
    await expect(page.locator('body')).toContainText(/PIN chráněn|F3|Konfigurace/);

    await page.goto('/tasks');
    await expect(page.locator('body')).toContainText(/Dokončit|Přebírám|Nový úkol/);

    await page.goto('/inspections');
    await expect(page.locator('body')).toContainText(/Zahájit|Uzavřít|Hotové kontroly|Archiv/);

    await page.goto('/gearboxes');
    await expect(page.locator('body')).toContainText(/Nahlásit problém|Oprava|V servisu|Ve skladu/);
  });

  test('mutation: admin creates user, resets PIN, new PIN logs in', async ({ page }) => {
    test.skip(!process.env.SMOKE_BASE_URL, 'Set SMOKE_BASE_URL to run deployed mutation smoke.');
    test.skip(!mutationTestsEnabled, 'Set SMOKE_MUTATION_TESTS=1 to create/reset a smoke user.');
    const adminPin = requireEnv('SMOKE_ADMIN_PIN');

    const suffix = String(Date.now()).slice(-5);
    const displayName = `Smoke Operator ${suffix}`;
    const initialPin = process.env.SMOKE_NEW_USER_PIN || `8${suffix}`;
    const resetPin = process.env.SMOKE_RESET_USER_PIN || `7${suffix}`;

    await loginByPin(page, adminPin, { expectTokenCallable: true });
    await page.goto('/admin');
    await page.getByTestId('admin-new-user').click();
    await page.getByTestId('admin-new-user-name').fill(displayName);
    await page.getByTestId('admin-new-user-pin').fill(initialPin);
    await page.getByTestId('admin-new-user-role').selectOption('OPERATOR');
    await page.getByTestId('admin-new-user-email').fill(`smoke-${suffix}@example.invalid`);
    await page.getByTestId('admin-new-user-submit').click();
    await expect(page.getByRole('heading', { name: 'Nový uživatel' })).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByTestId('admin-user-card').filter({ hasText: displayName })).toBeVisible();

    await page.getByTestId('admin-user-card').filter({ hasText: displayName }).click();
    await page.getByTestId('admin-user-edit').click();
    await page.getByTestId('admin-user-pin').fill(resetPin);
    await page.getByTestId('admin-user-save').click();
    await expect(page.getByTestId('admin-user-save')).toHaveCount(0, { timeout: 20_000 });

    await logout(page);
    await loginByPin(page, resetPin, { expectTokenCallable: true });
    await expect(page.locator('body')).not.toContainText(/Nesprávný PIN|INTERNAL|invalid-credential/i);
  });

  test('mutation: Top5 task complete does not throw on optional fields', async ({ page }) => {
    test.skip(!process.env.SMOKE_BASE_URL, 'Set SMOKE_BASE_URL to run deployed mutation smoke.');
    test.skip(!mutationTestsEnabled, 'Set SMOKE_MUTATION_TESTS=1 to complete a visible Top5 task.');
    const adminPin = requireEnv('SMOKE_ADMIN_PIN');

    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));

    await loginByPin(page, adminPin, { expectTokenCallable: true });
    await page.goto('/');

    const completeButton = page.getByTestId('top5-task-complete').first();
    test.skip(!(await completeButton.isVisible().catch(() => false)), 'No in-progress Top5 task is visible to complete.');

    await completeButton.click();
    await expect(completeButton).toHaveCount(0, { timeout: 20_000 }).catch(() => undefined);
    expect(consoleErrors.filter((message) => /undefined|FirebaseError|completeTask/i.test(message))).toEqual([]);
  });
});
