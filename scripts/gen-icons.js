/*
 * gen-icons.js - 无第三方依赖生成应用图标（PNG）
 * 产出：
 *   icons/icon-192.png            手机/PWA
 *   icons/icon-512.png            PWA/Windows 图标源
 *   icons/icon-maskable-512.png   安卓自适应图标（图形充满安全区）
 *   icons/tv-banner-320x180.png   Android TV 横幅
 * 运行：node scripts/gen-icons.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------- 极简 PNG 编码（RGBA） ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  // 每行前加 filter byte 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 画布工具 ----------
function makeCanvas(w, h) {
  return { w, h, buf: Buffer.alloc(w * h * 4) };
}

function setPx(cv, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= cv.w || y >= cv.h) return;
  const i = (y * cv.w + x) * 4;
  if (a === 255) {
    cv.buf[i] = r; cv.buf[i + 1] = g; cv.buf[i + 2] = b; cv.buf[i + 3] = 255;
  } else {
    const af = a / 255;
    cv.buf[i] = Math.round(cv.buf[i] * (1 - af) + r * af);
    cv.buf[i + 1] = Math.round(cv.buf[i + 1] * (1 - af) + g * af);
    cv.buf[i + 2] = Math.round(cv.buf[i + 2] * (1 - af) + b * af);
    cv.buf[i + 3] = Math.max(cv.buf[i + 3], a);
  }
}

function fill(cv, r, g, b) {
  for (let i = 0; i < cv.w * cv.h; i++) {
    cv.buf[i * 4] = r;
    cv.buf[i * 4 + 1] = g;
    cv.buf[i * 4 + 2] = b;
    cv.buf[i * 4 + 3] = 255;
  }
}

// 圆角矩形（填充）
function roundRect(cv, x0, y0, x1, y1, rad, r, g, b, a = 255) {
  // Buffer 索引必须为整数
  const bx0 = Math.ceil(x0), by0 = Math.ceil(y0);
  const bx1 = Math.floor(x1), by1 = Math.floor(y1);
  for (let y = by0; y < by1; y++) {
    for (let x = bx0; x < bx1; x++) {
      let inside = true;
      const cx = x < x0 + rad ? x0 + rad : x > x1 - rad ? x1 - rad : x;
      const cy = y < y0 + rad ? y0 + rad : y > y1 - rad ? y1 - rad : y;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > rad * rad) inside = false;
      if (inside) setPx(cv, x, y, r, g, b, a);
    }
  }
}

// 三角形（播放键），cx/cy 为中心，size 为外接尺寸
function playTriangle(cv, cx, cy, size, r, g, b) {
  const half = size / 2;
  // 三个顶点：左偏一点视觉居中
  const p1 = { x: cx - half * 0.72, y: cy - half };
  const p2 = { x: cx - half * 0.72, y: cy + half };
  const p3 = { x: cx + half, y: cy };
  const minY = Math.floor(Math.min(p1.y, p2.y, p3.y));
  const maxY = Math.ceil(Math.max(p1.y, p2.y, p3.y));
  for (let y = minY; y <= maxY; y++) {
    const xs = [];
    [[p1, p2], [p2, p3], [p3, p1]].forEach(([a, z]) => {
      if ((y >= a.y && y <= z.y) || (y >= z.y && y <= a.y)) {
        if (a.y === z.y) return;
        xs.push(a.x + (z.x - a.x) * ((y - a.y) / (z.y - a.y)));
      }
    });
    if (xs.length >= 2) {
      xs.sort((m, n) => m - n);
      for (let x = Math.floor(xs[0]); x <= Math.ceil(xs[xs.length - 1]); x++) {
        setPx(cv, x, y, r, g, b, 255);
      }
    }
  }
}

// ---------- 配色 ----------
const BG = [15, 17, 21];       // #0f1115
const CARD = [28, 31, 38];     // 卡片底
const GOLD = [218, 168, 84];   // 播放三角（与主站主题呼应）
const GLOW = [218, 168, 84];

// 标准图标：深圆角底卡 + 金色播放键
function appIcon(size, { maskable = false } = {}) {
  const cv = makeCanvas(size, size);
  fill(cv, BG[0], BG[1], BG[2]);
  if (maskable) {
    // 自适应图标：背景铺满，图形控制在中心 60% 安全区内
    fill(cv, BG[0], BG[1], BG[2]);
    playTriangle(cv, size * 0.52, size * 0.52, size * 0.42, GOLD[0], GOLD[1], GOLD[2]);
  } else {
    const pad = size * 0.06;
    // 外层金色圆角底 + 内层深色卡片，形成金边
    roundRect(cv, pad, pad, size - pad, size - pad, size * 0.22, GOLD[0], GOLD[1], GOLD[2]);
    const inset = Math.max(3, size * 0.008);
    roundRect(cv, pad + inset, pad + inset, size - pad - inset, size - pad - inset,
      size * 0.2, CARD[0], CARD[1], CARD[2]);
    playTriangle(cv, size * 0.53, size * 0.52, size * 0.4, GOLD[0], GOLD[1], GOLD[2]);
  }
  return encodePNG(size, size, cv.buf);
}

// TV 横幅 320x180：左侧播放键，右侧留品牌区（纯图形，无字体依赖）
function tvBanner() {
  const w = 320, h = 180;
  const cv = makeCanvas(w, h);
  fill(cv, BG[0], BG[1], BG[2]);
  roundRect(cv, 0, 0, w, h, 0, BG[0], BG[1], BG[2]);
  // 左侧圆形徽标：金色圆环 + 深色内圆
  const ccx = 58, ccy = 90, rad = 38, inner = 32;
  for (let y = ccy - rad; y < ccy + rad; y++) {
    for (let x = ccx - rad; x < ccx + rad; x++) {
      const dx = x - ccx, dy = y - ccy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= rad * rad && d2 > inner * inner) {
        setPx(cv, x, y, GOLD[0], GOLD[1], GOLD[2], 255);
      } else if (d2 <= inner * inner) {
        setPx(cv, x, y, CARD[0], CARD[1], CARD[2], 255);
      }
    }
  }
  playTriangle(cv, ccx + 4, ccy, 30, GOLD[0], GOLD[1], GOLD[2]);
  // 右侧三条横杠暗示"影序"列表
  for (let i = 0; i < 3; i++) {
    const y = 66 + i * 26;
    roundRect(cv, 120, y, 280 - i * 24, y + 8, 4, GLOW[0], GLOW[1], GLOW[2], i === 0 ? 230 : 150);
  }
  return encodePNG(w, h, cv.buf);
}

// 启动屏：满版深色底 + 居中播放键
function splash(size) {
  const cv = makeCanvas(size, size);
  fill(cv, BG[0], BG[1], BG[2]);
  playTriangle(cv, size * 0.52, size * 0.5, size * 0.3, GOLD[0], GOLD[1], GOLD[2]);
  return encodePNG(size, size, cv.buf);
}

// ---------- 输出 ----------
const outDir = path.join(__dirname, '..', 'icons');
const assetsDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(assetsDir, { recursive: true });
const files = {
  'icon-192.png': appIcon(192),
  'icon-512.png': appIcon(512),
  'icon-1024.png': appIcon(1024),
  'icon-maskable-512.png': appIcon(512, { maskable: true }),
  'icon-maskable-1024.png': appIcon(1024, { maskable: true }),
  'tv-banner-320x180.png': tvBanner(),
};
for (const [name, buf] of Object.entries(files)) {
  fs.writeFileSync(path.join(outDir, name), buf);
  console.log('生成 icons/' + name + ' (' + buf.length + ' 字节)');
}
// Capacitor 资源（@capacitor/assets 约定：满版 1024 图标 + 启动屏）
fs.writeFileSync(path.join(assetsDir, 'icon.png'), files['icon-maskable-1024.png']);
fs.writeFileSync(path.join(assetsDir, 'splash.png'), splash(1024));
console.log('生成 assets/icon.png、assets/splash.png');
