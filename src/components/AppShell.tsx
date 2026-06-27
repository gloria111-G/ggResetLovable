import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowLeft, Settings as SettingsIcon } from "lucide-react";

export function AppShell({
  children,
  title,
  titleSlot,
  back = true,
}: {
  children: ReactNode;
  title?: string;
  titleSlot?: ReactNode;
  back?: boolean;
}) {
  const router = useRouter();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const showSettingsBtn = path !== "/settings";

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      router.navigate({ to: "/" });
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-4 md:px-6 pt-6 pb-2 flex items-center justify-between max-w-5xl mx-auto w-full gap-3">
        {back ? (
          <button
            onClick={goBack}
            className="glass glass-hover rounded-full px-3 py-2 text-sm flex items-center gap-1 shrink-0"
            aria-label="返回上一级"
          >
            <ArrowLeft className="size-4" />
          </button>
        ) : (
          <div className="w-10 shrink-0" />
        )}
        <div className="flex-1 flex items-center justify-center min-w-0">
          {titleSlot ? (
            titleSlot
          ) : (
            <Link
              to="/"
              className="font-display tracking-wide text-base md:text-xl text-center truncate"
            >
              GG RESET{title ? ` · ${title}` : ""}
            </Link>
          )}
        </div>
        {showSettingsBtn ? (
          <Link
            to="/settings"
            className="glass glass-hover rounded-full px-3 py-2 text-sm flex items-center gap-1 shrink-0"
            aria-label="设置"
          >
            <SettingsIcon className="size-4" />
          </Link>
        ) : (
          <div className="w-10 shrink-0" />
        )}
      </header>

      <main className="flex-1 px-4 md:px-6 py-6 max-w-5xl mx-auto w-full">{children}</main>

      <Disclaimer />
    </div>
  );
}

export function Disclaimer() {
  return (
    <footer className="px-6 py-6 text-center text-[11px] opacity-60 max-w-2xl mx-auto leading-relaxed">
      GG reset 仅提供正念放松的平台，不替代任何医疗、心理或专业建议。
      <br className="hidden md:block" />
      所有数据仅存储于您本地浏览器，我们不收集、不上传、不分享任何个人信息。
      如有身心不适，请及时联系专业人士。
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
