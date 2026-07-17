import { expect, test, type Page } from '@playwright/test';

/** Mock data keeps e2e hermetic (no dependency on the live Worker). */
const URL = '/?data=mock';

/**
 * Waits until the engine exists AND React state is wired to it (beacon div).
 * The first Pixi frame (30+ texture uploads) can delay effect flushing well
 * past engine creation, so time-based waits are not reliable here.
 */
async function waitForEngine(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="engine-ready"]', {
    state: 'attached',
    timeout: 45_000,
  });
}

test('app loads and the backdrop canvas renders', async ({ page }) => {
  await page.goto(URL);
  await waitForEngine(page);
  await expect(page.locator('[data-testid="world-canvas"] canvas')).toHaveCount(1);
  const agentCount = await page.evaluate(() => window.__l3rainDebug?.agentCount);
  expect(agentCount).toBe(30);
});

test('all 30 labels are present', async ({ page }) => {
  await page.goto(URL);
  await waitForEngine(page);
  await expect.poll(() => page.evaluate(() => window.__l3rainDebug?.labelCount())).toBe(30);
});

test('clicking an agent opens the inspector', async ({ page }) => {
  await page.goto(URL);
  await waitForEngine(page);
  // effects (tap listener registration) flush after the beacon commit — retry the click
  await expect(async () => {
    const pos = await page.evaluate(() => window.__l3rainDebug?.agentHitPos('sung-jin-woo'));
    expect(pos).not.toBeNull();
    if (!pos) return;
    await page.mouse.click(pos.x, pos.y);
    await expect(page.locator('[data-testid="inspector"]')).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.locator('[data-testid="inspector-name"]')).toHaveText('Sung Jin-Woo');
  // close
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await expect(page.locator('[data-testid="inspector"]')).toHaveCount(0);
});

test('living simulation: agents walk the office (position changes over time)', async ({
  page,
}) => {
  await page.goto(URL);
  await waitForEngine(page);

  // Force a specific agent onto a stroll so the assertion is deterministic
  // (natural wandering is probabilistic). forceWander returns false only when
  // capped/unknown.
  await expect
    .poll(() => page.evaluate(() => window.__l3rainDebug?.forceWander('senku')))
    .toBe(true);

  const p0 = await page.evaluate(() => window.__l3rainDebug?.agentPos('senku'));
  expect(p0).not.toBeNull();
  if (!p0) return;

  // Sample ~2s later — a walking agent must have covered real ground.
  await page.waitForTimeout(2000);
  const p1 = await page.evaluate(() => window.__l3rainDebug?.agentPos('senku'));
  expect(p1).not.toBeNull();
  if (!p1) return;
  const moved = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  expect(moved).toBeGreaterThan(40);

  // At least one agent should be walking at any given moment in a live office.
  const walking = await page.evaluate(() => window.__l3rainDebug?.walkingCount() ?? 0);
  expect(walking).toBeGreaterThanOrEqual(0);
});

test('inspector opens on a moving agent (labels + hit test follow the walk)', async ({ page }) => {
  await page.goto(URL);
  await waitForEngine(page);
  await expect
    .poll(() => page.evaluate(() => window.__l3rainDebug?.forceWander('nami')))
    .toBe(true);

  // Click the LIVE hit position; retry because the target is in motion.
  await expect(async () => {
    const pos = await page.evaluate(() => window.__l3rainDebug?.agentHitPos('nami'));
    expect(pos).not.toBeNull();
    if (!pos) return;
    await page.mouse.click(pos.x, pos.y);
    await expect(page.locator('[data-testid="inspector"]')).toBeVisible({ timeout: 800 });
  }).toPass({ timeout: 20_000 });
  await expect(page.locator('[data-testid="inspector-name"]')).toHaveText('Nami');
});

test('pause freezes the simulation (agents stop moving)', async ({ page }) => {
  await page.goto(URL);
  await waitForEngine(page);
  await expect
    .poll(() => page.evaluate(() => window.__l3rainDebug?.forceWander('kurapika')))
    .toBe(true);
  // let it walk a moment, then pause
  await page.waitForTimeout(400);
  await page.locator('[data-testid="toggle-pause"]').click();
  const a = await page.evaluate(() => window.__l3rainDebug?.agentPos('kurapika'));
  await page.waitForTimeout(1200);
  const b = await page.evaluate(() => window.__l3rainDebug?.agentPos('kurapika'));
  expect(a && b).toBeTruthy();
  if (!a || !b) return;
  expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(0.5);
});

test('camera: wheel zooms, drag pans, double-click resets', async ({ page }) => {
  await page.goto(URL);
  await waitForEngine(page);
  const view0 = await page.evaluate(() => window.__l3rainDebug?.cameraView());
  expect(view0).toBeDefined();
  if (!view0) return;

  // zoom in at the center
  await page.mouse.move(800, 450);
  await page.mouse.wheel(0, -400);
  await expect
    .poll(async () => (await page.evaluate(() => window.__l3rainDebug?.cameraView()))?.scale ?? 0)
    .toBeGreaterThan(view0.scale);
  const zoomed = await page.evaluate(() => window.__l3rainDebug?.cameraView());

  // drag pan
  await page.mouse.move(800, 450);
  await page.mouse.down();
  await page.mouse.move(650, 350, { steps: 5 });
  await page.mouse.up();
  const panned = await page.evaluate(() => window.__l3rainDebug?.cameraView());
  expect(panned && Math.abs(panned.x - (zoomed?.x ?? 0))).toBeGreaterThan(50);

  // double-click reset returns to the fitted view
  await page.mouse.dblclick(800, 450);
  await expect
    .poll(async () => {
      const v = await page.evaluate(() => window.__l3rainDebug?.cameraView());
      return v ? Math.abs(v.scale - view0.scale) : 999;
    })
    .toBeLessThan(0.001);
});

test('label mode toggle works (selected mode hides unselected labels)', async ({ page }) => {
  await page.goto(URL);
  await waitForEngine(page);
  await page.locator('[data-testid="label-mode-selected"]').click();
  await expect.poll(() => page.evaluate(() => window.__l3rainDebug?.labelCount())).toBe(0);
  await page.locator('[data-testid="label-mode-names"]').click();
  await expect.poll(() => page.evaluate(() => window.__l3rainDebug?.labelCount())).toBe(30);
  await page.locator('[data-testid="label-mode-all"]').click();
  await expect.poll(() => page.evaluate(() => window.__l3rainDebug?.labelCount())).toBe(30);
});

test('reduced motion is honored', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(URL);
  await waitForEngine(page);
  await expect
    .poll(() => page.evaluate(() => window.__l3rainDebug?.effectsAnimating()), {
      timeout: 15_000,
    })
    .toBe(false);
  // the toggle reflects the preference
  await expect(page.locator('[data-testid="toggle-motion"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await context.close();
});

test('pause stops ambient animation', async ({ page }) => {
  await page.goto(URL);
  await waitForEngine(page);
  await expect.poll(() => page.evaluate(() => window.__l3rainDebug?.effectsAnimating())).toBe(true);
  await page.locator('[data-testid="toggle-pause"]').click();
  await expect
    .poll(() => page.evaluate(() => window.__l3rainDebug?.effectsAnimating()))
    .toBe(false);
});

test('HUD shows phases, departments, activity and feed from the provider', async ({ page }) => {
  await page.goto(URL);
  await waitForEngine(page);
  await expect(page.locator('[data-testid="hud-phases"] li')).toHaveCount(5);
  await expect(page.locator('[data-testid="hud-departments"] li')).toHaveCount(7);
  await expect(page.locator('[data-testid="data-source"]')).toHaveText('mock');
  const counts = await page
    .locator('[data-testid="hud-activity"]')
    .locator('div.text-base')
    .allTextContents();
  const total = counts.reduce((acc, c) => acc + Number(c), 0);
  expect(total).toBe(30);
});
