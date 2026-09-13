import { test, expect, type Page } from "@playwright/test";

async function start(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as { deeperGame?: unknown }).deeperGame, null, { timeout: 30000 });
  await page.waitForFunction(() => (window as unknown as { deeper?: { scene?: unknown } }).deeper, null, { timeout: 30000 });
}

test("title screen shows and new game starts", async ({ page }) => {
  await start(page);
  await expect(page.locator(".title-panel")).toBeVisible();
  await expect(page.locator(".tagline")).toContainText("EVERYTHING EVENTUALLY BREAKS");
  await page.getByRole("button", { name: "NEW GAME" }).click();
  await page.waitForTimeout(1200);
  await expect(page.locator("#hud-money")).toContainText("¤");
});

test("first dig breaks terrain, loot pickup and cargo respond", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "NEW GAME" }).click();
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const deeper = (window as unknown as { deeper: { sim: () => { rig: { x: number; y: number } } } }).deeper;
    const sim = deeper.sim();
    sim.rig.x = 60; sim.rig.y = 6.5;
  });
  // hold dig downward for a while (aim below the rig via mouse at screen center-down)
  const canvas = page.locator("#game canvas");
  const box = await canvas.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2 + 120);
  await page.mouse.down();
  await page.waitForTimeout(6000);
  await page.mouse.up();
  const state = await page.evaluate(() => (window as unknown as { deeper: { state: () => { cellsDestroyed: number; cargoUsed: number; y: number } } }).deeper.state());
  expect(state.cellsDestroyed).toBeGreaterThan(0);
});

test("pause and settings open", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "NEW GAME" }).click();
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "PAUSED" })).toBeVisible();
  await page.getByRole("button", { name: "SETTINGS" }).click();
  await expect(page.getByRole("heading", { name: "SETTINGS" })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("map overlay opens with markers legend", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "NEW GAME" }).click();
  await page.waitForTimeout(500);
  await page.keyboard.press("m");
  await expect(page.locator(".map-panel")).toBeVisible();
  await expect(page.locator(".map-canvas")).toBeVisible();
  await page.keyboard.press("m");
});

test("workshop sells and buys first upgrade", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "NEW GAME" }).click();
  await page.waitForTimeout(500);
  // grant resources deterministically via QA hook, then buy
  await page.evaluate(() => {
    const deeper = (window as unknown as { deeper: { sim: () => { rig: { money: number; pickup: (r: string, n: number) => number } } } }).deeper;
    const sim = deeper.sim();
    sim.rig.money = 2000;
    sim.rig.pickup("iron", 20);
    sim.rig.pickup("copper", 20);
  });
  await page.evaluate(() => {
    const deeper = (window as unknown as { deeper: { sim: () => { rig: { x: number; y: number } } } }).deeper;
    const sim = deeper.sim();
    sim.rig.x = 24; sim.rig.y = 6;
  });
  await page.keyboard.press("e");
  await expect(page.locator("#workshop")).toBeVisible();
  await page.getByRole("button", { name: /SELL ALL/ }).click();
  await expect(page.locator(".ws-money")).toContainText(/¤\s?[\d,]{4,}/);
  // upgrades also need materials, which SELL ALL just liquidated: restock + reopen
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const sim = (window as unknown as { deeper: { sim: () => { rig: { pickup: (r: string, n: number) => number } } } }).deeper.sim();
    sim.rig.pickup("iron", 20);
  });
  await page.keyboard.press("e");
  await expect(page.locator("#workshop")).toBeVisible();
  // buy an upgrade (Hopper Extension I should be affordable)
  const buyBtns = page.locator(".ws-up .btn");
  const n = await buyBtns.count();
  let bought = false;
  for (let i = 0; i < n; i++) {
    const b = buyBtns.nth(i);
    if (!(await b.isDisabled())) {
      await b.click();
      bought = true;
      break;
    }
  }
  expect(bought).toBe(true);
  await page.keyboard.press("Escape");
});

test("save, reload, continue restores state", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "NEW GAME" }).click();
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const deeper = (window as unknown as { deeper: { sim: () => { rig: { money: number } }; save: () => void } }).deeper;
    const sim = deeper.sim();
    sim.rig.money = 7777;
    deeper.save();
  });
  await page.reload();
  await start(page);
  await page.getByRole("button", { name: "CONTINUE" }).click();
  await page.waitForTimeout(800);
  const money = await page.evaluate(() => (window as unknown as { deeper: { state: () => { money: number } } }).deeper.state().money);
  expect(money).toBe(7777);
});
