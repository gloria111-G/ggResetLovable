import { useState } from "react";
import { X, LogOut, Loader2, CloudCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export function AccountModal({ onClose }: { onClose: () => void }) {
  const { user, setPassword, signOut, pushNow, syncing } = useAuth();
  const defaultUsername = user?.username || user?.phone?.replace(/^\+86\s*/, "") || "";
  const [username, setUsername] = useState(defaultUsername);
  const [password, setPasswordVal] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [confirmOut, setConfirmOut] = useState(false);

  async function handleSave() {
    setErr("");
    setMsg("");
    if (!password || password.length < 6) {
      setErr("密码至少 6 位");
      return;
    }
    setSaving(true);
    try {
      await setPassword(username.trim(), password);
      setMsg("密码已更新，下次可直接用密码登录");
      setPasswordVal("");
    } catch (e) {
      setErr((e as Error).message || "更新失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="glass-strong rounded-3xl p-6 w-full max-w-sm relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 glass-strong rounded-full size-9 flex items-center justify-center shadow-md"
          aria-label="关闭"
        >
          <X className="size-4" />
        </button>

        <p className="font-display text-xl text-center mb-1">账户</p>
        <p className="text-[11px] opacity-60 text-center mb-5">
          {user?.phone || user?.username || "已登录"}
        </p>

        <div className="space-y-3">
          <div>
            <p className="text-xs opacity-70 mb-1.5">用户名</p>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="glass rounded-2xl w-full px-4 py-3 text-sm outline-none"
              placeholder="默认为手机号"
            />
          </div>
          <div>
            <p className="text-xs opacity-70 mb-1.5">新密码</p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPasswordVal(e.target.value)}
              className="glass rounded-2xl w-full px-4 py-3 text-sm outline-none"
              placeholder="至少 6 位"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="glass-strong selected-strong rounded-2xl w-full py-3 text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            保存
          </button>

          <button
            onClick={() => {
              pushNow();
            }}
            className="glass glass-hover rounded-2xl w-full py-2.5 text-xs flex items-center justify-center gap-2"
          >
            {syncing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CloudCheck className="size-3.5" />
            )}
            立即同步到云端
          </button>

          <button
            onClick={() => setConfirmOut(true)}
            className="glass glass-hover rounded-2xl w-full py-3 text-sm flex items-center justify-center gap-2 mt-2"
          >
            <LogOut className="size-4" /> 退出登录
          </button>
        </div>

        {msg && <p className="mt-4 text-xs text-center opacity-80">{msg}</p>}
        {err && <p className="mt-4 text-xs text-center text-red-400/90">{err}</p>}
      </div>

      {confirmOut && (
        <div
          className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setConfirmOut(false)}
        >
          <div
            className="glass-strong rounded-3xl p-6 w-full max-w-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-display text-lg text-center mb-2">退出登录？</p>
            <p className="text-xs opacity-70 text-center mb-5 leading-relaxed">
              退出登录可能导致数据丢失，确定是否退出登录？
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmOut(false)}
                className="glass glass-hover rounded-2xl flex-1 py-2.5 text-sm"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  setConfirmOut(false);
                  await signOut();
                }}
                className="glass-strong selected-strong rounded-2xl flex-1 py-2.5 text-sm"
              >
                退出登录
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
