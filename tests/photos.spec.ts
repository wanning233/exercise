import { test, expect } from "@playwright/test";
import { createPhotoTransport } from "../src/cloudPhotos";
import { newDay, newJournal, validateJournal } from "../src/model";

test("private photo upload round-trips to an offline-complete journal and reuses identical photos", async () => {
  const files = new Map<string, Blob>();
  let uploads = 0;
  let downloads = 0;
  const storage = {
    async upload(path: string, blob: Blob) {
      uploads++;
      files.set(path, blob);
      return { error: null };
    },
    async download(path: string) {
      downloads++;
      return { data: files.get(path) || null, error: null };
    },
  };
  const dataURL = async (blob: Blob) =>
    `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`;
  const transport = createPhotoTransport(storage, dataURL);
  const user = { id: "alice", email: "alice@example.test" };
  const journal = newJournal();
  journal.days["2026-10-26"] = {
    ...newDay(),
    meals: [
      {
        id: "meal-1",
        type: "breakfast",
        time: "08:00",
        text: "早餐",
        photo: "data:image/jpeg;base64,YWJj",
        nutrition: { source: "home", items: [{ foodId: "rice", quantity: .5 }], consumed: .75, oil: "unknown", complete: false },
      },
      {
        id: "meal-2",
        type: "lunch",
        time: "12:00",
        text: "午餐",
        photo: "data:image/jpeg;base64,YWJj",
      },
    ],
  };
  journal.settings.nutritionTargets = { protein: 120, kcal: 2100 };
  const payload = await transport.upload(user, journal);
  expect(uploads).toBe(1);
  expect(payload.cloudPhotos?.["meal-1"]).toMatch(/^alice\/[0-9a-f]{64}\.jpg$/);
  expect(payload.days["2026-10-26"].meals[0].photo).toBeUndefined();
  expect(journal.days["2026-10-26"].meals[0].photo).toBe(
    "data:image/jpeg;base64,YWJj",
  );
  const row = { payload, revision: 1, updated_at: new Date().toISOString() };
  const restored = await transport.hydrate(user, row);
  expect(restored.journal).toEqual(journal);
  expect(validateJournal(restored.journal)).toBe(true);
  const count = downloads;
  await transport.hydrate(user, row);
  expect(downloads).toBe(count);
  await transport.upload(user, journal);
  expect(uploads).toBe(1);
});

test("photo failures and foreign paths are rejected without mutating either snapshot", async () => {
  const user = { id: "alice", email: "alice@example.test" };
  const journal = newJournal();
  journal.days["2026-10-26"] = {
    ...newDay(),
    meals: [
      {
        id: "meal",
        type: "lunch",
        time: "12:00",
        text: "",
        photo: "data:image/jpeg;base64,YWJj",
      },
    ],
  };
  const transport = createPhotoTransport({
    async upload() {
      return { error: new Error("offline") };
    },
    async download() {
      throw new Error("must not download foreign object");
    },
  });
  await expect(transport.upload(user, journal)).rejects.toThrow(
    "本机照片已保留",
  );
  expect(journal.days["2026-10-26"].meals[0].photo).toBeDefined();
  const payload = structuredClone(journal);
  delete payload.days["2026-10-26"].meals[0].photo;
  await expect(
    transport.hydrate(user, {
      payload: { ...payload, cloudPhotos: { meal: "bob/photo.jpg" } },
      revision: 1,
      updated_at: new Date().toISOString(),
    }),
  ).rejects.toThrow("照片权限异常");
  expect(payload.days["2026-10-26"].meals[0].photo).toBeUndefined();
});
