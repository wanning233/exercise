import { test, expect } from "@playwright/test";
import { Journal, newDay, newJournal, validateJournal } from "../src/model";
import {
  CloudAdapter,
  CloudRecord,
  fingerprint,
  JournalSync,
  RevisionConflict,
  SyncMeta,
} from "../src/sync";

function journal(amount: number) {
  const data = newJournal();
  data.days["2026-10-26"] = {
    ...newDay(),
    water: [{ id: `water-${amount}`, amount, time: "12:00" }],
  };
  return data;
}
function setup(initial = newJournal(), remote: CloudRecord | null = null) {
  let local = initial;
  let disk = initial;
  let cloud = remote;
  let meta: SyncMeta | undefined;
  let online = true;
  let fail = false;
  let conflict = false;
  let reads = 0;
  let writes = 0;
  const recoveries: Journal[] = [];
  const adapter: CloudAdapter = {
    async read() {
      reads++;
      if (fail) throw new Error("网络失败");
      return cloud;
    },
    async write(_user, data, expected) {
      writes++;
      if (fail) throw new Error("网络失败");
      if (conflict || expected !== (cloud?.revision ?? 0))
        throw new RevisionConflict();
      cloud = {
        journal: data,
        revision: expected + 1,
        updatedAt: new Date().toISOString(),
      };
      return cloud;
    },
    async versions() {
      return cloud ? [cloud] : [];
    },
    async readVersion() {
      return {
        journal: journal(100),
        revision: 1,
        updatedAt: new Date().toISOString(),
      };
    },
  };
  const engine = new JournalSync({
    cloud: adapter,
    current: () => local,
    apply: (value) => {
      local = value;
    },
    save: async (value) => {
      disk = value;
    },
    meta: async () => meta,
    saveMeta: async (value) => {
      meta = value;
    },
    recover: async (value) => {
      recoveries.push(value);
    },
    online: () => online,
    changed: () => {},
  });
  engine.attach({ id: "alice", email: "alice@example.test" });
  return {
    engine,
    adapter,
    recoveries,
    get local() {
      return local;
    },
    get disk() {
      return disk;
    },
    get cloud() {
      return cloud;
    },
    get writes() {
      return writes;
    },
    get reads() {
      return reads;
    },
    setLocal(value: Journal) {
      local = value;
      engine.pending();
    },
    setCloud(value: CloudRecord) {
      cloud = value;
    },
    setMeta(value: SyncMeta) {
      meta = value;
    },
    offline(value: boolean) {
      online = !value;
    },
    fail(value: boolean) {
      fail = value;
    },
    conflict(value: boolean) {
      conflict = value;
    },
  };
}
const record = (data: Journal, revision = 1): CloudRecord => ({
  journal: data,
  revision,
  updatedAt: new Date().toISOString(),
});

test("first login uploads local records including photo data to adapter", async () => {
  const data = journal(200);
  data.days["2026-10-26"].meals.push({
    id: "meal",
    type: "lunch",
    text: "午餐",
    time: "12:00",
    photo: "data:image/jpeg;base64,YQ==",
  });
  const s = setup(data);
  await s.engine.run();
  expect(s.cloud?.journal).toEqual(data);
  expect(s.engine.state.status).toBe("synced");
  await s.engine.run();
  expect(s.writes).toBe(1);
});
test("empty device restores cloud and protects previous local snapshot", async () => {
  const s = setup(newJournal(), record(journal(300)));
  await s.engine.run();
  expect(s.local).toEqual(journal(300));
  expect(s.disk).toEqual(s.local);
  expect(s.recoveries).toHaveLength(1);
  expect(s.writes).toBe(0);
});
test("different first-login records require explicit choice, and cloud choice preserves local copy", async () => {
  const s = setup(journal(200), record(journal(300)));
  await s.engine.run();
  expect(s.engine.state.status).toBe("conflict");
  expect(s.writes).toBe(0);
  await s.engine.run();
  expect(s.reads).toBe(1);
  await s.engine.run("cloud");
  expect(s.local).toEqual(journal(300));
  expect(s.recoveries[0]).toEqual(journal(200));
});
test("failed upload keeps local data, offline edits retry, sign-out keeps records", async () => {
  const s = setup(journal(200));
  s.fail(true);
  await s.engine.run();
  expect(s.engine.state.status).toBe("error");
  expect(s.disk).toEqual(journal(200));
  s.offline(true);
  s.setLocal(journal(500));
  await s.engine.run();
  expect(s.engine.state.status).toBe("offline");
  s.offline(false);
  s.fail(false);
  await s.engine.run();
  expect(s.cloud?.journal).toEqual(journal(500));
  s.engine.attach(null);
  expect(s.local).toEqual(journal(500));
  expect(s.engine.state.status).toBe("signed-out");
});
test("concurrent remote edit does not overwrite unsynced local edit", async () => {
  const s = setup(journal(200), record(journal(200)));
  await s.engine.run();
  s.setLocal(journal(500));
  s.setCloud(record(journal(300), 2));
  await s.engine.run();
  expect(s.engine.state.status).toBe("conflict");
  expect(s.cloud?.journal).toEqual(journal(300));
  expect(s.local).toEqual(journal(500));
  await s.engine.run("local");
  expect(s.cloud?.journal).toEqual(journal(500));
  expect(s.cloud?.revision).toBe(3);
});
test("confirmation expires if cloud changed again", async () => {
  const s = setup(journal(200), record(journal(300)));
  await s.engine.run();
  s.setCloud(record(journal(400), 2));
  await s.engine.run("local");
  expect(s.engine.state.status).toBe("conflict");
  expect(s.writes).toBe(0);
});
test("unchanged local device pulls remote updates and rejects invalid payload", async () => {
  const s = setup(journal(200), record(journal(200)));
  await s.engine.run();
  s.setCloud(record(journal(400), 2));
  await s.engine.run();
  expect(s.local).toEqual(journal(400));
  s.setCloud(record({ version: 1 } as Journal, 3));
  await s.engine.run();
  expect(s.engine.state.status).toBe("error");
  expect(validateJournal(s.local)).toBe(true);
  expect(s.local).toEqual(journal(400));
});
test("in-flight local edit is not replaced by a cloud response", async () => {
  const s = setup(newJournal());
  let resolve!: (data: CloudRecord) => void;
  s.adapter.read = () =>
    new Promise((r) => {
      resolve = r;
    });
  const task = s.engine.run();
  await expect.poll(() => typeof resolve).toBe("function");
  s.setLocal(journal(800));
  resolve(record(journal(300)));
  await task;
  expect(s.local).toEqual(journal(800));
  expect(s.engine.state.status).toBe("pending");
});
test("CAS race retries instead of marking the stale snapshot synced", async () => {
  const s = setup(journal(200));
  s.conflict(true);
  await s.engine.run();
  expect(s.engine.state.status).toBe("pending");
  expect(s.cloud).toBeNull();
});
test("a different account must approve uploading existing local data", async () => {
  const s = setup(journal(200));
  s.setMeta({
    owner: "bob",
    fingerprint: await fingerprint(journal(200)),
    revision: 2,
    syncedAt: "",
  });
  await s.engine.run();
  expect(s.engine.state.status).toBe("conflict");
  expect(s.writes).toBe(0);
});
test("another tab's metadata cannot authorize overwriting an unseen cloud revision", async () => {
  const s = setup(journal(200), record(journal(200)));
  await s.engine.run();
  s.setLocal(journal(500));
  s.setCloud(record(journal(300), 2));
  s.setMeta({
    owner: "alice",
    fingerprint: await fingerprint(journal(300)),
    revision: 2,
    syncedAt: "",
  });
  await s.engine.run();
  expect(s.engine.state.status).toBe("conflict");
  expect(s.writes).toBe(0);
});
test("restore keeps a local recovery and saves recovered contents as a new cloud revision", async () => {
  const s = setup(journal(200), record(journal(200), 2));
  await s.engine.run();
  await s.engine.restore(1);
  expect(s.local).toEqual(journal(100));
  expect(s.recoveries[0]).toEqual(journal(200));
  await s.engine.run();
  expect(s.cloud?.revision).toBe(3);
  expect(s.cloud?.journal).toEqual(journal(100));
});
