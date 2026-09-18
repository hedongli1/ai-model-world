import Link from 'next/link';
import { ModelRoom } from '@/components/character/ModelRoom';
import { buildScales, buildVisualPruning, rankByEci, visualOf } from '@/lib/derive';
import { assignTraits, buildTraitContext } from '@/lib/traits';
import { buildAptitudeScale } from '@/lib/aptitude';
import { buildPersonaContext, personaFor } from '@/lib/persona';
import { newerThanFlagship } from '@/lib/roster';
import type { ContinentRoster, PlazaTier, RosterEntry } from '@/lib/roster';
import type { Continent, ModelRecord, Vendor } from '@/lib/types';
import { getDict, type Lang } from '@/lib/i18n';
import { SectionFrame } from './SectionFrame';

/**
 * 广场：国外、国内两个区，各自按厂商实力分成三条街，每条街整行铺满。
 *
 * 每家厂商的当家门面住一间屋子，能力条和人设都写在门口，不点进任何一间就能横向比较。
 *
 * **布局经过三版，每一版的教训都值得留着。**
 *
 * 第一版国外、国内左右两栏。地理隐喻很直接，但国外 26 家、国内 13 家，
 * 右栏第二屏就空了，桌面端一半宽度什么都没有，每栏只排得下三间屋子。
 *
 * 第二版把两区揉进同一条街、用旗子区分。空间用满了，但用户明确要求**分开展示**——
 * 「国内现在什么水平」是一个独立的问题，读者想整块地看，而不是在国外屋子中间找旗子。
 *
 * 第三版两区上下堆叠、各自整行铺满，顶上加了一条贴顶悬浮的「全部 / 国外 / 国内」标签栏。
 * 标签栏后来也撤了：它其实是个筛选器，点「国内」会把国外整块藏起来，
 * 而读者要的只是「快点带我到国内那一段」。现在两区永远都在，
 * 跳转交给页顶那排锚点（`PageJump`）——没有状态、没有 JavaScript、不遮挡任何东西。
 *
 * 所以现在：**两区上下堆叠，各自整行铺满。** 分区回答「哪里的」，
 * 区内的三块路牌回答「多强」，屏幕不留空白，又不用来回滚动。
 */

const TIER_ORDER: PlazaTier[] = ['top', 'main', 'unscored'];
const CONTINENT_ORDER: Continent[] = ['west', 'east'];

/** 分区底色只用一层从顶边落下来的极淡识别色晕，不画任何线——线会干扰读字 */
const CONTINENT_STYLE: Record<Continent, { accent: string; ground: string }> = {
  west: {
    accent: 'var(--color-west)',
    ground: 'linear-gradient(180deg, rgb(98 182 224 / 0.07), transparent 240px)',
  },
  east: {
    accent: 'var(--color-east)',
    ground: 'linear-gradient(180deg, rgb(226 112 92 / 0.07), transparent 240px)',
  },
};

/** 路牌：像素木牌，钉在每条街的街口 */
function Signpost({ tier, count, lang }: { tier: PlazaTier; count: number; lang: Lang }) {
  const dict = getDict(lang);
  const gold = tier === 'top';
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2" title={dict.plaza.tierHint[tier]}>
      <div
        className="relative border-2 border-[var(--color-ink)] px-2.5 py-0.5 text-[13px] font-semibold leading-tight"
        style={{
          background: gold ? 'var(--color-gold)' : '#7d6238',
          color: gold ? 'var(--color-ink)' : 'var(--color-parchment-lit)',
          boxShadow:
            'inset -2px -2px 0 rgb(0 0 0 / 0.3), inset 2px 2px 0 rgb(255 255 255 / 0.25), 2px 2px 0 rgb(0 0 0 / 0.4)',
        }}
      >
        {dict.plaza.tier[tier]}
        {/* 木牌下面的钉桩 */}
        <span
          className="absolute -bottom-2 left-1/2 h-2 w-1 -translate-x-1/2 bg-[#5b4426]"
          aria-hidden
        />
      </div>
      <span className="text-[12px] text-[var(--color-ghost)]">
        {dict.plaza.vendorCount(count)} · {dict.plaza.tierHint[tier]}
      </span>
    </div>
  );
}

/**
 * 「本家更新」便条，钉在屋子下沿。
 *
 * 屋里站的是这家当下最强的一位，这是对的；但读者看到自己刚在新闻里读到的型号
 * 不在广场上，第一反应是「这站没更新」。便条把事实说出来，并给一条直达的路。
 *
 * 为什么在屋子外面而不是名牌里加一行：整间屋子本身就是一个指向门面的链接，
 * 链接里不能再嵌链接。做成屋子的兄弟节点，HTML 合法，两个点击目标也不会打架。
 */
function NewerNote({ model, lang }: { model: ModelRecord; lang: Lang }) {
  const dict = getDict(lang);
  return (
    <Link
      href={`/model/${model.slug}/`}
      title={dict.plaza.newerHint(model.name, model.releaseDate ?? '未知日期')}
      className="mt-1 flex items-center gap-1 border-2 border-t-0 border-[var(--color-ink)] px-2 py-1 text-[12px] leading-tight text-[var(--color-parchment-dim)] transition-colors hover:text-[var(--color-gold)]"
      style={{ background: 'rgb(255 255 255 / 0.04)' }}
    >
      <span className="shrink-0 text-[var(--color-gold)]">▲</span>
      <span className="truncate">{dict.plaza.newer(model.name)}</span>
    </Link>
  );
}

interface PlazaProps {
  rosters: ContinentRoster[];
  allModels: ModelRecord[];
  /** 人设里的「国内厂商里」「国外厂商里」这类限定域要按厂商归属判定 */
  vendors: Vendor[];
  lang: Lang;
  spriteSlugs: ReadonlySet<string>;
  now: Date;
  /** SWE-Bench Pro 的成绩是不是第三方测的。两类来源中位数差 18 分，必须分开分档。 */
  proIsThirdParty: (modelId: string) => boolean;
  /** 精灵图未烘焙皇冠、光环等状态层，需要前端补画 */
  overlaysNeeded: boolean;
}

export function Plaza({
  rosters,
  allModels,
  vendors,
  lang,
  spriteSlugs,
  now,
  proIsThirdParty,
  overlaysNeeded,
}: PlazaProps) {
  const dict = getDict(lang);
  const ranks = rankByEci(allModels);
  // 档位与标签都按全体模型自校准，所以必须用完整模型集而不是广场阵容来建标尺
  const scales = buildScales(allModels, proIsThirdParty);
  // 名次与档位要跟全体模型比，但标签的稀有度只跟**同屏展示的这批**比——
  // 「百万记性」放在 485 个模型里算稀有，放在一屏旗舰里就人手一块了
  const traitCtx = buildTraitContext(allModels);
  const displayed = rosters.flatMap((r) => [...r.entries, ...r.others].map((e) => e.model));
  const traitMap = assignTraits(displayed, traitCtx, now);
  // 能力条同样跟全体模型比。只跟同屏这几十个比的话，「记性」会因为旗舰模型
  // 普遍是百万上下文而全部顶格，条子就白画了。
  const aptitude = buildAptitudeScale(allModels);
  // 人设要在**全体模型**里评「谁是第一」。只跟同屏这几十个比的话，
  // 「全世界最便宜的模型」会颁给广场上最便宜的那个，而不是真的全球最便宜。
  const personaCtx = buildPersonaContext(allModels, vendors);
  // 视觉裁剪只看**同屏这批**：全库 485 个里空桌占八成没有意义，
  // 广场上这几十个当家门面里占八成才说明这个视觉元素失效了
  const pruning = buildVisualPruning(displayed, scales);

  // 「本家更新」那行提示要在同厂全部模型里找，而不是只在广场阵容里找
  const byVendor = new Map<string, ModelRecord[]>();
  for (const m of allModels) {
    const list = byVendor.get(m.vendorId);
    if (list) list.push(m);
    else byVendor.set(m.vendorId, [m]);
  }

  const renderRoom = (continent: Continent, entry: RosterEntry) => {
    const newer = newerThanFlagship(entry.model, byVendor.get(entry.model.vendorId) ?? []);
    return (
      <div key={entry.model.id}>
        <ModelRoom
          model={entry.model}
          visual={visualOf(entry.model, ranks.get(entry.model.id) ?? null, now, scales)}
          continent={continent}
          lang={lang}
          hasSprite={spriteSlugs.has(entry.model.slug)}
          traits={traitMap.get(entry.model.id) ?? []}
          scales={scales}
          overlaysNeeded={overlaysNeeded}
          aptitude={aptitude.rowOf(entry.model)}
          persona={personaFor(entry.model, personaCtx)}
          pruning={pruning}
        />
        {newer && <NewerNote model={newer} lang={lang} />}
      </div>
    );
  };

  const byContinent = new Map(rosters.map((r) => [r.continent, r]));

  /** 一块大陆：标题 + 三条街 + 折叠区，整行铺满 */
  const renderContinent = (continent: Continent) => {
    const roster = byContinent.get(continent);
    if (!roster) return null;
    const style = CONTINENT_STYLE[continent];
    const streets = TIER_ORDER.map((tier) => ({
      tier,
      entries: roster.entries.filter((e) => e.tier === tier),
    })).filter((s) => s.entries.length > 0);

    return (
      <div>
        <header className="mb-3 flex items-baseline gap-3 px-1">
          <h2
            id={`region-${continent}`}
            className="scroll-mt-4 font-pixel text-[18px] leading-none tracking-wide"
            style={{ color: style.accent }}
          >
            {dict.continent[continent]}
          </h2>
          <span className="text-[13px] text-[var(--color-ghost)]">
            {dict.plaza.vendorCount(roster.entries.length)}
          </span>
        </header>

        <SectionFrame
          accent={style.accent}
          tint={style.ground}
          className="px-2 pb-5 pt-4 sm:px-3"
        >
          {streets.map((street, i) => (
            <div key={street.tier} className={i > 0 ? 'mt-7 border-t border-white/10 pt-5' : ''}>
              <Signpost tier={street.tier} count={street.entries.length} lang={lang} />
              <div className="flex flex-wrap justify-center gap-x-2 gap-y-5 sm:justify-start sm:gap-x-3 sm:gap-y-6">
                {street.entries.map((e) => renderRoom(continent, e))}
              </div>
            </div>
          ))}

          {/* 折叠区用原生 details，不需要任何 JavaScript */}
          {roster.others.length > 0 && (
            <details className="mt-6 border-t border-white/10 pt-4">
              <summary className="cursor-pointer list-none text-[13px] text-[var(--color-ghost)] hover:text-[var(--color-parchment)]">
                ▸ {dict.plaza.moreVendors(roster.others.length)}
              </summary>
              <div className="mt-4 flex flex-wrap justify-center gap-x-2 gap-y-5 sm:justify-start sm:gap-x-3 sm:gap-y-6">
                {roster.others.map((e) => renderRoom(continent, e))}
              </div>
            </details>
          )}
        </SectionFrame>
      </div>
    );
  };

  return (
    <div>
      {CONTINENT_ORDER.filter((c) => byContinent.has(c)).map((c, i) => (
        <section key={c} aria-labelledby={`region-${c}`} className={i > 0 ? 'mt-10' : undefined}>
          {renderContinent(c)}
        </section>
      ))}
    </div>
  );
}
