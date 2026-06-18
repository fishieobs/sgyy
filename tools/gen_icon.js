/* 產生 App 圖示 PNG（無第三方相依，使用 Node 內建 zlib）。
   主題：朱漆描金・印章 —— 金色「鼎」象徵問鼎中原、天下歸一。 */
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

/* ---------- PNG 編碼 ---------- */
function crc32(buf) {
  let c, t = crc32.t;
  if (!t) {
    t = crc32.t = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
  }
  c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

/* ---------- 繪圖工具（座標皆以 0..1 正規化） ---------- */
function mix(a, b, t) { return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

// 圓角矩形：點(px,py) 是否落在 中心(cx,cy)、半寬hw、半高hh、圓角r 內
function inRR(px, py, cx, cy, hw, hh, r) {
  const dx = Math.abs(px - cx), dy = Math.abs(py - cy);
  if (dx > hw || dy > hh) return false;
  const ix = dx - (hw - r), iy = dy - (hh - r);
  if (ix <= 0 || iy <= 0) return true;
  return ix * ix + iy * iy <= r * r;
}
// 梯形（上下半寬線性內插）：y 介於 [ty,by]，中心 cx
function inTrap(px, py, ty, by, cx, hwTop, hwBot, splay) {
  if (py < ty || py > by) return false;
  const t = (py - ty) / (by - ty);
  const hw = hwTop + (hwBot - hwTop) * t;
  const c = cx + (splay || 0) * t;
  return Math.abs(px - c) <= hw;
}

const GOLD_HI = [252, 232, 168];
const GOLD = [233, 196, 110];
const GOLD_LO = [176, 134, 58];
const RED_HI = [176, 64, 48];
const RED = [150, 47, 34];
const RED_LO = [96, 26, 18];

// 回傳某取樣點(nx,ny ∈0..1)的 RGB
function shade(nx, ny) {
  // 背景：上紅下深紅 + 中央柔光 + 邊角暗角
  let bg = mix(RED_HI, RED_LO, clamp(ny * 0.95 + 0.05, 0, 1));
  const cdx = nx - 0.5, cdy = ny - 0.42;
  const glow = clamp(1 - Math.sqrt(cdx * cdx + cdy * cdy) / 0.55, 0, 1);
  bg = mix(bg, RED, glow * 0.5);
  const vig = clamp((Math.max(Math.abs(nx - 0.5), Math.abs(ny - 0.5)) - 0.34) / 0.16, 0, 1);
  bg = mix(bg, RED_LO, vig * 0.6);
  let col = bg;

  // 金色印框（外粗 + 內細）
  const outerOn = inRR(nx, ny, 0.5, 0.5, 0.42, 0.42, 0.14);
  const outerIn = inRR(nx, ny, 0.5, 0.5, 0.402, 0.402, 0.125);
  if (outerOn && !outerIn) col = mix(GOLD, GOLD_LO, clamp(ny, 0, 1));
  const innA = inRR(nx, ny, 0.5, 0.5, 0.372, 0.372, 0.115);
  const innB = inRR(nx, ny, 0.5, 0.5, 0.362, 0.362, 0.11);
  if (innA && !innB) col = mix(GOLD, GOLD_LO, clamp(ny, 0, 1));

  // ===== 鼎 =====
  let onDing = false;
  // 雙耳（環形把手）
  for (const ex of [0.388, 0.612]) {
    const outer = inRR(nx, ny, ex, 0.305, 0.044, 0.066, 0.026);
    const inner = inRR(nx, ny, ex, 0.296, 0.020, 0.034, 0.012);
    if (outer && !inner) onDing = true;
  }
  // 鼎口（橫沿）
  if (inRR(nx, ny, 0.5, 0.368, 0.235, 0.030, 0.016)) onDing = true;
  // 鼎腹（梯形上寬下窄）+ 圓底（底寬與梯形底齊，避免腰部凸肩）
  if (inTrap(nx, ny, 0.398, 0.620, 0.5, 0.205, 0.150, 0)) onDing = true;
  if (inRR(nx, ny, 0.5, 0.618, 0.150, 0.052, 0.05)) onDing = true;
  // 三足
  if (inTrap(nx, ny, 0.616, 0.792, 0.5, 0.034, 0.020, 0)) onDing = true;           // 中足
  if (inTrap(nx, ny, 0.612, 0.788, 0.378, 0.034, 0.019, -0.050)) onDing = true;    // 左足（外撇）
  if (inTrap(nx, ny, 0.612, 0.788, 0.622, 0.034, 0.019, 0.050)) onDing = true;     // 右足（外撇）
  // 圓足
  for (const [fx, fy] of [[0.5, 0.792], [0.326, 0.788], [0.674, 0.788]]) {
    if (inRR(nx, ny, fx, fy, 0.026, 0.014, 0.012)) onDing = true;
  }
  // 腹部凹槽（裝飾分隔，挖空成背景色）
  const groove = ny > 0.470 && ny < 0.492 && Math.abs(nx - 0.5) < 0.182;

  if (onDing && !groove) {
    // 鼎身金色：上亮下暗 + 左上高光
    let g = mix(GOLD_HI, GOLD_LO, clamp((ny - 0.25) / 0.55, 0, 1));
    const hl = clamp(1 - Math.sqrt((nx - 0.40) ** 2 + (ny - 0.40) ** 2) / 0.28, 0, 1);
    g = mix(g, GOLD_HI, hl * 0.35);
    col = g;
  }
  return col;
}

function makeIcon(size, ss) {
  ss = ss || 4;
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const nx = (x + (sx + 0.5) / ss) / size;
          const ny = (y + (sy + 0.5) / ss) / size;
          const c = shade(nx, ny);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = ss * ss, i = (y * size + x) * 4;
      rgba[i] = clamp(Math.round(r / n), 0, 255);
      rgba[i + 1] = clamp(Math.round(g / n), 0, 255);
      rgba[i + 2] = clamp(Math.round(b / n), 0, 255);
      rgba[i + 3] = 255;
    }
  }
  return encodePNG(size, size, rgba);
}

const out = path.resolve(__dirname, "..");
for (const sz of [180, 192, 512]) {
  const buf = makeIcon(sz, sz >= 512 ? 3 : 4);
  const name = sz === 180 ? "apple-touch-icon.png" : `icon-${sz}.png`;
  fs.writeFileSync(path.join(out, name), buf);
  console.log("wrote", name, buf.length, "bytes");
}
