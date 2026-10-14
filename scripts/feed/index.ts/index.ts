/**
 * 开放数据出口与订阅源生成器。
 *
 *   npx tsx scripts/feed/index.ts
 *
 * 读 `data/models.json`（管线的产物），写以下「由快照再生产」的公共资源：
 *   public/data/models.csv   —— 全量模型事实表，表格软件与脚本可直接读取
 *   public/data/models.json  —— 精简、字段稳定的机器可读导出（剥离内部 provenance 噪声）
 *   public/data/vendors.csv  —— 厂商名录
 *   public/feed.xml          —— Atom 订阅源，收录最近发布的模型
 *
 * 目的：把站里已经汇总、核对过的信息以通用格式还给读者，方便二次利用与订阅。
 * 与精灵图、搜索索引一样属于「由快照再生产的产物」，不进版本库，由 predev / prebuild 现做，
 * 从而保证导出永远和页面上看到的是同一份快照。
 */

import fs from 'node:fs';
import path from 'node:path';

import type { ModelRecord, Vendor, WorldSnapshot } from '../../src/lib/types.ts';

const ROOT = process.cwd();
const SNAPSHOT = path.join(ROOT, 'data', 'models.json');
const DATA_DIR = path.join(ROOT, 'public', 'data');
const FEED_PATH = path.join(ROOT, 'public', 'feed.xml');

/** 站点根地址。feed 与导出里的绝对链接用它拼接。 */
const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://hedongli1.github.io/ai-model-world').replace(
  /\/$/,
  '',
);
/** 订阅源最多收录多少条最新发布。 */
const FEED_LIMIT = 40;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(','));
  return lines.join('\n') + '\n';
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 把只有年或月的发布日期补成完整日期，便于机器排序与 feed 时间戳。 */
function fullDate(value: string | null, precision: string | null): string | null {
  if (!value) return null;
  if (precision === 'year') return `${value}-01-01`;
  if (precision === 'month') return `${value}-01`;
  return value;
}

const MODEL_HEADER = [
  'id',
  'name',
  'vendor',
  'vendor_zh',
  'vendor_id',
  'country',
  'release_date',
  'release_date_precision',
  'knowledge_cutoff',
  'retired_at',
  'open_weights',
  'license',
  'params_total_b',
  'params_active_b',
  'params_confidence',
  'context_window',
  'max_output',
  'price_input_usd_per_mtok',
  'price_output_usd_per_mtok',
  'price_cached_input_usd_per_mtok',
  'modalities_input',
  'modalities_output',
  'tool_call',
  'reasoning',
  'structured_output',
  'prompt_caching',
  'eci',
  'swe_bench_verified',
  'swe_bench_vendor',
  'swe_bench_pro',
  'aime',
  'gpqa_diamond',
  'arc_agi_2',
  'fiction_live',
  'webdev_arena_elo',
  'training_compute_flop',
  'coding_scores_count',
  'page_url',
];

function modelRow(m: ModelRecord, v: Vendor | undefined): unknown[] {
  const b = m.benchmarks;
  return [
    m.id,
    m.name,
    v?.name ?? '',
    v?.nameZh ?? '',
    m.vendorId,
    v?.country ?? '',
    m.releaseDate,
    m.releaseDatePrecision,
    m.knowledgeCutoff,
    m.retiredAt,
    m.openWeights,
    m.license,
    m.params.totalB,
    m.params.activeB,
    m.params.confidence,
    m.contextWindow,
    m.maxOutput,
    m.pricing.inputPerMTok,
    m.pricing.outputPerMTok,
    m.pricing.cachedInputPerMTok,
    m.modalities.input.join('|'),
    m.modalities.output.join('|'),
    m.capabilities.toolCall,
    m.capabilities.reasoning,
    m.capabilities.structuredOutput,
    m.capabilities.promptCaching,
    b.eci,
    b.swe_bench_verified,
    b.swe_bench_vendor,
    b.swe_bench_pro,
    b.aime,
    b.gpqa_diamond,
    b.arc_agi_2,
    b.fiction_live,
    b.webdev_arena_elo,
    m.trainingComputeFlop ?? null,
    m.coding.length,
    `${SITE}/model/${m.slug}/`,
  ];
}

/** 精简的机器可读导出：保留事实字段与逐项成绩，去掉内部 provenance / firstSeenAt 等实现细节。 */
function openModel(m: ModelRecord, v: Vendor | undefined) {
  const compact = (arr?: ModelRecord['coding']) =>
    arr?.map((c) => ({
      league: c.league,
      score: c.score,
      unit: c.unit,
      attribution: c.attribution,
      source: c.source,
      source_url: c.sourceUrl,
    }));

  return {
    id: m.id,
    slug: m.slug,
    name: m.name,
    vendor_id: m.vendorId,
    vendor: v?.name ?? null,
    vendor_zh: v?.nameZh ?? null,
    country: v?.country ?? null,
    release_date: m.releaseDate,
    release_date_precision: m.releaseDatePrecision,
    knowledge_cutoff: m.knowledgeCutoff,
    retired_at: m.retiredAt,
    open_weights: m.openWeights,
    license: m.license,
    params: m.params,
    context_window: m.contextWindow,
    max_output: m.maxOutput,
    pricing: m.pricing,
    modalities: m.modalities,
    capabilities: m.capabilities,
    benchmarks: m.benchmarks,
    training_compute_flop: m.trainingComputeFlop ?? null,
    coding_scores: compact(m.coding),
    scores: compact(m.scores),
    page_url: `${SITE}/model/${m.slug}/`,
  };
}

function buildFeed(snapshot: WorldSnapshot, vendorById: Map<string, Vendor>): string {
  const items = snapshot.models
    .filter((m) => m.releaseDate)
    .sort((a, b) =>
      (fullDate(b.releaseDate, b.releaseDatePrecision) ?? '').localeCompare(
        fullDate(a.releaseDate, a.releaseDatePrecision) ?? '',
      ),
    )
    .slice(0, FEED_LIMIT);

  const updated = snapshot.generatedAt || new Date().toISOString();

  const entries = items
    .map((m) => {
      const v = vendorById.get(m.vendorId);
      const link = `${SITE}/model/${m.slug}/`;
      const rawDate = fullDate(m.releaseDate, m.releaseDatePrecision);
      const stamp = rawDate ? new Date(`${rawDate}T00:00:00Z`).toISOString() : updated;
      const title = `${m.name}${v ? `（${v.nameZh || v.name}）` : ''}`;

      const bits: string[] = [];
      if (v) bits.push(`厂商：${v.nameZh || v.name}`);
      if (m.releaseDate) bits.push(`发布：${m.releaseDate}`);
      if (m.params.totalB !== null) bits.push(`参数：${m.params.totalB}B`);
      if (m.openWeights !== null) bits.push(m.openWeights ? '开源权重' : '闭源');
      if (m.contextWindow !== null) bits.push(`上下文：${m.contextWindow}`);
      if (m.benchmarks.eci !== null) bits.push(`ECI ${m.benchmarks.eci}`);

      return [
        '  <entry>',
        `    <title>${xmlEscape(title)}</title>`,
        `    <link href="${xmlEscape(link)}"/>`,
        `    <id>${xmlEscape(link)}</id>`,
        `    <updated>${xmlEscape(stamp)}</updated>`,
        `    <summary>${xmlEscape(bits.join(' · '))}</summary>`,
        '  </entry>',
      ].join('\n');
    })
    .join('\n');

  return (
    [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<feed xmlns="http://www.w3.org/2005/Atom">',
      '  <title>大模型世界 · 最新模型</title>',
      `  <link href="${xmlEscape(`${SITE}/feed.xml`)}" rel="self"/>`,
      `  <link href="${xmlEscape(`${SITE}/`)}"/>`,
      `  <id>${xmlEscape(`${SITE}/`)}</id>`,
      `  <updated>${xmlEscape(updated)}</updated>`,
      '  <author><name>大模型世界</name></author>',
      '  <subtitle>按发布时间收录最近新增的模型，数据来自站内快照。</subtitle>',
      entries,
      '</feed>',
      '',
    ].join('\n')
  );
}

function main() {
  if (!fs.existsSync(SNAPSHOT)) {
    console.log('[feed] 没有 data/models.json，跳过（先跑 npm run sync）');
    return;
  }

  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')) as WorldSnapshot;
  const vendorById = new Map(snapshot.vendors.map((v) => [v.id, v]));

  fs.mkdirSync(DATA_DIR, { recursive: true });

  const modelCsv = toCsv(
    MODEL_HEADER,
    snapshot.models.map((m) => modelRow(m, vendorById.get(m.vendorId))),
  );
  fs.writeFileSync(path.join(DATA_DIR, 'models.csv'), modelCsv);

  const vendorCsv = toCsv(
    ['id', 'name', 'name_zh', 'country', 'region', 'homepage'],
    snapshot.vendors.map((v) => [v.id, v.name, v.nameZh, v.country, v.continent, v.homepage]),
  );
  fs.writeFileSync(path.join(DATA_DIR, 'vendors.csv'), vendorCsv);

  const open = {
    generated_at: snapshot.generatedAt,
    source: SITE,
    license_note:
      '事实字段来自 models.dev、Epoch AI、LiveBench 等公开来源，本站做聚合与整理，逐项署名见站内页脚与 /credits/。',
    counts: { models: snapshot.models.length, vendors: snapshot.vendors.length },
    vendors: snapshot.vendors,
    models: snapshot.models.map((m) => openModel(m, vendorById.get(m.vendorId))),
  };
  fs.writeFileSync(path.join(DATA_DIR, 'models.json'), JSON.stringify(open, null, 1));

  fs.writeFileSync(FEED_PATH, buildFeed(snapshot, vendorById));

  const kb = (n: number) => (n / 1024).toFixed(1);
  console.log(
    `[feed] ${snapshot.models.length} 模型 / ${snapshot.vendors.length} 厂商 -> public/data/{models.csv,vendors.csv,models.json} + public/feed.xml`,
  );
  console.log(
    `[feed] models.csv ${kb(Buffer.byteLength(modelCsv))}KB · feed.xml ${kb(Buffer.byteLength(fs.readFileSync(FEED_PATH)))}KB`,
  );
}

main();
