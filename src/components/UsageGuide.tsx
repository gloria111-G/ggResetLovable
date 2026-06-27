import { X } from "lucide-react";
import type { ReactNode } from "react";

export const GUIDE_SECTIONS: { title: string; body: ReactNode }[] = [
  {
    title: "欢迎",
    body: (
      <p>
        欢迎来到 <b>GG RESET</b>。在这里你可以通过计时、肯定语计数和呼吸调整来帮助你稳固信念。
      </p>
    ),
  },
  {
    title: "1. 设置主题 / 肯定语",
    body: (
      <p>
        进入【显化列表】页面，您可以增加或删除主题标签（在专注页面和数据中心都会用到！），在主题标签下添加肯定语；在下方的显化列表里增加目标。
      </p>
    ),
  },
  {
    title: "2. 进入专注 · 肯定语",
    body: (
      <>
        <p>
          返回主页进入【进入专注】，默认在「肯定语」标签页。直接在轮盘上选择倒计时时长，选择您想要专注的主题或具体肯定语，然后点击开始。
        </p>
        <p className="mt-2 opacity-80">
          · 在右上角【设置】里可切换计时模式（倒计时 / 正计时）、开启自动计数、调整间隔、开启音效提醒，并可播放舒缓白噪音帮助进入状态。
        </p>
      </>
    ),
  },
  {
    title: "3. 进入专注 · 呼吸法",
    body: (
      <>
        <p>
          切换到「呼吸法」标签页，跟随呼吸球完成神经系统调节。底部还有其他调节的小 tips ✨
        </p>
        <p className="mt-2 opacity-80">
          · 设置里可自定义呼吸节奏，单独设置呼吸法页面的计时模式；白噪音、音效与「肯定语」共通。
        </p>
      </>
    ),
  },
  {
    title: "4. 其他",
    body: (
      <>
        <p>【数据中心】展示您近期的专注数据与神经系统调节时长。</p>
        <p className="mt-1">【设置】可更改主题与背景，备份或导入数据；电脑端可开启键盘空格 / 回车计数。</p>
        <p className="mt-1">
          【防崩溃系统】中途切后台、关闭浏览器或意外崩溃，重新打开后计时和计数都会自动对齐真实时间。
        </p>
        <p className="mt-1">
          计数器和计时器可独立使用：可手动计数而不开启计时；也可只用主题计时来记录日常工作、学习、运动时长。
        </p>
      </>
    ),
  },
  {
    title: "5. 数据备份 / 转移",
    body: (
      <p>
        所有数据存储在浏览器本地，暂不支持云端同步。在【设置】中选择「导出本地数据」，得到一份 JSON 文件即完成备份。
        换设备时打开 GG RESET，选择「导入数据」即可。
      </p>
    ),
  },
  {
    title: "声明",
    body: (
      <p className="opacity-80">
        GG reset 由 AI 辅助搭建完成，仅提供正念放松平台，不替代任何医疗、心理或专业建议。所有数据仅储存于您本地浏览器，我们不收集、不上传、不分享任何信息。如有身心不适，请及时联系专业人士。
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
