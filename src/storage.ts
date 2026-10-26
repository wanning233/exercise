import { get, set } from "idb-keyval";
import { Journal, newJournal, validateJournal } from "./model";

const KEY = "lianji-journal-v1";
let queue = Promise.resolve();
export async function loadJournal(): Promise<Journal> {
  const data: unknown = await get(KEY);
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
