/**
 * E2E Tests – Card → Modal Flow
 *
 * Framework: Playwright  (install: npm i -D @playwright/test)
 * Config:    playwright.config.ts at project root
 *
 * Run:  npx playwright test src/tests/e2e/cardModal.test.ts
 *
 * Coverage:
 *   1. Clicking a Quadro Geral card opens the modal (no page navigation).
 *   2. Clicking a module/plano item row opens the modal (no page navigation).
 *   3. No card click executes navigate('/') – URL must not change to '/'.
 *   4. Modal opens correctly in all relevant entry points.
 *   5. Modal is accessible: ESC closes it; clicking overlay closes it.
 *   6. Status changed in modal immediately reflects in Quadro Geral card.
 *   7. Focus is restored to the triggering element after modal closes.
 */

import { test, expect, type Page, type Locator } from "@playwright/test";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Log into the app (adjust selectors to match actual auth form) */
async function login(page: Page) {
  await page.goto("/auth");
  await page.fill('input[type="email"]', process.env.TEST_EMAIL ?? "test@example.com");
  await page.fill('input[type="password"]', process.env.TEST_PASSWORD ?? "testpassword");
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

/** Navigate to the Quadro Geral page and wait for cards to load */
async function gotoQuadro(page: Page) {
  await page.goto("/quadro");
  // Wait until at least one kanban card is visible
  await page.waitForSelector('[role="button"][aria-label^="Abrir card:"]', { timeout: 15_000 });
}

/** Grab the first kanban card in a given status column */
function firstCardInColumn(page: Page, status: string): Locator {
  // The column header contains the status name
  return page
    .locator(`div:has(span:text-is("${status}")) [role="button"][aria-label^="Abrir card:"]`)
    .first();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Quadro Geral – card click", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await gotoQuadro(page);
  });

  test("clicking a card opens the modal without navigating away", async ({ page }) => {
    const urlBefore = page.url();

    const card = page.locator('[role="button"][aria-label^="Abrir card:"]').first();
    await card.click();

    // Modal must appear
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5_000 });

    // URL must NOT have changed to '/'
    expect(page.url()).toBe(urlBefore);
    // URL must still contain /quadro
    expect(page.url()).toContain("/quadro");
  });

  test("navigate('/') is never called when clicking any card", async ({ page }) => {
    // Track navigation events
    const navigations: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations.push(frame.url());
    });

    const cards = page.locator('[role="button"][aria-label^="Abrir card:"]');
    const count = await cards.count();
    const testCount = Math.min(count, 5); // test up to 5 cards

    for (let i = 0; i < testCount; i++) {
      // Re-query each iteration because DOM may update
      const card = page.locator('[role="button"][aria-label^="Abrir card:"]').nth(i);
      await card.click();

      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5_000 });

      // Verify no navigation to home happened
      const homeNavs = navigations.filter((u) => new URL(u).pathname === "/");
      expect(homeNavs, `Card ${i} triggered navigate('/')`).toHaveLength(0);

      // Close modal with ESC before proceeding
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible({ timeout: 3_000 });
    }
  });

  test("modal opens correctly for every visible card", async ({ page }) => {
    const cards = page.locator('[role="button"][aria-label^="Abrir card:"]');
    const count = await cards.count();
    expect(count, "There must be at least one card").toBeGreaterThan(0);

    // Test the first card in each column
    for (const status of [
      "A Fazer",
      "Em Andamento",
      "Pendência Interna",
      "Pendência Cliente",
      "Monitoramento",
      "Finalizado",
      "Suspenso",
    ]) {
      const card = firstCardInColumn(page, status);
      const isVisible = await card.isVisible();
      if (!isVisible) continue; // skip columns with no cards

      await card.click();
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible({ timeout: 3_000 });
    }
  });
});

test.describe("Modal – accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await gotoQuadro(page);
  });

  test("modal closes with ESC key", async ({ page }) => {
    const card = page.locator('[role="button"][aria-label^="Abrir card:"]').first();
    await card.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible({ timeout: 3_000 });
  });

  test("modal closes when clicking the overlay backdrop", async ({ page }) => {
    const card = page.locator('[role="button"][aria-label^="Abrir card:"]').first();
    await card.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Click the fixed overlay (the semi-transparent backdrop behind the modal)
    // The backdrop is the parent element with fixed position
    const overlay = page.locator('div[style*="position: fixed"][style*="inset: 0"]').first();
    await overlay.click({ position: { x: 5, y: 5 } }); // top-left corner = outside modal

    await expect(dialog).not.toBeVisible({ timeout: 3_000 });
  });

  test("focus is trapped inside the modal while open", async ({ page }) => {
    const card = page.locator('[role="button"][aria-label^="Abrir card:"]').first();
    await card.click();

    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Tab through all focusable elements – focus must never leave the dialog
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return false;
        const dialog = document.querySelector('[role="dialog"]');
        return dialog ? dialog.contains(el) : false;
      });
      expect(focused, `Tab press ${i + 1}: focus escaped the modal`).toBe(true);
    }

    await page.keyboard.press("Escape");
  });

  test("focus is restored to the triggering card after modal closes", async ({ page }) => {
    const card = page.locator('[role="button"][aria-label^="Abrir card:"]').first();
    const cardLabel = await card.getAttribute("aria-label");

    await card.click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 3_000 });

    // The element with the same aria-label should now have focus
    const restored = await page.evaluate((label) => {
      const el = document.activeElement;
      return el?.getAttribute("aria-label") === label;
    }, cardLabel);
    expect(restored, "Focus was not restored to the card that opened the modal").toBe(true);
  });
});

test.describe("Status sync – modal ↔ Quadro Geral", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await gotoQuadro(page);
  });

  test("status changed in modal immediately reflects on the card column", async ({ page }) => {
    // Pick a card from 'A Fazer'
    const card = firstCardInColumn(page, "A Fazer");
    if (!(await card.isVisible())) {
      test.skip(); // no cards in that column
      return;
    }

    const cardLabel = await card.getAttribute("aria-label");
    await card.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Open status dropdown and pick 'Em Andamento'
    const statusBtn = dialog
      .locator('button:has(span, text="A Fazer"), button:has-text("A Fazer")')
      .first();
    await statusBtn.click();

    const emAndamento = dialog.locator('button:has-text("Em Andamento")').first();
    await emAndamento.click();

    // Close modal
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible({ timeout: 3_000 });

    // The card must now appear in the 'Em Andamento' column
    const movedCard = firstCardInColumn(page, "Em Andamento");
    const movedLabel = await movedCard.getAttribute("aria-label");
    expect(movedLabel).toBe(cardLabel);
  });
});

test.describe("Module (AdekeDashboard) – item click", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    // Home route renders AdekeDashboard
    await page.goto("/");
    await page.waitForSelector("nav button", { timeout: 15_000 });
  });

  test("clicking an item in a plano view opens the modal without redirecting", async ({ page }) => {
    const urlBefore = page.url();

    // Navigate to LGPD area → first client → first plano
    const lgpdBtn = page.locator('nav button:has-text("LGPD")').first();
    if (!(await lgpdBtn.isVisible())) {
      test.skip();
      return;
    }
    await lgpdBtn.click();

    // Click first cliente card
    const clienteBtn = page.locator('button:has-text("Ver planos"), button:has-text("→")').first();
    if (!(await clienteBtn.isVisible({ timeout: 5_000 }))) {
      test.skip();
      return;
    }
    await clienteBtn.click();

    // Click first plano "Abrir" button
    const planoBtn = page.locator('button:has-text("Abrir"), button:has-text("Ver itens")').first();
    if (!(await planoBtn.isVisible({ timeout: 5_000 }))) {
      test.skip();
      return;
    }
    await planoBtn.click();

    // Click first item name button to open modal
    const itemBtn = page
      .locator('button[type="button"]:not([title])')
      .filter({ hasText: /.+/ })
      .first();
    await itemBtn.click({ timeout: 5_000 });

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // URL must NOT have become '/' (no re-navigation)
    expect(page.url()).not.toMatch(/^https?:\/\/[^/]+\/?$/);

    await page.keyboard.press("Escape");
  });

  test("no card/item click in the dashboard calls navigate('/')", async ({ page }) => {
    const navigations: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations.push(frame.url());
    });

    // Switch to the embedded Quadro Geral tab
    const quadroTab = page.locator('button:has-text("Quadro Geral")').first();
    if (!(await quadroTab.isVisible({ timeout: 5_000 }))) {
      test.skip();
      return;
    }
    await quadroTab.click();

    // Click up to 3 cards
    const cards = page.locator('[role="button"][aria-label^="Abrir card:"]');
    const count = Math.min(await cards.count(), 3);
    for (let i = 0; i < count; i++) {
      await page.locator('[role="button"][aria-label^="Abrir card:"]').nth(i).click();
      await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5_000 });
      await page.keyboard.press("Escape");
      await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 3_000 });
    }

    // No navigation to root should have occurred
    const rootNavs = navigations.filter((u) => {
      try {
        return new URL(u).pathname === "/";
      } catch {
        return false;
      }
    });
    expect(rootNavs, "A card click triggered navigate('/')").toHaveLength(0);
  });
});
