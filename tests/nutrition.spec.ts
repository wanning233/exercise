import { test, expect } from "@playwright/test";
import {
  estimateNutrition,
  dayNutrition,
  proteinSuggestions,
  targetDifference,
  validNutrition,
  validTargets,
  type MealNutrition,
} from "../src/nutrition";
import { newDay, newJournal, validateJournal, type Meal } from "../src/model";

const portion = (): MealNutrition => ({
  source: "home",
  items: [{ foodId: "egg", quantity: 2 }],
  oil: "none",
  consumed: 1,
  complete: true,
});
const meals = (): Meal[] =>
  (["breakfast", "lunch", "dinner"] as const).map((type, i) => ({
    id: `meal-${i}`,
    type,
    time: "12:00",
    text: "鸡蛋",
    nutrition: portion(),
  }));

test("household portions account for uncertainty, cooking oil and leftovers", () => {
  const first = estimateNutrition(portion());
  expect(first.low.protein).toBeCloseTo(11.05);
  expect(first.high.protein).toBeCloseTo(14.95);
  expect(first.low.kcal).toBeCloseTo(122.4);
  const half = estimateNutrition({ ...portion(), consumed: 0.5 });
  expect(half.high.protein).toBeCloseTo(first.high.protein / 2);
  const oil = estimateNutrition({ ...portion(), oil: "unknown" });
  expect(oil.low.kcal - first.low.kcal).toBeCloseTo(45);
  expect(oil.high.kcal - first.high.kcal).toBeCloseTo(180);
  expect(oil.high.protein).toEqual(first.high.protein);
});

test("partial days and uncounted meals cannot be marked nutritionally complete", () => {
  expect(dayNutrition(meals().slice(0, 1)).complete).toBe(false);
  const full = meals();
  expect(dayNutrition(full).complete).toBe(true);
  full[0].nutrition!.complete = false;
  expect(dayNutrition(full).complete).toBe(false);
  full[0].nutrition!.complete = true;
  const snack: Meal = {
    id: "snack",
    type: "snack",
    text: "未计入饮料",
    time: "15:00",
  };
  expect(dayNutrition([...full, snack]).missing).toBe(1);
  expect(dayNutrition([...full, snack]).complete).toBe(false);
});

test("target comparisons use ranges and suggestions respect remaining energy", () => {
  expect(targetDifference(80, 100, 120)).toBe("距目标约 20-40");
  expect(targetDifference(80, 100, 90)).toBe("目标在估算范围内");
  expect(targetDifference(80, 100, 70)).toBe("高于目标约 10-30");
  expect(
    proteinSuggestions(70, 80, { protein: 100, kcal: 2000 }, 1900),
  ).toEqual([]);
  expect(
    proteinSuggestions(70, 80, { protein: 100, kcal: 2000 }, 1700).length,
  ).toBeGreaterThan(0);
  expect(proteinSuggestions(100, 120, { protein: 110 }, 0)).toEqual([]);
  expect(proteinSuggestions(0, 0, {}, 0)).toEqual([]);
});

test("old backups remain valid and new optional nutrition fields reject invalid values", () => {
  const journal = newJournal();
  expect(validateJournal(journal)).toBe(true);
  journal.days["2026-10-26"] = { ...newDay(), meals: meals() };
  journal.settings.nutritionTargets = { kcal: 2100, protein: 120 };
  expect(validateJournal(journal)).toBe(true);
  expect(validateJournal(JSON.parse(JSON.stringify(journal)))).toBe(true);
  expect(validTargets({ protein: NaN })).toBe(false);
  expect(validTargets({ kcal: -2 })).toBe(false);
  expect(validTargets({ unexpected: 1 })).toBe(false);
  for (const invalid of [
    { consumed: -1 },
    { items: [{ foodId: "mystery", quantity: 1 }] },
    { oil: "bad" },
    { source: "bad" },
    { complete: "yes" },
    { items: [{ foodId: "rice", quantity: Infinity }] },
    { items: [] },
  ]) {
    expect(validNutrition({ ...portion(), ...invalid })).toBe(false);
  }
  journal.days["2026-10-26"].meals[0].nutrition!.consumed = 2;
  expect(validateJournal(journal)).toBe(false);
});

test("no-scale meal logging persists, exports, and edits on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "营养目标", exact: true }).click();
  await page.getByLabel("蛋白质目标（g）", { exact: true }).fill("120");
  await page.getByLabel("热量目标（kcal）", { exact: true }).fill("2100");
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await page.locator(".meal-card").first().click();
  await page.getByRole("button", { name: /食物与份量/ }).click();
  await page.getByLabel("选择食物", { exact: true }).selectOption("egg");
  await page.getByRole("button", { name: "添加食物", exact: true }).click();
  await page.getByLabel("鸡蛋（不含煎油）份量 1", { exact: true }).fill("2");
  await page
    .getByRole("combobox", {
      name: "这份餐的额外用油（仅你分到的份量）",
      exact: true,
    })
    .selectOption("none");
  await page
    .getByRole("combobox", { name: "实际吃了多少", exact: true })
    .selectOption("0.5");
  await page.getByLabel("本餐食物已记全", { exact: true }).check();
  await expect(page.getByLabel("本餐营养估算")).toContainText("61-83");
  expect(
    await page
      .locator(".modal")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/nutrition-mobile-form.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "保存这一餐", exact: true }).click();
  await expect(page.getByLabel("每日营养")).toContainText("三餐未记全");
  await expect(page.getByLabel("每日营养")).not.toContainText("距目标约");
  await page.reload();
  await expect(page.getByLabel("每日营养")).toContainText("61-83");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "设置与备份", exact: true }).click();
  await page.getByRole("button", { name: /导出完整备份/ }).click();
  const path = await (await download).path();
  const { readFile } = await import("node:fs/promises");
  const backup = JSON.parse(await readFile(path!, "utf8"));
  expect(validateJournal(backup)).toBe(true);
  expect(backup.settings.nutritionTargets.protein).toBe(120);
  const day = Object.values(backup.days)[0] as { meals: Meal[] };
  expect(day.meals[0].nutrition?.consumed).toBe(0.5);
  await page.getByRole("button", { name: "关闭窗口", exact: true }).click();
  await page.locator(".meal-card").first().click();
  await expect(
    page.getByLabel("鸡蛋（不含煎油）份量 1", { exact: true }),
  ).toHaveValue("2");
  await page
    .getByRole("button", { name: "移除鸡蛋（不含煎油） 1", exact: true })
    .click();
  await page.getByRole("button", { name: "保存这一餐", exact: true }).click();
  await expect(page.getByLabel("每日营养")).toContainText("暂无份量记录");
});

test("complete-day differences and suggestions appear only after all meals confirmed", async ({
  page,
}) => {
  const journal = newJournal();
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  journal.days[date] = { ...newDay(), meals: meals() };
  journal.settings.nutritionTargets = { kcal: 2100, protein: 120 };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "设置与备份", exact: true }).click();
  await page.getByRole("button", { name: /从备份恢复/ }).click();
  await page
    .getByLabel("导入备份文件")
    .setInputFiles({
      name: "nutrition.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(journal)),
    });
  await page.getByRole("button", { name: "确认替换", exact: true }).click();
  await expect(page.getByLabel("每日营养")).toContainText("距目标约");
  await expect(page.getByLabel("每日营养")).toContainText("任选，不是都吃");
  await page.screenshot({
    path: "test-results/nutrition-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 780 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/nutrition-mobile-summary.png",
    fullPage: true,
  });
});
