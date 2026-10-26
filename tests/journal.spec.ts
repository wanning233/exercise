import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("records a full day, persists photos and training, and restores a complete backup", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.getByRole("heading", { name: "今天的记录" }).waitFor();
  await page.getByRole("button", { name: "300 ml", exact: true }).click();
  await page.getByRole("button", { name: "300 ml", exact: true }).click();
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(page.locator(".water-display strong")).toHaveText("300");
  await page.getByRole("button", { name: "自定义水量" }).click();
  await page.getByLabel("饮水量（ml）").fill("250");
  await page.getByRole("button", { name: "记录饮水", exact: true }).click();
  await expect(page.locator(".water-display strong")).toHaveText("550");

  await page.locator(".meal-card").first().click();
  await page
    .getByLabel("选择餐食照片")
    .setInputFiles("public/images/breakfast.jpg");
  await expect(page.getByAltText("餐食照片预览")).toBeVisible();
  await page.getByLabel("吃了什么").fill("鸡蛋、牛奶、全麦面包");
  await page.getByLabel("用餐时间").fill("08:30");
  await page.getByRole("button", { name: "保存这一餐" }).click();
  await expect(page.getByAltText("早餐照片")).toBeVisible();

  await page
    .getByRole("button", { name: "添加动作", exact: true })
    .first()
    .click();
  await page
    .locator(".exercise-picker button")
    .filter({ hasText: "杠铃卧推" })
    .click();
  await page.getByLabel("杠铃卧推第1组重量").fill("30");
  await page.getByLabel("杠铃卧推第1组次数").fill("12");
  await page
    .getByRole("button", { name: "杠铃卧推第1组标记完成", exact: true })
    .click();
  await page.getByRole("button", { name: "添加一组" }).click();
  await expect(page.getByLabel("杠铃卧推第2组重量")).toHaveValue("30");
  await page
    .getByRole("button", { name: "杠铃卧推第2组标记完成", exact: true })
    .click();
  await page.getByRole("button", { name: "结束训练" }).click();
  await expect(page.getByRole("button", { name: "训练已完成" })).toBeVisible();

  await page.getByRole("button", { name: "为这个动作记录要点" }).click();
  await page.getByLabel("一句话记住重点").fill("先收好肩胛");
  await page
    .getByLabel("具体要点")
    .fill("肩胛后缩下沉，脚踩稳，保持手腕稳定。");
  await page.getByRole("button", { name: "保存要点" }).click();
  await page.getByLabel("今日感受").fill("今天卧推更稳了。");
  await expect(page.locator(".save-status")).toHaveText("已保存在本机");
  await page.reload();
  await expect(page.locator(".water-display strong")).toHaveText("550");
  await expect(page.getByLabel("今日感受")).toHaveValue("今天卧推更稳了。");
  await expect(page.getByAltText("早餐照片")).toBeVisible();
  await expect(page.getByLabel("杠铃卧推第2组重量")).toHaveValue("30");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出我的记录" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  const backup = JSON.parse(await readFile(path!, "utf8"));
  const day = Object.values(backup.days)[0] as any;
  expect(day.meals[0].photo).toMatch(/^data:image\/jpeg;base64,/);
  expect(day.exercises[0].sets).toHaveLength(2);
  expect(backup.notes[0].action).toBe("杠铃卧推");

  const context = await browser.newContext({ baseURL: "http://localhost:4173" });
  const restored = await context.newPage();
  await restored.goto("/");
  await restored.getByRole("button", { name: "设置与备份" }).click();
  await restored.getByRole("button", { name: /从备份恢复/ }).click();
  await restored.getByLabel("导入备份文件").setInputFiles(path!);
  await restored.getByRole("button", { name: "确认替换" }).click();
  await expect(restored.locator(".water-display strong")).toHaveText("550");
  await expect(restored.getByAltText("早餐照片")).toBeVisible();
  await expect(restored.getByLabel("今日感受")).toHaveValue("今天卧推更稳了。");
  await context.close();
});

test("rejects malformed nested backups without overwriting current records", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "200 ml", exact: true }).click();
  await page.getByRole("button", { name: "设置与备份" }).click();
  await page.getByRole("button", { name: /从备份恢复/ }).click();
  await page
    .getByLabel("导入备份文件")
    .setInputFiles({
      name: "broken.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          version: 1,
          days: { "2026-10-01": { meals: [{}] } },
          notes: [],
          settings: { name: "我", waterGoal: 2000 },
        }),
      ),
    });
  await expect(page.getByRole("status")).toContainText("文件格式不正确");
  await expect(page.locator(".water-display strong")).toHaveText("200");
});

test("sample edits are isolated from personal data", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "200 ml", exact: true }).click();
  await page.getByRole("button", { name: "查看示例" }).click();
  await expect(page.locator(".water-display strong")).toHaveText("1,200");
  await page.getByRole("button", { name: "500 ml", exact: true }).click();
  await page.getByRole("button", { name: "回到我的记录" }).click();
  await expect(page.locator(".water-display strong")).toHaveText("200");
  await expect(page.locator(".exercise-card")).toHaveCount(0);
});

test("mobile dates, notes-only calendar, rest days and custom cardio work", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "添加老师要点", exact: true }).click();
  await page.getByLabel("一句话记住重点").fill("恢复日");
  await page.getByLabel("具体要点").fill("记录课堂笔记");
  await page.getByRole("button", { name: "保存要点" }).click();
  await page.getByRole("button", { name: "设为休息日" }).click();
  await page.getByRole("button", { name: "历史记录", exact: true }).click();
  await expect(page.locator(".history-summary")).toContainText("休息");
  await page.getByRole("button", { name: "查看与编辑" }).click();
  await page.getByRole("button", { name: "添加动作", exact: true }).click();
  await page.getByRole("button", { name: "自定义动作", exact: true }).click();
  await page.getByLabel("动作名称").fill("快走");
  await page.getByLabel("训练部位").selectOption("全身");
  await page.getByLabel("记录类型").selectOption("cardio");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "添加动作", exact: true })
    .click();
  await page.getByLabel("时长（分钟）").fill("25");
  await page.getByLabel("距离（km）").fill("2");
  await page.getByRole("button", { name: "结束训练" }).click();
  await expect(page.getByRole("button", { name: "训练已完成" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

test("production shell and local records remain usable offline", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "200 ml", exact: true }).click();
  await expect(page.locator(".save-status")).toHaveText("已保存在本机");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "今天的记录" })).toBeVisible();
  await expect(page.locator(".water-display strong")).toHaveText("200");
  await page.getByRole("button", { name: "300 ml", exact: true }).click();
  await expect(page.locator(".water-display strong")).toHaveText("500");
  expect(
    await page
      .locator(".training-empty img")
      .evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
  ).toBeTruthy();
});
