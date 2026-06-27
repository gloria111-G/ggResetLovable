import { useEffect, useState } from "react";
import { X } from "lucide-react";

export function ConfirmDialog({
  open,
  title = "是否要删除？",
  description,
  confirmText = "删除",
  cancelText = "取消",
  destructive = true,
  requireText,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  /** Require user to type this string before confirming. */
  requireText?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);
  if (!open) return null;
  const okEnabled = !requireText || typed.trim().toLowerCase() === requireText.toLowerCase();
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="glass-strong rounded-3xl p-5 w-full max-w-xs relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-2 right-2 glass rounded-full size-8 flex items-center justify-center"
          aria-label="关闭"
        >
          <X className="size-3.5" />
        </button>
        <p className="font-display text-lg text-center mb-2">{title}</p>
        {description && <p className="text-xs opacity-70 text-center mb-3">{description}</p>}
        {requireText && (
          <div className="mb-3">
            <p className="text-[11px] opacity-70 text-center mb-1.5">
              请输入「<span className="font-mono">{requireText}</span>」以确认
            </p>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={requireText}
              className="w-full glass rounded-full px-4 py-2 text-sm outline-none text-center"
              autoFocus
            />
          </div>
        )}
        <div className="flex gap-2 mt-2">
          <button
            onClick={onClose}
            className="flex-1 glass glass-hover rounded-full px-4 py-2.5 text-sm"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              if (!okEnabled) return;
              onConfirm();
              onClose();
            }}
            disabled={!okEnabled}
            className={`flex-1 rounded-full px-4 py-2.5 text-sm font-medium transition ${
              !okEnabled
                ? "glass opacity-40 cursor-not-allowed"
                : destructive
                  ? "bg-red-500/80 text-white hover:bg-red-500"
                  : "glass-strong selected-strong glass-hover"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
