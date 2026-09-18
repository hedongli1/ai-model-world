import Link from 'next/link';
import { DEFAULT_LANG, getDict } from '@/lib/i18n';

/** 数据源署名。CC-BY 4.0 要求每个展示页都能找到出处，所以放在全站布局里而不是某一页。 */
const DATA_SOURCES = [
  { name: 'Epoch AI', license: 'CC-BY 4.0', href: 'https://epoch.ai/data/ai-benchmarking-dashboard' },
  { name: 'models.dev', license: 'MIT', href: 'https://models.dev' },
  { name: 'LiveBench', license: 'Apache-2.0', href: 'https://livebench.ai' },
];

const ART_SOURCES = [
  {
    name: 'Liberated Pixel Cup',
    license: 'CC0 / OGA-BY 3.0',
    href: 'https://lpc.opengameart.org',
  },
  {
    name: 'Fusion Pixel Font',
    license: 'OFL-1.1',
    href: 'https://github.com/TakWolf/fusion-pixel-font',
  },
];

/**
 * 二次开源标识（本仓库为部署副本）。
 *
 * 原版页脚这里放的是原作者的身份标识与个人推广链接。本副本按部署方要求
 * 移除个人引流位，改为标明本站的二次开源谱系——上游仓库保留在下方署名区，
 * 与数据源、美术素材并列回答「这些东西都是哪来的」。
 *
 * ⚠️ 许可边界（改动前必读）：LICENSE（MIT）的版权声明、DATA_SOURCES（CC-BY 4.0）、
 * ART_SOURCES（OGA-BY / OFL）、/credits/ 页面是许可要求，不是装饰，不得删。
 */
const FORK = {
  upstream: { name: 'liyupi/ai-model-world', href: 'https://github.com/liyupi/ai-model-world' },
  thisRepo: { name: 'hedongli1/ai-model-world', href: 'https://github.com/hedongli1/ai-model-world' },
};

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--color-parchment)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-gold)]"
    >
      {children}
    </a>
  );
}

/**
 * 全站页脚：数据与美术的出处。
 *
 * 这不是装饰。Epoch 的 CC-BY 与 LPC 素材的 OGA-BY 都是「署名即可用」的许可，
 * 署名做在每一页的页脚是最稳妥的履约方式——读者截任何一页的图，出处都在。
 * 逐资产的作者名单太长，放在 /credits/ 单页，这里只给入口。
 */
export function SiteFooter() {
  const dict = getDict(DEFAULT_LANG);
  return (
    <footer className="relative mt-12 border-t border-white/10 bg-black/40">
      <div className="mx-auto max-w-6xl px-4 py-5 text-[12px] leading-relaxed text-[var(--color-ghost)] sm:px-8">
        {/* 二次开源标识：上游谱系 + 本仓库，替代原版的作者身份行与引流按钮 */}
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/10 pb-4">
          <span className="font-pixel text-[13px] text-[var(--color-parchment)]">
            二次开源 · 基于 <ExtLink href={FORK.upstream.href}>{FORK.upstream.name}</ExtLink>（MIT）
          </span>
          <span className="hidden opacity-40 sm:inline">|</span>
          <a
            href={FORK.thisRepo.href}
            target="_blank"
            rel="noopener noreferrer"
            className="pixel-button flex items-center gap-1.5 bg-[var(--color-gold)] px-2 py-0.5 text-[12px] leading-tight text-[var(--color-ink)] hover:brightness-110"
          >
            <span className="font-semibold">本站源码</span>
            <span className="hidden text-[var(--color-ink-soft)] sm:inline">hedongli1/ai-model-world · 深海霓虹主题</span>
          </a>
        </div>

        <div className="flex flex-wrap gap-x-1.5 gap-y-1">
          <span>{dict.footer.dataFrom}</span>
          {DATA_SOURCES.map((s, i) => (
            <span key={s.name}>
              <ExtLink href={s.href}>{s.name}</ExtLink>
              <span className="opacity-70">（{s.license}）</span>
              {i < DATA_SOURCES.length - 1 && <span className="mx-1 opacity-50">·</span>}
            </span>
          ))}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-1.5 gap-y-1">
          <span>{dict.footer.artFrom}</span>
          {ART_SOURCES.map((s, i) => (
            <span key={s.name}>
              <ExtLink href={s.href}>{s.name}</ExtLink>
              <span className="opacity-70">（{s.license}）</span>
              {i < ART_SOURCES.length - 1 && <span className="mx-1 opacity-50">·</span>}
            </span>
          ))}
          <span className="mx-1 opacity-50">·</span>
          <Link
            href="/credits/"
            className="text-[var(--color-parchment)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-gold)]"
          >
            {dict.footer.credits}
          </Link>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-1.5 gap-y-1" title={dict.footer.sourceCodeHint}>
          <span>{dict.footer.sourceCode}</span>
          <ExtLink href={FORK.upstream.href}>{FORK.upstream.name}</ExtLink>
          <span className="opacity-70">（MIT）</span>
        </div>
      </div>
    </footer>
  );
}
