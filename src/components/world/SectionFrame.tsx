import type { ReactNode } from 'react';

/**
 * 首页三大块（今日格局 / 按类型看 / 国外 · 国内）共用的外框。
 *
 * 这套「顶边一条识别色 + 往下一层极淡色晕 + 一点外发光」原先在三个文件里各写一遍，
 * 改一次要动三处。抽出来之后顺带补上了 HUD 零件：
 *
 * - **角标**：顶边两端各垂一小段竖线，底边两角各一个 L 形折角。
 *   框不闭合，读起来是仪器面板的卡口而不是一个把内容关起来的盒子。
 * - **扫光**：一条 2px 的光沿顶边缓慢滑过，各区错开相位，不同时亮。
 *
 * 都做在框线上，一格都不进内容区。这个站撤掉过石板网格与 CRT 扫描线，
 * 原因都是「规则重复的图案压在文字后面会被眼睛追着看」——科技感要加在边框、
 * 角标、小灯这类点状元素上，永远不要加到正文背后。
 */
export function SectionFrame({
  accent,
  tint,
  className = 'px-2 pb-4 pt-4 sm:px-3',
  children,
}: {
  /** 本区识别色，可以是 CSS 变量 */
  accent: string;
  /** 顶部色晕，完整的 background-image 值 */
  tint: string;
  /** 内边距，分区之间略有差别 */
  className?: string;
  children: ReactNode;
}) {
  const corner = 'pointer-events-none absolute h-[13px] w-[13px]';
  return (
    <div
      className={`relative border-t-2 ${className}`}
      style={{
        borderColor: accent,
        backgroundImage: tint,
        backgroundColor: 'rgb(0 0 0 / 0.12)',
        ['--hud' as string]: accent,
      }}
    >

      {/* 顶边两端的下垂短线 */}
      <span
        className={`${corner} -left-px -top-px border-l-2`}
        style={{ borderColor: accent }}
        aria-hidden
      />
      <span
        className={`${corner} -right-px -top-px border-r-2`}
        style={{ borderColor: accent }}
        aria-hidden
      />
      {/* 底边两角的折角。透明度压到一半，让顶边始终是这个区最亮的一条线 */}
      <span
        className={`${corner} -bottom-px -left-px border-b-2 border-l-2 opacity-50`}
        style={{ borderColor: accent }}
        aria-hidden
      />
      <span
        className={`${corner} -bottom-px -right-px border-b-2 border-r-2 opacity-50`}
        style={{ borderColor: accent }}
        aria-hidden
      />

      {children}
    </div>
  );
}
