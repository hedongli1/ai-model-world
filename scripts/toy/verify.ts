/**
 * Toy 包的发布前自检。
 *
 * 起一个本地静态服务，把 `.toy-pkg` 挂到与正式地址相同的子路径下
 * （`/toy/<slug>/`），然后用真实浏览器跑一遍：页面有没有水合、每个控件点下去
 * 有没有反应、站内跳转会不会落到 404、搜索能不能出结果。
 *
 * **为什么必须本地验，不能看 `toy create` 给的预览链接**：包里的 basePath 是构建时
 * 写死的，预览地址前缀不同，打开只会是没有样式的裸 HTML。原因见 `pack.ts` 顶部。
 *
 * 这个脚本是 2026-09-17 那次事故的产物。当时整站水合失败，页面看着完全正常，
 * 所有按钮点了都没反应，控制台一条报错都没有，只有「点一下看状态变没变」这种
 * 端到端的断言能抓住它。
 *
 * 用法：
 *   npx tsx scripts/toy/verify.ts            # 自动起服务、跑完自动关
 *   npx tsx scripts/toy/verify.ts --keep     # 跑完保留服务，方便手动看
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { chromium, type Frame, type Page } from 'playwright';

const ROOT = join(import.meta.dirname, '..', '..');
const PKG = join(ROOT, '.toy-pkg');
/**
 * 挂载路径要跟线上同构，**包括那个版本号目录**。
 *
 * 线上真实地址是 `/toy/<slug>/<toyId>-v<版本号>/index.html`（在 bilibili.com 的页面里
 * 用 iframe 套着），版本号每次更新都变。拿 `/toy/<slug>/` 验等于放过了「前缀写死」
 * 这一整类问题，正是它让 2026-09-17 那版整站失去交互。这里用一个假的版本号目录，
 * 只要包对挂载路径没有任何假设，它就能过。
 */
const SLUG = (process.env.NEXT_BASE_PATH ?? '/toy/ai-model-world').replace(/^\/+|\/+$/g, '');
const MOUNT = `${SLUG}/34090174887936-v15484`;
const PORT = 4561;
const BASE = `http://127.0.0.1:${PORT}/${MOUNT}`;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

/**
 * 刻意只认完整文件路径，不做目录回退，跟 Toy 的对象存储保持一致。
 * 如果这里回退到 index.html，就验不出「目录链接会 404」这一类问题了。
 */
function serve() {
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const path = decodeURIComponent(url.pathname);
    if (!path.startsWith(`/${MOUNT}/`)) {
      res.writeHead(404).end('outside mount');
      return;
    }
    const file = join(PKG, normalize(path.slice(MOUNT.length + 2)));
    if (!file.startsWith(PKG) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  }).listen(PORT);
}

let failures = 0;
function check(ok: boolean, label: string, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? `  ${detail}` : ''}`);
}

const PAGES = [
  '/index.html',
  '/leaderboard/index.html',
  '/leaderboard/all/index.html',
  '/chronicle/index.html',
  '/vendor/deepseek/index.html',
  '/model/deepseek-deepseek-v4-1-flash/index.html',
  '/credits/index.html',
];

/** React 挂上事件了没有。没水合的页面长得一模一样，只能从 DOM 上的内部字段看 */
const HYDRATED = () => {
  const n = document.querySelector('button, a');
  return n ? Object.keys(n).some((k) => k.startsWith('__react')) : false;
};

async function fingerprint(scope: Page | Frame): Promise<string> {
  return scope.evaluate(() => {
    const sec = document.querySelector('section') ?? document.body;
    return JSON.stringify({
      q: location.search,
      head: sec.querySelector('h2')?.textContent?.trim(),
      meta: sec.querySelector('header span')?.textContent?.trim(),
      rows: [...sec.querySelectorAll('ol > li, tbody > tr')].slice(0, 4).map((n) => n.textContent?.trim().slice(0, 48)),
      count: sec.querySelectorAll('ol > li, tbody > tr').length,
    });
  });
}

async function main() {
  const server = serve();
  const browser = await chromium.launch();

  // ---------------------------------------------------------------- 水合与资源
  console.log('— 页面水合与资源 —');
  for (const p of PAGES) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const broken: string[] = [];
    /*
     * 两类 404 属预期，不算失败：
     *   1. `.txt`，被刻意删掉的预取负载；
     *   2. 以 `/` 结尾的目录 URL，那是 Next 对站内链接的预取，在这个只认完整路径的
     *      存储上必然落空。真正的跳转由 pack 注入的点击兜底改写成 index.html，
     *      所以预取落空不影响功能，下面的「站内跳转」小节会把这一点验掉。
     */
    page.on('response', (r) => {
      const u = r.url();
      if (r.status() < 400 || u.includes('.txt') || new URL(u).pathname.endsWith('/')) return;
      broken.push(`${r.status()} ${u.replace(BASE, '')}`);
    });
    page.on('pageerror', (e) => broken.push(`JS 异常 ${e.message.slice(0, 80)}`));
    await page.goto(BASE + p, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    check(await page.evaluate(HYDRATED), `水合 ${p}`);
    check(broken.length === 0, `无失败请求 ${p}`, [...new Set(broken)].slice(0, 3).join(' | '));
    await page.close();
  }

  // ---------------------------------------------------------------- 排行榜控件
  console.log('\n— 排行榜每个控件 —');
  const lb = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await lb.goto(`${BASE}/leaderboard/index.html`, { waitUntil: 'networkidle' });
  await lb.waitForTimeout(1200);

  const tracks = lb.locator('nav[aria-label="赛道"] button');
  const nTracks = await tracks.count();
  let dead = 0;
  for (let i = 0; i < nTracks; i++) {
    const btn = tracks.nth(i);
    const before = await fingerprint(lb);
    await btn.click({ timeout: 4000 }).catch(() => {});
    await lb.waitForTimeout(220);
    const after = await fingerprint(lb);
    // 第一个按钮是当前赛道，点了本来就不该变
    if (before === after && i > 0) {
      dead += 1;
      console.log(`   赛道无反应：${(await btn.textContent())?.trim()}`);
    }
  }
  check(dead === 0, `${nTracks} 个赛道按钮全部可切换`, dead ? `${dead} 个无反应` : '');

  await tracks.first().click();
  await lb.waitForTimeout(400);

  const controls = lb.locator('section button');
  const nCtl = await controls.count();
  let deadCtl = 0;
  let tested = 0;
  for (let i = 0; i < nCtl; i++) {
    const btn = controls.nth(i);
    if (!(await btn.isVisible().catch(() => false))) continue;
    const label = (await btn.textContent())?.trim().replace(/\s+/g, ' ') ?? '';
    // 「全部」是筛选的默认档，当前就选中它，点了不该有变化
    if (label === '全部') continue;
    tested += 1;
    const before = await fingerprint(lb);
    await btn.click({ timeout: 4000 }).catch(() => {});
    await lb.waitForTimeout(260);
    if (before === (await fingerprint(lb))) {
      deadCtl += 1;
      console.log(`   控件无反应：${label}`);
    }
  }
  check(deadCtl === 0, `${tested} 个筛选控件全部生效`, deadCtl ? `${deadCtl} 个无反应` : '');

  // 前面把每个控件都点过一遍，状态已经很乱，回到干净页面再验输入类控件
  await lb.goto(`${BASE}/leaderboard/index.html`, { waitUntil: 'networkidle' });
  await lb.waitForTimeout(1200);

  const box = lb.locator('section input[type="search"], section input[type="text"]').first();
  const beforeInput = await fingerprint(lb);
  await box.fill('kimi');
  await lb.waitForTimeout(700);
  check(beforeInput !== (await fingerprint(lb)), '筛选框输入生效');
  await box.fill('');
  await lb.waitForTimeout(400);

  for (const [sel, label] of [
    ['input[type="checkbox"]', '复选框'],
    ['select', '下拉框'],
  ] as const) {
    const els = lb.locator(sel);
    for (let i = 0; i < (await els.count()); i++) {
      const el = els.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const before = await fingerprint(lb);
      if (sel === 'select') await el.selectOption({ index: 1 }).catch(() => {});
      else await el.click().catch(() => {});
      await lb.waitForTimeout(500);
      check(before !== (await fingerprint(lb)), `${label} #${i + 1} 生效`);
    }
  }
  await lb.close();

  // ---------------------------------------------------------------- 站内跳转
  console.log('\n— 站内跳转 —');
  const nav = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  // href 剥过前缀，是不带开头斜杠的相对路径，所以这里不能按 `/model/` 匹配
  const hops: Array<[string, string]> = [
    ['/index.html', 'a[href*="model/"]'],
    ['/leaderboard/index.html', 'a[href*="model/"]'],
    ['/chronicle/index.html', 'a[href*="model/"]'],
    ['/model/deepseek-deepseek-v4-1-flash/index.html', 'a[href*="vendor/"]'],
    ['/index.html', 'a[href*="leaderboard/"]'],
  ];
  for (const [from, sel] of hops) {
    await nav.goto(BASE + from, { waitUntil: 'networkidle' });
    await nav.waitForTimeout(1200);
    const link = nav.locator(sel).first();
    const href = await link.getAttribute('href');
    await link.click().catch(() => {});
    await nav.waitForTimeout(1800);
    const ok = await nav.evaluate(() => document.body.innerText.length > 400 && !document.body.innerText.includes('not found'));
    check(ok, `${from} → ${href?.replace(`/${MOUNT}`, "") ?? "?"}`, ok ? '' : `落在 ${nav.url()}`);
  }
  await nav.close();

  // ---------------------------------------------------------------- 页内锚点
  console.log('\n— 首页页内锚点 —');
  const jump = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await jump.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
  await jump.waitForTimeout(1200);
  const chip = jump.locator('a[href^="#"]').first();
  const anchor = await chip.getAttribute('href');
  await chip.click();
  await jump.waitForTimeout(900);
  const scrolled = await jump.evaluate(() => window.scrollY > 100);
  check(scrolled && jump.url().includes('#'), `锚点 ${anchor} 能滚动定位`, scrolled ? '' : '页面没动');
  await jump.close();

  // ---------------------------------------------------------------- 总表页控件
  console.log('\n— 总表页控件 —');
  const all = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await all.goto(`${BASE}/leaderboard/all/index.html`, { waitUntil: 'networkidle' });
  await all.waitForTimeout(1200);
  const heads = all.locator('thead th button, thead button');
  const nHead = await heads.count();
  let deadHead = 0;
  for (let i = 0; i < nHead; i++) {
    const before = await fingerprint(all);
    await heads.nth(i).click({ timeout: 4000 }).catch(() => {});
    await all.waitForTimeout(300);
    if (before === (await fingerprint(all))) deadHead += 1;
  }
  check(nHead > 0 && deadHead === 0, `${nHead} 个排序表头可用`, deadHead ? `${deadHead} 个无反应` : '');
  await all.close();

  // ---------------------------------------------------------------- 全局搜索
  console.log('\n— 全局搜索 —');
  const s = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  let indexOk = false;
  s.on('response', (r) => r.url().includes('search-index.json') && r.status() === 200 && (indexOk = true));
  await s.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
  await s.locator('nav input, input[type="search"]').first().click();
  await s.waitForTimeout(800);
  await s.locator('nav input, input[type="search"]').first().type('deepseek', { delay: 60 });
  await s.waitForTimeout(1000);
  check(indexOk, '搜索索引可加载');
  const results = s.locator('[role="option"], nav li a').filter({ hasText: /DeepSeek|深度求索/i });
  const hits = await results.count();
  check(hits > 3, '搜索能出结果', `${hits} 条`);
  if (hits > 0) {
    await results.first().click();
    await s.waitForTimeout(1800);
    const landed = await s.evaluate(() => document.body.innerText.length > 400);
    check(landed, '搜索结果可点进详情', landed ? '' : `落在 ${s.url()}`);
  }
  await s.close();

  await browser.close();
  if (!process.argv.includes('--keep')) server.close();

  console.log(`\n${failures === 0 ? '全部通过，可以发布' : `${failures} 项未通过，先别发`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
