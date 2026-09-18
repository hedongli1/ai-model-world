import type { Metadata, Viewport } from 'next';
import './globals.css';
import { DEFAULT_LANG, getDict, htmlLang } from '@/lib/i18n';
import { SiteFooter } from '@/components/world/SiteFooter';
import { asset } from '@/lib/asset';

const dict = getDict(DEFAULT_LANG);

/*
 * 中文像素字体的 @font-face 内联在这里，不放 globals.css。
 *
 * 字体地址必须跟着部署前缀走：作为 B 站 Toy 发布时全站挂在 /toy/<slug>/ 下，
 * 写死的 /fonts/... 会打到 bilibili.com 的根上，中文整站掉回系统字体。
 * CSS 文件里既读不到环境变量，改成相对路径又会被打包器当模块在构建期解析失败，
 * 所以交给这里用 asset() 算，与精灵图、搜索索引共用同一套前缀规则。
 */
const fontFace = `@font-face{font-family:'Fusion Pixel';src:url('${asset('/fonts/pixel-zh.woff2')}') format('woff2');font-weight:400;font-style:normal;font-display:swap}`;

export const metadata: Metadata = {
  title: {
    default: `${dict.siteName} · ${dict.siteTagline}`,
    template: `%s · ${dict.siteName}`,
  },
  description: dict.siteDescription,
  applicationName: dict.siteName,
};

export const viewport: Viewport = {
  // 主题层已切换为「深海霓虹」，地址栏底色跟随。详见 globals.css 的二次开发主题层。
  themeColor: '#080a12',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang={htmlLang(DEFAULT_LANG)} data-scroll-behavior="smooth" className="h-full">
      <head>
        <style dangerouslySetInnerHTML={{ __html: fontFace }} />
      </head>
      <body className="min-h-full">
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
