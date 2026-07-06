import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { useAuth, type OtpHandle } from "@/lib/auth-context";

export function LoginModal({ onClose }: { onClose: () => void }) {
  const { sendSmsCode, loginWithSms, loginWithPassword } = useAuth();
  const [tab, setTab] = useState<"sms" | "password">("sms");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [otpHandle, setOtpHandle] = useState<OtpHandle | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const [pwUsername, setPwUsername] = useState("");
  const [pwPassword, setPwPassword] = useState("");

  async function handleSend() {
    setErr("");
    if (!/^\d{11}$/.test(phone.trim())) {
      setErr("请输入 11 位手机号");
      return;
    }
    setSending(true);
    try {
      const handle = await sendSmsCode(phone.trim());
      setOtpHandle(handle);
      setCooldown(60);
      const t = setInterval(() => {
        setCooldown((c) => {
          if (c <= 1) {
            clearInterval(t);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } catch (e) {
      setErr((e as Error).message || "发送失败");
    } finally {
      setSending(false);
    }
  }

  async function handleSmsLogin() {
    setErr("");
    if (!otpHandle) {
      setErr("请先获取验证码");
      return;
    }
    if (!/^\d{4,6}$/.test(code.trim())) {
      setErr("请输入验证码");
      return;
    }
    setSubmitting(true);
    try {
      await loginWithSms(otpHandle, code.trim());
      onClose();
    } catch (e) {
      setErr((e as Error).message || "登录失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePwLogin() {
    setErr("");
    if (!pwUsername.trim() || !pwPassword) {
      setErr("请输入账号和密码");
      return;
    }
    setSubmitting(true);
    try {
      await loginWithPassword(pwUsername.trim(), pwPassword);
      onClose();
    } catch (e) {
      setErr((e as Error).message || "登录失败");
    } finally {
      setSubmitting(false);
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
          登录后数据自动同步云端，换设备也不丢
        </p>

        <div className="flex gap-2 mb-5">
          <button
            onClick={() => setTab("sms")}
            className={`flex-1 rounded-2xl py-2 text-sm ${
              tab === "sms" ? "glass-strong selected-strong" : "glass"
            }`}
          >
            短信登录
          </button>
          <button
            onClick={() => setTab("password")}
            className={`flex-1 rounded-2xl py-2 text-sm ${
              tab === "password" ? "glass-strong selected-strong" : "glass"
            }`}
          >
            密码登录
          </button>
        </div>

        {tab === "sms" ? (
          <div className="space-y-3">
            <input
              type="tel"
              inputMode="numeric"
              placeholder="手机号"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="glass rounded-2xl w-full px-4 py-3 text-sm outline-none"
            />
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                placeholder="短信验证码"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="glass rounded-2xl flex-1 px-4 py-3 text-sm outline-none"
              />
              <button
                onClick={handleSend}
                disabled={sending || cooldown > 0}
                className="glass glass-hover rounded-2xl px-4 py-3 text-xs whitespace-nowrap disabled:opacity-50"
              >
                {sending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : cooldown > 0 ? (
                  `${cooldown}s`
                ) : (
                  "发送验证码"
                )}
              </button>
            </div>
            <button
              onClick={handleSmsLogin}
              disabled={submitting}
              className="glass-strong selected-strong rounded-2xl w-full py-3 text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              登录 / 注册
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              type="text"
              placeholder="手机号或用户名"
              value={pwUsername}
              onChange={(e) => setPwUsername(e.target.value)}
              className="glass rounded-2xl w-full px-4 py-3 text-sm outline-none"
            />
            <input
              type="password"
              placeholder="密码"
              value={pwPassword}
              onChange={(e) => setPwPassword(e.target.value)}
              className="glass rounded-2xl w-full px-4 py-3 text-sm outline-none"
            />
            <button
              onClick={handlePwLogin}
              disabled={submitting}
              className="glass-strong selected-strong rounded-2xl w-full py-3 text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              登录
            </button>
            <p className="text-[11px] opacity-60 text-center">
              首次使用请先用短信登录，然后到「设置」中设置密码
            </p>
          </div>
        )}

        {err && (
          <p className="mt-4 text-xs text-center text-red-400/90">{err}</p>
        )}
      </div>
    </div>
  );
}
