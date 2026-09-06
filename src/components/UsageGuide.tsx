import { X } from "lucide-react";
import type { ReactNode } from "react";

export const GUIDE_SECTIONS: { title: string; body: ReactNode }[] = [
  {
    title: "欢迎",
    body: (
      <p>
        欢迎来到 <b>GG RESET</b>，在这里你可以通过计时、计数和呼吸调整，帮助自己放松下来、保持专注。
      </p>
    ),
  },
  {
    title: "肯定语计时计数",
    body: (
      <>
        <p className="font-medium">设置主题和肯定语</p>
        <p className="mt-1">
          进入【目标列表】页面您可以增加或删除主题标签（在专注页面和数据中心会有用！），在主题标签下添加肯定语。在下方的目标列表里增加目标，可拖动调整顺序。
        </p>
        <p className="font-medium mt-3">进入专注</p>
        <p className="mt-1">
          设置好了之后返回主页，进入【进入专注】页面，选择您想要专注的主题或具体的肯定语开始计时和计数。
        </p>
        <p className="mt-2 opacity-80">
          · 在右上角的【设置】里可以更改计时模式，我们支持正计时（秒表）倒计时模式选择和自动计数。在【进入专注】页面底部可直接播放或关闭白噪音（海浪 / 篝火 / 雨声）。
        </p>
        <p className="mt-1 opacity-80">
          · 想要解放双手？选择自动计数功能，自由调整自动计数间隔，开启计时后自动计数（自动计数功能必须配合计时一起使用），还可选择开启音效提醒（每计数一下会响一下）。
        </p>
      </>
    ),
  },
  {
    title: "呼吸调整放松身心",
    body: (
      <>
        <p>
          【进入专注】页面顶部可切换模式进入"呼吸调整"页面，开始计时跟随呼吸球完成呼吸放松。底部还有其他放松身心的小 tips 噢！
        </p>
        <p className="mt-2 opacity-80">
          · 在设置里可以自定义呼吸的间隔和选择计时模式。页面底部的白噪音（海浪 / 篝火 / 雨声）可随时开启或关闭。
        </p>
        <p className="mt-1 opacity-80">
          · 呼吸调整功能与计时器绑定，开启计时呼吸球自动开始。
        </p>
      </>
    ),
  },
  {
    title: "其他",
    body: (
      <>
        <p>【数据中心】会展示您的专注数据。</p>
        <p className="mt-1">【设置】里可以更改设置，改变背景图，备份或导入数据。</p>
        <p className="mt-1">
          【进入专注】切后台不掉队，本站设置了防崩溃系统，中途切换后台、息屏、不小心关闭浏览器或遇到突发的崩溃重新打开网站后计时和计数都会瞬间对齐真实时间，不影响使用和数据记录。
        </p>
        <p className="mt-1">
          计数器和计时器的功能可以单独使用。您可以选择手动计数不选择计时，也可以选择只开启主题计时来记录日常工作学习和运动的时长数据。选择正计时自动计数功能请记得在结束的时候返回 GG reset 关闭计时计数。
        </p>
        <p className="mt-1">
          【网站更新】重新加载网页以更新至最新版本。一些时候系统可能会突然卡回旧的版本或有偶发性故障，重刷新页面就会恢复正常更新到最新的版本。刷新和重新输入网址并不会影响数据。
        </p>
        <p className="mt-1">
          【肯定语】可在设置里选择计数器显示"今日计数"或"累积计数"，开启计数器"重置"开关（开启后在计数器下方会有一个重置按钮，用户可以选择清空今日计数或累计计数）。在「目标列表」页面可手动输入数值。
        </p>
      </>
    ),
  },
  {
    title: "关于数据 · 如何备份转移",
    body: (
      <>
        <p>
          所有数据均存储于浏览器本地，云端共享功能还在开发中。请不要在无痕浏览页使用 GG reset，或清除浏览器缓存或数据，这些都会导致 GG reset 数据丢失。
        </p>
        <p className="mt-2">
          在设置里可以选择导出本地数据，选择保存 JSON 文件即可完成备份。如需转移数据到新设备，请将导出的 JSON 文件发送到您的新设备，打开 GG RESET 并在设置里选择"导入数据"，选择文件导入即可。
        </p>
      </>
    ),
  },
  {
    title: "GG RESET · 声明",
    body: (
      <p className="opacity-80">
        GG reset 由 AI 搭建完成，所有功能均免费。本工具仅供日常正念打卡与习惯记录使用，不提供任何专业建议。所有数据仅储存于您本地浏览器，我们不收集、不上传、不分享任何信息。
      </p>
    ),
  },
];

export function UsageGuideContent() {
  return (
    <div className="space-y-5 text-sm leading-relaxed">
      {GUIDE_SECTIONS.map((s) => (
        <section key={s.title}>
          <h3 className="font-display text-lg mb-1.5">{s.title}</h3>
          <div className="opacity-90">{s.body}</div>
        </section>
      ))}
    </div>
  );
}

export function UsageGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="glass-strong rounded-3xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 glass rounded-full size-9 flex items-center justify-center"
          aria-label="关闭"
        >
          <X className="size-4" />
        </button>
        <h2 className="font-display text-2xl mb-4">GG RESET · 使用指南</h2>
        <UsageGuideContent />
      </div>
    </div>
  );
}
