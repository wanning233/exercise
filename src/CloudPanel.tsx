import { useEffect, useState } from "react";
import { Cloud, Download, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import type { Verification } from "./cloudbase";
import { CloudVersion, syncLabels } from "./sync";
import { CloudSync } from "./useCloudSync";
import type { Journal } from "./model";
import { CLOUD_SITE, cloudAvailable } from "./cloudConfig";
import { exportFile, loadRecoveries, Recovery } from "./storage";

const format = (date: string) => new Date(date).toLocaleString("zh-CN");
export function CloudPanel({
  sync,
  demo,
  notify,
  exportBackup,
  journal,
}: {
  sync: CloudSync;
  demo: boolean;
  notify: (message: string) => void;
  exportBackup: () => void;
  journal: Journal;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [verification, setVerification] = useState<{
    email: string;
    info: Verification;
  } | null>(null);
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [versions, setVersions] = useState<CloudVersion[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [recoveries, setRecoveries] = useState<Recovery[]>([]);
  const { state, engine } = sync;
  useEffect(() => {
    void loadRecoveries()
      .then(setRecoveries)
      .catch(() => {});
  }, [state.status]);
  useEffect(() => {
    if (until <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  const seconds = Math.max(0, Math.ceil((until - now) / 1000));
  async function perform(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="cloud-panel" aria-label="云端同步">
      <h3>
        <Cloud size={18} />
        云端同步
      </h3>
      {demo ? (
        <p>示例记录不会上传。回到我的记录后可登录同步。</p>
      ) : !cloudAvailable ? (
        <>
          <p>
            云端同步版使用腾讯云自带网址。此处的本机记录需要导出后，在云端版“从备份恢复”中导入。
          </p>
          <div className="cloud-actions">
            <button className="button" onClick={exportBackup}>
              <Download size={16} />
              导出本机记录
            </button>
            <a
              className="button primary"
              href={CLOUD_SITE}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Cloud size={16} />
              打开云端同步版
            </a>
          </div>
        </>
      ) : (
        <>
          <p className="cloud-status">{syncLabels[state.status]}</p>
          {state.lastSync && <small>最近同步：{format(state.lastSync)}</small>}
          {(error || state.error || sync.authError) && (
            <p className="cloud-error" role="alert">
              {error || state.error || sync.authError}
            </p>
          )}
          {!state.user ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void perform(async () => {
                  if (!verification || verification.email !== email.trim())
                    throw new Error("请先为当前邮箱获取验证码。");
                  const { loginEmail } = await import("./cloudbase");
                  sync.loggedIn(
                    await loginEmail(
                      email.trim(),
                      code.trim(),
                      verification.info,
                    ),
                  );
                  setCode("");
                  notify("已登录，正在检查云端记录");
                });
              }}
            >
              <label className="form-field">
                邮箱
                <input
                  type="email"
                  required
                  autoComplete="email"
                  maxLength={254}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setVerification(null);
                  }}
                />
              </label>
              <div className="cloud-code-row">
                <label className="form-field">
                  邮箱验证码
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="button"
                  disabled={
                    busy || seconds > 0 || !sync.authReady || !email.trim()
                  }
                  onClick={() =>
                    void perform(async () => {
                      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
                        throw new Error("请填写有效邮箱。");
                      const { auth } = await import("./cloudbase");
                      const address = email.trim();
                      const info = await auth.getVerification({
                        email: address,
                      });
                      setVerification({ email: address, info });
                      setNow(Date.now());
                      setUntil(Date.now() + 60000);
                      notify("验证码已发送，请查看邮箱");
                    })
                  }
                >
                  {seconds > 0 ? `${seconds} 秒后重发` : "获取验证码"}
                </button>
              </div>
              <button
                className="button primary full"
                disabled={busy || !verification || !sync.authReady}
              >
                <ShieldCheck size={16} />
                登录并同步
              </button>
            </form>
          ) : (
            <>
              <p className="cloud-account">{state.user.email}</p>
              {state.status === "conflict" ? (
                <div className="cloud-conflict">
                  <p>
                    本机：{Object.keys(journal.days).length} 天记录，
                    {journal.notes.length} 条要点
                  </p>
                  <p>
                    云端：
                    {state.conflict
                      ? `${Object.keys(state.conflict.journal.days).length} 天记录，${state.conflict.journal.notes.length} 条要点，${format(state.conflict.updatedAt)}`
                      : "暂无记录"}
                  </p>
                  <button
                    className="button primary full"
                    disabled={busy}
                    onClick={() => void perform(() => engine!.run("local"))}
                  >
                    保留本机，上传到云端
                  </button>
                  {state.conflict && (
                    <button
                      className="button full"
                      disabled={busy}
                      onClick={() => void perform(() => engine!.run("cloud"))}
                    >
                      使用云端，替换本机记录
                    </button>
                  )}
                </div>
              ) : null}
              <div className="cloud-actions">
                <button
                  className="button"
                  disabled={
                    busy ||
                    state.status === "syncing" ||
                    state.status === "conflict"
                  }
                  onClick={() => void perform(() => engine!.run())}
                >
                  <RefreshCw size={16} />
                  立即同步
                </button>
                <button
                  className="button"
                  disabled={busy || state.status === "syncing"}
                  onClick={() => void perform(() => sync.signOut())}
                >
                  <LogOut size={16} />
                  退出登录
                </button>
              </div>
              <button
                className="settings-row"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    setVersions(await engine!.versions());
                    setSelected(null);
                  })
                }
              >
                <Download size={18} />
                <span>
                  <strong>云端历史版本</strong>
                  <small>最近 50 个保存版本，可恢复误删记录</small>
                </span>
              </button>
              {versions && (
                <div className="cloud-versions">
                  {!versions.length && (
                    <p>还没有历史版本，首次同步后会自动保留。</p>
                  )}
                  {versions.map((item) => (
                    <button
                      className="settings-row"
                      key={item.revision}
                      disabled={busy}
                      onClick={() => setSelected(item.revision)}
                    >
                      <span>
                        <strong>版本 {item.revision}</strong>
                        <small>{format(item.updatedAt)}</small>
                      </span>
                    </button>
                  ))}
                  {selected !== null && (
                    <div className="cloud-conflict">
                      <p>
                        将恢复版本 {selected}
                        。当前本机记录会先保留副本，恢复后再同步到云端。
                      </p>
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() =>
                          void perform(async () => {
                            await engine!.restore(selected);
                            setSelected(null);
                            notify("历史版本已恢复，正在同步");
                          })
                        }
                      >
                        确认恢复此版本
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
      {recoveries.length > 0 && (
        <details className="cloud-recoveries">
          <summary>本机保护副本（{recoveries.length}）</summary>
          {recoveries.map((item, i) => (
            <button
              className="settings-row"
              key={`${item.date}-${i}`}
              onClick={() => exportFile(item.journal)}
            >
              <Download size={16} />
              <span>
                <strong>导出保护副本</strong>
                <small>{format(item.date)}</small>
              </span>
            </button>
          ))}
        </details>
      )}
    </section>
  );
}
