import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";
import { AppShell, GlassCard } from "@/components/AppShell";
import { useApp } from "@/lib/app-context";
import { storage } from "@/lib/storage";
import { Download, Upload, Sun, Moon, Image as ImageIcon, Coffee, Trash2 } from "lucide-react";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "设置 · GG RESET" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { settings, setSettings } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const bgRef = useRef<HTMLInputElement>(null);

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
        <GlassCard>
          <h2 className="font-display text-xl mb-4">外观</h2>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setSettings((s) => ({ ...s, theme: "light" }))}
              className={`flex-1 rounded-2xl px-4 py-3 text-sm flex items-center justify-center gap-2 ${
                settings.theme === "light" ? "glass-strong" : "glass"
              }`}
            >
              <Sun className="size-4" /> 日间
            </button>
            <button
              onClick={() => setSettings((s) => ({ ...s, theme: "dark" }))}
              className={`flex-1 rounded-2xl px-4 py-3 text-sm flex items-center justify-center gap-2 ${
                settings.theme === "dark" ? "glass-strong" : "glass"
              }`}
            >
              <Moon className="size-4" /> 夜间
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => bgRef.current?.click()}
              className="glass glass-hover rounded-2xl px-4 py-3 text-sm flex items-center gap-2 flex-1"
            >
              <ImageIcon className="size-4" /> 上传背景图
            </button>
            {settings.customBg && (
              <button
                onClick={() => setSettings((s) => ({ ...s, customBg: undefined }))}
                className="glass glass-hover rounded-2xl px-4 py-3 text-sm"
              >
                恢复默认
              </button>
            )}
            <input
              ref={bgRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => e.target.files?.[0] && uploadBg(e.target.files[0])}
            />
          </div>
        </GlassCard>

        <GlassCard>
          <h2 className="font-display text-xl mb-4">专注页面</h2>
          <Toggle
            label="显示呼吸球"
            value={settings.showBreath}
            onChange={(v) => setSettings((s) => ({ ...s, showBreath: v }))}
          />
          <Toggle
            label="显示计数器"
            value={settings.showCounter}
            onChange={(v) => setSettings((s) => ({ ...s, showCounter: v }))}
          />
          <Toggle
            label="音效提示"
            value={settings.sound}
            onChange={(v) => setSettings((s) => ({ ...s, sound: v }))}
          />
          <Toggle
            label="震动提示"
            value={settings.vibration}
            onChange={(v) => setSettings((s) => ({ ...s, vibration: v }))}
          />

          <div className="mt-4">
            <p className="text-sm mb-2">呼吸法</p>
            <div className="flex flex-wrap gap-2">
              {(["box", "478", "custom", "off"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setSettings((s) => ({ ...s, breathMode: m }))}
                  className={`rounded-full px-3 py-1.5 text-xs ${
                    settings.breathMode === m ? "glass-strong" : "glass"
                  }`}
                >
                  {m === "box" ? "箱式 4-4-4-4" : m === "478" ? "4-7-8" : m === "custom" ? "自定义" : "关闭"}
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

          <div className="mt-4">
            <p className="text-sm mb-2">
              自动计数间隔 ({settings.autoCountInterval === 0 ? "关闭" : `每 ${settings.autoCountInterval} 秒`})
            </p>
            <input
              type="range"
              min={0}
              max={10}
              value={settings.autoCountInterval}
              onChange={(e) =>
                setSettings((s) => ({ ...s, autoCountInterval: Number(e.target.value) }))
              }
              className="w-full"
            />
          </div>
        </GlassCard>

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
              onClick={() => {
                if (confirm("确认清空所有本地数据？此操作不可恢复。")) {
                  storage.clearAll();
                  location.reload();
                }
              }}
              className="glass glass-hover rounded-2xl px-4 py-3 text-sm flex items-center gap-2"
            >
              <Trash2 className="size-4" /> 清空数据
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])}
            />
          </div>
          <p className="text-xs opacity-60 mt-3">
            所有数据存储在你的浏览器本地，从不上传。
          </p>
        </GlassCard>

        <GlassCard className="text-center">
          <Coffee className="size-6 mx-auto mb-2 opacity-70" />
          <p className="font-display text-lg mb-1">如果喜欢 GG reset</p>
          <p className="text-xs opacity-60 mb-4">可以请作者喝杯咖啡 ☕</p>
          <a
            href="https://www.buymeacoffee.com/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex glass glass-hover rounded-full px-5 py-2.5 text-sm items-center gap-2"
          >
            <Coffee className="size-4" /> 打赏作者
          </a>
        </GlassCard>
      </div>
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
          value ? "glass-strong" : ""
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
