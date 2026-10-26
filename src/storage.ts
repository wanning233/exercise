import { get, getMany, set } from "idb-keyval";
import { Journal, newJournal, validateJournal } from "./model";
import type { SyncMeta } from "./sync";

const KEY = "lianji-journal-v1";
let queue = Promise.resolve();
let sessionMeta: SyncMeta | undefined;
export async function loadJournal(): Promise<Journal> {
  const [data, meta] = await getMany<unknown>([KEY, "lianji-sync-v1"]);
  sessionMeta = meta as SyncMeta | undefined;
  if (data === undefined) return newJournal();
  if (!validateJournal(data))
    throw new Error("本机记录格式异常，请先导出原始备份。");
  return data;
}
export const loadRawJournal = () => get(KEY);
export function saveJournal(data: Journal) {
  const task = queue.catch(() => {}).then(() => set(KEY, data));
  queue = task;
  return task;
}
// Keep the baseline paired with this tab's initial journal, even if another tab syncs.
export const loadSyncMeta = async () => sessionMeta;
export async function saveSyncMeta(meta: SyncMeta) {
  await set("lianji-sync-v1", meta);
  sessionMeta = meta;
}
export type Recovery = { date: string; journal: Journal };
export const loadRecoveries = async () =>
  (await get<Recovery[]>("lianji-recovery-v1")) || [];
export async function saveRecovery(journal: Journal) {
  const previous = await loadRecoveries();
  await set(
    "lianji-recovery-v1",
    [{ date: new Date().toISOString(), journal }, ...previous].slice(0, 5),
  );
}
export function exportFile(data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `练记备份-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function compressPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("请选择图片文件。");
  if (file.size > 25 * 1024 * 1024) throw new Error("图片不能超过 25 MB。");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const ratio = Math.min(1, 1280 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * ratio);
    canvas.height = Math.round(img.height * ratio);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器无法处理图片。");
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.78);
  } catch {
    throw new Error("图片读取失败，请尝试 JPG、PNG 或 WebP 图片。");
  } finally {
    URL.revokeObjectURL(url);
  }
}
