import { Journal, newJournal, validateJournal } from "./model";

export type CloudUser = { id: string; email: string };
export type CloudRecord = {
  journal: Journal;
  revision: number;
  updatedAt: string;
};
export type CloudVersion = { revision: number; updatedAt: string };
export type SyncMeta = {
  owner: string;
  fingerprint: string;
  revision: number;
  syncedAt: string;
};
export type SyncState = {
  status:
    | "signed-out"
    | "pending"
    | "syncing"
    | "synced"
    | "offline"
    | "error"
    | "conflict";
  user: CloudUser | null;
  lastSync: string;
  error: string;
  conflict: CloudRecord | null;
};
export interface CloudAdapter {
  read(user: CloudUser): Promise<CloudRecord | null>;
  write(
    user: CloudUser,
    journal: Journal,
    expectedRevision: number,
  ): Promise<CloudVersion>;
  versions(user: CloudUser): Promise<CloudVersion[]>;
  readVersion(user: CloudUser, revision: number): Promise<CloudRecord>;
}
export class RevisionConflict extends Error {}

// PostgreSQL jsonb reorders keys; canonicalize before comparing device snapshots.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export async function fingerprint(journal: Journal) {
  return hashText(canonical(journal));
}
export async function hashText(value: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
export const emptyJournal = (journal: Journal) =>
  canonical(journal) === canonical(newJournal());
export const syncLabels: Record<SyncState["status"], string> = {
  "signed-out": "未登录云端",
  pending: "等待同步",
  syncing: "正在同步",
  synced: "已同步云端",
  offline: "离线，稍后同步",
  error: "同步失败，点击重试",
  conflict: "需要确认同步记录",
};

type Dependencies = {
  cloud: CloudAdapter;
  current: () => Journal;
  apply: (journal: Journal) => void;
  save: (journal: Journal) => Promise<void>;
  meta: () => Promise<SyncMeta | undefined>;
  saveMeta: (meta: SyncMeta) => Promise<void>;
  recover: (journal: Journal) => Promise<void>;
  online: () => boolean;
  changed: (state: SyncState) => void;
};

export class JournalSync {
  state: SyncState = {
    status: "signed-out",
    user: null,
    lastSync: "",
    error: "",
    conflict: null,
  };
  private generation = 0;
  private busy: Promise<void> | null = null;
  private metadata: Promise<SyncMeta | undefined> | null = null;
  constructor(private deps: Dependencies) {}
  private emit(update: Partial<SyncState>) {
    this.state = { ...this.state, ...update };
    this.deps.changed(this.state);
  }
  attach(user: CloudUser | null) {
    this.generation++;
    this.metadata = null;
    this.emit({
      user,
      status: user ? "pending" : "signed-out",
      error: "",
      conflict: null,
      lastSync: "",
    });
  }
  pending() {
    if (this.state.user && this.state.status !== "conflict")
      this.emit({ status: this.deps.online() ? "pending" : "offline" });
  }
  run(choice?: "local" | "cloud") {
    if (this.busy) return this.busy;
    this.busy = this.perform(choice).finally(() => {
      this.busy = null;
    });
    return this.busy;
  }
  private async perform(choice?: "local" | "cloud") {
    const user = this.state.user;
    if (!user || (this.state.status === "conflict" && !choice)) return;
    if (!this.deps.online()) {
      this.emit({ status: "offline" });
      return;
    }
    const generation = this.generation;
    const local = this.deps.current();
    const active = () => generation === this.generation;
    const unchanged = () => active() && this.deps.current() === local;
    const previousConflict = this.state.conflict;
    this.emit({ status: "syncing", error: "" });
    try {
      await this.deps.save(local);
      const [meta, hash, remote] = await Promise.all([
        (this.metadata ??= this.deps.meta()),
        fingerprint(local),
        this.deps.cloud.read(user),
      ]);
      if (!active()) return;
      if (!unchanged()) {
        this.emit({ status: "pending" });
        return;
      }
      if (remote && !validateJournal(remote.journal))
        throw new Error("云端记录格式异常，已保留本机记录。");
      const conflict = () =>
        this.emit({
          status: "conflict",
          conflict: remote,
          error: "本机与云端记录不同，请选择要保留的版本。覆盖前会保留副本。",
        });
      if (
        choice &&
        (previousConflict?.revision ?? 0) !== (remote?.revision ?? 0)
      ) {
        conflict();
        return;
      }
      const sameOwner = !meta || meta.owner === user.id;
      const remoteHash = remote ? await fingerprint(remote.journal) : "";
      if (!unchanged()) {
        this.emit({ status: "pending" });
        return;
      }
      let result: CloudVersion;
      let savedHash = hash;
      if (remote && remoteHash === hash) {
        result = remote;
      } else if (
        remote &&
        (choice === "cloud" ||
          (!choice &&
            sameOwner &&
            (emptyJournal(local) ||
              (meta?.owner === user.id && meta.fingerprint === hash))))
      ) {
        await this.deps.recover(local);
        if (!unchanged()) {
          this.emit({ status: "pending" });
          return;
        }
        // apply is synchronous, so edits after this point start from the pulled snapshot.
        this.deps.apply(remote.journal);
        await this.deps.save(remote.journal);
        savedHash = remoteHash;
        result = remote;
      } else if (
        choice === "local" ||
        (!choice &&
          sameOwner &&
          ((!remote && !meta?.revision) ||
            (meta?.owner === user.id && meta.revision === remote?.revision)))
      ) {
        result = await this.deps.cloud.write(
          user,
          local,
          remote?.revision ?? 0,
        );
      } else {
        conflict();
        return;
      }
      if (!active()) return;
      const syncedAt = new Date().toISOString();
      const nextMeta = {
        owner: user.id,
        fingerprint: savedHash,
        revision: result.revision,
        syncedAt,
      };
      await this.deps.saveMeta(nextMeta);
      if (!active()) return;
      this.metadata = Promise.resolve(nextMeta);
      const latestHash = await fingerprint(this.deps.current());
      this.emit({
        status: latestHash === savedHash ? "synced" : "pending",
        lastSync: syncedAt,
        error: "",
        conflict: null,
      });
    } catch (error) {
      if (!active()) return;
      if (error instanceof RevisionConflict) {
        this.emit({ status: "pending", conflict: null });
      } else {
        this.emit({
          status: this.deps.online() ? "error" : "offline",
          error:
            error instanceof Error ? error.message : "同步失败，请稍后重试。",
        });
      }
    }
  }
  async versions() {
    if (!this.state.user) return [];
    return this.deps.cloud.versions(this.state.user);
  }
  async restore(revision: number) {
    const user = this.state.user;
    if (!user || this.busy) throw new Error("请等待当前同步完成后再恢复。");
    const generation = this.generation;
    const local = this.deps.current();
    const record = await this.deps.cloud.readVersion(user, revision);
    if (generation !== this.generation || local !== this.deps.current())
      throw new Error("记录已变化，请重新选择恢复版本。");
    if (!validateJournal(record.journal))
      throw new Error("历史版本格式异常，未修改本机记录。");
    await this.deps.recover(local);
    if (generation !== this.generation || local !== this.deps.current())
      throw new Error("记录已变化，请重新选择恢复版本。");
    this.deps.apply(record.journal);
    await this.deps.save(record.journal);
    this.emit({ status: "pending", conflict: null, error: "" });
  }
}
