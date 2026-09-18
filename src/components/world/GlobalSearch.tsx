'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { VendorCrest } from '@/components/character/VendorCrest';
import { runSearch, type SearchIndex, type SearchResult } from '@/lib/search';
import { DEFAULT_LANG, getDict } from '@/lib/i18n';
import { asset } from '@/lib/asset';

/**
 * 全站搜索框。放在导航条里，每一页都在。
 *
 * 它同时回答三种问题：
 * - 「GLM-5.3 在哪」——按名字直达角色房间；
 * - 「智谱都有什么」——按厂商直达厂商页；
 * - 「多模态的有哪些」「智谱有没有多模态」——按能力算出数量，点进去是筛好的总表。
 *
 * 索引**按需加载**：聚焦（或鼠标移上来）才去拉 `/search-index.json`，约 52 KB、一次缓存。
 * 导航条在 580 个静态页面上都有，内联索引等于给每次访问都加上这笔流量。
 *
 * 匹配逻辑全在 `src/lib/search.ts`，这里只管交互。禁用 JavaScript 时输入框不渲染——
 * 一个点了没反应的框比没有更糟；那种情况下总表页自带的搜索框仍然可用。
 */

/**
 * 输入停顿多久才真正查。553 个模型的匹配本身不到一毫秒，防抖挡的不是算力，
 * 是**中间态**：拼音输入法每敲一个字母都会触发 input 事件，不防抖的话结果面板
 * 会在「z / zh / zhi / zhip…」之间疯狂重排，读者眼里就是一片乱跳。
 */
const DEBOUNCE_MS = 140;

/** 索引在模块作用域缓存：跨页面导航时 React 树会重建，但模块不会 */
let cachedIndex: SearchIndex | null = null;
let inflight: Promise<SearchIndex | null> | null = null;

function loadIndex(): Promise<SearchIndex | null> {
  if (cachedIndex) return Promise.resolve(cachedIndex);
  inflight ??= fetch(asset('/search-index.json'))
    .then((r) => (r.ok ? (r.json() as Promise<SearchIndex>) : null))
    .then((i) => {
      cachedIndex = i;
      return i;
    })
    .catch(() => null);
  return inflight;
}

interface Row {
  key: string;
  href: string;
  /** 主标题 */
  title: string;
  /** 副标题，说明这一条是什么 */
  note: string;
  /** 右侧的数字或标记 */
  tail?: string;
  crest?: { motif: string; accent: string };
  /** 分组小标题，只在该组第一行上显示 */
  group?: string;
}

/** 把三类命中拍平成一维，键盘上下键才好走 */
function toRows(r: SearchResult, dict: ReturnType<typeof getDict>): Row[] {
  const rows: Row[] = [];

  r.shortcuts.forEach((s, i) => {
    rows.push({
      key: `s${i}`,
      href: s.href,
      title: s.label,
      note: s.hint,
      tail: s.count != null ? `${s.count} 个` : '看榜单',
      crest: s.vendor ? { motif: s.vendor.m, accent: s.vendor.a } : undefined,
      group: i === 0 ? '按能力找' : undefined,
    });
  });

  r.vendors.forEach((v, i) => {
    rows.push({
      key: `v${v.vendor.i}`,
      href: v.href,
      title: v.vendor.n,
      note: `${dict.continent[v.vendor.c]}厂商`,
      tail: `${v.vendor.t} 个模型`,
      crest: { motif: v.vendor.m, accent: v.vendor.a },
      group: i === 0 ? '厂商' : undefined,
    });
  });

  r.models.forEach((m, i) => {
    const kind = m.model.k ? dict.kind.label[m.model.k] : dict.kind.unknown;
    rows.push({
      key: `m${m.model.s}`,
      href: m.href,
      title: m.model.n,
      note: `${m.vendor.n} · ${kind}${m.model.x ? ' · 已退役' : ''}`,
      tail: m.model.r != null ? `智力 #${m.model.r}` : undefined,
      crest: { motif: m.vendor.m, accent: m.vendor.a },
      group: i === 0 ? '模型' : undefined,
    });
  });

  return rows;
}

export function GlobalSearch() {
  const dict = getDict(DEFAULT_LANG);
  const [index, setIndex] = useState<SearchIndex | null>(cachedIndex);
  const [q, setQ] = useState('');
  /** 真正拿去查的关键词，比 q 慢半拍 */
  const [term, setTerm] = useState('');
  /** 中文输入法正在拼字。拼到一半的拼音拿去查只会出噪音，等它落字。 */
  const [composing, setComposing] = useState(false);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const warm = useCallback(() => {
    if (cachedIndex) return;
    void loadIndex().then(setIndex);
  }, []);

  // 防抖。setState 在 timeout 回调里，不是同步落在 effect 体内
  useEffect(() => {
    if (composing) return;
    const t = setTimeout(() => setTerm(q), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q, composing]);

  const result = useMemo(() => runSearch(index, term), [index, term]);
  const rows = useMemo(() => toRows(result, dict), [result, dict]);
  const hasRows = rows.length > 0;
  // 改关键词时 onChange 会把游标归零；这里再夹一次，防止索引刚加载完导致行数变少
  const active = Math.min(cursor, Math.max(0, rows.length - 1));
  /** 已经敲了新字但还没到防抖点。此时旧结果继续挂着，就是不能说「没有匹配」 */
  const pending = term.trim() !== q.trim();
  const allHref = `/leaderboard/all/?q=${encodeURIComponent(q.trim())}`;

  // 点框外收起。用 pointerdown 而不是 click，否则点结果行时会先收起再丢掉这一下点击
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  /**
   * 结果行全部是真链接，跳转交给它们自己完成，这里只负责收起面板。
   *
   * 不用 `router.push`：静态托管到 B 站 Toy 那种只认完整文件路径的对象存储时，
   * 编程式跳转会绕过打包脚本注入的链接兜底，落到一个 404 上。走真链接还顺带
   * 拿到了中键新开、右键复制地址这些浏览器原生行为。
   */
  const dismiss = () => {
    setOpen(false);
    setQ('');
    setTerm('');
    inputRef.current?.blur();
  };

  /** 键盘回车：找到面板里当前选中的那条链接，替用户点一下 */
  const activate = (selector: string) => {
    boxRef.current?.querySelector<HTMLElement>(selector)?.click();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open || !hasRows) {
      // 没有命中时回车退到总表，让读者至少落到一个能继续筛的地方
      if (e.key === 'Enter' && q.trim()) activate('[data-nav="all"]');
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((active + 1) % rows.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((active - 1 + rows.length) % rows.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      activate('[data-active="1"], [data-nav="all"]');
    }
  };

  const showPanel = open && q.trim() !== '';

  return (
    <div ref={boxRef} className="relative w-full sm:w-auto">
      {/*
        底色必须近乎不透明。首页的导航条压在天空上，用半透明黑会让像素太阳的阶梯边缘
        透上来，正好落在输入区，字就读不清了。
      */}
      <div
        className="flex items-center gap-1.5 border-2 border-[var(--color-ink)] px-2 py-1"
        style={{ background: 'rgb(16 20 28 / 0.94)' }}
      >
        <MagnifierIcon />
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setCursor(0);
            setOpen(true);
          }}
          onFocus={() => {
            warm();
            setOpen(true);
          }}
          onPointerEnter={warm}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          onKeyDown={onKeyDown}
          placeholder="搜模型、厂商、多模态…"
          aria-label="搜索模型、厂商或能力"
          aria-expanded={showPanel}
          aria-controls="global-search-results"
          role="combobox"
          className="w-full min-w-0 bg-transparent text-[13px] leading-5 text-[var(--color-parchment)] outline-none placeholder:text-[var(--color-ghost)] sm:w-44"
        />
      </div>

      {showPanel && (
        <div
          id="global-search-results"
          role="listbox"
          className="pixel-panel-dark absolute left-0 top-full z-50 mt-1 max-h-[70vh] w-full overflow-y-auto p-1 text-left sm:left-auto sm:right-0 sm:w-[26rem]"
        >
          {!index && <div className="px-2 py-3 text-[13px] text-[var(--color-ghost)]">正在载入索引…</div>}

          {index && !hasRows && pending && (
            <div className="px-2 py-3 text-[13px] text-[var(--color-ghost)]">搜索中…</div>
          )}

          {index && !hasRows && !pending && (
            <div className="px-2 py-3 text-[13px] text-[var(--color-ghost)]">
              没有匹配的模型、厂商或能力。试试「多模态」「开源」「国内」，或者直接
              <Link
                href={allHref}
                data-nav="all"
                onClick={dismiss}
                className="ml-1 text-[var(--color-gold)] underline"
              >
                去总表搜
              </Link>
              。
            </div>
          )}

          {rows.map((row, i) => (
            <div key={row.key}>
              {row.group && (
                <div className="px-2 pb-0.5 pt-2 text-[12px] text-[var(--color-ghost)]">{row.group}</div>
              )}
              <Link
                href={row.href}
                role="option"
                aria-selected={i === active}
                data-active={i === active ? '1' : undefined}
                onPointerEnter={() => setCursor(i)}
                onClick={dismiss}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
                style={{
                  background: i === active ? 'rgb(242 207 106 / 0.16)' : 'transparent',
                  boxShadow: i === active ? 'inset 2px 0 0 var(--color-gold)' : 'none',
                }}
              >
                {row.crest ? (
                  <VendorCrest motif={row.crest.motif} accentColor={row.crest.accent} size={14} />
                ) : (
                  <span className="h-3.5 w-3.5 shrink-0 bg-[var(--color-gold)] opacity-70" aria-hidden />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] leading-tight text-[var(--color-parchment)]">
                    {row.title}
                  </span>
                  <span className="block truncate text-[12px] leading-tight text-[var(--color-ghost)]">
                    {row.note}
                  </span>
                </span>
                {row.tail && (
                  <span className="shrink-0 font-pixel text-[12px] text-[var(--color-gold)]">{row.tail}</span>
                )}
              </Link>
            </div>
          ))}

          {result.modelTotal > result.models.length && (
            <Link
              href={allHref}
              data-nav="all"
              onClick={dismiss}
              className="mt-1 block w-full border-t border-white/10 px-2 py-2 text-left text-[13px] text-[var(--color-parchment-dim)] hover:text-[var(--color-gold)]"
            >
              在总表里看全部 {result.modelTotal} 个匹配 →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function MagnifierIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden className="shrink-0">
      <g fill="var(--color-ghost)">
        <rect x="3" y="1" width="4" height="1" />
        <rect x="3" y="7" width="4" height="1" />
        <rect x="2" y="2" width="1" height="5" />
        <rect x="7" y="2" width="1" height="5" />
        <rect x="8" y="8" width="1" height="1" />
        <rect x="9" y="9" width="2" height="2" />
      </g>
    </svg>
  );
}
