import { GroundBackdrop } from '@/components/world/Ground';
import { SiteHeader } from '@/components/world/SiteHeader';
import { DEFAULT_LANG } from '@/lib/i18n';
import { asset } from '@/lib/asset';
import { loadSnapshot } from '@/lib/snapshot';

export const metadata = { title: '开放数据' };

/**
 * 开放数据页。
 *
 * 站里汇总的模型信息以通用格式回给读者：CSV 事实表、精简 JSON、以及可订阅的 Atom 源。
 * 这些文件由 `scripts/feed` 在每次构建（prebuild）时从同一份快照生成，与页面数据同源，
 * 因此不存在「导出比页面旧」的情况——站点一更新，导出和订阅源一起更新。
 */
export default function DataPage() {
  const snapshot = loadSnapshot();
  const generated = snapshot.generatedAt ? new Date(snapshot.generatedAt) : null;
  const alive = snapshot.models.filter((m) => !m.retiredAt).length;

  const files = [
    {
      href: asset('/data/models.csv'),
      label: 'models.csv',
      desc: `全量 ${snapshot.models.length} 个模型的事实表，一行一个模型：发布日期、参数量、上下文窗口、定价、开源权重、主要基准分与详情页链接。表格软件与脚本可直接读取。`,
    },
    {
      href: asset('/data/models.json'),
      label: 'models.json',
      desc: '同一批内容的机器可读版本，字段更完整（含逐项成绩数组与厂商名录），适合程序消费。',
    },
    {
      href: asset('/data/vendors.csv'),
      label: 'vendors.csv',
      desc: `厂商名录（${snapshot.vendors.length} 家），含中英文名、总部国家与官网。`,
    },
    {
      href: asset('/feed.xml'),
      label: 'feed.xml',
      desc: 'Atom 订阅源，按发布时间收录最近新增的模型，可直接加进 RSS 阅读器。',
    },
  ];

  return (
    <main className="relative min-h-dvh">
      <GroundBackdrop />
      <div className="relative">
        <SiteHeader current={null} lang={DEFAULT_LANG} narrow />

        <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-4 sm:px-8">
          <h1 className="pixel-outline mb-2 mt-4 text-2xl sm:text-3xl">开放数据</h1>
          <p className="mb-6 max-w-2xl text-[13px] leading-relaxed text-[var(--color-ghost)]">
            本站把已经汇总、核对过的模型信息以通用格式开放出来，方便二次利用与订阅。
            所有文件都在每次构建时从站内快照即时生成，永远与页面同步。
            {generated && (
              <>
                {' '}
                当前快照生成于 {generated.toISOString().slice(0, 10)}，共 {snapshot.models.length} 个模型（存活{' '}
                {alive}）/ {snapshot.vendors.length} 家厂商。
              </>
            )}
          </p>

          <section className="pixel-panel-dark mb-6 p-4">
            <h2 className="mb-3 font-pixel text-[14px] text-[var(--color-gold)]">下载</h2>
            <ul className="space-y-3 text-[13px] leading-relaxed text-[var(--color-parchment)]">
              {files.map((f) => (
                <li key={f.label}>
                  <a
                    href={f.href}
                    download
                    className="font-mono text-[var(--color-gold)] underline decoration-dotted underline-offset-2 hover:brightness-110"
                  >
                    {f.label}
                  </a>
                  <span className="ml-2 text-[var(--color-ghost)]">{f.desc}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="pixel-panel-dark p-4 text-[13px] leading-relaxed text-[var(--color-parchment)]">
            <h2 className="mb-2 font-pixel text-[14px] text-[var(--color-gold)]">订阅</h2>
            <p>
              把{' '}
              <span className="font-mono text-[var(--color-ghost)]">{asset('/feed.xml')}</span>{' '}
              加进你的 RSS 阅读器，新模型上线时即可收到更新；也可以关注本站仓库，上游数据每日自动同步。
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
