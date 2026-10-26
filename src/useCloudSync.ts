import { useEffect, useRef, useState } from "react";
import { Journal } from "./model";
import { cloudAvailable } from "./cloudConfig";
import { JournalSync, CloudUser, SyncState } from "./sync";
import {
  loadSyncMeta,
  saveJournal,
  saveRecovery,
  saveSyncMeta,
} from "./storage";

const initial: SyncState = {
  status: "signed-out",
  user: null,
  lastSync: "",
  error: "",
  conflict: null,
};
export function useCloudSync(
  journal: Journal,
  ready: boolean,
  demo: boolean,
  apply: (data: Journal) => void,
) {
  const latest = useRef(journal);
  latest.current = journal;
  const [state, setState] = useState(initial);
  const [engine, setEngine] = useState<JournalSync | null>(null);
  const engineRef = useRef<JournalSync | null>(null);
  const [authError, setAuthError] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  useEffect(() => {
    if (!cloudAvailable) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void import("./cloudbase")
      .then(async ({ cloudAdapter, currentCloudUser, auth }) => {
        if (cancelled) return;
        const sync = new JournalSync({
          cloud: cloudAdapter,
          current: () => latest.current,
          apply: (data) => {
            latest.current = data;
            applyRef.current(data);
          },
          save: saveJournal,
          meta: loadSyncMeta,
          saveMeta: saveSyncMeta,
          recover: saveRecovery,
          online: () => navigator.onLine,
          changed: (next) => {
            if (!cancelled) setState(next);
          },
        });
        engineRef.current = sync;
        setEngine(sync);
        try {
          sync.attach(await currentCloudUser());
        } catch {
          setAuthError("无法检查云端登录，请联网后重试。");
        } finally {
          if (!cancelled) setAuthReady(true);
        }
        if (!cancelled) {
          unsubscribe = auth.onAuthStateChange((event) => {
            if (event === "SIGNED_OUT") sync.attach(null);
          }).data.subscription.unsubscribe;
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuthError("云端组件加载失败，请联网后刷新。");
          setAuthReady(true);
        }
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
      engineRef.current?.attach(null);
    };
  }, []);
  useEffect(() => {
    if (!ready || demo || !engine || !state.user) return;
    engine.pending();
    const timer = window.setTimeout(() => void engine.run(), 1500);
    return () => clearTimeout(timer);
  }, [journal, ready, demo, engine, state.user]);
  useEffect(() => {
    if (!ready || demo || !engine || !state.user) return;
    const retry = () => {
      if (document.visibilityState !== "hidden") void engine.run();
    };
    const offline = () => engine.pending();
    window.addEventListener("online", retry);
    window.addEventListener("offline", offline);
    window.addEventListener("focus", retry);
    const timer = window.setInterval(retry, 30000);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("offline", offline);
      window.removeEventListener("focus", retry);
      clearInterval(timer);
    };
  }, [ready, demo, engine, state.user]);
  useEffect(() => {
    if (!ready || demo || !engine || state.status !== "pending") return;
    const timer = window.setTimeout(() => void engine.run(), 1500);
    return () => clearTimeout(timer);
  }, [ready, demo, engine, state.status]);
  return {
    state,
    engine,
    authReady,
    authError,
    loggedIn(user: CloudUser) {
      setAuthError("");
      engine?.attach(user);
    },
    async signOut() {
      if (state.status === "syncing")
        throw new Error("请等待当前同步完成再退出。");
      const { auth } = await import("./cloudbase");
      await auth.signOut();
      engine?.attach(null);
    },
  };
}
export type CloudSync = ReturnType<typeof useCloudSync>;
