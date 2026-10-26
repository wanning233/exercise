import { Journal, validateJournal } from "./model";
import { CloudRecord, CloudUser, hashText } from "./sync";

export type CloudPayload = Journal & { cloudPhotos?: Record<string, string> };
type PhotoStorage = {
  upload(
    path: string,
    blob: Blob,
    options: { contentType: string; upsert: boolean },
  ): Promise<{ error: unknown }>;
  download(path: string): PromiseLike<{ data: Blob | null; error: unknown }>;
};
const blobDataURL = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("照片读取失败，请重试同步。"));
    reader.readAsDataURL(blob);
  });
function check(error: unknown) {
  if (error) throw new Error("照片同步失败，请稍后重试。本机照片已保留。");
}
export function createPhotoTransport(
  storage: PhotoStorage,
  readBlob = blobDataURL,
) {
  const uploaded = new Set<string>();
  const hydrated = new Map<string, CloudRecord>();
  return {
    async upload(user: CloudUser, journal: Journal): Promise<CloudPayload> {
      const payload: CloudPayload = structuredClone(journal);
      payload.cloudPhotos = {};
      for (const day of Object.values(payload.days))
        for (const meal of day.meals) {
          if (!meal.photo) continue;
          if (!meal.photo.startsWith("data:image/"))
            throw new Error("照片格式异常，未上传记录。");
          const hash = await hashText(meal.photo);
          const path = `${user.id}/${hash}.jpg`;
          if (!uploaded.has(path)) {
            const blob = await (await fetch(meal.photo)).blob();
            const { error } = await storage.upload(path, blob, {
              contentType: blob.type,
              upsert: true,
            });
            check(error);
            uploaded.add(path);
          }
          payload.cloudPhotos[meal.id] = path;
          delete meal.photo;
        }
      return payload;
    },
    async hydrate(
      user: CloudUser,
      row: { payload: unknown; revision: unknown; updated_at: unknown },
    ): Promise<CloudRecord> {
      const key = `${user.id}/${row.revision}`;
      const cached = hydrated.get(key);
      if (cached) return structuredClone(cached);
      const payload = structuredClone(row.payload) as CloudPayload;
      if (!validateJournal(payload))
        throw new Error("云端记录格式异常，未修改本机记录。");
      if (
        !Number.isSafeInteger(Number(row.revision)) ||
        Number(row.revision) < 1
      )
        throw new Error("云端版本号异常。");
      if (
        typeof row.updated_at !== "string" ||
        !Number.isFinite(Date.parse(row.updated_at))
      )
        throw new Error("云端保存时间异常。");
      const refs = payload.cloudPhotos;
      if (
        refs !== undefined &&
        (!refs || typeof refs !== "object" || Array.isArray(refs))
      )
        throw new Error("云端照片索引异常。");
      for (const day of Object.values(payload.days))
        for (const meal of day.meals) {
          const path = refs?.[meal.id];
          if (path === undefined) continue;
          if (
            typeof path !== "string" ||
            !path.startsWith(`${user.id}/`) ||
            path.includes("..")
          )
            throw new Error("云端照片权限异常。");
          const { data, error } = await storage.download(path);
          check(error);
          if (!data) throw new Error("云端照片下载失败，本机记录已保留。");
          meal.photo = await readBlob(data);
          uploaded.add(path);
        }
      delete payload.cloudPhotos;
      if (!validateJournal(payload))
        throw new Error("云端照片格式异常，本机记录已保留。");
      const result = {
        journal: payload,
        revision: Number(row.revision),
        updatedAt: row.updated_at,
      };
      hydrated.clear();
      hydrated.set(key, structuredClone(result));
      return result;
    },
  };
}
