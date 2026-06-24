import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell, GlassCard } from "@/components/AppShell";
import {
  useLocal,
  type Affirmation,
  type Goal,
  DEFAULT_TAGS,
  uid,
} from "@/lib/storage";
import { Check, Plus, Trash2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/manifest")({
  head: () => ({ meta: [{ title: "显化列表 · GG RESET" }] }),
  component: ManifestPage,
});

function ManifestPage() {
  const [goals, setGoals] = useLocal<Goal[]>("gg_goals", []);
  const [affs, setAffs] = useLocal<Affirmation[]>("gg_affirmations", []);
  const [customTags, setCustomTags] = useLocal<string[]>("gg_tags", []);

  const allTags = useMemo(
    () => Array.from(new Set([...DEFAULT_TAGS, ...customTags])),
    [customTags],
  );

  const [goalInput, setGoalInput] = useState("");
  const [affInput, setAffInput] = useState("");
  const [affTag, setAffTag] = useState(allTags[0]);
  const [newTag, setNewTag] = useState("");
  const [celebrate, setCelebrate] = useState<string | null>(null);

  const active = goals.filter((g) => !g.done);
  const done = goals.filter((g) => g.done);

  function addGoal() {
    if (!goalInput.trim()) return;
    setGoals((p) => [
      { id: uid(), text: goalInput.trim(), done: false, createdAt: Date.now() },
      ...p,
    ]);
    setGoalInput("");
  }
  function toggleGoal(id: string) {
    setGoals((p) =>
      p.map((g) =>
        g.id === id
          ? { ...g, done: !g.done, doneAt: !g.done ? Date.now() : undefined }
          : g,
      ),
    );
    const g = goals.find((x) => x.id === id);
    if (g && !g.done) {
      setCelebrate("恭喜你显化成功！✨");
      setTimeout(() => setCelebrate(null), 2200);
    }
  }
  function removeGoal(id: string) {
    setGoals((p) => p.filter((g) => g.id !== id));
  }

  function addAff() {
    if (!affInput.trim()) return;
    setAffs((p) => [
      { id: uid(), text: affInput.trim(), tag: affTag, count: 0, createdAt: Date.now() },
      ...p,
    ]);
    setAffInput("");
  }
  function removeAff(id: string) {
    setAffs((p) => p.filter((a) => a.id !== id));
  }
  function addTag() {
    const t = newTag.trim();
    if (!t || allTags.includes(t)) return;
    setCustomTags((p) => [...p, t]);
    setNewTag("");
  }

  return (
    <AppShell title="显化列表">
      {celebrate && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 glass-strong rounded-full px-6 py-3 z-50 font-display text-lg">
          {celebrate}
        </div>
      )}

      <div className="grid gap-6">
        <GlassCard>
          <h2 className="font-display text-2xl mb-1">显化列表 · 你会得到：</h2>
          <p className="text-xs opacity-60 mb-4">轻轻写下，已经完成。</p>

          <div className="flex gap-2 mb-5">
            <input
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addGoal()}
              placeholder="写下一个你想显化的目标…"
              className="flex-1 glass rounded-full px-4 py-2.5 text-sm outline-none placeholder:opacity-50"
            />
            <button
              onClick={addGoal}
              className="glass glass-hover rounded-full px-4 py-2.5 text-sm flex items-center gap-1"
            >
              <Plus className="size-4" /> 添加
            </button>
          </div>

          <div className="space-y-2">
            {active.length === 0 && (
              <p className="text-sm opacity-50 text-center py-4">还没有目标，写下第一个吧。</p>
            )}
            {active.map((g) => (
              <div key={g.id} className="glass rounded-2xl px-4 py-3 flex items-center gap-3">
                <button
                  onClick={() => toggleGoal(g.id)}
                  className="size-5 rounded-full border border-current/40 flex items-center justify-center shrink-0"
                />
                <span className="flex-1 text-sm">{g.text}</span>
                <button onClick={() => removeGoal(g.id)} className="opacity-40 hover:opacity-100">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>

          {done.length > 0 && (
            <div className="mt-6">
              <p className="font-display text-lg mb-3">已落地：</p>
              <div className="space-y-2">
                {done.map((g) => (
                  <div
                    key={g.id}
                    className="glass rounded-2xl px-4 py-3 flex items-center gap-3 opacity-70"
                  >
                    <button
                      onClick={() => toggleGoal(g.id)}
                      className="size-5 rounded-full bg-current/20 flex items-center justify-center shrink-0"
                    >
                      <Check className="size-3" />
                    </button>
                    <span className="flex-1 text-sm line-through">{g.text}</span>
                    <button
                      onClick={() => removeGoal(g.id)}
                      className="opacity-40 hover:opacity-100"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </GlassCard>

        <GlassCard>
          <h2 className="font-display text-2xl mb-1 flex items-center gap-2">
            <Sparkles className="size-5" /> 我的肯定语
          </h2>
          <p className="text-xs opacity-60 mb-4">
            为每条肯定语贴上分类标签，专注页面会用得到。
          </p>

          <div className="flex flex-wrap gap-2 mb-4">
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => setAffTag(t)}
                className={`rounded-full px-3 py-1.5 text-xs ${
                  affTag === t ? "glass-strong selected-strong" : "glass"
                }`}
              >
                #{t}
              </button>
            ))}
            <div className="flex items-center gap-1">
              <input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTag()}
                placeholder="新标签"
                className="glass rounded-full px-3 py-1.5 text-xs outline-none w-20"
              />
              <button
                onClick={addTag}
                className="glass glass-hover rounded-full size-7 flex items-center justify-center"
              >
                <Plus className="size-3" />
              </button>
            </div>
          </div>

          <div className="flex gap-2 mb-5">
            <input
              value={affInput}
              onChange={(e) => setAffInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addAff()}
              placeholder="例：我值得被深深爱着。"
              className="flex-1 glass rounded-full px-4 py-2.5 text-sm outline-none placeholder:opacity-50"
            />
            <button
              onClick={addAff}
              className="glass glass-hover rounded-full px-4 py-2.5 text-sm flex items-center gap-1"
            >
              <Plus className="size-4" /> 添加
            </button>
          </div>

          <div className="space-y-2">
            {affs.length === 0 && (
              <p className="text-sm opacity-50 text-center py-4">还没有肯定语。</p>
            )}
            {affs.map((a) => (
              <div
                key={a.id}
                className="glass rounded-2xl px-4 py-3 flex items-center gap-3"
              >
                <span className="text-[10px] glass-strong rounded-full px-2 py-0.5 shrink-0">
                  #{a.tag}
                </span>
                <span className="flex-1 text-sm">{a.text}</span>
                <span className="text-xs tabular-nums opacity-70">×{a.count}</span>
                <button
                  onClick={() => removeAff(a.id)}
                  className="opacity-40 hover:opacity-100"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </AppShell>
  );
}
