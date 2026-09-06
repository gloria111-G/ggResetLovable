import { useState } from "react";
import { LogOut, Loader2, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { maskOpenId } from "@/lib/wx-login";

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="opacity-60 shrink-0">{label}</span>
      <span className={`text-right opacity-90 break-all ${mono ? "font-num" : ""}`}>
        {value}
      </span>
    </div>
  );
}

export function AccountModal({ onClose }: { onClose: () => void }) {
  const { user, sync, signOut } = useAuth();
  const [confirmOut, setConfirmOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      onClose();
    } catch (e) {
      console.warn("signOut", e);
      setSigningOut(false);
      setConfirmOut(false);
    }
  }

  const openid = user?.openid || "";

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
          {user?.nickname || "已登录"}
          {openid && <span className="font-num"> · {maskOpenId(openid)}</span>}
        </p>

        <div className="glass rounded-2xl px-4 py-2 mb-5 divide-y divide-black/5 dark:divide-white/10 text-xs">
          <Row label="登录方式" value="微信一键快捷登录（本机 OpenID）" />
          <Row label="账号标识" value={maskOpenId(openid) || "-"} mono />
          <Row
            label="数据同步"
            value={
              sync.remote
                ? `云端已连接 · ${sync.name}`
                : "保存在本机浏览器 · 云端接入预留"
            }
          />
        </div>

        <button
          onClick={() => setConfirmOut(true)}
          className="glass glass-hover rounded-2xl w-full py-3 text-sm flex items-center justify-center gap-2"
        >
          <LogOut className="size-4" /> 退出登录
        </button>
        <p className="mt-4 text-[11px] opacity-50 text-center leading-relaxed">
          退出登录不会清除本机数据与账号标识，
          下次点击微信快捷登录即可一键恢复。
        </p>
      </div>

      {confirmOut && (
        <div
          className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => !signingOut && setConfirmOut(false)}
        >
          <div
            className="glass-strong rounded-3xl p-6 w-full max-w-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-display text-lg text-center mb-2">退出登录？</p>
            <p className="text-xs opacity-70 text-center mb-5 leading-relaxed">
              数据仍保存在本机浏览器与账号标识中，
              之后可随时一键重新登录同一账号。
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmOut(false)}
                disabled={signingOut}
                className="glass glass-hover rounded-2xl flex-1 py-2.5 text-sm disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="glass-strong selected-strong rounded-2xl flex-1 py-2.5 text-sm disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {signingOut && <Loader2 className="size-4 animate-spin" />}
                退出登录
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
