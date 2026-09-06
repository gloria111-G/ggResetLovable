import { useState } from "react";
import { ArrowRight, Loader2, ShieldCheck, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getDeviceOpenId, maskOpenId } from "@/lib/wx-login";

/** 微信绿色圆角标识（延续 GG RESET 玻璃质感，不引入外部图标依赖）。 */
function WeChatBadge({ className = "size-10" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-2xl bg-[#07C160] text-white ${className}`}
      style={{ boxShadow: "0 6px 18px rgba(7, 193, 96, 0.35)" }}
    >
      <span className="relative z-10 text-[11px] font-semibold tracking-tight">微信</span>
      <span className="absolute inset-x-0 top-0 h-1/2 bg-white/20" />
    </span>
  );
}

export function LoginModal({ onClose }: { onClose: () => void }) {
  const { quickLogin } = useAuth();
  const [existingOpenId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : getDeviceOpenId(),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function handleQuickLogin() {
    if (busy) return;
    setErr("");
    setBusy(true);
    try {
      await quickLogin();
      // 登录成功：直接关闭弹窗，页面全局“已登录”态由 AuthProvider 自动更新
      onClose();
    } catch (e) {
      setBusy(false);
      setErr(e instanceof Error ? e.message : "登录失败，请重试");
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

        <p className="font-display text-2xl text-center mb-1">登录 GG RESET</p>
        <p className="text-[11px] opacity-60 text-center mb-5">
          微信小程序同款 · 一键快捷登录，无需手机号与验证码
        </p>

        <div className="glass rounded-2xl px-4 py-3 mb-5 flex items-start gap-2.5">
          <ShieldCheck className="size-4 mt-0.5 shrink-0 opacity-70" />
          <p className="text-[11px] leading-relaxed opacity-70">
            {existingOpenId ? (
              <>
                已检测到本机账号{" "}
                <span className="font-num">{maskOpenId(existingOpenId)}</span>
                ，点击下方按钮将一键恢复登录。
              </>
            ) : (
              <>
                首次使用将为本机自动创建唯一账号（OpenID），
                数据安全保存在当前浏览器。
              </>
            )}
          </p>
        </div>

        <button
          onClick={handleQuickLogin}
          disabled={busy}
          className="glass-strong selected-strong rounded-2xl w-full px-4 py-4 text-sm font-medium disabled:opacity-60 transition active:scale-[0.98] flex items-center justify-center gap-3"
        >
          <WeChatBadge className="size-10" />
          <span className="flex items-baseline gap-1.5">
            <span>微信一键快捷登录</span>
            <span className="opacity-50 font-normal text-[11px]">/ 进入应用</span>
          </span>
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ArrowRight className="size-4 opacity-60" />
          )}
        </button>

        <p className="mt-4 text-[11px] opacity-50 text-center leading-relaxed">
          模拟微信小程序 wx.login 静默登录 · OpenID 由本机生成
          <br />
          不收集、不上传、不分享任何个人信息
        </p>

        {err && <p className="mt-3 text-xs text-center text-red-400/90">{err}</p>}
      </div>
    </div>
  );
}
