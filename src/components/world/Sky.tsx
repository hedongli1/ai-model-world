/**
 * 世界的天空。
 *
 * 时刻固定在黎明：左边（西岸都会）夜色未退、星辰仍在，右边（东方城邦）朝阳已经升起。
 * 这条从靛蓝到琥珀的横向渐变本身就是地理隐喻，用户不需要读任何文字就能感到「这是两个世界」。
 *
 * 全部用 CSS 与内联 SVG 绘制，不加载任何图片。所有图形由确定性函数生成，
 * 因此服务端与客户端渲染结果一致，不会水合失配。
 *
 * 分层要点：星星与太阳用固定像素尺寸绝对定位，绝不能放进会被拉伸的 SVG 里，
 * 否则在窄高视口下会被抻成竖条。只有天际线允许横向拉伸——矩形楼体横向变宽看不出来。
 */

/** 稳定哈希，让布局看起来随机但每次构建都一样 */
function hash(n: number): number {
  let h = (n ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

/** 星星只出现在西侧夜空，越往东越稀疏，到中线彻底消失 */
function Stars() {
  const stars = Array.from({ length: 90 }, (_, i) => {
    const left = hash(i * 3 + 1) * 58;
    const top = hash(i * 3 + 2) * 55;
    const bright = hash(i * 3 + 3);
    const size = bright > 0.88 ? 3 : bright > 0.6 ? 2 : 1;
    return {
      left,
      top,
      size,
      opacity: Math.max(0, 1 - left / 58) * (0.3 + bright * 0.7),
      twinkle: bright > 0.93,
    };
  });

  return (
    <>
      {stars.map((s, i) => (
        <span
          key={i}
          className={s.twinkle ? 'animate-pulse' : undefined}
          style={{
            position: 'absolute',
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            background: '#f4f6f8',
            opacity: s.opacity,
            animationDuration: `${2 + (i % 4)}s`,
          }}
        />
      ))}
    </>
  );
}

/** 阶梯状的方块太阳。固定像素尺寸，永远是正的。 */
function Sun() {
  const px = 7;
  const rows = [4, 6, 8, 9, 10, 10, 10, 9, 8, 6, 4];
  return (
    <div
      className="absolute"
      style={{ right: '9%', top: '22%', filter: 'drop-shadow(0 0 24px rgb(232 180 92 / 0.45))' }}
    >
      <div
        className="absolute rounded-full"
        style={{
          inset: -46,
          background: 'radial-gradient(circle, rgb(232 180 92 / 0.22) 0%, transparent 70%)',
        }}
      />
      <div className="relative">
        {rows.map((w, i) => (
          <div
            key={i}
            style={{
              width: w * px,
              height: px,
              marginLeft: ((10 - w) / 2) * px,
              background: i < 4 ? '#f0ca7a' : i < 8 ? '#e8b45c' : '#d8943f',
            }}
          />
        ))}
      </div>
    </div>
  );
}

const TOWER_COUNT = 34;
const ROOF_COUNT = 12;

/** 西岸：高低错落的摩天楼剪影，窗户零星亮着 */
function westTowers() {
  return Array.from({ length: TOWER_COUNT }, (_, i) => {
    const h = 6 + hash(i * 7 + 11) * 30;
    const w = 1.1 + hash(i * 7 + 12) * 1.1;
    return { x: i * 1.52, w, h };
  });
}

/** 东方：层叠的飞檐屋顶剪影。楼体要够宽、屋檐要明显宽于楼体，否则会画成电视天线。 */
function eastRoofs() {
  return Array.from({ length: ROOF_COUNT }, (_, i) => ({
    x: 51 + i * 4.1,
    h: 7 + hash(i * 5 + 23) * 16,
    tiers: 2 + Math.floor(hash(i * 5 + 24) * 2),
    body: 2.4 + hash(i * 5 + 25) * 1.2,
  }));
}

/**
 * 飘过的像素云。
 *
 * 一整屏静止的画面看起来像插图而不是游戏，云是最便宜的「这个世界在运转」的证据——
 * 三朵不同高度不同速度的云，纯 CSS transform，不占主线程。
 */
function Clouds() {
  const clouds = [
    { top: '18%', scale: 1, duration: 190, delay: 0, opacity: 0.16 },
    { top: '38%', scale: 0.7, duration: 260, delay: -70, opacity: 0.11 },
    { top: '9%', scale: 1.3, duration: 320, delay: -160, opacity: 0.09 },
  ];
  return (
    <>
      {clouds.map((c, i) => (
        <div
          key={i}
          className="anim-drift absolute"
          style={{
            top: c.top,
            animationDuration: `${c.duration}s`,
            animationDelay: `${c.delay}s`,
            opacity: c.opacity,
          }}
          aria-hidden
        >
          <svg
            width={72 * c.scale}
            height={24 * c.scale}
            viewBox="0 0 24 8"
            shapeRendering="crispEdges"
          >
            <rect x="4" y="2" width="10" height="2" fill="#fffaf0" />
            <rect x="2" y="4" width="18" height="2" fill="#fffaf0" />
            <rect x="7" y="0" width="6" height="2" fill="#fffaf0" />
            <rect x="14" y="3" width="8" height="3" fill="#fffaf0" />
          </svg>
        </div>
      ))}
    </>
  );
}

function Skyline({ height }: { height: string }) {
  const GROUND = 40;
  return (
    <svg
      className="absolute inset-x-0 bottom-0 w-full"
      style={{ height }}
      viewBox={`0 0 100 ${GROUND}`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
    >
      {westTowers().map((t, i) => (
        <g key={`w${i}`}>
          <rect x={t.x} y={GROUND - t.h} width={t.w} height={t.h} fill="#0b0e15" />
          {Array.from({ length: Math.floor(t.h / 3.2) }, (_, r) => {
            if (hash(i * 31 + r * 7) < 0.62) return null;
            return (
              <rect
                key={r}
                x={t.x + t.w * 0.28}
                y={GROUND - t.h + 1.6 + r * 3.2}
                width={t.w * 0.44}
                height={0.7}
                fill="#62b6e0"
                opacity={0.5}
              />
            );
          })}
          {/*
            高楼顶上的航空警示灯。只给最高的那几栋，各自错开节拍慢慢闪。
            这是全站性价比最高的科技感：一个像素、零布局成本、离任何文字都有一屏远，
            但它让天际线从一张剪影变成一座还亮着灯的城。
          */}
          {t.h > 26 && (
            <rect
              className="animate-pulse"
              style={{ animationDuration: `${2.2 + (i % 5) * 0.6}s` }}
              // viewBox 被 preserveAspectRatio="none" 横向拉伸约 14 倍、纵向约 2 倍，
              // 想画一个方点就得先把这两个系数除回去，否则会变成一道横杠
              x={t.x + t.w / 2 - 0.1}
              y={GROUND - t.h - 1.7}
              width={0.2}
              height={1.7}
              fill="#ff7d68"
            />
          )}
        </g>
      ))}

      {eastRoofs().map((r, i) => (
        <g key={`e${i}`}>
          <rect x={r.x} y={GROUND - r.h} width={r.body} height={r.h} fill="#0b0e15" />
          {Array.from({ length: r.tiers }, (_, t) => {
            const y = GROUND - r.h + t * ((r.h - 2) / r.tiers);
            // 上层屋檐比下层窄，形成塔的收分
            const spread = 2.2 - t * 0.5;
            const left = r.x - spread;
            const width = r.body + spread * 2;
            return (
              <g key={t}>
                <rect x={left} y={y} width={width} height={1.2} fill="#0b0e15" />
                {/* 两端上翘的檐角 */}
                <rect x={left - 0.7} y={y - 0.8} width={1.1} height={1.1} fill="#0b0e15" />
                <rect x={left + width - 0.4} y={y - 0.8} width={1.1} height={1.1} fill="#0b0e15" />
              </g>
            );
          })}
          {hash(i * 13 + 3) > 0.4 && (
            <rect
              x={r.x + r.body / 2 - 0.4}
              y={GROUND - r.h * 0.35}
              width={0.9}
              height={1.3}
              fill="#e2705c"
              opacity={0.7}
            />
          )}
        </g>
      ))}
    </svg>
  );
}

/**
 * 填满父容器的天空。父容器需要 `relative` 并给出高度——
 * 天空是地平线以上的那一带，不是整页的固定背景。
 *
 * `skylineHeight` 让首页可以把天空压成一条窄带（进来直接看到世界而不是一张海报），
 * 同时保留在其它场合放大使用的余地。
 */
export function Sky({
  className = '',
  skylineHeight = 'clamp(96px, 20vh, 190px)',
}: {
  className?: string;
  skylineHeight?: string;
}) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(100deg, var(--color-void) 0%, var(--color-dusk) 26%, var(--color-twilight) 48%, var(--color-ember) 74%, var(--color-dawn) 100%)',
        }}
      />
      <Stars />
      {/* 银河光带：西侧夜空的淡蓝紫柔光，与「左夜右昼」隐喻一致。
          纯径向渐变、确定性，只在天空 banner 内（SSR 安全的装饰层） */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 95% 42% at 32% 46%, rgb(130 160 220 / 0.12), transparent 68%), radial-gradient(ellipse 70% 28% at 24% 52%, rgb(190 170 235 / 0.08), transparent 70%)',
        }}
      />
      <Sun />
      <Clouds />
      {/* 地平线附近压一层暖光，制造大气透视。
          底部透明→暖色过渡同时充当 banner 与正文的渐隐衔接，消除「贴片感」 */}
      
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, transparent 45%, rgb(216 148 63 / 0.16) 80%, rgb(232 180 92 / 0.26) 100%)',
        }}
      />
      <Skyline height={skylineHeight} />
    </div>
  );
}
