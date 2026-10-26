import cloudbase from "@cloudbase/js-sdk";
import type { IPgClient } from "@cloudbase/js-sdk/mysql";
import { CloudAdapter, CloudUser, RevisionConflict } from "./sync";
import { createPhotoTransport } from "./cloudPhotos";

export const app = cloudbase.init({
  env: "evil-alpaca-d2g9jlaor6491e737",
  region: "ap-shanghai",
});
export const auth = app.auth();
// SDK 3.10.4 labels rdb as MySQL in core.d.ts; its PG client exposes RPC.
const db = (app.rdb as unknown as IPgClient)();
const photos = app.storage.from("meal-photos");
const transport = createPhotoTransport(photos);
export type Verification = Awaited<ReturnType<typeof auth.getVerification>>;

export async function currentCloudUser(): Promise<CloudUser | null> {
  const user = await auth.getCurrentUser();
  return user?.uid
    ? { id: user.uid, email: user.email || user.username || "已登录" }
    : null;
}
export async function loginEmail(
  email: string,
  code: string,
  verification: Verification,
) {
  const token = await auth.verify({
    verification_id: verification.verification_id,
    verification_code: code,
  });
  if (verification.is_user) {
    await auth.signIn({
      username: email,
      verification_token: token.verification_token,
    });
  } else {
    const result = await auth.signUp({
      email,
      verification_code: code,
      verification_token: token.verification_token,
      name: "练记用户",
    });
    if (result.error) throw new Error(result.error.message);
  }
  const user = await currentCloudUser();
  if (!user) throw new Error("登录未完成，请重新获取验证码。");
  return user;
}
function check(error: unknown) {
  if (!error) return;
  const message =
    typeof error === "object" && error && "message" in error
      ? String(error.message)
      : String(error);
  if (message.includes("JOURNAL_CONFLICT")) throw new RevisionConflict(message);
  throw new Error(`云端连接失败：${message}`);
}
export const cloudAdapter: CloudAdapter = {
  async read(user) {
    const { data, error } = await db
      .from("journals")
      .select("payload,revision,updated_at")
      .eq("owner_id", user.id);
    check(error);
    return data?.[0] ? transport.hydrate(user, data[0]) : null;
  },
  async write(user, journal, expectedRevision) {
    const payload = await transport.upload(user, journal);
    if (auth.currentUser?.uid !== user.id)
      throw new Error("登录账号已变化，请重新登录后同步。");
    const { data, error } = await db.rpc("save_journal", {
      p_payload: payload,
      p_expected_revision: expectedRevision,
    });
    check(error);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.revision) throw new Error("云端未确认保存，请重试。");
    return { revision: Number(row.revision), updatedAt: row.updated_at };
  },
  async versions(user) {
    const { data, error } = await db
      .from("journal_versions")
      .select("revision,updated_at")
      .eq("owner_id", user.id)
      .order("revision", { ascending: false })
      .limit(50);
    check(error);
    return (data || []).map((row) => ({
      revision: Number(row.revision),
      updatedAt: String(row.updated_at),
    }));
  },
  async readVersion(user, revision) {
    const { data, error } = await db
      .from("journal_versions")
      .select("payload,revision,updated_at")
      .eq("owner_id", user.id)
      .eq("revision", revision);
    check(error);
    if (!data?.[0]) throw new Error("该历史版本已不存在。");
    return transport.hydrate(user, data[0]);
  },
};
