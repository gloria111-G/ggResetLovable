import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

export function AppShell({
  children,
  title,
  back = true,
}: {
  children: ReactNode;
  title?: string;
  back?: boolean;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 pt-6 pb-2 flex items-center justify-between max-w-5xl mx-auto w-full">
        {back ? (
          <Link
            to="/"
            className="glass glass-hover rounded-full px-4 py-2 text-sm flex items-center gap-2"
          >
            <ArrowLeft className="size-4" /> 返回
          </Link>
        ) : (
          <div />
        )}
        <Link to="/" className="font-display text-xl tracking-wide opacity-80">
          GG RESET
        </Link>
        <div className="w-20" />
      </header>

      <main className="flex-1 px-6 py-6 max-w-5xl mx-auto w-full">
        {title && (
          <h1 className="text-3xl md:text-4xl font-display mb-8 text-center">{title}</h1>
        )}
        {children}
      </main>

      <Disclaimer />
    </div>
  );
}

export function Disclaimer() {
  return (
    <footer className="px-6 py-6 text-center text-xs opacity-60">
      GG reset 仅提供正念放松的平台，不替代任何专业意见
    </footer>
  );
}

export function GlassCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`glass rounded-3xl p-6 ${className}`}>{children}</div>;
}
