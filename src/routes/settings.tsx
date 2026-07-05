import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell, GlassCard } from "@/components/AppShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { UsageGuideContent } from "@/components/UsageGuide";
import { useApp } from "@/lib/app-context";
import { storage } from "@/lib/storage";
import { setWhiteNoise, stopWhiteNoise } from "@/lib/white-noise";
import {
  Download,
  Upload,
  Sun,
  Moon,
  Image as ImageIcon,
  Coffee,
  Trash2,
  X,
  Timer,
  Hourglass,
  BookOpen,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import donateWechat from "@/assets/donate-wechat.jpg";
import donateAlipay from "@/assets/donate-alipay.jpg";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "设置 · GG RESET" }] }),
  component: SettingsPage,
});

function selCls(active: boolean) {
  return active ? "glass-strong selected-strong" : "glass";
}

function SettingsPage() {
  const { settings, setSettings } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const bgRef = useRef<HTMLInputElement>(null);
  const [showDonate, setShowDonate] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // Live preview of white noise on settings page
  useEffect(() => {
    if (settings.whiteNoise === "off") {
      stopWhiteNoise();
    } else {
      setWhiteNoise(settings.whiteNoise, settings.whiteNoiseVolume);
    }
  }, [settings.whiteNoise, settings.whiteNoiseVolume]);

  function exportData() {
    const data = storage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gg-reset-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData(f: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        storage.importAll(data);
        alert("导入成功，请刷新页面。");
        location.reload();
      } catch {
        alert("文件格式错误。");
      }
    };
    reader.readAsText(f);
  }

  function uploadBg(f: File) {
    const reader = new FileReader();
    reader.onload = () => setSettings((s) => ({ ...s, customBg: String(reader.result) }));
    reader.readAsDataURL(f);
  }

  return (
    <AppShell title="设置">
      <div className="grid gap-6">
        {/* Usage Guide — first */}
        <GlassCard>
          <button
            onClick={() => setGuideOpen((v) => !v)}
            className="w-full flex items-center justify-between"
          >
            <span className="flex items-center gap-2 font-display text-xl">
              <BookOpen className="size-5" /> 使用说明
            </span>
            {guideOpen ? (
              <ChevronUp className="size-4 opacity-60" />
            ) : (
              <ChevronDown className="size-4 opacity-60" />
            )}
          </button>
          {guideOpen && (
            <div className="mt-5">
              <UsageGuideContent />
            </div>
          )}
          <div className="mt-5 pt-4 border-t border-white/15">
            <Toggle
              label="保留主页快捷入口"
              value={settings.homeGuideShortcut}
              onChange={(v) => setSettings((s) => ({ ...s, homeGuideShortcut: v }))}
            />
          </div>
        </GlassCard>

        {/* Appearance */}
        <GlassCard>
          <h2 className="font-display text-xl mb-4">外观</h2>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setSettings((s) => ({ ...s, theme: "light" }))}
              className={`flex-1 rounded-2xl px-4 py-3 text-sm flex items-center justify-center gap-2 ${selCls(settings.theme === "light")}`}
            >
              <Sun className="size-4" /> 日间
            </button>
            <button
              onClick={() => setSettings((s) => ({ ...s, theme: "dark" }))}
              className={`flex-1 rounded-2xl px-4 py-3 text-sm flex items-center justify-center gap-2 ${selCls(settings.theme === "dark")}`}
            >
              <Moon className="size-4" /> 夜间
            </button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => bgRef.current?.click()}
              className="glass glass-hover rounded-2xl px-4 py-3 text-sm flex items-center gap-2 flex-1"
            >
              <ImageIcon className="size-4" /> 上传背景图
            </button>
            <button
              onClick={() => setSettings((s) => ({ ...s, customBg: undefined }))}
              className="glass glass-hover rounded-2xl px-4 py-3 text-sm"
            >
              恢复默认海浪背景
            </button>
            <input
              ref={bgRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => e.target.files?.[0] && uploadBg(e.target.files[0])}
            />
          </div>
        </GlassCard>

        {/* Focus settings */}
        <GlassCard>
          <h2 className="font-display text-xl mb-4">专注页面</h2>

          {/* ---- 肯定语页面 ---- */}
          <p className="text-xs opacity-60 mb-2 tracking-widest">肯定语页面</p>

          <div className="mb-4">
            <p className="text-sm mb-2">计时模式 · 肯定语页面</p>
            <div className="flex gap-2">
              <button
                onClick={() => setSettings((s) => ({ ...s, affirmTimerMode: "countdown" }))}
                className={`flex-1 rounded-2xl px-3 py-2.5 text-sm flex items-center justify-center gap-2 ${selCls(settings.affirmTimerMode === "countdown")}`}
              >
                <Hourglass className="size-4" /> 倒计时
              </button>
              <button
                onClick={() => setSettings((s) => ({ ...s, affirmTimerMode: "stopwatch" }))}
                className={`flex-1 rounded-2xl px-3 py-2.5 text-sm flex items-center justify-center gap-2 ${selCls(settings.affirmTimerMode === "stopwatch")}`}
              >
                <Timer className="size-4" /> 正计时（秒表）
              </button>
            </div>
          </div>

          <Toggle
            label="计数器音效提示"
            value={settings.sound}
            onChange={(v) => setSettings((s) => ({ ...s, sound: v }))}
          />
          <Toggle
            label="键盘计数（回车/空格 +1）"
            value={settings.keyboardCounter}
            onChange={(v) => setSettings((s) => ({ ...s, keyboardCounter: v }))}
          />
          <Toggle
            label="启用自动计数功能"
            value={settings.autoCountEnabled}
            onChange={(v) => setSettings((s) => ({ ...s, autoCountEnabled: v }))}
          />

          {settings.autoCountEnabled && (
            <div className="mt-2 mb-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs opacity-70">自动计数间隔</p>
                <input
                  type="number"
                  step={0.1}
                  min={0.1}
                  max={60}
                  value={settings.autoCountInterval}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      autoCountInterval: Math.max(0.1, Number(e.target.value) || 1),
                    }))
                  }
                  className="glass rounded-xl px-2 py-1 w-20 text-sm text-center outline-none tabular-nums"
                />
                <span className="text-xs opacity-60">秒 / 次</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={10}
                step={0.1}
                value={settings.autoCountInterval}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, autoCountInterval: Number(e.target.value) }))
                }
                className="w-full"
              />
            </div>
          )}

          <Toggle
            label="显示计数器重置按钮"
            value={settings.resetCounterEnabled}
            onChange={(v) => setSettings((s) => ({ ...s, resetCounterEnabled: v }))}
          />

          <div className="mt-4">
            <p className="text-sm mb-2">计数器显示</p>
            <div className="flex gap-2">
              {(["today", "total"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setSettings((s) => ({ ...s, counterMode: m }))}
                  className={`flex-1 rounded-full px-3 py-2 text-xs ${selCls(settings.counterMode === m)}`}
                >
                  {m === "today" ? "今日计数" : "累计计数"}
                </button>
              ))}
            </div>
          </div>

          {/* ---- 呼吸调整页面 ---- */}
          <p className="text-xs opacity-60 mt-8 mb-2 tracking-widest">呼吸调整页面</p>

          <div className="mb-4">
            <p className="text-sm mb-2">计时模式 · 呼吸调整页面</p>
            <div className="flex gap-2">
              <button
                onClick={() => setSettings((s) => ({ ...s, breathTimerMode: "countdown" }))}
                className={`flex-1 rounded-2xl px-3 py-2.5 text-sm flex items-center justify-center gap-2 ${selCls(settings.breathTimerMode === "countdown")}`}
              >
                <Hourglass className="size-4" /> 倒计时
              </button>
              <button
                onClick={() => setSettings((s) => ({ ...s, breathTimerMode: "stopwatch" }))}
                className={`flex-1 rounded-2xl px-3 py-2.5 text-sm flex items-center justify-center gap-2 ${selCls(settings.breathTimerMode === "stopwatch")}`}
              >
                <Timer className="size-4" /> 正计时（秒表）
              </button>
            </div>
          </div>

          <div className="mt-2">
            <p className="text-sm mb-2">呼吸节奏</p>
            <div className="flex flex-wrap gap-2">
              {(["box", "478", "custom", "off"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setSettings((s) => ({ ...s, breathMode: m }))}
                  className={`rounded-full px-3 py-1.5 text-xs ${selCls(settings.breathMode === m)}`}
                >
                  {m === "box"
                    ? "箱式 4-4-4-4"
                    : m === "478"
                      ? "4-7-8"
                      : m === "custom"
                        ? "自定义"
                        : "关闭"}
                </button>
              ))}
            </div>
            {settings.breathMode === "custom" && (
              <div className="grid grid-cols-4 gap-2 mt-3">
                {(["inhale", "hold1", "exhale", "hold2"] as const).map((k) => (
                  <label key={k} className="text-xs">
                    <span className="opacity-60 block mb-1">
                      {k === "inhale" ? "吸" : k === "exhale" ? "呼" : "屏"}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={settings.customBreath[k]}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          customBreath: { ...s.customBreath, [k]: Number(e.target.value) },
                        }))
                      }
                      className="glass rounded-xl px-2 py-1.5 w-full text-sm outline-none"
                    />
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* ---- 白噪音 ---- */}
          <p className="text-xs opacity-60 mt-8 mb-2 tracking-widest">白噪音</p>

          <div className="flex flex-wrap gap-2">
            {(["off", "waves", "fire", "rain"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setSettings((s) => ({ ...s, whiteNoise: m }))}
                className={`rounded-full px-3 py-1.5 text-xs ${selCls(settings.whiteNoise === m)}`}
              >
                {m === "off"
                  ? "关闭"
                  : m === "waves"
                    ? "🌊 海浪"
                    : m === "fire"
                      ? "🔥 篝火"
                      : "🌧 下雨"}
              </button>
            ))}
          </div>
          {settings.whiteNoise !== "off" && (
            <div className="mt-3">
              <p className="text-xs opacity-70 mb-1">
                音量 {Math.round(settings.whiteNoiseVolume * 100)}%
              </p>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.whiteNoiseVolume}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, whiteNoiseVolume: Number(e.target.value) }))
                }
                className="w-full"
              />
            </div>
          )}
        </GlassCard>

        {/* Data */}
        <GlassCard>
          <h2 className="font-display text-xl mb-4">数据</h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={exportData}
              className="glass glass-hover rounded-2xl px-4 py-3 text-sm flex items-center gap-2"
            >
              <Download className="size-4" /> 导出本地数据
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="glass glass-hover rounded-2xl px-4 py-3 text-sm flex items-center gap-2"
            >
              <Upload className="size-4" /> 导入数据
            </button>
            <button
              onClick={() => setConfirmClear(true)}
              className="glass glass-hover rounded-2xl px-4 py-3 text-sm flex items-center gap-2"
            >
              <Trash2 className="size-4" /> 重置数据
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])}
            />
          </div>
          <p className="text-xs opacity-60 mt-3">所有数据存储在你的浏览器本地，从不上传。</p>
          <button
            onClick={() => setShowChangelog(true)}
            className="mt-4 glass glass-hover rounded-2xl px-4 py-3 text-sm inline-flex items-center gap-2"
          >
            <BookOpen className="size-4" /> 更新日志
          </button>
        </GlassCard>

        {/* Donate */}
        <GlassCard className="text-center">
          <Coffee className="size-6 mx-auto mb-2 opacity-70" />
          <p className="font-display text-lg mb-1">如果喜欢 GG reset</p>
          <p className="text-xs opacity-60 mb-4">可以请作者喝杯咖啡 ☕</p>
          <button
            onClick={() => setShowDonate(true)}
            className="inline-flex glass glass-hover rounded-full px-5 py-2.5 text-sm items-center gap-2"
          >
            <Coffee className="size-4" /> 打赏作者
          </button>
          <p className="text-[11px] opacity-55 mt-3 leading-relaxed">
            本网站所有功能均可免费使用，打赏非强制，不影响任何功能的使用。
          </p>
        </GlassCard>

      </div>

      {showDonate && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setShowDonate(false)}
        >
          <div
            className="glass-strong rounded-3xl p-5 w-full max-w-sm relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowDonate(false)}
              className="absolute -top-3 -right-3 glass-strong rounded-full size-9 flex items-center justify-center shadow-md"
              aria-label="关闭"
            >
              <X className="size-4" />
            </button>
            <p className="font-display text-lg text-center mb-4">打赏作者</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl overflow-hidden glass p-2 flex flex-col items-center">
                <img src={donateWechat} alt="微信支付" className="w-full h-auto rounded-xl" />
                <p className="text-[10px] opacity-70 mt-1.5">微信</p>
              </div>
              <div className="rounded-2xl overflow-hidden glass p-2 flex flex-col items-center">
                <img src={donateAlipay} alt="支付宝" className="w-full h-auto rounded-xl" />
                <p className="text-[10px] opacity-70 mt-1.5">支付宝</p>
              </div>
            </div>
            <p className="text-center text-xs opacity-70 mt-4">感谢您的支持</p>
          </div>
        </div>
      )}

      {showChangelog && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setShowChangelog(false)}
        >
          <div
            className="glass-strong rounded-3xl p-6 w-full max-w-md relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowChangelog(false)}
              className="absolute top-3 right-3 glass rounded-full size-9 flex items-center justify-center"
              aria-label="关闭"
            >
              <X className="size-4" />
            </button>
            <h3 className="font-display text-xl mb-4">更新日志</h3>
            <div className="space-y-4 text-sm leading-relaxed">
              <div>
                <p className="font-medium mb-1">2026 / 7</p>
                <p className="opacity-85">
                  更新肯定语数值手动调整、重置计数器功能，调整呼吸球颜色对比，修复计数器音效和白噪音播放的bug。其他功能仍在开发中敬请期待！
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmClear}
        title="重置全部本地数据？"
        description="此操作不可恢复，所有肯定语、目标、专注记录与设置将被清空。"
        requireText="reset"
        confirmText="确认重置"
        cancelText="取消"
        onConfirm={() => {
          storage.clearAll();
          location.reload();
        }}
        onClose={() => setConfirmClear(false)}
      />
    </AppShell>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`w-12 h-7 rounded-full glass relative transition ${
          value ? "glass-strong selected-strong" : ""
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-6 rounded-full bg-white/80 shadow transition ${
            value ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}
