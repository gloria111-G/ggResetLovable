import { X } from "lucide-react";
import type { ReactNode } from "react";

export const GUIDE_SECTIONS: { title: string; body: ReactNode }[] = [
  {
    title: "欢迎",
    body: (
      <p>
        欢迎来到 <b>GG RESET</b>，在这里你可以通过计时、肯定语计数和呼吸调整来帮助你稳固信念。
      </p>
    ),
  },
  {
    title: "想要 a 肯定语？没问题！",
    body: (
      <>
        <p className="font-medium">设置主题和肯定语</p>
        <p className="mt-1">
          进入【显化列表】页面您可以增加或删除主题标签（在专注页面和数据中心会有用！），在主题标签下添加肯定语。在下方的显化列表里增加目标，可拖动调整顺序。
        </p>
        <p className="font-medium mt-3">进入专注</p>
        <p className="mt-1">
          设置好了之后返回主页，进入【进入专注】页面，选择您想要专注的主题或具体的肯定语开始计时和计数。
        </p>
        <p className="mt-2 opacity-80">
          · 在右上角的【设置】里可以更改计时模式，我们支持正计时（秒表）倒计时模式选择、自动计数和播放白噪音。
        </p>
        <p className="mt-1 opacity-80">
          · 想要解放双手？选择自动计数功能，自由调整自动计数间隔，开启计时后自动计数（自动计数功能必须配合计时一起使用），还可选择开启音效提醒（每计数一下会响一下）。
        </p>
      </>
    ),
  },
  {
    title: "想要做呼吸调整？没问题！",
    body: (
      <>
        <p>
          【进入专注】页面顶部可切换模式进入"呼吸调整"页面，开始计时跟随呼吸球完成神经系统调节。底部还有其他调节的小 tips 噢！
        </p>
        <p className="mt-2 opacity-80">
          · 在设置里可以自定义呼吸的间隔，也可以选择计时模式和选择播放白噪音。
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
        <p>【数据中心】会展示近期您的肯定语和专注数据。</p>
        <p className="mt-1">
          【设置】里可以更改设置，改变背景图，备份或导入数据。电脑端可选择开启键盘回车键 / 空格键计数。
        </p>
        <p className="mt-1">
          【进入专注】切后台不掉队，本站设置了防崩溃系统，中途切换后台、不小心关闭浏览器或遇到突发的崩溃重新打开网站后计时和计数都会瞬间对齐真实时间，不影响使用和数据记录。
        </p>
        <p className="mt-1">
          计数器和计时器的功能可以单独使用。您可以选择手动计数肯定语不选择计时，也可以选择只开启主题计时来记录日常工作学习和运动的时长数据。
        </p>
        <p className="mt-1">
          【网站更新】重新加载网页以更新至最新版本。一些时候系统可能会突然卡回旧的版本，重新加载一遍就会更新到最新的版本。刷新和重新输入网址并不会影响数据。
        </p>
      </>
    ),
  },
  {
    title: "关于数据 · 如何备份转移",
    body: (
      <p>
        所有数据均存储于浏览器本地，暂不支持云端共享功能。在设置里可以选择导出本地数据，选择保存 JSON 文件即可完成备份。如需转移数据到新设备，请将导出的 JSON 文件发送到您的新设备，打开 GG RESET 并在设置里选择"导入数据"，选择文件导入即可。
      </p>
    ),
  },
  {
    title: "GG RESET · 声明",
    body: (
      <p className="opacity-80">
        GG reset 由 ai 搭建完成，所有功能均免费。GG RESET 仅提供正念放松平台，不替代任何医疗、心理或专业建议。所有数据仅储存于您本地浏览器，我们不收集、不上传、不分享任何信息。如有身心不适，请计时联系专业人士。
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
