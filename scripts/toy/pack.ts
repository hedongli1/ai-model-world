/**
 * 把 Next 的静态导出打成一个能作为 B 站 Toy 发布的包。
 *
 * 这个平台有两个硬约束，Next 的产物默认一个都不满足：
 *
 * **一、挂载路径事先不知道，而且每次更新都会变。** 线上真实地址是
 * `/toy/<slug>/<toyId>-v<版本号>/`，版本号由平台生成，发布之后才知道；预览又是
 * `/toy/preview/preview_xxxx/`。所以产物里任何写死的绝对前缀都会指向错误的位置。
 *
 * **二、存储只认完整文件路径。** 实测 `/chronicle/`、`/chronicle`、`/chronicle.html`
 * 全是 404，只有 `/chronicle/index.html` 返回 200，没有目录回退也没有扩展名回退。
 *
 * 于是这个脚本做四件事。
 *
 * ## 1. 删掉 `.txt` 预取负载
 *
 * 完整产物 428 MB，其中 244 MB 是 App Router 给客户端导航预取用的 RSC 负载。
 * 删掉之后预取拿不到东西，页面切换退回整页跳转，水合与页面内交互不受影响。
 * 删完 zip 约 36 MB，留着是 92 MB。
 *
 * ## 2. 把所有绝对前缀剥成「相对包根」，再用 `<base>` 统一解析
 *
 * 产物里的 `/toy/ai-model-world/_next/x.js` 一律剥成 `_next/x.js`，然后给每个 HTML
 * 注入一个按自身深度算好的 `<base href="../…">`。这样同一个字符串在任何挂载路径下
 * 都能解析到正确位置，HTML 属性、内联 flight 数据、JS 里的 fetch 与精灵图 URL 全部适用。
 *
 * **不能改成按文件深度写 `../` 前缀**，那是 2026-09-17 整站失去交互的原因：JS 里的
 * 相对路径是相对*文档*解析的，而 chunk 躺在 `_next/static/chunks/`（深度 3），
 * 按它自身深度算出的 `../../../` 从页面文档解析会直接飞出站点根。
 *
 * CSS 是唯一的例外，它的 `url()` 相对样式表自身解析，所以单独按文件深度处理。
 *
 * ## 3. 把 chunk 基址对齐成同一个字符串
 *
 * 光剥前缀还不够。turbopack 的加载器用 `document.querySelectorAll('script[src="…"]')`
 * 去重，比的是 **src 属性的字面值**，而它要找的字符串是
 * `TURBOPACK_CHUNK_BASE_PATH + chunk 路径`。两边对不上，它就会重新插一遍脚本，
 * 并且等在一个永远不会 resolve 的 promise 上，**页面渲染完全正常、所有按钮点了都没反应、
 * 控制台一条报错都没有**。所以这里把基址设成 `_next/`，与剥完前缀的 src 属性完全一致。
 *
 * 这个全局必须在 turbopack 运行时之前执行，所以注入在 `<head>` 的最前面。
 *
 * ## 4. 注入跳转兜底
 *
 * 目录链接补 `index.html` 只能管住服务端渲染出来的那份 HTML，水合之后 React 会用 JS 里的
 * 值覆盖 href，又变回 `/toy/ai-model-world/model/x/`（构建期写死的前缀，在真实挂载路径下
 * 是错的）。所以还要在捕获阶段拦住点击，自己把 URL 算对再跳，绕开客户端路由。
 * 全局搜索用的是 `router.push`，拦不到点击，所以 `history.pushState` 也一并接管。
 *
 * ---
 *
 * 发布前必须跑 `npm run toy:verify`，它会把包挂到与线上同构的版本化路径下，
 * 用真实浏览器把每个控件点一遍。`toy create` 给的预览链接只能看个大概，
 * 它跑在另一个域的 iframe 里，报错看不到。
 *
 * 用法：
 *   npm run toy:build && npm run toy:verify
 *   toy update <id> .toy-pkg --yes
 */
import { cpSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const SRC = join(ROOT, process.env.NEXT_DIST_DIR ?? '.next-toy');
const OUT = join(ROOT, '.toy-pkg');
/** 与构建时的 NEXT_BASE_PATH 一致。产物里出现的这个前缀全部要剥掉 */
const BASE = `${process.env.NEXT_BASE_PATH ?? '/toy/ai-model-world'}/`;

/**
 * 目录形式的站内链接补 index.html。剥完前缀之后它们长这样：
 *   href="model/foo/"            普通跳转
 *   href="leaderboard/all/?k=v"  带查询串
 * 排除掉冒号是为了不碰外链（`https://`），要求路径段非空是为了不碰纯锚点（`#x`）。
 */
const DIR_LINK = /(href=")([^"?#:]+\/)(?=["?#])/g;
/** 指向站点根的链接剥完前缀会变成空串，单独补一下 */
const ROOT_LINK = /href=""/g;

/**
 * 跳转兜底。见文件顶部第 4 条。
 *
 * href 有两种形态要归一：HTML 里是剥好前缀的相对路径，水合之后 React 换成带构建期
 * 前缀的绝对路径。所以先把构建期前缀剥掉，再用 `document.baseURI` 解析。
 *
 * 页内锚点要单独处理：`<base>` 会让 `href="#x"` 解析成「base 地址 + #x」，也就是那个
 * 会 404 的目录 URL。改成直接设 `location.hash`，它作用在当前地址上，不受 base 影响。
 *
 * 放行外链；带修饰键的点击（新标签页打开）只就地改 href，跳转仍交给浏览器。
 * 另外把指向构建期前缀的 fetch 直接短路掉，那些是客户端路由的预取，负载已经删了，
 * 放它们出去只会在控制台刷一屏 404。
 */
function shim(base: string): string {
  const b = JSON.stringify(base);
  return `<script>(function(){var B=${b};function raw(h){return h.indexOf(B)===0?h.slice(B.length):h===B.slice(0,-1)?"":h}
function fix(u){var p=u.pathname,l=p.slice(p.lastIndexOf("/")+1);if(l.indexOf(".")>=0)return /\\.html$/.test(l)?u:null;u.pathname=p.replace(/\\/?$/,"/")+"index.html";return u}
function to(h){var u;try{u=new URL(raw(h)||"index.html",document.baseURI)}catch(e){return null}return u.origin===location.origin?fix(u):null}
document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(!a)return;var h=a.getAttribute("href");if(!h)return;
if(h.charAt(0)==="#"){if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey)return;e.preventDefault();e.stopImmediatePropagation();location.hash=h.slice(1);return}
var u=to(h);if(!u)return;
if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey){a.setAttribute("href",u.href);return}
e.preventDefault();e.stopImmediatePropagation();location.href=u.href},true);
var push=history.pushState.bind(history);history.pushState=function(s,t,url){if(url!=null){var u=to(String(url));if(u&&u.pathname!==location.pathname){location.href=u.href;return}}return push(s,t,url)};
var f=window.fetch;window.fetch=function(i){var u=typeof i==="string"?i:i&&i.url;if(typeof u==="string"&&u.indexOf(B)===0)return Promise.resolve(new Response("",{status:404}));return f.apply(this,arguments)}})()</script>`;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function main(): void {
  rmSync(OUT, { recursive: true, force: true });
  cpSync(SRC, OUT, { recursive: true });

  const files = walk(OUT);

  let dropped = 0;
  let droppedBytes = 0;
  for (const f of files) {
    if (!f.endsWith('.txt')) continue;
    droppedBytes += statSync(f).size;
    rmSync(f);
    dropped += 1;
  }

  const boot = `<script>window.TURBOPACK_CHUNK_BASE_PATH="_next/"</script>`;
  let html = 0;
  let css = 0;
  let js = 0;
  let links = 0;

  for (const f of files) {
    if (f.endsWith('.txt')) continue;
    const rel = f.slice(OUT.length + 1);
    const depth = rel.split('/').length - 1;
    let text: string;
    try {
      text = readFileSync(f, 'utf8');
    } catch {
      continue;
    }

    if (f.endsWith('.html')) {
      if (!text.includes(BASE)) continue;
      text = text.split(BASE).join('');
      text = text.replace(DIR_LINK, (_m, attr: string, path: string) => {
        links += 1;
        return `${attr}${path}index.html`;
      });
      text = text.replace(ROOT_LINK, 'href="index.html"');
      const up = depth === 0 ? './' : '../'.repeat(depth);
      text = text.replace('<head>', `<head><base href="${up}"/>${boot}`);
      text = text.replace('</head>', `${shim(BASE)}</head>`);
      html += 1;
    } else if (f.endsWith('.css')) {
      if (!text.includes(BASE)) continue;
      // CSS 的 url() 相对样式表自身解析，所以这里按文件深度算，跟 HTML 不同
      text = text.split(BASE).join('../'.repeat(depth));
      css += 1;
    } else if (/\.(js|mjs)$/.test(f)) {
      if (!text.includes(BASE)) continue;
      text = text.split(BASE).join('');
      js += 1;
    } else {
      continue;
    }

    writeFileSync(f, text);
  }

  const kept = walk(OUT);
  const total = kept.reduce((n, f) => n + statSync(f).size, 0);
  console.log(`删除预取负载 ${dropped} 个（${(droppedBytes / 1048576).toFixed(0)} MB）`);
  console.log(`剥前缀：${html} 个 HTML（补 ${links} 条目录链接）、${js} 个 JS、${css} 个 CSS`);
  console.log(`产出 ${OUT}：${kept.length} 个文件，${(total / 1048576).toFixed(0)} MB`);
}

main();
