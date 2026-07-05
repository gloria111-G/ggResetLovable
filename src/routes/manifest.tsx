import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell, GlassCard } from "@/components/AppShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  useLocal,
  type Affirmation,
  type Goal,
  type FocusLog,
  DEFAULT_TAGS,
  uid,
  todayKey,
  upsertDailyLog,
  dailyLogId,
} from "@/lib/storage";
import { Check, Plus, Trash2, Sparkles, GripVertical, X, Settings as SettingsIcon } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";


export const Route = createFileRoute("/manifest")({
  head: () => ({ meta: [{ title: "目标列表 · GG RESET" }] }),
  component: ManifestPage,
});

type PendingDelete =
  | { kind: "goal"; id: string; text: string }
  | { kind: "aff"; id: string; text: string }
  | { kind: "tag"; tag: string };

function ManifestPage() {
  const [goals, setGoals] = useLocal<Goal[]>("gg_goals", []);
  const [affs, setAffs] = useLocal<Affirmation[]>("gg_affirmations", []);
  const [logs, setLogs] = useLocal<FocusLog[]>("gg_focus_logs", []);
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
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [editAff, setEditAff] = useState<Affirmation | null>(null);

  const sortedGoals = useMemo(() => {
    return [...goals].sort((a, b) => {
      const ao = a.order ?? a.createdAt;
      const bo = b.order ?? b.createdAt;
      return ao - bo;
    });
  }, [goals]);
  const active = sortedGoals.filter((g) => !g.done);
  const done = sortedGoals.filter((g) => g.done);

  function addGoal() {
    if (!goalInput.trim()) return;
    const maxOrder = goals.reduce((m, g) => Math.max(m, g.order ?? g.createdAt), 0);
    setGoals((p) => [
      ...p,
      {
        id: uid(),
        text: goalInput.trim(),
        done: false,
        createdAt: Date.now(),
        order: maxOrder + 1,
      },
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
      setCelebrate("恭喜你完成目标 ✨");
      setTimeout(() => setCelebrate(null), 2200);
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    const ids = active.map((g) => g.id);
    const fromIdx = ids.indexOf(String(a.id));
    const toIdx = ids.indexOf(String(over.id));
    if (fromIdx < 0 || toIdx < 0) return;
    const newOrder = arrayMove(ids, fromIdx, toIdx);
    setGoals((prev) =>
      prev.map((g) => {
        const idx = newOrder.indexOf(g.id);
        if (idx >= 0) return { ...g, order: idx + 1 };
        return g;
      }),
    );
  }


  function addAff() {
    if (!affInput.trim()) return;
    setAffs((p) => [
      { id: uid(), text: affInput.trim(), tag: affTag, count: 0, createdAt: Date.now() },
      ...p,
    ]);
    setAffInput("");
  }

  function addTag() {
    const t = newTag.trim();
    if (!t || allTags.includes(t)) return;
    setCustomTags((p) => [...p, t]);
    setNewTag("");
  }

  function confirmDelete() {
    if (!pending) return;
    if (pending.kind === "goal") setGoals((p) => p.filter((g) => g.id !== pending.id));
    if (pending.kind === "aff") {
      setAffs((p) => p.filter((a) => a.id !== pending.id));
      setLogs((p) => p.filter((l) => l.affirmationId !== pending.id));
    }
    if (pending.kind === "tag") {
      setCustomTags((p) => p.filter((t) => t !== pending.tag));
    }
  }

  function saveAffirmCount(id: string, newValue: number) {
    const target = affs.find((a) => a.id === id);
    if (!target) return;
    const delta = newValue - target.count;
    setAffs((prev) => prev.map((a) => (a.id === id ? { ...a, count: newValue } : a)));
    if (delta !== 0) {
      setLogs((prev) =>
        upsertDailyLog(prev, {
          tag: target.tag,
          affId: id,
          addCount: delta,
          kind: "affirm",
        }),
      );
    }
  }

  /** Change an affirmation's tag AND migrate every prior FocusLog entry
   *  for that affirmation to the new tag, so the data center reflects the
   *  move instantly (count + duration). Logs sharing the same date+affId
   *  after remap are merged. */
  function changeAffirmTag(id: string, newTag: string) {
    const target = affs.find((a) => a.id === id);
    if (!target || target.tag === newTag) return;
    setAffs((prev) => prev.map((a) => (a.id === id ? { ...a, tag: newTag } : a)));
    setLogs((prev) => {
      const remapped = prev.map((l) => {
        if (l.affirmationId !== id) return l;
        const kind = l.kind ?? "affirm";
        return { ...l, tag: newTag, id: dailyLogId(l.date, newTag, id, kind) };
      });
      // Merge collisions (same id after remap).
      const byId = new Map<string, FocusLog>();
      for (const l of remapped) {
        const cur = byId.get(l.id);
        if (!cur) byId.set(l.id, l);
        else
          byId.set(l.id, {
            ...cur,
            count: cur.count + l.count,
            durationSec: cur.durationSec + l.durationSec,
            timestamp: Math.max(cur.timestamp, l.timestamp),
          });
      }
      return Array.from(byId.values());
    });
  }

  return (
    <AppShell title="目标列表">
      {celebrate && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 glass-strong rounded-full px-6 py-3 z-50 font-display text-lg">
          {celebrate}
        </div>
      )}

      <div className="grid gap-6">
        {/* Affirmations FIRST */}
        <GlassCard>
          <h2 className="font-display text-2xl mb-1 flex items-center gap-2">
            <Sparkles className="size-5" /> 我的肯定语
          </h2>
          <p className="text-xs opacity-60 mb-4">
            为每条肯定语贴上分类标签，专注页面会用得到。
          </p>

          <div className="flex flex-wrap gap-2 mb-4">
            {allTags.map((t) => {
              const isCustom = customTags.includes(t);
              return (
                <span key={t} className="inline-flex items-center">
                  <button
                    onClick={() => setAffTag(t)}
                    className={`rounded-full px-3 py-1.5 text-xs ${
                      affTag === t ? "glass-strong selected-strong" : "glass"
                    }`}
                  >
                    #{t}
                  </button>
                  {isCustom && (
                    <button
                      onClick={() => setPending({ kind: "tag", tag: t })}
                      className="ml-0.5 opacity-40 hover:opacity-100"
                      aria-label="删除标签"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </span>
              );
            })}
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
                <span className="text-xs tabular-nums opacity-70 font-num">×{a.count}</span>
                <button
                  onClick={() => setEditAff(a)}
                  className="opacity-50 hover:opacity-100"
                  aria-label="肯定语设置"
                >
                  <SettingsIcon className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Goals */}
        <GlassCard>
          <h2 className="font-display text-2xl mb-1">目标列表</h2>
          <p className="text-xs opacity-60 mb-4">可拖拽调整顺序。</p>

          <div className="flex gap-2 mb-5">
            <input
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addGoal()}
              placeholder="写下一个你想实现的目标…"
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
              <p className="text-sm opacity-50 text-center py-4">写下第一个想实现的目标吧。</p>
            )}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={active.map((g) => g.id)}
                strategy={verticalListSortingStrategy}
              >
                {active.map((g) => (
                  <SortableGoal
                    key={g.id}
                    id={g.id}
                    text={g.text}
                    onToggle={() => toggleGoal(g.id)}
                    onDelete={() => setPending({ kind: "goal", id: g.id, text: g.text })}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>


          {done.length > 0 && (
            <div className="mt-6">
              <p className="font-display text-lg mb-3">已实现：</p>
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
                      onClick={() => setPending({ kind: "goal", id: g.id, text: g.text })}
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
      </div>

      <ConfirmDialog
        open={!!pending}
        title="是否要删除？"
        description={
          pending?.kind === "tag"
            ? `标签「#${pending.tag}」将被移除（标签下的肯定语会保留）`
            : pending?.kind === "goal"
              ? `「${pending.text}」`
              : pending?.kind === "aff"
                ? `「${pending.text}」`
                : ""
        }
        confirmText="删除"
        cancelText="取消"
        onConfirm={confirmDelete}
        onClose={() => setPending(null)}
      />

      {editAff && (
        <AffirmSettingsDialog
          affirmation={editAff}
          onSave={(v) => {
            saveAffirmCount(editAff.id, v);
            setEditAff(null);
          }}
          onDelete={() => {
            setPending({ kind: "aff", id: editAff.id, text: editAff.text });
            setEditAff(null);
          }}
          onClose={() => setEditAff(null)}
        />
      )}
    </AppShell>
  );
}

function AffirmSettingsDialog({
  affirmation,
  onSave,
  onDelete,
  onClose,
}: {
  affirmation: Affirmation;
  onSave: (value: number) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [val, setVal] = useState(String(affirmation.count));
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="glass-strong rounded-3xl p-5 w-full max-w-sm relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-2 right-2 glass rounded-full size-8 flex items-center justify-center"
          aria-label="关闭"
        >
          <X className="size-3.5" />
        </button>
        <p className="text-[11px] opacity-60 mb-1">#{affirmation.tag}</p>
        <p className="font-display text-lg mb-4 pr-4">{affirmation.text}</p>

        <p className="text-xs opacity-70 mb-2">当前计数（可手动输入）</p>
        <div className="flex gap-2 mb-5">
          <input
            type="number"
            min={0}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            className="flex-1 glass rounded-full px-4 py-2.5 text-lg font-num text-center outline-none"
            autoFocus
          />
          <button
            onClick={() => {
              const n = Math.max(0, Math.floor(Number(val) || 0));
              onSave(n);
            }}
            className="glass-strong selected-strong glass-hover rounded-full px-5 text-sm"
          >
            保存
          </button>
        </div>

        <button
          onClick={onDelete}
          className="w-full glass glass-hover rounded-2xl px-4 py-2.5 text-sm text-red-500/90 flex items-center justify-center gap-2"
        >
          <Trash2 className="size-4" /> 删除肯定语
        </button>
        <p className="text-[11px] opacity-55 text-center mt-3">
          保存后数值会即时同步到计数器和数据中心。
        </p>
      </div>
    </div>
  );
}

function SortableGoal({
  id,
  text,
  onToggle,
  onDelete,
}: {
  id: string;
  text: string;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    touchAction: "none",
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="glass rounded-2xl px-3 py-3 flex items-center gap-2"
    >
      <button
        {...attributes}
        {...listeners}
        className="touch-none cursor-grab active:cursor-grabbing p-1 -ml-1 opacity-40 hover:opacity-80 shrink-0"
        aria-label="拖拽排序"
      >
        <GripVertical className="size-4" />
      </button>
      <button
        onClick={onToggle}
        className="size-5 rounded-full border-2 border-current/40 flex items-center justify-center shrink-0"
        aria-label="完成"
      />
      <span className="flex-1 text-sm">{text}</span>
      <button onClick={onDelete} className="opacity-40 hover:opacity-100" aria-label="删除">
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
