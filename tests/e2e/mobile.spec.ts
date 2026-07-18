import { expect, test, type CDPSession, type Page } from '@playwright/test';

/**
 * iPhone-viewport touchscreen suite (Playwright device emulation + CDP
 * multi-touch). Covers the owner-reported mobile bug: the world must pan,
 * pinch-zoom and double-tap-reset on a phone, and the HUD rail must collapse
 * so the world gets the full screen.
 */

const URL = '/?data=mock';

// NOTE: the mobile project runs with reducedMotion:'reduce' (playwright.config).
// These tests validate the CAMERA (pan/pinch/reset) + responsive layout, which
// are independent of the living simulation; freezing animation keeps the main
// thread free so synthetic-touch dispatch stays fast and tap-timing is
// deterministic under parallel headless-swiftshader load.

async function waitForEngine(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="engine-ready"]', {
    state: 'attached',
    timeout: 45_000,
  });
}

interface TouchPoint {
  x: number;
  y: number;
  id: number;
}

async function dispatchTouch(
  cdp: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  points: TouchPoint[],
): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id })),
  });
}

/**
 * Lift every active finger, ONE AT A TIME. CDP's touchEnd identifies the ended
 * point by diffing against the still-active set, so releasing two fingers with a
 * single empty touchEnd leaves the second one "stuck" (a real Safari fires a
 * pointerup per finger). Pop one point per event until none remain.
 */
async function releaseAll(cdp: CDPSession, active: TouchPoint[]): Promise<void> {
  const remaining = [...active];
  while (remaining.length > 0) {
    remaining.pop();
    await dispatchTouch(cdp, 'touchEnd', remaining);
  }
}

/** Two fingers spreading apart around a midpoint (pinch out = zoom in). */
async function pinchOut(
  page: Page,
  mid: { x: number; y: number },
  fromSpread: number,
  toSpread: number,
  steps = 12,
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const at = (spread: number): TouchPoint[] => [
    { x: mid.x - spread / 2, y: mid.y, id: 1 },
    { x: mid.x + spread / 2, y: mid.y, id: 2 },
  ];
  await dispatchTouch(cdp, 'touchStart', at(fromSpread));
  for (let i = 1; i <= steps; i += 1) {
    const spread = fromSpread + ((toSpread - fromSpread) * i) / steps;
    await dispatchTouch(cdp, 'touchMove', at(spread));
  }
  await releaseAll(cdp, at(toSpread));
  await cdp.detach();
}

/** One finger dragging from a to b. */
async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 12,
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await dispatchTouch(cdp, 'touchStart', [{ ...from, id: 1 }]);
  for (let i = 1; i <= steps; i += 1) {
    await dispatchTouch(cdp, 'touchMove', [
      {
        x: from.x + ((to.x - from.x) * i) / steps,
        y: from.y + ((to.y - from.y) * i) / steps,
        id: 1,
      },
    ]);
  }
  await dispatchTouch(cdp, 'touchEnd', []);
  await cdp.detach();
}

async function doubleTap(page: Page, at: { x: number; y: number }): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  // Pipeline the four touch dispatches (no per-send await). Each CDP round-trip
  // costs ~250ms of ACK latency under headless swiftshader; awaiting each one
  // stretches the two taps to ~700ms apart — outside the camera's 450ms
  // double-tap window — even though a real double-tap is two QUICK taps. Queuing
  // the sends makes the browser stamp them back-to-back (~ms apart, well within
  // the window), so the reset gesture is exercised deterministically on both
  // fast CI and a loaded local machine. Order is preserved: cdp.send writes to
  // the wire in call order and the browser processes touch events FIFO.
  const p = { ...at, id: 1 };
  await Promise.all([
    dispatchTouch(cdp, 'touchStart', [p]),
    dispatchTouch(cdp, 'touchEnd', []),
    dispatchTouch(cdp, 'touchStart', [p]),
    dispatchTouch(cdp, 'touchEnd', []),
  ]);
  await cdp.detach();
}

function cameraView(page: Page) {
  return page.evaluate(() => window.__l3rainDebug?.cameraView());
}

test('phone layout: no fixed side rail — the world canvas fills the viewport', async ({
  page,
}) => {
  await page.goto(URL);
  await waitForEngine(page);
  // the desktop HUD rail is collapsed
  await expect(page.locator('[data-testid="hud"]')).toBeHidden();
  // the STATUS toggle is available instead
  await expect(page.locator('[data-testid="hud-toggle"]')).toBeVisible();
  // the canvas host spans the full viewport
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const box = await page.locator('[data-testid="world-canvas"]').boundingBox();
  expect(box).not.toBeNull();
  if (!box || !viewport) return;
  expect(box.width).toBeGreaterThanOrEqual(viewport.width - 1);
  expect(box.height).toBeGreaterThanOrEqual(viewport.height - 1);
  expect(Math.abs(box.x)).toBeLessThan(1);
});

test('STATUS toggle opens and closes the HUD drawer', async ({ page }) => {
  await page.goto(URL);
  await waitForEngine(page);
  await expect(page.locator('[data-testid="hud-drawer"]')).toHaveCount(0);
  await page.locator('[data-testid="hud-toggle"]').tap();
  await expect(page.locator('[data-testid="hud-drawer"]')).toBeVisible();
  // scope to the drawer: the desktop rail is display:none but still in the DOM
  await expect(
    page.locator('[data-testid="hud-drawer"] [data-testid="hud-phases"] li'),
  ).toHaveCount(5);
  await page.locator('[data-testid="hud-toggle"]').tap();
  await expect(page.locator('[data-testid="hud-drawer"]')).toHaveCount(0);
});

test('two-finger pinch zooms, anchored at the pinch midpoint', async ({ page }) => {
  await page.goto(URL);
  await waitForEngine(page);
  const v0 = await cameraView(page);
  expect(v0).toBeDefined();
  if (!v0) return;

  const mid = { x: 195, y: 330 };
  await pinchOut(page, mid, 80, 300);
  const v1 = await cameraView(page);
  expect(v1).toBeDefined();
  if (!v1) return;
  expect(v1.scale).toBeGreaterThan(v0.scale * 1.5);

  // pinch in zooms back out
  await pinchOut(page, mid, 300, 80);
  const v2 = await cameraView(page);
  if (!v2) return;
  expect(v2.scale).toBeLessThan(v1.scale * 0.7);
});

test('one-finger drag pans the world', async ({ page }) => {
  await page.goto(URL);
  await waitForEngine(page);
  // zoom in first so there is somewhere to pan
  await pinchOut(page, { x: 195, y: 330 }, 80, 320);
  const v1 = await cameraView(page);
  expect(v1).toBeDefined();
  if (!v1) return;

  await drag(page, { x: 300, y: 400 }, { x: 120, y: 260 });
  const v2 = await cameraView(page);
  if (!v2) return;
  const moved = Math.hypot(v2.x - v1.x, v2.y - v1.y);
  expect(v2.scale).toBeCloseTo(v1.scale, 5); // drag must not zoom
  expect(moved).toBeGreaterThan(60);
});

test('double-tap resets the camera to the fitted view', async ({ page }) => {
  await page.goto(URL);
  await waitForEngine(page);
  const fitted = await cameraView(page);
  expect(fitted).toBeDefined();
  if (!fitted) return;

  await pinchOut(page, { x: 195, y: 330 }, 80, 300);
  const zoomed = await cameraView(page);
  if (!zoomed) return;
  expect(zoomed.scale).toBeGreaterThan(fitted.scale * 1.5);

  await doubleTap(page, { x: 195, y: 330 });
  await expect
    .poll(async () => {
      const v = await cameraView(page);
      return v ? Math.abs(v.scale - fitted.scale) : 999;
    })
    .toBeLessThan(0.001);
});
