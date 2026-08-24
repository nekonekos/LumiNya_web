/* =========================================================================
 * LumiNya · Web Minecraft —— 纯前端 3D 体素游戏
 * 技术：Three.js + 程序化纹理 + 确定性噪声世界生成 + localStorage 存档
 * ========================================================================= */
import * as THREE from 'three';

/* ============================ 常量 ============================ */
const CHUNK = 16;               // 区块边长
const HEIGHT = 64;              // 世界高度
const SEA = 32;                 // 海平面
const REACH = 6;                // 交互距离
const MAX_STACK = 64;           // 堆叠上限
const SAVE_KEY = 'luminya_mc_saves';
const ATLAS_COLS = 16;

/* ============================ RNG 与噪声 ============================ */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, z) {
  let n = Math.imul(x, 374761393) + Math.imul(z, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}

class Perlin {
  constructor(seed) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    const rng = mulberry32(seed);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  _grad(hash, x, y, z) {
    z = z || 0;
    switch (hash & 15) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      case 3: return -x - y;
      case 4: return x + z;
      case 5: return -x + z;
      case 6: return x - z;
      case 7: return -x - z;
      case 8: return y + z;
      case 9: return -y + z;
      case 10: return y - z;
      case 11: return -y - z;
      case 12: return x + y;
      case 13: return -x + y;
      case 14: return y - x;
      case 15: return -y - x;
    }
    return 0;
  }
  _fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  noise2(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = this._fade(x), v = this._fade(y);
    const p = this.perm;
    const A = p[X] + Y, B = p[X + 1] + Y;
    const g = (h, dx, dy) => this._grad(h, dx, dy);
    return (
      g(p[A], x, y) * (1 - u) * (1 - v) +
      g(p[B], x - 1, y) * u * (1 - v) +
      g(p[A + 1], x, y - 1) * (1 - u) * v +
      g(p[B + 1], x - 1, y - 1) * u * v
    );
  }
  noise3(x, y, z) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = this._fade(x), v = this._fade(y), w = this._fade(z);
    const p = this.perm;
    const A = p[X] + Y, B = p[X + 1] + Y;
    const AA = p[A] + Z, AB = p[A + 1] + Z, BA = p[B] + Z, BB = p[B + 1] + Z;
    const g = this._grad;
    return (
      g(p[AA], x, y, z) * (1 - u) * (1 - v) * (1 - w) +
      g(p[BA], x - 1, y, z) * u * (1 - v) * (1 - w) +
      g(p[AB], x, y - 1, z) * (1 - u) * v * (1 - w) +
      g(p[BB], x - 1, y - 1, z) * u * v * (1 - w) +
      g(p[AA + 1], x, y, z - 1) * (1 - u) * (1 - v) * w +
      g(p[BA + 1], x - 1, y, z - 1) * u * (1 - v) * w +
      g(p[AB + 1], x, y - 1, z - 1) * (1 - u) * v * w +
      g(p[BB + 1], x - 1, y - 1, z - 1) * u * v * w
    );
  }
}

/* ============================ 方块 ID ============================ */
const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, COBBLE = 4, PLANK = 5, LOG = 6,
  LEAVES = 7, SAND = 8, GRAVEL = 9, WATER = 10, GLASS = 11, BRICK = 12, SNOW = 13,
  BEDROCK = 14, COAL_ORE = 15, IRON_ORE = 16, GOLD_ORE = 17, DIAMOND_ORE = 18,
  CRAFTING = 19, FURNACE = 20, TORCH = 21, STONE_BRICK = 22, SANDSTONE = 23,
  POPPY = 24, DANDELION = 25, TALL_GRASS = 26, SNOW_GRASS = 27;
// 红石系统方块（门除外）
const RS_WIRE = 28, RS_TORCH = 29, RS_BLOCK = 30, RS_REPEATER = 31, RS_COMPARATOR = 32,
  RS_LEVER = 33, RS_BUTTON = 34, RS_PLATE = 35, RS_PISTON = 36, RS_STICKY = 37,
  RS_OBSERVER = 38, RS_TNT = 39, RS_LAMP = 40;
const STICK = 100;

/* ============================ 纹理生成 ============================ */
function makeTile(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const ctx = c.getContext('2d');
  draw(ctx);
  return c;
}
function px(ctx, x, y, color) { ctx.fillStyle = color; ctx.fillRect(x, y, 1, 1); }
function hex(h) { return '#' + h.toString(16).padStart(6, '0'); }
function shadeHex(hexStr, amt) {
  const n = parseInt(hexStr.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r * amt)));
  g = Math.max(0, Math.min(255, Math.round(g * amt)));
  b = Math.max(0, Math.min(255, Math.round(b * amt)));
  return hex((r << 16) | (g << 8) | b);
}
function noiseFill(ctx, base, variance, seed, alpha = 1) {
  const rng = mulberry32(seed);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const a = (rng() - 0.5) * 2 * variance;
    ctx.fillStyle = shadeHex(base, 1 + a);
    ctx.globalAlpha = alpha;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.globalAlpha = 1;
}

const TILE_NAMES = [
  'grass_top', 'grass_side', 'dirt', 'stone', 'cobble', 'plank', 'log_side', 'log_top',
  'leaves', 'sand', 'gravel', 'water', 'glass', 'brick', 'snow', 'bedrock',
  'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'craft_top', 'craft_side',
  'furnace_side', 'furnace_top', 'torch', 'stone_brick', 'sandstone_top', 'sandstone_side',
  'poppy', 'dandelion', 'tall_grass', 'stick',
  // 红石方块纹理
  'rs_wire_off', 'rs_wire_on', 'rs_torch_off', 'rs_torch_on', 'rs_block',
  'rs_repeater_off', 'rs_repeater_on', 'rs_comparator', 'rs_lever', 'rs_button',
  'rs_plate', 'piston_top', 'piston_side', 'piston_bottom', 'sticky_top',
  'observer_side', 'observer_back', 'observer_front', 'tnt_side', 'tnt_top', 'tnt_bottom',
  'rs_lamp_off', 'rs_lamp_on'
];

function buildTiles() {
  const t = {};
  t.grass_top = makeTile(ctx => noiseFill(ctx, '#57b64a', 0.16, 101));
  t.grass_side = makeTile(ctx => {
    noiseFill(ctx, '#7a5632', 0.18, 102);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) {
      const rng = mulberry32(101 + x * 7 + y * 13);
      px(ctx, x, y, shadeHex('#57b64a', 1 + (rng() - 0.5) * 0.3));
    }
  });
  t.dirt = makeTile(ctx => noiseFill(ctx, '#7a5632', 0.2, 103));
  t.stone = makeTile(ctx => noiseFill(ctx, '#8a8a8a', 0.12, 104));
  t.cobble = makeTile(ctx => {
    noiseFill(ctx, '#777777', 0.14, 105);
    ctx.fillStyle = '#5e5e5e';
    const blobs = [[1, 1], [8, 2], [4, 6], [12, 5], [2, 11], [9, 10], [13, 12], [5, 14]];
    for (const [bx, by] of blobs) { ctx.fillRect(bx, by, 4, 3); ctx.fillStyle = '#6b6b6b'; }
    ctx.fillStyle = '#949494';
    for (const [bx, by] of blobs) { ctx.fillRect(bx + 1, by + 1, 2, 1); }
  });
  t.plank = makeTile(ctx => {
    noiseFill(ctx, '#9c6b3f', 0.12, 106);
    ctx.fillStyle = '#6e4725';
    for (let y = 0; y < 16; y += 4) ctx.fillRect(0, y, 16, 1);
    ctx.fillStyle = '#b58154';
    for (let y = 1; y < 16; y += 4) ctx.fillRect(0, y, 16, 1);
    ctx.fillStyle = '#6e4725';
    ctx.fillRect(8, 0, 1, 4); ctx.fillRect(4, 4, 1, 4); ctx.fillRect(12, 8, 1, 4); ctx.fillRect(6, 12, 1, 4);
  });
  t.log_side = makeTile(ctx => {
    noiseFill(ctx, '#5c432a', 0.14, 107);
    for (let x = 0; x < 16; x += 2) { ctx.fillStyle = shadeHex('#5c432a', 1.12); ctx.fillRect(x, 0, 1, 16); }
  });
  t.log_top = makeTile(ctx => {
    noiseFill(ctx, '#8a6a42', 0.1, 108);
    ctx.strokeStyle = '#6a4f2d'; ctx.lineWidth = 1;
    for (let r = 3; r < 10; r += 2) { ctx.beginPath(); ctx.arc(7.5, 7.5, r, 0, Math.PI * 2); ctx.stroke(); }
  });
  t.leaves = makeTile(ctx => {
    const rng = mulberry32(109);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (rng() < 0.16) continue; // 透明空洞
      ctx.fillStyle = shadeHex('#3d7a2e', 1 + (rng() - 0.5) * 0.5);
      ctx.fillRect(x, y, 1, 1);
    }
  });
  t.sand = makeTile(ctx => noiseFill(ctx, '#dbd29a', 0.1, 110));
  t.gravel = makeTile(ctx => {
    noiseFill(ctx, '#8b7f70', 0.2, 111);
    const rng = mulberry32(111);
    for (let i = 0; i < 22; i++) { const g = 80 + Math.floor(rng() * 70); px(ctx, Math.floor(rng() * 16), Math.floor(rng() * 16), hex((g << 16) | (g << 8) | g)); }
  });
  t.water = makeTile(ctx => noiseFill(ctx, '#3866d8', 0.12, 112));
  t.glass = makeTile(ctx => {
    ctx.clearRect(0, 0, 16, 16);
    ctx.strokeStyle = 'rgba(220,235,255,0.9)'; ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, 15, 15);
    ctx.fillStyle = 'rgba(210,230,255,0.25)';
    ctx.fillRect(1, 1, 4, 4); ctx.fillRect(10, 10, 4, 4);
  });
  t.brick = makeTile(ctx => {
    noiseFill(ctx, '#a5503a', 0.12, 113);
    ctx.fillStyle = '#c9c2b8';
    ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 7, 16, 1); ctx.fillRect(0, 15, 16, 1);
    ctx.fillRect(0, 0, 1, 4); ctx.fillRect(8, 0, 1, 4); ctx.fillRect(4, 4, 1, 4); ctx.fillRect(12, 4, 1, 4);
  });
  t.snow = makeTile(ctx => noiseFill(ctx, '#eef4f7', 0.08, 114));
  t.bedrock = makeTile(ctx => {
    noiseFill(ctx, '#2e2e2e', 0.4, 115);
    const rng = mulberry32(115);
    for (let i = 0; i < 30; i++) { const g = Math.floor(rng() * 160); px(ctx, Math.floor(rng() * 16), Math.floor(rng() * 16), hex((g << 16) | (g << 8) | g)); }
  });
  t.coal_ore = makeTile(ctx => { noiseFill(ctx, '#8a8a8a', 0.12, 116); oreBlobs(ctx, '#222222', 116); });
  t.iron_ore = makeTile(ctx => { noiseFill(ctx, '#8a8a8a', 0.12, 117); oreBlobs(ctx, '#d8b59a', 117); });
  t.gold_ore = makeTile(ctx => { noiseFill(ctx, '#8a8a8a', 0.12, 118); oreBlobs(ctx, '#f2d24b', 118); });
  t.diamond_ore = makeTile(ctx => { noiseFill(ctx, '#8a8a8a', 0.12, 119); oreBlobs(ctx, '#5ce0dc', 119); });
  t.craft_top = makeTile(ctx => {
    noiseFill(ctx, '#9c6b3f', 0.1, 120);
    ctx.fillStyle = '#6e4725'; ctx.fillRect(4, 4, 8, 1); ctx.fillRect(4, 11, 8, 1); ctx.fillRect(4, 4, 1, 8); ctx.fillRect(11, 4, 1, 8);
  });
  t.craft_side = makeTile(ctx => {
    noiseFill(ctx, '#9c6b3f', 0.1, 121);
    ctx.fillStyle = '#6e4725';
    ctx.fillRect(2, 6, 8, 2); ctx.fillRect(10, 6, 2, 6); ctx.fillRect(2, 12, 3, 2);
    ctx.fillStyle = '#c9c2b8'; ctx.fillRect(3, 7, 3, 1);
  });
  t.furnace_side = makeTile(ctx => { noiseFill(ctx, '#777777', 0.13, 122); ctx.fillStyle = '#333333'; ctx.fillRect(4, 5, 8, 8); ctx.fillStyle = '#111111'; ctx.fillRect(5, 6, 6, 6); });
  t.furnace_top = makeTile(ctx => noiseFill(ctx, '#777777', 0.13, 123));
  t.torch = makeTile(ctx => {
    ctx.fillStyle = '#6e4725'; ctx.fillRect(7, 8, 2, 8);
    ctx.fillStyle = '#e8862a'; ctx.fillRect(5, 2, 6, 3);
    ctx.fillStyle = '#f7d24b'; ctx.fillRect(6, 4, 4, 3);
    ctx.fillStyle = '#fff3b0'; ctx.fillRect(7, 5, 2, 2);
  });
  t.stone_brick = makeTile(ctx => {
    noiseFill(ctx, '#7d7d7d', 0.1, 124);
    ctx.fillStyle = '#5b5b5b';
    ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 8, 16, 1); ctx.fillRect(0, 0, 1, 16); ctx.fillRect(8, 0, 1, 16);
  });
  t.sandstone_top = makeTile(ctx => { noiseFill(ctx, '#d8cf9a', 0.08, 125); ctx.fillStyle = '#b8ad7b'; ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 15, 16, 1); });
  t.sandstone_side = makeTile(ctx => {
    noiseFill(ctx, '#d8cf9a', 0.08, 126);
    ctx.fillStyle = '#b8ad7b';
    for (let y = 0; y < 16; y += 4) ctx.fillRect(0, y, 16, 1);
  });
  t.poppy = makeTile(ctx => {
    ctx.fillStyle = '#3d7a2e'; ctx.fillRect(7, 10, 2, 6);
    ctx.fillStyle = '#c93838';
    ctx.fillRect(4, 4, 4, 4); ctx.fillRect(9, 4, 3, 4); ctx.fillRect(5, 8, 2, 3); ctx.fillRect(9, 8, 2, 3);
    ctx.fillStyle = '#222222'; ctx.fillRect(6, 6, 1, 1);
  });
  t.dandelion = makeTile(ctx => {
    ctx.fillStyle = '#3d7a2e'; ctx.fillRect(7, 9, 2, 7);
    ctx.fillStyle = '#f2d24b';
    ctx.fillRect(5, 5, 6, 2); ctx.fillRect(6, 4, 4, 2); ctx.fillRect(6, 6, 4, 1);
  });
  t.tall_grass = makeTile(ctx => {
    const rng = mulberry32(127);
    for (let i = 0; i < 9; i++) {
      const gx = 3 + Math.floor(rng() * 10);
      ctx.fillStyle = shadeHex('#4d8a3a', 1 + (rng() - 0.5) * 0.5);
      ctx.fillRect(gx, 2 + Math.floor(rng() * 2), 1, 12);
    }
  });
  t.stick = makeTile(ctx => {
    ctx.fillStyle = '#9c6b3f';
    for (let i = 0; i < 16; i++) { const off = (i % 3) - 1; px(ctx, i, 4 + Math.max(0, Math.min(10, Math.floor(i * 0.7) + off)), '#9c6b3f'); }
    ctx.fillStyle = '#7a4e28'; ctx.fillRect(8, 7, 2, 2);
  });
  // ---- 红石纹理 ----
  t.rs_wire_off = makeTile(ctx => {
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = '#5a1f16'; // 深红，低亮度
    for (const [x, y] of [[1, 8], [4, 4], [8, 11], [12, 3], [6, 14], [14, 8], [3, 12], [11, 6]]) ctx.fillRect(x, y, 2, 2);
  });
  t.rs_wire_on = makeTile(ctx => {
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = '#e0342c'; // 亮红
    for (const [x, y] of [[1, 8], [4, 4], [8, 11], [12, 3], [6, 14], [14, 8], [3, 12], [11, 6]]) ctx.fillRect(x, y, 2, 2);
    ctx.fillStyle = '#ff7a66';
    for (const [x, y] of [[2, 9], [5, 5], [9, 12], [13, 4]]) ctx.fillRect(x, y, 1, 1);
  });
  t.rs_torch_off = makeTile(ctx => {
    ctx.fillStyle = '#5c3a1e'; ctx.fillRect(7, 6, 2, 10);
    ctx.fillStyle = '#7a1f1f'; ctx.fillRect(5, 2, 6, 3);
    ctx.fillStyle = '#552525'; ctx.fillRect(6, 3, 4, 2);
  });
  t.rs_torch_on = makeTile(ctx => {
    ctx.fillStyle = '#5c3a1e'; ctx.fillRect(7, 6, 2, 10);
    ctx.fillStyle = '#ff5b4d'; ctx.fillRect(5, 2, 6, 3);
    ctx.fillStyle = '#ffd9a0'; ctx.fillRect(6, 3, 4, 2);
  });
  t.rs_block = makeTile(ctx => noiseFill(ctx, '#a8322b', 0.15, 128));
  t.rs_repeater_off = makeTile(ctx => { noiseFill(ctx, '#7a7a7a', 0.12, 129); ctx.fillStyle = '#3a3a3a'; ctx.fillRect(5, 5, 6, 2); ctx.fillRect(5, 9, 6, 2); ctx.fillStyle = '#d0342c'; ctx.fillRect(7, 7, 2, 2); });
  t.rs_repeater_on = makeTile(ctx => { noiseFill(ctx, '#7a7a7a', 0.12, 130); ctx.fillStyle = '#3a3a3a'; ctx.fillRect(5, 5, 6, 2); ctx.fillRect(5, 9, 6, 2); ctx.fillStyle = '#ff5b4d'; ctx.fillRect(7, 7, 2, 2); });
  t.rs_comparator = makeTile(ctx => { noiseFill(ctx, '#7a7a7a', 0.12, 131); ctx.fillStyle = '#d0342c'; ctx.fillRect(4, 6, 4, 2); ctx.fillRect(8, 6, 2, 4); ctx.fillStyle = '#f2d24b'; ctx.fillRect(3, 5, 2, 4); });
  t.rs_lever = makeTile(ctx => { noiseFill(ctx, '#9c6b3f', 0.12, 132); ctx.fillStyle = '#d8d8d8'; ctx.fillRect(3, 4, 6, 3); ctx.fillRect(4, 7, 4, 2); ctx.fillRect(7, 9, 2, 4); });
  t.rs_button = makeTile(ctx => { noiseFill(ctx, '#9c6b3f', 0.12, 133); ctx.fillStyle = '#7a4e28'; ctx.fillRect(4, 5, 8, 6); ctx.fillStyle = '#e8e8e8'; ctx.fillRect(6, 7, 4, 2); });
  t.rs_plate = makeTile(ctx => { noiseFill(ctx, '#b0b0b0', 0.1, 134); ctx.fillStyle = '#d8d8d8'; ctx.fillRect(4, 5, 8, 6); });
  t.piston_top = makeTile(ctx => { noiseFill(ctx, '#9a6b3f', 0.12, 135); ctx.fillStyle = '#c9c2b8'; ctx.fillRect(3, 3, 10, 10); ctx.fillStyle = '#9a6b3f'; ctx.fillRect(6, 6, 4, 4); });
  t.piston_side = makeTile(ctx => { noiseFill(ctx, '#8a8a8a', 0.12, 136); ctx.fillStyle = '#c9c2b8'; ctx.fillRect(4, 4, 8, 8); ctx.fillStyle = '#8a8a8a'; ctx.fillRect(6, 6, 4, 4); });
  t.piston_bottom = makeTile(ctx => noiseFill(ctx, '#8a8a8a', 0.15, 137));
  t.sticky_top = makeTile(ctx => { noiseFill(ctx, '#4a7a3a', 0.12, 138); ctx.fillStyle = '#8fd47a'; ctx.fillRect(3, 3, 10, 10); ctx.fillStyle = '#4a7a3a'; ctx.fillRect(6, 6, 4, 4); });
  t.observer_side = makeTile(ctx => noiseFill(ctx, '#7a7a7a', 0.12, 139));
  t.observer_back = makeTile(ctx => { noiseFill(ctx, '#5c5c5c', 0.12, 140); ctx.fillStyle = '#d0342c'; ctx.fillRect(5, 5, 6, 6); });
  t.observer_front = makeTile(ctx => { noiseFill(ctx, '#4a4a4a', 0.12, 141); ctx.fillStyle = '#111111'; ctx.fillRect(4, 4, 8, 8); ctx.fillStyle = '#f2d24b'; ctx.fillRect(6, 6, 4, 4); });
  t.tnt_side = makeTile(ctx => { noiseFill(ctx, '#c0392b', 0.15, 142); ctx.fillStyle = '#fdf5e6'; ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 5, 16, 1); ctx.fillRect(0, 10, 16, 1); ctx.fillRect(0, 15, 16, 1); ctx.fillRect(0, 0, 1, 16); ctx.fillRect(7, 0, 1, 16); ctx.fillRect(15, 0, 1, 16); });
  t.tnt_top = makeTile(ctx => { noiseFill(ctx, '#c0392b', 0.15, 143); ctx.fillStyle = '#fdf5e6'; ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 15, 16, 1); ctx.fillRect(0, 0, 1, 16); ctx.fillRect(15, 0, 1, 16); ctx.fillStyle = '#8b1a10'; ctx.fillRect(6, 6, 4, 4); });
  t.tnt_bottom = makeTile(ctx => noiseFill(ctx, '#8b1a10', 0.2, 144));
  t.rs_lamp_off = makeTile(ctx => { noiseFill(ctx, '#6b4a1e', 0.12, 145); ctx.fillStyle = '#8a6b3f'; ctx.fillRect(3, 3, 10, 10); ctx.fillStyle = '#5c3a1e'; ctx.fillRect(5, 5, 6, 6); });
  t.rs_lamp_on = makeTile(ctx => { noiseFill(ctx, '#d8b45a', 0.12, 146); ctx.fillStyle = '#f7e2a0'; ctx.fillRect(3, 3, 10, 10); ctx.fillStyle = '#fff3c0'; ctx.fillRect(5, 5, 6, 6); });
  return t;
}
function oreBlobs(ctx, color, seed) {
  const rng = mulberry32(seed);
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(rng() * 12), y = Math.floor(rng() * 12);
    ctx.fillStyle = color; ctx.fillRect(x, y, 3, 3);
    ctx.fillStyle = shadeHex(color, 0.8); ctx.fillRect(x + 1, y + 1, 1, 1);
  }
}

/* ============================ 方块注册表 ============================ */
const T = {};
TILE_NAMES.forEach((n, i) => { T[n] = i; });

const BLOCKS = {
  [GRASS]: { name: '草方块', top: T.grass_top, side: T.grass_side, bottom: T.dirt, solid: true },
  [DIRT]: { name: '泥土', top: T.dirt, side: T.dirt, bottom: T.dirt, solid: true },
  [STONE]: { name: '石头', top: T.stone, side: T.stone, bottom: T.stone, solid: true },
  [COBBLE]: { name: '圆石', top: T.cobble, side: T.cobble, bottom: T.cobble, solid: true },
  [PLANK]: { name: '木板', top: T.plank, side: T.plank, bottom: T.plank, solid: true },
  [LOG]: { name: '原木', top: T.log_top, side: T.log_side, bottom: T.log_top, solid: true },
  [LEAVES]: { name: '树叶', top: T.leaves, side: T.leaves, bottom: T.leaves, solid: true, cutout: true },
  [SAND]: { name: '沙子', top: T.sand, side: T.sand, bottom: T.sand, solid: true },
  [GRAVEL]: { name: '沙砾', top: T.gravel, side: T.gravel, bottom: T.gravel, solid: true },
  [WATER]: { name: '水', top: T.water, side: T.water, bottom: T.water, transparent: true, liquid: true },
  [GLASS]: { name: '玻璃', top: T.glass, side: T.glass, bottom: T.glass, solid: true, transparent: true },
  [BRICK]: { name: '红砖块', top: T.brick, side: T.brick, bottom: T.brick, solid: true },
  [SNOW]: { name: '雪块', top: T.snow, side: T.snow, bottom: T.snow, solid: true },
  [BEDROCK]: { name: '基岩', top: T.bedrock, side: T.bedrock, bottom: T.bedrock, solid: true, unbreakable: true },
  [COAL_ORE]: { name: '煤矿石', top: T.coal_ore, side: T.coal_ore, bottom: T.coal_ore, solid: true },
  [IRON_ORE]: { name: '铁矿石', top: T.iron_ore, side: T.iron_ore, bottom: T.iron_ore, solid: true },
  [GOLD_ORE]: { name: '金矿石', top: T.gold_ore, side: T.gold_ore, bottom: T.gold_ore, solid: true },
  [DIAMOND_ORE]: { name: '钻石矿石', top: T.diamond_ore, side: T.diamond_ore, bottom: T.diamond_ore, solid: true },
  [CRAFTING]: { name: '工作台', top: T.craft_top, side: T.craft_side, bottom: T.plank, solid: true },
  [FURNACE]: { name: '熔炉', top: T.furnace_top, side: T.furnace_side, bottom: T.furnace_top, solid: true },
  [TORCH]: { name: '火把', top: T.torch, side: T.torch, bottom: T.torch, cross: true },
  [STONE_BRICK]: { name: '石砖', top: T.stone_brick, side: T.stone_brick, bottom: T.stone_brick, solid: true },
  [SANDSTONE]: { name: '砂岩', top: T.sandstone_top, side: T.sandstone_side, bottom: T.sandstone_top, solid: true },
  [POPPY]: { name: '虞美人', top: T.poppy, side: T.poppy, bottom: T.poppy, cross: true },
  [DANDELION]: { name: '蒲公英', top: T.dandelion, side: T.dandelion, bottom: T.dandelion, cross: true },
  [TALL_GRASS]: { name: '草丛', top: T.tall_grass, side: T.tall_grass, bottom: T.tall_grass, cross: true },
  [SNOW_GRASS]: { name: '雪草方块', top: T.snow, side: T.grass_side, bottom: T.dirt, solid: true },
  // 红石方块
  [RS_WIRE]: { name: '红石粉', top: T.rs_wire_off, side: T.rs_wire_off, bottom: T.rs_wire_off, redstone: true, wire: true },
  [RS_TORCH]: { name: '红石火把', top: T.rs_torch_off, side: T.rs_torch_off, bottom: T.rs_torch_off, redstone: true, cross: true, torch: true },
  [RS_BLOCK]: { name: '红石块', top: T.rs_block, side: T.rs_block, bottom: T.rs_block, solid: true, redstone: true, alwaysPowered: true },
  [RS_REPEATER]: { name: '红石中继器', top: T.rs_repeater_off, side: T.rs_repeater_off, bottom: T.rs_repeater_off, redstone: true, repeater: true },
  [RS_COMPARATOR]: { name: '红石比较器', top: T.rs_comparator, side: T.rs_comparator, bottom: T.rs_comparator, redstone: true, comparator: true },
  [RS_LEVER]: { name: '拉杆', top: T.rs_lever, side: T.rs_lever, bottom: T.rs_lever, redstone: true, cross: true, lever: true },
  [RS_BUTTON]: { name: '按钮', top: T.rs_button, side: T.rs_button, bottom: T.rs_button, redstone: true, button: true },
  [RS_PLATE]: { name: '压力板', top: T.rs_plate, side: T.rs_plate, bottom: T.rs_plate, redstone: true, plate: true },
  [RS_PISTON]: { name: '活塞', top: T.piston_top, side: T.piston_side, bottom: T.piston_bottom, solid: true, redstone: true, piston: true },
  [RS_STICKY]: { name: '粘性活塞', top: T.sticky_top, side: T.piston_side, bottom: T.piston_bottom, solid: true, redstone: true, piston: true, sticky: true },
  [RS_OBSERVER]: { name: '侦测器', top: T.observer_side, side: T.observer_side, bottom: T.observer_side, solid: true, redstone: true, observer: true },
  [RS_TNT]: { name: 'TNT', top: T.tnt_top, side: T.tnt_side, bottom: T.tnt_bottom, solid: true, redstone: true, tnt: true },
  [RS_LAMP]: { name: '红石灯', top: T.rs_lamp_off, side: T.rs_lamp_off, bottom: T.rs_lamp_off, solid: true, redstone: true, lamp: true },
};

const ITEMS = {
  [STICK]: { name: '木棍', iconTile: T.stick },
};
const ITEM_NAMES = {};
for (const id in BLOCKS) ITEM_NAMES[id] = BLOCKS[id].name;
ITEM_NAMES[STICK] = '木棍';

function itemName(id) { return ITEM_NAMES[id] || '未知'; }
function isSolid(id) { const b = BLOCKS[id]; return !!b && b.solid; }
function isOpaque(id) { const b = BLOCKS[id]; return !!b && b.solid && !b.transparent && !b.cutout; }

/* ============================ 纹理图集 ============================ */
let atlas, tileCanvases, TILE_MAP = {};
function buildAtlas() {
  tileCanvases = buildTiles();
  const rows = Math.ceil(TILE_NAMES.length / ATLAS_COLS);
  atlas = document.createElement('canvas');
  atlas.width = ATLAS_COLS * 16;
  atlas.height = rows * 16;
  const ctx = atlas.getContext('2d');
  TILE_NAMES.forEach((name, i) => {
    const col = i % ATLAS_COLS, row = Math.floor(i / ATLAS_COLS);
    ctx.drawImage(tileCanvases[name], col * 16, row * 16);
    TILE_MAP[name] = i;
  });
  TILE_NAMES.forEach((n, i) => { T[n] = i; });
}

/* ============================ 物品图标（伪 3D） ============================ */
const iconCache = {};
function cubeIcon(topTile, sideTile, bottomTile) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const face = (tile, p0, p1, p3, dark) => {
    const a = p1[0] - p0[0], b = p1[1] - p0[1];
    const cc = p3[0] - p0[0], d = p3[1] - p0[1];
    ctx.save();
    ctx.setTransform(a, b, cc, d, p0[0], p0[1]);
    ctx.drawImage(tile, 0, 0, 16, 16, 0, 0, 1, 1);
    if (dark > 0) { ctx.fillStyle = `rgba(0,0,0,${dark})`; ctx.fillRect(0, 0, 1, 1); }
    ctx.restore();
  };
  face(sideTile, [1, 3], [8, 6], [1, 11], 0.18);
  face(sideTile, [8, 6], [15, 3], [8, 14], 0.38);
  face(topTile, [8, 0], [15, 3], [1, 3], 0);
  return c;
}
function itemIcon(id) {
  if (iconCache[id]) return iconCache[id];
  let icon;
  if (id === STICK) {
    icon = document.createElement('canvas');
    icon.width = icon.height = 16;
    icon.getContext('2d').drawImage(tileCanvases[TILE_NAMES[T.stick]], 0, 0);
  } else {
    const b = BLOCKS[id];
    if (!b) return null;
    if (b.cross) {
      icon = document.createElement('canvas');
      icon.width = icon.height = 16;
      icon.getContext('2d').drawImage(tileCanvases[TILE_NAMES[b.top]], 0, 0);
    } else {
      icon = cubeIcon(tileCanvases[TILE_NAMES[b.top]], tileCanvases[TILE_NAMES[b.side]], tileCanvases[TILE_NAMES[b.bottom]]);
    }
  }
  iconCache[id] = icon;
  return icon;
}

/* ============================ 合成配方 ============================ */
// 创造模式已移除合成台；giveItem 仅供 /give 指令使用。

/* ============================ 世界数据 ============================ */
const chunks = new Map();        // key "cx,cz" -> chunk
const editsByChunk = new Map();  // key -> Map(localIdx -> blockId)
let noise = null;
let worldSeed = 0;
let player = { x: 8, y: 40, z: 8, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, onGround: false, flying: false };
let inventory = new Array(9).fill(null);
let hotbarSel = 0;
let renderDistance = 4;

const ckey = (cx, cz) => cx + ',' + cz;
const cidx = (lx, ly, lz) => (ly * CHUNK + lz) * CHUNK + lx;

/* ============================ 红石状态 ============================ */
// 每方块状态：power(0-15)、facing(0-3)、extra(开/关、延时等)。用 Map 按 "x,y,z" 存取，节省内存。
const rsState = new Map();
let rsTickQueue = [];  // 待处理的刻事件 {t, x, y, z, type}
let rsTime = 0;
const RS_DIRS = [
  [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0],
];
function rsKey(x, y, z) { return x + ',' + y + ',' + z; }
function rsGet(x, y, z) {
  return rsState.get(rsKey(x, y, z));
}
function rsSet(x, y, z, partial) {
  const k = rsKey(x, y, z);
  const s = rsState.get(k) || { power: 0, facing: 0, on: false };
  Object.assign(s, partial);
  rsState.set(k, s);
  return s;
}
function rsDel(x, y, z) { rsState.delete(rsKey(x, y, z)); }

/* 方块朝向（放置时根据玩家视角确定，0:+X 1:-X 2:+Z 3:-Z 4:+Y 5:-Y） */
function facingFromDir(dx, dy, dz) {
  if (dy === 1) return 4;
  if (dy === -1) return 5;
  if (dx === 1) return 0;
  if (dx === -1) return 1;
  if (dz === 1) return 2;
  return 3;
}
const FACING_VEC = [
  [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0],
];

function getChunk(cx, cz) { return chunks.get(ckey(cx, cz)); }

function getBlock(x, y, z) {
  if (y < 0 || y >= HEIGHT) return AIR;
  const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
  const chunk = chunks.get(ckey(cx, cz));
  if (!chunk || !chunk.generated) return AIR;
  const lx = x - cx * CHUNK, lz = z - cz * CHUNK, ly = y;
  return chunk.data[cidx(lx, ly, lz)];
}

function setBlock(x, y, z, id) {
  if (y < 0 || y >= HEIGHT) return;
  const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
  const chunk = chunks.get(ckey(cx, cz));
  if (!chunk) return;
  const lx = x - cx * CHUNK, lz = z - cz * CHUNK, ly = y;
  const li = cidx(lx, ly, lz);
  const old = chunk.data[li];
  chunk.data[li] = id;
  chunk.dirty = true;
  let em = editsByChunk.get(ckey(cx, cz));
  if (!em) { em = new Map(); editsByChunk.set(ckey(cx, cz), em); }
  em.set(li, id);
  // 边界相邻区块重算网格
  if (lx === 0) markDirty(cx - 1, cz);
  if (lx === CHUNK - 1) markDirty(cx + 1, cz);
  if (lz === 0) markDirty(cx, cz - 1);
  if (lz === CHUNK - 1) markDirty(cx, cz + 1);
  // 红石：旧方块移除状态，新方块初始化状态，并通知周围
  if (old !== id) {
    if (old && BLOCKS[old] && BLOCKS[old].redstone) rsDel(x, y, z);
    if (id && BLOCKS[id] && BLOCKS[id].redstone && !rsGet(x, y, z)) {
      rsSet(x, y, z, { power: 0, facing: 0, on: false });
    }
    rsOnBlockChange(x, y, z);
    // 侦测器检测到相邻方块变化
    notifyObservers(x, y, z);
  }
}
function markDirty(cx, cz) {
  const c = chunks.get(ckey(cx, cz));
  if (c && c.generated) c.dirty = true;
}
function markBlockDirty(x, y, z) {
  markDirty(Math.floor(x / CHUNK), Math.floor(z / CHUNK));
  // 相邻区块也可能受影响
  if ((x & (CHUNK - 1)) === 0) markDirty(Math.floor(x / CHUNK) - 1, Math.floor(z / CHUNK));
  if ((x & (CHUNK - 1)) === CHUNK - 1) markDirty(Math.floor(x / CHUNK) + 1, Math.floor(z / CHUNK));
  if ((z & (CHUNK - 1)) === 0) markDirty(Math.floor(x / CHUNK), Math.floor(z / CHUNK) - 1);
  if ((z & (CHUNK - 1)) === CHUNK - 1) markDirty(Math.floor(x / CHUNK), Math.floor(z / CHUNK) + 1);
}

/* ============================ 红石引擎 ============================ */
// 是否是可被红石信号"充能"的方块（非空气、非液体）
function isRsConductor(id) {
  return id !== AIR && id !== WATER && !(BLOCKS[id] && BLOCKS[id].cross);
}
// 该方块是否输出强充能（红石块、激活的拉杆等）
function isStrongPowered(x, y, z) {
  const id = getBlock(x, y, z);
  const def = BLOCKS[id];
  if (!def) return false;
  if (def.alwaysPowered) return true;
  const s = rsGet(x, y, z);
  if (def.lever && s && s.on) return true;
  return false;
}
// 计算某方块接收到的红石信号强度（忽略来自排除方向）
function computeInputPower(x, y, z) {
  const id = getBlock(x, y, z);
  const def = BLOCKS[id];
  let best = 0;
  // 六个方向
  for (let d = 0; d < 6; d++) {
    const [dx, dy, dz] = RS_DIRS[d];
    const nx = x + dx, ny = y + dy, nz = z + dz;
    const nid = getBlock(nx, ny, nz);
    const nd = BLOCKS[nid];
    if (!nd) continue;
    let p = 0;
    if (nd.wire) {
      const ns = rsGet(nx, ny, nz);
      if (ns && ns.power > 0 && ns.power > best) best = ns.power;
    } else if (nd.alwaysPowered) {
      best = 15;
    } else if (nd.lever || nd.button || nd.plate) {
      const ns = rsGet(nx, ny, nz);
      if (ns && ns.on) best = 15;
    } else if (nd.torch) {
      const ns = rsGet(nx, ny, nz);
      if (ns && ns.on) best = 15;
    } else if (nd.repeater || nd.comparator) {
      const ns = rsGet(nx, ny, nz);
      // 中继器/比较器只向 facing 方向输出
      if (ns && ns.on && FACING_VEC[ns.facing] && FACING_VEC[ns.facing][0] === -dx && FACING_VEC[ns.facing][1] === -dy && FACING_VEC[ns.facing][2] === -dz) {
        best = Math.max(best, ns.power || 15);
      }
    } else if (nd.observer) {
      const ns = rsGet(nx, ny, nz);
      if (ns && ns.on && FACING_VEC[ns.facing] && FACING_VEC[ns.facing][0] === -dx && FACING_VEC[ns.facing][1] === -dy && FACING_VEC[ns.facing][2] === -dz) {
        best = 15;
      }
    } else if (nd.piston) {
      // 活塞可被强充能方块驱动（弱充能忽略，简化：只认前方方块直接输出）
    }
  }
  return best;
}

// 红石火把/中继器等的输入：仅考虑其"背面"（与 facing 相反）的输入
function computeFacingInput(x, y, z, facing) {
  const [dx, dy, dz] = FACING_VEC[facing];
  const bx = x - dx, by = y - dy, bz = z - dz;
  const nid = getBlock(bx, by, bz);
  const nd = BLOCKS[nid];
  if (!nd) return 0;
  if (nd.wire) { const s = rsGet(bx, by, bz); return s ? s.power : 0; }
  if (nd.alwaysPowered) return 15;
  if (nd.lever || nd.button || nd.plate || nd.torch) { const s = rsGet(bx, by, bz); return (s && s.on) ? 15 : 0; }
  // 背面的普通方块若被强充能
  if (isStrongPowered(bx, by, bz)) return 15;
  return 0;
}

// 更新一个红石组件的输出（返回是否发生变化）
function updateRsComponent(x, y, z) {
  const id = getBlock(x, y, z);
  const def = BLOCKS[id];
  if (!def || !def.redstone) return false;
  let changed = false;
  if (def.alwaysPowered) return false; // 恒定输出
  if (def.wire) {
    // 红石粉：直接读取输入
    const p = computeInputPower(x, y, z);
    const s = rsGet(x, y, z) || rsSet(x, y, z, { power: 0 });
    if (s.power !== p) { s.power = p; changed = true; }
  } else if (def.torch) {
    const p = computeFacingInput(x, y, z, (rsGet(x, y, z) || { facing: 0 }).facing);
    const s = rsGet(x, y, z) || rsSet(x, y, z, { facing: 0, on: false });
    const on = p === 0; // 红石火把在输入为 0 时点亮
    if (s.on !== on) { s.on = on; changed = true; }
  } else if (def.repeater || def.comparator) {
    const s = rsGet(x, y, z) || rsSet(x, y, z, { facing: 0, on: false, power: 0 });
    const p = computeFacingInput(x, y, z, s.facing);
    const on = p > 0;
    if (s.on !== on) { s.on = on; s.power = on ? 15 : 0; changed = true; }
  } else if (def.observer) {
    const s = rsGet(x, y, z) || rsSet(x, y, z, { facing: 0, on: false });
    // 侦测器由 tick 触发，这里仅维持
  } else if (def.lamp) {
    const p = computeInputPower(x, y, z);
    const s = rsGet(x, y, z) || rsSet(x, y, z, { on: false });
    const on = p > 0;
    if (s.on !== on) { s.on = on; changed = true; }
  } else if (def.tnt) {
    // TNT 被充能即引爆（延迟一小段以模拟引信）
    const p = computeInputPower(x, y, z);
    const s = rsGet(x, y, z) || rsSet(x, y, z, { on: false });
    if (p > 0 && !s.on) { s.on = true; rsSchedule(x, y, z, 'tnt_boom', 15); changed = true; }
  } else if (def.piston) {
    const p = computeInputPower(x, y, z);
    const s = rsGet(x, y, z) || rsSet(x, y, z, { on: false, extended: false });
    const on = p > 0;
    if (s.on !== on) {
      s.on = on;
      changed = true;
      // 延迟一个刻执行活塞推出/缩回
      if (on) rsSchedule(x, y, z, 'extend', 2);
      else rsSchedule(x, y, z, 'retract', 2);
    }
  }
  if (changed) markBlockDirty(x, y, z);
  return changed;
}

// 定时事件
function rsSchedule(x, y, z, type, delay) {
  rsTickQueue.push({ t: rsTime + delay, x, y, z, type });
}

// BFS 传播：从一组起点传播信号，更新所有受影响的组件
function rsPropagate(startList) {
  const queue = [...startList];
  const seen = new Set();
  while (queue.length) {
    const [x, y, z] = queue.shift();
    const k = rsKey(x, y, z);
    if (seen.has(k)) continue;
    seen.add(k);
    if (updateRsComponent(x, y, z)) {
      // 变化后，邻居组件也可能受影响
      for (const [dx, dy, dz] of RS_DIRS) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        const nid = getBlock(nx, ny, nz);
        if (nid !== AIR && BLOCKS[nid] && BLOCKS[nid].redstone) queue.push([nx, ny, nz]);
      }
    }
  }
}

// 方块变化时通知红石系统
function rsOnBlockChange(x, y, z) {
  const queue = [[x, y, z]];
  for (const [dx, dy, dz] of RS_DIRS) {
    queue.push([x + dx, y + dy, z + dz]);
  }
  rsPropagate(queue);
}

// 每刻执行：处理定时事件（活塞推出/缩回、按钮复位、侦测器）
function rsTick() {
  rsTime++;
  const due = rsTickQueue.filter(e => e.t <= rsTime);
  rsTickQueue = rsTickQueue.filter(e => e.t > rsTime);
  for (const e of due) processRsEvent(e);
}

function processRsEvent(e) {
  const { x, y, z, type } = e;
  const id = getBlock(x, y, z);
  const def = BLOCKS[id];
  if (!def) return;
  if (type === 'extend' && def.piston) {
    const s = rsGet(x, y, z);
    if (s && s.on && !s.extended) doPistonExtend(x, y, z, s.facing, def.sticky);
  } else if (type === 'retract' && def.piston) {
    const s = rsGet(x, y, z);
    if (s && !s.on && s.extended) doPistonRetract(x, y, z, s.facing, def.sticky);
  } else if (type === 'button_off') {
    const s = rsGet(x, y, z);
    if (s) { s.on = false; rsOnBlockChange(x, y, z); }
  } else if (type === 'observer_off') {
    const s = rsGet(x, y, z);
    if (s) { s.on = false; rsOnBlockChange(x, y, z); }
  } else if (type === 'tnt_boom') {
    explodeTnt(x, y, z);
  }
}

/* TNT 爆炸：清除周围球形区域内的可破坏方块，不破坏基岩 */
function explodeTnt(x, y, z) {
  setBlock(x, y, z, AIR);
  const R = 3;
  for (let dx = -R; dx <= R; dx++)
    for (let dy = -R; dy <= R; dy++)
      for (let dz = -R; dz <= R; dz++) {
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > R * R) continue;
        const tx = x + dx, ty = y + dy, tz = z + dz;
        const id = getBlock(tx, ty, tz);
        if (id === AIR || id === WATER || id === BEDROCK) continue;
        if (BLOCKS[id] && BLOCKS[id].unbreakable) continue;
        setBlock(tx, ty, tz, AIR);
      }
  // 触发音效（可复用破坏音）
  playBreak(STONE);
}

/* 活塞推出：把 facing 方向前 1 格尝试推出 */
function doPistonExtend(x, y, z, facing, sticky) {
  const s = rsGet(x, y, z);
  const [dx, dy, dz] = FACING_VEC[facing];
  const tx = x + dx, ty = y + dy, tz = z + dz;
  const target = getBlock(tx, ty, tz);
  // 只能推可移动方块（非基岩、非活塞、非观测者简化）
  const movable = target !== AIR && target !== WATER && target !== BEDROCK &&
    !(BLOCKS[target] && (BLOCKS[target].piston || BLOCKS[target].unbreakable || BLOCKS[target].observer));
  if (target === AIR || target === WATER) {
    // 推空：只标记伸展状态（实际活塞头未渲染，简化处理）
    s.extended = true;
    markBlockDirty(x, y, z);
  } else if (movable) {
    // 找目标方块前的位置
    const px = tx + dx, py = ty + dy, pz = tz + dz;
    const dest = getBlock(px, py, pz);
    if (dest === AIR || dest === WATER) {
      setBlock(px, py, pz, target);
      setBlock(tx, ty, tz, AIR);
      s.extended = true;
      markBlockDirty(x, y, z);
      markBlockDirty(tx, ty, tz);
      markBlockDirty(px, py, pz);
      // 侦测器若被推动则触发
      if (target === RS_OBSERVER) triggerObserver(px, py, pz);
    }
  }
}

function doPistonRetract(x, y, z, facing, sticky) {
  const s = rsGet(x, y, z);
  const [dx, dy, dz] = FACING_VEC[facing];
  const tx = x + dx, ty = y + dy, tz = z + dz;
  s.extended = false;
  markBlockDirty(x, y, z);
  // 粘性活塞缩回：把前方 1 格拉回
  if (sticky) {
    const target = getBlock(tx, ty, tz);
    if (target !== AIR && target !== WATER && target !== BEDROCK && !(BLOCKS[target] && (BLOCKS[target].piston || BLOCKS[target].observer))) {
      const px = x + dx * 2, py = y + dy * 2, pz = z + dz * 2;
      const dest = getBlock(px, py, pz);
      if (dest === AIR || dest === WATER) {
        setBlock(px, py, pz, target);
        setBlock(tx, ty, tz, AIR);
        markBlockDirty(tx, ty, tz);
        markBlockDirty(px, py, pz);
      }
    }
  }
}

function triggerObserver(x, y, z) {
  const s = rsGet(x, y, z);
  if (!s) return;
  s.on = true;
  markBlockDirty(x, y, z);
  rsSchedule(x, y, z, 'observer_off', 2);
  rsOnBlockChange(x, y, z);
}

// 方块变化时，通知相邻的侦测器（侦测器检测其朝向面对的那一面）
function notifyObservers(x, y, z) {
  for (let d = 0; d < 6; d++) {
    const [dx, dy, dz] = RS_DIRS[d];
    const nx = x + dx, ny = y + dy, nz = z + dz;
    const nid = getBlock(nx, ny, nz);
    if (nid === RS_OBSERVER) {
      const s = rsGet(nx, ny, nz);
      if (s && FACING_VEC[s.facing] && FACING_VEC[s.facing][0] === -dx && FACING_VEC[s.facing][1] === -dy && FACING_VEC[s.facing][2] === -dz) {
        triggerObserver(nx, ny, nz);
      }
    }
  }
}

/* ============================ 世界生成 ============================ */
function heightAt(x, z) {
  const e = (noise.noise2(x * 0.0042, z * 0.0042) * 1.0 +
    noise.noise2(x * 0.016, z * 0.016) * 0.35 +
    noise.noise2(x * 0.06, z * 0.06) * 0.08) / 1.43;
  return Math.max(6, Math.min(HEIGHT - 10, Math.round(SEA + e * 20)));
}
function biomeAt(x, z) {
  const t = noise.noise2(x * 0.0013, z * 0.0013);
  const m = noise.noise2(x * 0.0015 + 500, z * 0.0015 + 500);
  const h = heightAt(x, z);
  if (h >= SEA + 14) return 'mountain';
  if (t < -0.16) return 'snow';
  if (t > 0.18 && m < -0.05) return 'desert';
  if (m > 0.12) return 'forest';
  return 'plains';
}
const BIOME_CN = { plains: '平原', forest: '森林', desert: '沙漠', snow: '雪原', mountain: '山地', ocean: '海洋' };

function hashNoise01(x, y, z) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647) + worldSeed * 974634;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n = n ^ (n >>> 16);
  return (n >>> 0) / 4294967296;
}

function generateChunk(chunk) {
  const { cx, cz, data } = chunk;
  for (let lx = 0; lx < CHUNK; lx++) {
    for (let lz = 0; lz < CHUNK; lz++) {
      const x = cx * CHUNK + lx, z = cz * CHUNK + lz;
      const h = heightAt(x, z);
      const biome = biomeAt(x, z);
      let surface = GRASS, sub = DIRT;
      if (biome === 'mountain') { surface = h >= SEA + 18 ? SNOW : STONE; sub = STONE; }
      else if (biome === 'snow') { surface = SNOW_GRASS; sub = DIRT; }
      else if (biome === 'desert') { surface = SAND; sub = SAND; }
      const subDepth = biome === 'desert' ? 4 : 3;
      for (let y = 0; y < HEIGHT; y++) {
        let id = AIR;
        if (y === 0) id = BEDROCK;
        else if (y <= 2 && hashNoise01(x, y, z) < 0.6) id = BEDROCK;
        else if (y < h - subDepth) id = STONE;
        else if (y < h) id = sub;
        else if (y === h) id = surface;
        else if (y <= SEA) id = WATER;
        data[cidx(lx, y, lz)] = id;
      }
      // 洞穴（海平面以上、地表以下）
      for (let y = SEA + 2; y < h - 1; y++) {
        if (data[cidx(lx, y, lz)] === STONE || data[cidx(lx, y, lz)] === DIRT || data[cidx(lx, y, lz)] === SAND || data[cidx(lx, y, lz)] === SNOW) {
          const cave = noise.noise3(x * 0.07, y * 0.11, z * 0.07);
          if (cave > 0.62 && cave < 0.78) data[cidx(lx, y, lz)] = AIR;
        }
      }
      // 矿物
      for (let y = 4; y < h - 1; y++) {
        const li = cidx(lx, y, lz);
        if (data[li] !== STONE) continue;
        const r = hashNoise01(x, y, z);
        if (y < 48 && r > 0.985) data[li] = COAL_ORE;
        else if (y < 34 && r > 0.992) data[li] = IRON_ORE;
        else if (y < 22 && r > 0.996) data[li] = GOLD_ORE;
        else if (y < 14 && r > 0.9985) data[li] = DIAMOND_ORE;
      }
    }
  }
  // 树木（确定性跨区块生成：每个区块为其重叠的树打上本区块内的部分）
  stampTrees(chunk);
  // 植被（在树木之后打，避免长在树干底部）
  stampVegetation(chunk);
  // 应用编辑差分
  const em = editsByChunk.get(ckey(cx, cz));
  if (em) for (const [li, id] of em) data[li] = id;
  chunk.generated = true;
}

/* 判断 (tx,tz) 处是否有一棵树（纯种子函数，与区块生成顺序无关） */
function treeAt(tx, tz) {
  const h = heightAt(tx, tz);
  if (h < SEA + 1) return null; // 水下不长树
  const t = noise.noise2(tx * 0.0013, tz * 0.0013);
  const m = noise.noise2(tx * 0.0015 + 500, tz * 0.0015 + 500);
  let biome = 'plains';
  if (h >= SEA + 14) biome = 'mountain';
  else if (t < -0.16) biome = 'snow';
  else if (t > 0.18 && m < -0.05) biome = 'desert';
  else if (m > 0.12) biome = 'forest';
  if (biome !== 'forest' && biome !== 'plains') return null;
  if (hashNoise01(tx, 777, tz) >= (biome === 'forest' ? 0.016 : 0.006)) return null;
  const th = 4 + Math.floor(hashNoise01(tx, h + 1, tz) * 3);
  return { h, th };
}

/* 为当前区块打上所有与本区块重叠的树木（只写本区块内的方块） */
function stampTrees(chunk) {
  const { cx, cz, data } = chunk;
  const x0 = cx * CHUNK - 2, x1 = cx * CHUNK + CHUNK + 1;
  const z0 = cz * CHUNK - 2, z1 = cz * CHUNK + CHUNK + 1;
  const set = (x, y, z, id) => {
    if (y < 0 || y >= HEIGHT) return;
    if (x < cx * CHUNK || x >= cx * CHUNK + CHUNK) return;
    if (z < cz * CHUNK || z >= cz * CHUNK + CHUNK) return;
    const li = cidx(x - cx * CHUNK, y, z - cz * CHUNK);
    if (data[li] === AIR) data[li] = id;
  };
  for (let tx = x0; tx <= x1; tx++) {
    for (let tz = z0; tz <= z1; tz++) {
      const tree = treeAt(tx, tz);
      if (!tree) continue;
      const baseY = tree.h + 1;
      // 树干
      for (let i = 0; i < tree.th; i++) set(tx, baseY + i, tz, LOG);
      // 树冠
      const topY = baseY + tree.th - 2;
      for (let dy = -2; dy <= 1; dy++) {
        const r = dy === 1 ? 1 : 2;
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) === r && Math.abs(dz) === r && hashNoise01(tx + dx, baseY, tz + dz) < 0.5) continue;
          set(tx + dx, topY + dy, tz + dz, LEAVES);
        }
      }
      set(tx, baseY + tree.th, tz, LEAVES);
    }
  }
}

/* 植被：只种在草地/雪草地上方一格且该格为空（AIR）的位置 */
function stampVegetation(chunk) {
  const { cx, cz, data } = chunk;
  for (let lx = 0; lx < CHUNK; lx++) {
    for (let lz = 0; lz < CHUNK; lz++) {
      const x = cx * CHUNK + lx, z = cz * CHUNK + lz;
      const h = heightAt(x, z);
      const surface = data[cidx(lx, h, lz)];
      if (surface !== GRASS && surface !== SNOW_GRASS) continue;
      const li = cidx(lx, h + 1, lz);
      if (data[li] !== AIR) continue; // 树干等占位时跳过
      const biome = biomeAt(x, z);
      const rp = hashNoise01(x, 999, z);
      if (biome === 'forest' && rp < 0.35) data[li] = TALL_GRASS;
      else if (biome === 'plains' && rp < 0.22) data[li] = TALL_GRASS;
      else if (rp > 0.985) data[li] = POPPY;
      else if (rp > 0.97) data[li] = DANDELION;
    }
  }
}

function findSpawn() {
  for (let r = 0; r < 64; r++) {
    for (let dx = -r; dx <= r; dx += (r === 0 ? 1 : 1)) {
      for (let dz = -r; dz <= r; dz += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = dx, z = dz;
        const h = heightAt(x, z);
        if (h >= SEA + 1) return { x: x + 0.5, y: h + 1.01, z: z + 0.5 };
      }
    }
  }
  return { x: 8.5, y: SEA + 2, z: 8.5 };
}

/* ============================ 网格构建 ============================ */
const FACES = [
  { n: [1, 0, 0], d: 0, corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.6 },
  { n: [-1, 0, 0], d: 0, corners: [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]], shade: 0.6 },
  { n: [0, 1, 0], d: 1, corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
  { n: [0, -1, 0], d: 1, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.5 },
  { n: [0, 0, 1], d: 2, corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.8 },
  { n: [0, 0, -1], d: 2, corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.8 },
];
const AO_BRIGHT = [0.45, 0.66, 0.84, 1.0];

class MeshBuilder {
  constructor() { this.pos = []; this.norm = []; this.uv = []; this.col = []; this.idx = []; }
  quad(p0, p1, p2, p3, n, uv0, uv1, uv2, uv3, light0, light1, light2, light3) {
    const base = this.pos.length / 3;
    const pts = [p0, p1, p2, p3], uvs = [uv0, uv1, uv2, uv3], lts = [light0, light1, light2, light3];
    for (let i = 0; i < 4; i++) {
      this.pos.push(pts[i][0], pts[i][1], pts[i][2]);
      this.norm.push(n[0], n[1], n[2]);
      this.uv.push(uvs[i][0], uvs[i][1]);
      this.col.push(lts[i], lts[i], lts[i]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  toGeometry() {
    if (this.pos.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.norm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}

function tileUV(tile) {
  const col = tile % ATLAS_COLS, row = Math.floor(tile / ATLAS_COLS);
  const rows = Math.ceil(TILE_NAMES.length / ATLAS_COLS);
  const eps = 0.0001;
  const u0 = (col + eps) / ATLAS_COLS, u1 = (col + 1 - eps) / ATLAS_COLS;
  const v0 = 1 - (row + 1 - eps) / rows, v1 = 1 - (row + eps) / rows;
  return { u0, u1, v0, v1 };
}

function shouldRenderFace(cur, nb) {
  if (nb === AIR) return true;
  const b = BLOCKS[nb];
  if (b && b.cross) return true;
  if (cur === LEAVES && nb === LEAVES) return false;
  if (cur === WATER && nb === WATER) return false;
  if (cur === GLASS && nb === GLASS) return false;
  // 邻居为透明或 cutout（树叶等）时不遮挡：当前方块面应被渲染
  // 否则会形成与树叶相接的方块面透明、可透视到天空的 bug
  return !!(b && (b.transparent || b.cutout));
}

function meshChunk(chunk) {
  const builders = {
    opaque: new MeshBuilder(),
    cutout: new MeshBuilder(),
    water: new MeshBuilder(),
    glass: new MeshBuilder(),
  };
  const { cx, cz, data } = chunk;
  for (let lx = 0; lx < CHUNK; lx++) {
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let ly = 0; ly < HEIGHT; ly++) {
        const id = data[cidx(lx, ly, lz)];
        if (id === AIR) continue;
        // 世界坐标：用于邻居查找（面剔除 / AO）
        const wx = cx * CHUNK + lx, wy = ly, wz = cz * CHUNK + lz;
        // 本地坐标：用于顶点位置（网格随后整体平移到区块原点）
        const px = lx, py = ly, pz = lz;
        const def = BLOCKS[id];
        if (!def) continue;
        // 红石粉：渲染为贴地的扁平十字（非方块），仅视觉，不参与碰撞
        if (def.wire) {
          const s = rsGet(wx, wy, wz) || { power: 0 };
          addWire(builders.cutout, px, py, pz, s.power > 0 ? T.rs_wire_on : T.rs_wire_off);
          continue;
        }
        if (def.cross) {
          addCross(builders.cutout, px, py, pz, def.top);
          continue;
        }
        const isWater = id === WATER;
        const isGlass = id === GLASS;
        const isCutout = !!def.cutout;
        const target = isWater ? builders.water : isGlass ? builders.glass : isCutout ? builders.cutout : builders.opaque;
        // 红石方块动态纹理（根据状态选 on/off）
        const rsS = (def.redstone && !def.cross) ? (rsGet(wx, wy, wz) || { on: false }) : null;
        for (const face of FACES) {
          const nx = face.n[0], ny = face.n[1], nz = face.n[2];
          const nb = getBlock(wx + nx, wy + ny, wz + nz);
          if (!shouldRenderFace(id, nb)) continue;
          let tile = face.d === 1 ? (ny > 0 ? def.top : def.bottom) : def.side;
          // 水下的草方块/雪草方块：所有可见面渲染为泥土（被水浸泡退化为泥土观感）
          if (id === GRASS || id === SNOW_GRASS) {
            const above = getBlock(wx, wy + 1, wz);
            if (above === WATER) tile = T.dirt;
          }
          // 红石方块动态纹理
          if (rsS) {
            if (id === RS_LAMP) {
              tile = rsS.on ? T.rs_lamp_on : T.rs_lamp_off;
            } else if (id === RS_REPEATER) {
              tile = rsS.on ? T.rs_repeater_on : T.rs_repeater_off;
            } else if (id === RS_WIRE) {
              tile = rsS.power > 0 ? T.rs_wire_on : T.rs_wire_off;
            } else if (id === RS_TORCH) {
              tile = rsS.on ? T.rs_torch_on : T.rs_torch_off;
            }
          }
          const uvRect = tileUV(tile);
          let topYOffset = 0;
          if (isWater && ny > 0) topYOffset = -0.125;
          const corners = face.corners;
          const lights = [];
          const uvArr = [];
          for (let ci = 0; ci < 4; ci++) {
            const c = corners[ci];
            // AO 与光照
            const axes = [0, 1, 2].filter(a => a !== face.d);
            const a1 = axes[0], a2 = axes[1];
            const s1 = c[a1] === 1 ? 1 : -1;
            const s2 = c[a2] === 1 ? 1 : -1;
            const e1 = [0, 0, 0]; e1[a1] = s1;
            const e2 = [0, 0, 0]; e2[a2] = s2;
            const ox1 = wx + nx + e1[0], oy1 = wy + ny + e1[1], oz1 = wz + nz + e1[2];
            const ox2 = wx + nx + e2[0], oy2 = wy + ny + e2[1], oz2 = wz + nz + e2[2];
            const ox3 = wx + nx + e1[0] + e2[0], oy3 = wy + ny + e1[1] + e2[1], oz3 = wz + nz + e1[2] + e2[2];
            const b1 = isOpaque(getBlock(ox1, oy1, oz1)) ? 1 : 0;
            const b2 = isOpaque(getBlock(ox2, oy2, oz2)) ? 1 : 0;
            const b3 = isOpaque(getBlock(ox3, oy3, oz3)) ? 1 : 0;
            const ao = (b1 && b2) ? 0 : 3 - (b1 + b2 + b3);
            lights.push(face.shade * AO_BRIGHT[ao]);
            // UV（flipY=true：v0=底部，v1=顶部；块底→v0，块顶→v1）
            let u, v;
            if (face.d === 0) { u = c[2]; v = c[1]; }
            else if (face.d === 1) { u = c[0]; v = c[2]; }
            else { u = c[0]; v = c[1]; }
            const U = uvRect.u0 + u * (uvRect.u1 - uvRect.u0);
            const V = uvRect.v0 + v * (uvRect.v1 - uvRect.v0);
            uvArr.push([U, V]);
          }
          const p0 = [px + corners[0][0], py + corners[0][1] + topYOffset, pz + corners[0][2]];
          const p1 = [px + corners[1][0], py + corners[1][1] + topYOffset, pz + corners[1][2]];
          const p2 = [px + corners[2][0], py + corners[2][1] + topYOffset, pz + corners[2][2]];
          const p3 = [px + corners[3][0], py + corners[3][1] + topYOffset, pz + corners[3][2]];
          target.quad(p0, p1, p2, p3, face.n, uvArr[0], uvArr[1], uvArr[2], uvArr[3], lights[0], lights[1], lights[2], lights[3]);
        }
      }
    }
  }
  buildChunkMesh(chunk, builders);
}

function addCross(builder, bx, by, bz, tile) {
  const uvRect = tileUV(tile);
  const { u0, u1, v0, v1 } = uvRect;
  const l = 0.85;
  // 沿 X 的竖直面（z 中心）
  builder.quad(
    [bx + 0.5 - 0.5, by, bz + 0.5], [bx + 0.5 + 0.5, by, bz + 0.5],
    [bx + 0.5 + 0.5, by + 1, bz + 0.5], [bx + 0.5 - 0.5, by + 1, bz + 0.5],
    [0, 0, 1], [u0, v0], [u1, v0], [u1, v1], [u0, v1], l, l, l, l
  );
  // 沿 Z 的竖直面（x 中心）
  builder.quad(
    [bx + 0.5, by, bz + 0.5 - 0.5], [bx + 0.5, by, bz + 0.5 + 0.5],
    [bx + 0.5, by + 1, bz + 0.5 + 0.5], [bx + 0.5, by + 1, bz + 0.5 - 0.5],
    [1, 0, 0], [u0, v0], [u1, v0], [u1, v1], [u0, v1], l, l, l, l
  );
}

// 红石粉：贴地扁平十字（略高于地面，避免 z-fighting）
function addWire(builder, bx, by, bz, tile) {
  const uvRect = tileUV(tile);
  const { u0, u1, v0, v1 } = uvRect;
  const y = by + 0.02;
  const hw = 0.5; // 半宽
  const l = 0.9;
  // 沿 X 的横向贴片（南北向）
  builder.quad(
    [bx + 0.5 - hw, y, bz + 0.5 - 0.05], [bx + 0.5 + hw, y, bz + 0.5 - 0.05],
    [bx + 0.5 + hw, y, bz + 0.5 + 0.05], [bx + 0.5 - hw, y, bz + 0.5 + 0.05],
    [0, 1, 0], [u0, v0], [u1, v0], [u1, v1], [u0, v1], l, l, l, l
  );
  // 沿 Z 的横向贴片（东西向）
  builder.quad(
    [bx + 0.5 - 0.05, y, bz + 0.5 - hw], [bx + 0.5 + 0.05, y, bz + 0.5 - hw],
    [bx + 0.5 + 0.05, y, bz + 0.5 + hw], [bx + 0.5 - 0.05, y, bz + 0.5 + hw],
    [0, 1, 0], [u0, v0], [u1, v0], [u1, v1], [u0, v1], l, l, l, l
  );
}

function buildChunkMesh(chunk, builders) {
  if (chunk.group) {
    scene.remove(chunk.group);
    chunk.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
  const group = new THREE.Group();
  const specs = [
    ['opaque', matOpaque],
    ['cutout', matCutout],
    ['water', matWater],
    ['glass', matGlass],
  ];
  for (const [key, mat] of specs) {
    const g = builders[key].toGeometry();
    if (!g) continue;
    g.computeBoundingBox();
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(chunk.cx * CHUNK, 0, chunk.cz * CHUNK);
    // 让三.js 自动视锥剔除该 mesh（不手动改 frustumCulled）
    mesh.frustumCulled = true;
    group.add(mesh);
  }
  // 组包围盒（世界坐标），用于快速判定该区块是否在相机视锥内
  group.userData.worldBox = new THREE.Box3(
    new THREE.Vector3(chunk.cx * CHUNK, 0, chunk.cz * CHUNK),
    new THREE.Vector3((chunk.cx + 1) * CHUNK, HEIGHT, (chunk.cz + 1) * CHUNK)
  );
  scene.add(group);
  chunk.group = group;
  chunk.dirty = false;
}

/* 区块世界包围盒是否与相机视锥相交（快速剔除） */
function chunkInFrustum(chunk) {
  if (!camera) return true;
  chunkBox.min.set(chunk.cx * CHUNK, 0, chunk.cz * CHUNK);
  chunkBox.max.set((chunk.cx + 1) * CHUNK, HEIGHT, (chunk.cz + 1) * CHUNK);
  return viewFrustum.intersectsBox(chunkBox);
}

/* 每帧更新视锥体（由投影矩阵 × 视图矩阵得到） */
function updateViewFrustum() {
  viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  viewFrustum.setFromProjectionMatrix(viewMatrix);
}

/* ============================ 玩家碰撞 ============================ */
const PHW = 0.3, PHH = 1.8, EYE = 1.62;

/* 判断某个世界坐标（玩家眼睛/身体中心）是否位于水中 */
function isWaterAt(wx, wy, wz) {
  return getBlock(Math.floor(wx), Math.floor(wy), Math.floor(wz)) === WATER;
}
function playerInWater() {
  // 仅当玩家眼睛（头部）浸入水中才算入水；
  // 头部露出水面即视为出水，恢复正常重力，避免在水面处卡住不上不下
  return isWaterAt(player.x, player.y + EYE, player.z);
}

function boxCollides(px, py, pz) {
  const x0 = Math.floor(px - PHW), x1 = Math.floor(px + PHW);
  const y0 = Math.floor(py), y1 = Math.floor(py + PHH);
  const z0 = Math.floor(pz - PHW), z1 = Math.floor(pz + PHW);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
    if (isSolid(getBlock(x, y, z))) return true;
  }
  return false;
}
function movePlayer(dt) {
  const inWater = playerInWater();
  // 水中行走阻力：减速至约 40%，且无法冲刺
  const baseSpeed = player.flying ? 11 : 4.4;
  const speed = inWater ? baseSpeed * 0.4 : baseSpeed;
  const sprint = !inWater && (keys.has('ControlLeft') || keys.has('ControlRight'));
  const k = 1 - Math.exp(-11 * dt);
  // 水中水平加速度响应也放慢，体现粘滞感
  const hk = inWater ? 1 - Math.exp(-4.5 * dt) : k;

  if (isTouch) {
    // 触控：摇杆直接驱动水平速度
    const sp = speed;
    const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
    const fx = touch.move.y, sx = touch.move.x;
    player.vx = -sin * fx * sp + cos * sx * sp;
    player.vz = -cos * fx * sp - sin * sx * sp;
  } else {
    const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
    let mx = (-sin * fwd + cos * strafe);
    let mz = (-cos * fwd - sin * strafe);
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const sp = speed * (sprint ? 1.5 : 1);
    player.vx += (mx * sp - player.vx) * hk;
    player.vz += (mz * sp - player.vz) * hk;
  }

  if (player.flying) {
    const up = (keys.has('Space') ? 1 : 0) - (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : 0);
    player.vy += (up * speed - player.vy) * k;
  } else {
    // 水中物理：重力与终端速度降低；出水后自动恢复正常重力
    const wantSwim = (keys.has('Space') || touch.jump);
    if (inWater) {
      if (wantSwim) {
        // 游泳上浮：快速朝目标速度收敛，足以浮出水面
        player.vy += (5.0 - player.vy) * Math.min(1, 8 * dt);
        if (player.vy > 5.0) player.vy = 5.0;
      } else {
        // 不按空格：缓慢下沉（终端 -2.5）
        player.vy += (-2.5 - player.vy) * Math.min(1, 4 * dt);
        if (player.vy < -2.5) player.vy = -2.5;
      }
    } else {
      // 陆地：正常重力
      player.vy -= 26 * dt;
      if (player.vy < -40) player.vy = -40;
      if (player.onGround && wantSwim) { player.vy = 8.6; player.onGround = false; touch.jump = false; }
    }
  }

  // X 轴
  player.x += player.vx * dt;
  if (boxCollides(player.x, player.y, player.z)) { player.x -= player.vx * dt; player.vx = 0; }
  // Z 轴
  player.z += player.vz * dt;
  if (boxCollides(player.x, player.y, player.z)) { player.z -= player.vz * dt; player.vz = 0; }
  // Y 轴
  const wasDescending = player.vy < 0;
  player.y += player.vy * dt;
  if (boxCollides(player.x, player.y, player.z)) {
    if (player.vy <= 0) player.onGround = true;
    player.y -= player.vy * dt; player.vy = 0;
  } else {
    player.onGround = false;
  }
  // 飞行状态下：只有"向下飞行并踩到实体方块"才结束飞行；
  // 刚开启飞行时（即使原来站在地面）不会立即关闭。
  if (player.flying && player.onGround && wasDescending) {
    setFlying(false, true);
  }
}

/* 切换飞行状态（双击空格 / F / 触控 / 指令统一入口） */
function setFlying(on, silent) {
  if (player.flying === on) return;
  player.flying = on;
  player.vy = 0;
  if (!silent) showToast(on ? '已开启飞行（踩到地面结束）' : '飞行结束');
  if (on) player.onGround = false;
}

/* ============================ 射线检测（DDA） ============================ */
function raycast(origin, dir, maxDist) {
  let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
  const stepX = dir.x > 0 ? 1 : -1, stepY = dir.y > 0 ? 1 : -1, stepZ = dir.z > 0 ? 1 : -1;
  const tDeltaX = Math.abs(1 / (dir.x || 1e-9));
  const tDeltaY = Math.abs(1 / (dir.y || 1e-9));
  const tDeltaZ = Math.abs(1 / (dir.z || 1e-9));
  let tMaxX = ((stepX > 0 ? x + 1 - origin.x : origin.x - x) * tDeltaX);
  let tMaxY = ((stepY > 0 ? y + 1 - origin.y : origin.y - y) * tDeltaY);
  let tMaxZ = ((stepZ > 0 ? z + 1 - origin.z : origin.z - z) * tDeltaZ);
  let face = [0, 0, 0];
  let prev = [x, y, z];
  let t = 0;
  for (let i = 0; i < 200; i++) {
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX; t = tMaxX; tMaxX += tDeltaX; face = [-stepX, 0, 0];
    } else if (tMaxY < tMaxZ) {
      y += stepY; t = tMaxY; tMaxY += tDeltaY; face = [0, -stepY, 0];
    } else {
      z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; face = [0, 0, -stepZ];
    }
    if (t > maxDist) return null;
    const id = getBlock(x, y, z);
    if (id !== AIR && id !== WATER) {
      return { x, y, z, face, prev };
    }
    prev = [x, y, z];
  }
  return null;
}

/* ============================ 三.js 场景 ============================ */
let renderer, camera, scene;
let matOpaque, matCutout, matWater, matGlass;
let highlightMesh, skyMesh, sunMesh, clouds = [];
let atlasTexture;
// 性能：视锥剔除用包围盒 + 自适应网格构建预算
const chunkBox = new THREE.Box3();
const viewFrustum = new THREE.Frustum();
const viewMatrix = new THREE.Matrix4();
const chunkMeshBox = new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(CHUNK + 0.5, HEIGHT, CHUNK + 0.5));
let lastMeshFrame = 0; // 记录上次网格化所在帧，用于分散构建

function initThree() {
  const canvas = document.getElementById('gameCanvas');
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    // 关键：避免浏览器因“页面导致上下文丢失”而封禁 WebGL
    failIfMajorPerformanceCaveat: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // 上下文丢失/恢复处理
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    onGLContextLost();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    onGLContextRestored();
  });

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbfd7ee, renderDistance * CHUNK * 0.45, renderDistance * CHUNK * 0.95);

  camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, 0.1, 600);
  camera.rotation.order = 'YXZ';

  // 天空穹顶
  const skyGeo = new THREE.SphereGeometry(400, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x6fa8dc) },
      bottom: { value: new THREE.Color(0xdceaf5) },
      offset: { value: 26 }, exponent: { value: 0.55 }
    },
    vertexShader: `varying vec3 vP; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vP = w.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform float offset; uniform float exponent; varying vec3 vP;
      void main(){ float h = normalize(vP + vec3(0.0, offset, 0.0)).y; float t = pow(max(h,0.0), exponent); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }`
  });
  skyMesh = new THREE.Mesh(skyGeo, skyMat);
  skyMesh.frustumCulled = false;
  scene.add(skyMesh);

  // 太阳（方形，仿原版）
  sunMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff2bf, fog: false, side: THREE.DoubleSide })
  );
  sunMesh.position.set(180, 260, -120);
  sunMesh.lookAt(new THREE.Vector3(0, 0, 0));
  scene.add(sunMesh);

  // 云（方块体积云，仿原版）：用 InstancedMesh 由单位立方体拼成蓬松云朵，
  // 仅作装饰渲染，不参与方块碰撞/世界数据运算（云不是方块）。
  const cloudGeo = new THREE.BoxGeometry(1, 1, 1);
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  const cloudCount = 40;
  for (let i = 0; i < cloudCount; i++) {
    const cells = generateCloudCells();
    const inst = new THREE.InstancedMesh(cloudGeo, cloudMat, cells.length);
    const dummy = new THREE.Object3D();
    for (let j = 0; j < cells.length; j++) {
      dummy.position.set(cells[j][0], cells[j][1], cells[j][2]);
      dummy.updateMatrix();
      inst.setMatrixAt(j, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    // 云分布在更大范围，避免过于拥挤
    inst.userData.offset = new THREE.Vector3((Math.random() - 0.5) * 1400, 88 + Math.random() * 16, (Math.random() - 0.5) * 1400);
    inst.position.copy(inst.userData.offset);
    clouds.push(inst);
    scene.add(inst);
  }

  // 灯光
  scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x9b8b6e, 0.85));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.0);
  sun.position.set(80, 130, 50);
  scene.add(sun);

  // 材质
  atlasTexture = new THREE.CanvasTexture(atlas);
  atlasTexture.magFilter = THREE.NearestFilter;
  atlasTexture.minFilter = THREE.NearestFilter;
  atlasTexture.generateMipmaps = false;
  atlasTexture.colorSpace = THREE.SRGBColorSpace;

  const base = { map: atlasTexture, vertexColors: true };
  matOpaque = new THREE.MeshLambertMaterial(base);
  matCutout = new THREE.MeshLambertMaterial(Object.assign({}, base, { alphaTest: 0.5, side: THREE.DoubleSide }));
  matWater = new THREE.MeshLambertMaterial(Object.assign({}, base, { transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false }));
  matGlass = new THREE.MeshLambertMaterial(Object.assign({}, base, { transparent: true, opacity: 0.35, side: THREE.DoubleSide }));

  // 高亮框
  const hg = new THREE.BoxGeometry(1.002, 1.002, 1.002);
  const he = new THREE.EdgesGeometry(hg);
  highlightMesh = new THREE.LineSegments(he, new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.7 }));
  highlightMesh.visible = false;
  scene.add(highlightMesh);

  window.addEventListener('resize', onResize);
}
function makeCloudTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const ctx = c.getContext('2d');
  const blobs = [[20, 28, 22], [48, 20, 26], [78, 26, 24], [104, 30, 18], [36, 40, 20], [66, 38, 22], [92, 42, 16]];
  for (const [x, y, r] of blobs) {
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return new THREE.CanvasTexture(c);
}

/* 生成一朵方块云的体素单元（本地坐标，单位方块，y 相对云底） */
function generateCloudCells() {
  const cells = [];
  const seed = Math.floor(Math.random() * 1e9);
  const rng = mulberry32(seed);
  // 云朵尺寸：随机长宽，整体更大
  const lenX = 12 + Math.floor(rng() * 12);   // 12..23
  const lenZ = 8 + Math.floor(rng() * 8);     // 8..15
  const add = (x, y, z) => cells.push([x, y, z]);
  // 底部长方形（近似椭圆边缘裁剪）
  for (let x = 0; x < lenX; x++) {
    for (let z = 0; z < lenZ; z++) {
      const nx = (x - (lenX - 1) / 2) / ((lenX - 1) / 2);
      const nz = (z - (lenZ - 1) / 2) / ((lenZ - 1) / 2);
      if (nx * nx + nz * nz > 1.2 + rng() * 0.2) continue;
      add(x, 0, z);
      // 第二层中间加厚
      if (nx * nx + nz * nz < 0.55) add(x, 1, z);
      // 第三层更靠中心加厚
      if (nx * nx + nz * nz < 0.3) add(x, 2, z);
    }
  }
  // 顶部凸起
  const bumps = 4 + Math.floor(rng() * 6);
  for (let b = 0; b < bumps; b++) {
    const bx = Math.floor(rng() * lenX);
    const bz = Math.floor(rng() * lenZ);
    add(bx, 3, bz);
    if (rng() < 0.4) add(bx, 4, bz);
  }
  // 去重
  const seen = new Set();
  const unique = [];
  for (const c of cells) {
    const key = c[0] + ',' + c[1] + ',' + c[2];
    if (!seen.has(key)) { seen.add(key); unique.push(c); }
  }
  // 平移到以原点为中心
  const cx = (lenX - 1) / 2, cz = (lenZ - 1) / 2;
  return unique.map(([x, y, z]) => [x - cx, y, z - cz]);
}
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/* ============================ WebGL 上下文丢失/恢复 ============================ */
let glLost = false;
let glLostTimer = null;
function onGLContextLost() {
  glLost = true;
  // 暂停游戏，避免在丢失的上下文上渲染
  if (gameState === 'playing') gameState = 'paused';
  // 若数秒内未恢复，显示错误遮罩引导用户重试
  clearTimeout(glLostTimer);
  glLostTimer = setTimeout(() => {
    if (glLost) showGLErrorScreen();
  }, 4000);
}
function onGLContextRestored() {
  glLost = false;
  clearTimeout(glLostTimer);
  // 重建丢失的 GPU 资源（三.js 会自动重传纹理/几何体），重新加入场景
  if (!renderer) return;
  // 强制所有 chunk 重算网格，确保几何体数据重新上传
  for (const [, chunk] of chunks) { if (chunk.generated) chunk.dirty = true; }
  if (gameState === 'paused') gameState = 'playing';
}

/* ============================ 区块流式加载 ============================ */
function updateChunks() {
  const pcx = Math.floor(player.x / CHUNK), pcz = Math.floor(player.z / CHUNK);
  // 确保相机矩阵与视锥体最新（相机位置由上一帧末尾设置）
  camera.updateMatrixWorld();
  updateViewFrustum();
  // 卸载远处区块
  for (const [k, chunk] of chunks) {
    const d = Math.max(Math.abs(chunk.cx - pcx), Math.abs(chunk.cz - pcz));
    if (d > renderDistance + 1) {
      if (chunk.group) { scene.remove(chunk.group); chunk.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
      chunks.delete(k);
    }
  }
  // 需要加载的区块列表
  const wanted = [];
  for (let dx = -renderDistance; dx <= renderDistance; dx++)
    for (let dz = -renderDistance; dz <= renderDistance; dz++)
      wanted.push([pcx + dx, pcz + dz]);
  wanted.sort((a, b) => (Math.max(Math.abs(a[0] - pcx), Math.abs(a[1] - pcz))) - (Math.max(Math.abs(b[0] - pcx), Math.abs(b[1] - pcz))));
  let genBudget = 1;
  // 自适应网格预算：低 FPS 时减少每帧网格化数量，避免加载区块卡顿
  let meshBudget = fps > 40 ? 3 : (fps > 20 ? 1 : 0);
  for (const [cx, cz] of wanted) {
    const k = ckey(cx, cz);
    let chunk = chunks.get(k);
    if (!chunk) {
      chunk = { cx, cz, generated: false, data: new Uint8Array(CHUNK * CHUNK * HEIGHT), group: null, dirty: true };
      chunks.set(k, chunk);
    }
    if (!chunk.generated && genBudget > 0) { generateChunk(chunk); genBudget--; markDirty(cx - 1, cz); markDirty(cx + 1, cz); markDirty(cx, cz - 1); markDirty(cx, cz + 1); }
    // 网格化：优先处理视锥内的区块；视锥外的区块延后，避免无谓构建
    if (chunk.generated && chunk.dirty && meshBudget > 0 && chunkInFrustum(chunk)) {
      meshChunk(chunk);
      meshBudget--;
    }
  }
  scene.fog.near = renderDistance * CHUNK * 0.45;
  scene.fog.far = renderDistance * CHUNK * 0.95;
}

/* ============================ 音效 ============================ */
let audioCtx = null, soundOn = true;
function ensureAudio() {
  if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}
function playBreak(id) {
  if (!soundOn || !audioCtx) return;
  const now = audioCtx.currentTime;
  const dur = id === STONE || id === COBBLE ? 0.09 : 0.12;
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2) * 0.6;
  const src = audioCtx.createBufferSource(); src.buffer = buf;
  const filt = audioCtx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 500 + Math.random() * 800;
  const gain = audioCtx.createGain(); gain.gain.value = 0.4;
  src.connect(filt); filt.connect(gain); gain.connect(audioCtx.destination);
  src.start(now); src.stop(now + dur);
}
function playPlace() {
  if (!soundOn || !audioCtx) return;
  const now = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  o.type = 'square'; o.frequency.setValueAtTime(160, now); o.frequency.exponentialRampToValueAtTime(80, now + 0.08);
  const g = audioCtx.createGain(); g.gain.setValueAtTime(0.25, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(now); o.stop(now + 0.1);
}

/* ============================ UI ============================ */
const $ = s => document.querySelector(s);
const el = {};

function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => el.toast.classList.remove('show'), 1800);
}

/* ============================ 聊天与指令 ============================ */
function addChatLine(text, kind) {
  // 保存聊天记录到持久化历史（最多 100 条）
  chatHistory.push({ text, kind, t: Date.now() });
  while (chatHistory.length > 100) chatHistory.shift();
  saveChatHistory();
  // 渲染该条消息
  const line = document.createElement('div');
  line.className = 'chat-line';
  if (kind === 'cmd') {
    line.innerHTML = `<span class="chat-sys">${escapeHtml(text)}</span>`;
  } else if (kind === 'err') {
    line.innerHTML = `<span class="chat-err">${escapeHtml(text)}</span>`;
  } else if (kind === 'player') {
    line.innerHTML = `<span class="chat-name">玩家</span> ${escapeHtml(text)}`;
  } else {
    line.innerHTML = `<span class="chat-sys">${escapeHtml(text)}</span>`;
  }
  el.chatLog.appendChild(line);
  while (el.chatLog.children.length > 40) el.chatLog.removeChild(el.chatLog.firstChild);
  // 数秒后自动淡出并移除（仅移除 DOM，历史仍在 chatHistory 中）
  setTimeout(() => { if (line.parentNode) line.parentNode.removeChild(line); }, 6000);
}

const CHAT_KEY = 'luminya_mc_chat';
let chatHistory = [];
function loadChatHistory() {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    if (raw) chatHistory = JSON.parse(raw);
  } catch (e) { chatHistory = []; }
}
function saveChatHistory() {
  try { localStorage.setItem(CHAT_KEY, JSON.stringify(chatHistory)); } catch (e) { /* 忽略 */ }
}
function restoreChatHistory() {
  // 把保存的历史重新渲染到聊天框
  el.chatLog.innerHTML = '';
  const recent = chatHistory.slice(-40);
  for (const { text, kind } of recent) {
    const line = document.createElement('div');
    line.className = 'chat-line';
    if (kind === 'cmd') {
      line.innerHTML = `<span class="chat-sys">${escapeHtml(text)}</span>`;
    } else if (kind === 'err') {
      line.innerHTML = `<span class="chat-err">${escapeHtml(text)}</span>`;
    } else if (kind === 'player') {
      line.innerHTML = `<span class="chat-name">玩家</span> ${escapeHtml(text)}</span>`;
    } else {
      line.innerHTML = `<span class="chat-sys">${escapeHtml(text)}</span>`;
    }
    el.chatLog.appendChild(line);
  }
}
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function openChat(isCommand) {
  if (gameState !== 'playing' || inventoryOpen) return;
  chatOpen = true;
  chatIsCommand = isCommand;
  el.chatBar.classList.remove('hidden');
  el.chatPrompt.textContent = isCommand ? '/' : '›';
  el.chatInput.value = '';
  el.chatInput.focus();
  if (!isTouch) exitPointerLock();
}
function closeChat() {
  chatOpen = false;
  el.chatBar.classList.add('hidden');
  el.chatInput.value = '';
}
function submitChat() {
  let raw = el.chatInput.value.trim();
  el.chatInput.value = '';
  if (!raw) { closeChat(); return; }
  if (chatIsCommand) raw = '/' + raw.replace(/^\/+/, '');
  if (raw.startsWith('/')) {
    executeCommand(raw);
  } else {
    addChatLine(raw, 'player');
  }
  closeChat();
}

function executeCommand(line) {
  const parts = line.slice(1).trim().split(/\s+/);
  const cmd = (parts[0] || '').toLowerCase();
  const arg = (s) => (parts.length > s ? parts[s] : null);
  switch (cmd) {
    case 'tp': {
      if (parts.length < 4) { addChatLine('用法: /tp <x> <y> <z>', 'err'); return; }
      const x = parseFloat(parts[1]), y = parseFloat(parts[2]), z = parseFloat(parts[3]);
      if (isNaN(x) || isNaN(y) || isNaN(z)) { addChatLine('坐标必须是数字', 'err'); return; }
      player.x = x; player.y = y; player.z = z;
      player.vx = player.vy = player.vz = 0;
      addChatLine(`已传送至 ${x}, ${y}, ${z}`, 'cmd');
      break;
    }
    case 'give': {
      if (parts.length < 2) { addChatLine('用法: /give <方块名> [数量]', 'err'); return; }
      const name = parts[1].toLowerCase();
      const count = parts.length > 2 ? Math.max(1, parseInt(parts[2], 10) || 1) : 1;
      let found = null;
      for (const id in BLOCKS) {
        const b = BLOCKS[id];
        if (b && (b.name.toLowerCase().includes(name) || String(id) === name)) { found = Number(id); break; }
      }
      if (found === null) {
        if (name === '木棍' || name === 'stick') found = STICK;
      }
      if (found === null) { addChatLine(`未知物品: ${parts[1]}`, 'err'); return; }
      giveItem(found, count);
      addChatLine(`已给予 ${itemName(found)} ×${count}`, 'cmd');
      break;
    }
    case 'fly': {
      setFlying(true);
      addChatLine('飞行模式已开启（踩到地面结束）', 'cmd');
      break;
    }
    case 'seed': {
      addChatLine(`世界种子: ${worldSeed}`, 'cmd');
      break;
    }
    case 'time': {
      addChatLine('当前为创造模式，无昼夜循环', 'cmd');
      break;
    }
    case 'rechunk':
    case 'reloadchunks':
    case 'rerender': {
      // 重新渲染所有已加载区块（标记 dirty 后由主循环重建网格）
      for (const [, chunk] of chunks) {
        if (chunk.generated) chunk.dirty = true;
      }
      addChatLine('已请求重新渲染所有区块', 'cmd');
      break;
    }
    case 'help': {
      addChatLine('指令: /tp <x y z> · /give <方块> [数量] · /fly · /seed · /rechunk · /help', 'cmd');
      break;
    }
    default:
      addChatLine(`未知指令: /${cmd}`, 'err');
  }
}

function makeSlot(parent, index, grid, extraCls) {
  const s = document.createElement('div');
  s.className = 'slot' + (extraCls ? ' ' + extraCls : '');
  s.dataset.grid = grid;
  s.dataset.index = index;
  parent.appendChild(s);
  return s;
}

function slotContent(slot, item) {
  slot.innerHTML = '';
  if (!item) return;
  const icon = itemIcon(item.id);
  if (icon) {
    const img = document.createElement('img');
    img.src = icon.toDataURL();
    slot.appendChild(img);
  }
  if (item.count > 1) {
    const c = document.createElement('span');
    c.className = 'slot-count';
    c.textContent = item.count;
    slot.appendChild(c);
  }
}

function renderHotbar() {
  el.hotbarSlots.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const s = makeSlot(el.hotbarSlots, i, 'hotbar');
    slotContent(s, inventory[i]);
    if (i === hotbarSel) s.classList.add('selected');
    const idx = document.createElement('span');
    idx.className = 'slot-index';
    idx.textContent = i + 1;
    s.appendChild(idx);
  }
}

function renderInventory() {
  el.inventoryGrid.innerHTML = '';
  // 创造模式：仅显示 9 格快捷栏（1-9），以九宫格布局呈现
  for (let i = 0; i < 9; i++) {
    const s = makeSlot(el.inventoryGrid, i, 'inv');
    slotContent(s, inventory[i]);
    if (i === hotbarSel) s.classList.add('selected');
    const idx = document.createElement('span');
    idx.className = 'slot-index';
    idx.textContent = i + 1;
    s.appendChild(idx);
  }
}

function renderCreative() {
  el.creativeGrid.innerHTML = '';
  // 创造模式：列出所有方块 + 物品（木棍等），均可无限获取
  const ids = Object.keys(BLOCKS).map(Number).filter(id => id !== AIR);
  ids.push(STICK);
  ids.sort((a, b) => a - b);
  for (const id of ids) {
    const s = makeSlot(el.creativeGrid, id, 'creative');
    slotContent(s, { id, count: -1 });
    const name = document.createElement('span');
    name.className = 'slot-index';
    name.textContent = itemName(id);
    s.title = itemName(id);
  }
}

/* ============================ 物品给予 ============================ */
function giveItem(id, count) {
  // 先放入光标，其次堆叠，再找空位（仅 9 格快捷栏）
  if (cursorItem && cursorItem.id === id && cursorItem.count > 0) {
    const space = MAX_STACK - cursorItem.count;
    const add = Math.min(space, count);
    cursorItem.count += add; count -= add;
  }
  for (let i = 0; i < 9 && count > 0; i++) {
    const s = inventory[i];
    if (s && s.id === id && s.count > 0 && s.count < MAX_STACK) {
      const add = Math.min(MAX_STACK - s.count, count);
      s.count += add; count -= add;
    }
  }
  for (let i = 0; i < 9 && count > 0; i++) {
    if (!inventory[i]) { inventory[i] = { id, count: Math.min(count, MAX_STACK) }; count -= Math.min(count, MAX_STACK); }
  }
  if (count > 0) showToast('快捷栏已满');
  renderHotbar(); renderInventory();
}

/* ============================ 背包交互 ============================ */
let cursorItem = null;

function slotItems(grid, idx) {
  if (grid === 'inv' || grid === 'hotbar') return inventory;
  return null;
}
function setSlotItems(grid, idx, val) {
  if (grid === 'inv' || grid === 'hotbar') { inventory[idx] = val; renderHotbar(); renderInventory(); }
}

function onSlotMouseDown(e, grid, idx) {
  e.preventDefault();
  if (grid === 'creative') {
    // 创造模式：点击物品 → 放入当前选中的快捷栏格
    const id = Number(idx);
    inventory[hotbarSel] = { id, count: -1 };
    renderHotbar(); renderInventory();
    showToast(itemName(id));
    return;
  }
  if (grid === 'trash') {
    // 点击销毁格：销毁光标上的物品
    if (cursorItem) { cursorItem = null; updateCursorVisual(); showToast('物品已销毁'); }
    return;
  }
  const items = slotItems(grid, idx);
  if (!items) return;
  const cur = items[idx];
  const isInfinite = (it) => it && it.count === -1;
  if (e.button === 0) {
    // 左键：拿起 / 放置 / 交换
    if (!cursorItem && !cur) return;
    if (!cursorItem) {
      if (isInfinite(cur)) { cursorItem = { id: cur.id, count: MAX_STACK }; }
      else { cursorItem = cur; items[idx] = null; }
    }
    else if (!cur) { items[idx] = cursorItem; cursorItem = null; }
    else if (cur.id === cursorItem.id) {
      if (isInfinite(cur)) { cursorItem = null; }
      else {
        const space = MAX_STACK - cur.count;
        if (space > 0) {
          const add = Math.min(space, cursorItem.count);
          cur.count += add; cursorItem.count -= add;
          if (cursorItem.count <= 0) cursorItem = null;
        }
      }
    } else {
      if (isInfinite(cur)) { cursorItem = { id: cur.id, count: MAX_STACK }; }
      else { const tmp = cursorItem; cursorItem = cur; items[idx] = tmp; }
    }
  } else if (e.button === 2) {
    // 右键：单格放置 / 平分
    if (!cursorItem && cur) {
      if (isInfinite(cur)) { cursorItem = { id: cur.id, count: 1 }; }
      else {
        const half = Math.ceil(cur.count / 2);
        const rest = cur.count - half;
        cursorItem = { id: cur.id, count: half };
        if (rest <= 0) items[idx] = null; else cur.count = rest;
      }
    } else if (cursorItem && !cur) {
      items[idx] = { id: cursorItem.id, count: 1 };
      cursorItem.count--;
      if (cursorItem.count <= 0) cursorItem = null;
    } else if (cursorItem && cur && cur.id === cursorItem.id) {
      if (isInfinite(cur)) { cursorItem.count--; if (cursorItem.count <= 0) cursorItem = null; }
      else if (cur.count < MAX_STACK) { cur.count++; cursorItem.count--; if (cursorItem.count <= 0) cursorItem = null; }
    }
  }
  setSlotItems(grid, idx, items[idx]);
  updateCursorVisual();
}

function updateCursorVisual() {
  const tip = el.inventoryTooltip;
  if (cursorItem) {
    tip.innerHTML = '';
    const icon = itemIcon(cursorItem.id);
    if (icon) {
      const img = document.createElement('img');
      img.src = icon.toDataURL();
      img.style.width = '36px'; img.style.height = '36px'; img.style.imageRendering = 'pixelated';
      tip.appendChild(img);
    }
    tip.classList.remove('hidden');
  } else {
    tip.classList.add('hidden');
  }
}

/* ============================ 状态与菜单 ============================ */
let gameState = 'menu'; // menu | playing | paused
let inventoryOpen = false;
let activeSaveName = null;
let lastAutoSave = 0;

function showMenu() {
  gameState = 'menu';
  el.menuScreen.classList.remove('hidden');
  el.pauseScreen.classList.add('hidden');
  el.inventoryScreen.classList.add('hidden');
  el.hud.classList.add('hidden');
  exitPointerLock();
  document.getElementById('btnContinue').textContent = getSaves().active ? '继续游戏' : '继续游戏（无存档）';
  // 释放世界 GPU 资源，避免反复进出世界累积显存导致上下文丢失
  clearWorld();
}
function clearWorld() {
  for (const [, chunk] of chunks) {
    if (chunk.group) {
      scene.remove(chunk.group);
      chunk.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    }
    chunk.group = null;
  }
  chunks.clear();
  editsByChunk.clear();
  rsState.clear();
  rsTickQueue = [];
  rsTime = 0;
  rsAccum = 0;
  if (highlightMesh) highlightMesh.visible = false;
  if (renderer) renderer.renderLists && renderer.renderLists.dispose();
}
function startGame(saveData, name, seed) {
  worldSeed = seed;
  noise = new Perlin(seed);
  activeSaveName = name;
  // 清空世界
  for (const [, chunk] of chunks) {
    if (chunk.group) { scene.remove(chunk.group); chunk.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  }
  chunks.clear();
  editsByChunk.clear();
  rsState.clear();
  rsTickQueue = [];
  rsTime = 0;
  rsAccum = 0;
  if (saveData) {
    player = {
      x: saveData.player.pos[0], y: saveData.player.pos[1], z: saveData.player.pos[2],
      yaw: saveData.player.yaw, pitch: saveData.player.pitch, vx: 0, vy: 0, vz: 0, onGround: false, flying: false
    };
    inventory = saveData.inventory.slice(0, 9).map(s => (s && s.id ? { id: s.id, count: s.count } : null));
    while (inventory.length < 9) inventory.push(null);
    const flat = saveData.edits || [];
    for (let i = 0; i + 3 < flat.length; i += 4) {
      const x = flat[i], y = flat[i + 1], z = flat[i + 2], id = flat[i + 3];
      const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
      const k = ckey(cx, cz);
      if (!editsByChunk.has(k)) editsByChunk.set(k, new Map());
      editsByChunk.get(k).set(cidx(x - cx * CHUNK, y, z - cz * CHUNK), id);
    }
  } else {
    const sp = findSpawn();
    player = { x: sp.x, y: sp.y, z: sp.z, yaw: Math.PI, pitch: 0, vx: 0, vy: 0, vz: 0, onGround: false, flying: false };
    inventory = new Array(9).fill(null);
    inventory[0] = { id: GRASS, count: -1 };
  }
  hotbarSel = 0;
  cursorItem = null;
  el.menuScreen.classList.add('hidden');
  el.pauseScreen.classList.add('hidden');
  el.inventoryScreen.classList.add('hidden');
  el.hud.classList.remove('hidden');
  gameState = 'playing';
  renderHotbar(); renderInventory(); renderCreative();
  updateCursorVisual();
  restoreChatHistory();
  // 初始加载区块（异步，带进度）
  initialLoad(() => {
    el.loadingScreen.classList.add('hidden');
    // 移除点击遮罩：加载完成后直接进入游戏，点击画布锁定指针
    if (!isTouch) requestPointerLock();
  });
}

function initialLoad(cb) {
  el.loadingScreen.classList.remove('hidden');
  el.loadingBarFill.style.width = '0%';
  el.loadingText.textContent = '正在生成世界…';
  const pcx = Math.floor(player.x / CHUNK), pcz = Math.floor(player.z / CHUNK);
  const wanted = [];
  for (let dx = -renderDistance; dx <= renderDistance; dx++)
    for (let dz = -renderDistance; dz <= renderDistance; dz++)
      wanted.push([pcx + dx, pcz + dz]);
  wanted.sort((a, b) => Math.max(Math.abs(a[0] - pcx), Math.abs(a[1] - pcz)) - Math.max(Math.abs(b[0] - pcx), Math.abs(b[1] - pcz)));
  let i = 0;
  const total = wanted.length;
  function genStep() {
    const batch = 4;
    let done = 0;
    while (done < batch && i < total) {
      const [cx, cz] = wanted[i];
      let chunk = chunks.get(ckey(cx, cz));
      if (!chunk) {
        chunk = { cx, cz, generated: false, data: new Uint8Array(CHUNK * CHUNK * HEIGHT), group: null, dirty: true };
        chunks.set(ckey(cx, cz), chunk);
      }
      if (!chunk.generated) generateChunk(chunk);
      i++; done++;
    }
    el.loadingBarFill.style.width = Math.round((i / total) * 60) + '%';
    el.loadingText.textContent = '正在生成地形… ' + Math.round((i / total) * 100) + '%';
    if (i < total) setTimeout(genStep, 16);
    else meshStep();
  }
  function meshStep() {
    // 全部生成后统一网格化，保证区块边界正确
    const list = [];
    for (const [, chunk] of chunks) if (chunk.generated && chunk.dirty) list.push(chunk);
    let m = 0;
    function next() {
      const batch = 3;
      let done = 0;
      while (done < batch && m < list.length) {
        meshChunk(list[m]); m++; done++;
      }
      el.loadingBarFill.style.width = Math.round(60 + (m / Math.max(list.length, 1)) * 40) + '%';
      el.loadingText.textContent = '正在构建网格… ' + Math.round((m / Math.max(list.length, 1)) * 100) + '%';
      if (m < list.length) setTimeout(next, 16);
      else cb();
    }
    next();
  }
  genStep();
}

function pauseGame() {
  if (gameState !== 'playing') return;
  gameState = 'paused';
  el.pauseScreen.classList.remove('hidden');
  exitPointerLock();
}
function resumeGame() {
  if (gameState !== 'paused') return;
  el.pauseScreen.classList.add('hidden');
  gameState = 'playing';
}
function openInventory() {
  if (gameState !== 'playing') return;
  inventoryOpen = true;
  el.inventoryScreen.classList.remove('hidden');
  el.touchControls.classList.add('hidden');
  renderInventory(); renderCreative();
  exitPointerLock();
}
function closeInventory() {
  inventoryOpen = false;
  el.inventoryScreen.classList.add('hidden');
  el.inventoryTooltip.classList.add('hidden');
  if (isTouch) el.touchControls.classList.remove('hidden');
}
function requestPointerLock() {
  if (!isTouch && gameState === 'playing' && !inventoryOpen) {
    const canvas = document.getElementById('gameCanvas');
    if (canvas.requestPointerLock) {
      try {
        const ret = canvas.requestPointerLock();
        if (ret && ret.catch) ret.catch(() => {});
      } catch (e) { /* 某些环境下不允许 pointer lock，忽略 */ }
    }
  }
}
function exitPointerLock() {
  if (document.pointerLockElement) {
    try { document.exitPointerLock && document.exitPointerLock(); } catch (e) {}
  }
}

/* ============================ 存档 ============================ */
function getSaves() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { active: null, slots: [] };
    return JSON.parse(raw);
  } catch (e) { return { active: null, slots: [] }; }
}
function writeSaves(saves) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(saves)); } catch (e) { showToast('保存失败：存储空间不足'); }
}
function collectSaveData() {
  const flat = [];
  for (const [k, em] of editsByChunk) {
    const [cx, cz] = k.split(',').map(Number);
    for (const [li, id] of em) {
      const ly = Math.floor(li / (CHUNK * CHUNK));
      const rem = li % (CHUNK * CHUNK);
      const lz = Math.floor(rem / CHUNK);
      const lx = rem % CHUNK;
      flat.push(cx * CHUNK + lx, ly, cz * CHUNK + lz, id);
    }
  }
  return {
    version: 1,
    name: activeSaveName,
    seed: worldSeed,
    savedAt: Date.now(),
    player: { pos: [player.x, player.y, player.z], yaw: player.yaw, pitch: player.pitch },
    inventory: inventory.map(s => (s ? { id: s.id, count: s.count } : null)),
    edits: flat,
  };
}
function saveGame(silent) {
  if (gameState !== 'playing' && gameState !== 'paused') return;
  if (!activeSaveName) return;
  const saves = getSaves();
  let slot = saves.slots.find(s => s.name === activeSaveName);
  if (!slot) {
    slot = { name: activeSaveName, worldName: activeSaveName, seed: worldSeed, createdAt: Date.now() };
    saves.slots.push(slot);
  }
  const data = collectSaveData();
  slot.seed = data.seed;
  slot.savedAt = data.savedAt;
  slot.data = data;
  saves.active = activeSaveName;
  writeSaves(saves);
  if (!silent) showToast('世界已保存');
}

function renderSlotList() {
  const saves = getSaves();
  el.slotList.innerHTML = '';
  if (saves.slots.length === 0) {
    el.slotList.innerHTML = '<div class="slot-empty">暂无存档</div>';
    return;
  }
  for (const s of saves.slots) {
    const item = document.createElement('div');
    item.className = 'slot-item';
    const info = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'slot-name';
    name.textContent = s.worldName || s.name;
    const meta = document.createElement('div');
    meta.className = 'slot-meta';
    meta.textContent = '种子 ' + s.seed + ' · ' + (s.savedAt ? new Date(s.savedAt).toLocaleString() : '未知');
    info.appendChild(name); info.appendChild(meta);
    const actions = document.createElement('div');
    actions.className = 'slot-actions';
    const loadBtn = document.createElement('button');
    loadBtn.textContent = '载入';
    loadBtn.onclick = () => {
      if (gameState === 'playing' || gameState === 'paused') saveGame(true);
      el.slotsModal.classList.add('hidden');
      startGame(s.data, s.name, s.seed);
    };
    const delBtn = document.createElement('button');
    delBtn.textContent = '删除';
    delBtn.className = 'slot-delete';
    delBtn.onclick = () => {
      saves.slots = saves.slots.filter(x => x.name !== s.name);
      if (saves.active === s.name) saves.active = saves.slots.length ? saves.slots[0].name : null;
      writeSaves(saves);
      renderSlotList();
    };
    actions.appendChild(loadBtn); actions.appendChild(delBtn);
    item.appendChild(info); item.appendChild(actions);
    el.slotList.appendChild(item);
  }
}

/* ============================ 输入 ============================ */
const keys = new Set();
let isTouch = false;
const touch = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, jump: false, fly: false, place: false, breaking: false };
let lastSpaceTapTime = 0;
let spacePressed = false;   // 空格是否物理按下（keyup 前为 true），用于区分真实按击与长按
let lastFlyToggle = 0;      // 上次飞行切换时间，防止双击判定与空中长按误触
let chatOpen = false;
let chatIsCommand = false;

function handleSpaceTap() {
  // 只在"真实按下"（非自动重复）时调用；由 keydown 的 e.repeat 过滤保证
  const now = performance.now();
  if (spacePressed) return;         // 已经按住：长按/自动重复，不算一次新点击
  spacePressed = true;
  const diff = now - lastSpaceTapTime;
  if (diff < 350) {
    lastSpaceTapTime = 0;
    // 双击空格：开启/关闭飞行；并加冷却，防止空中长按快速重复触发
    if (now - lastFlyToggle > 500) {
      lastFlyToggle = now;
      setFlying(!player.flying);
    }
  } else {
    lastSpaceTapTime = now;
  }
}
function handleSpaceRelease() {
  spacePressed = false;
}

function bindInput() {
  const canvas = document.getElementById('gameCanvas');
  canvas.addEventListener('mousedown', () => {
    if (gameState === 'playing' && !inventoryOpen && !chatOpen) requestPointerLock();
  });

  document.addEventListener('keydown', (e) => {
    // 聊天输入时只处理 Escape 与 Enter，不注册移动键、不触发热键
    if (chatOpen) {
      if (e.code === 'Escape') { closeChat(); return; }
      if (e.code === 'Enter') { submitChat(); return; }
      return;
    }
    keys.add(e.code);
    if (e.code === 'KeyE' && gameState === 'playing') { if (inventoryOpen) closeInventory(); else openInventory(); }
    if (e.code === 'KeyF' && gameState === 'playing' && !inventoryOpen) { setFlying(!player.flying); }
    if (e.code === 'Escape') {
      // Esc 仅返回上一级：物品栏→关闭物品栏，聊天已处理，游玩→暂停菜单
      if (inventoryOpen) { closeInventory(); return; }
      if (gameState === 'playing') pauseGame();
      else if (gameState === 'paused') resumeGame();
    }
    if (e.code === 'F3') { e.preventDefault(); debugInfoEnabled = !debugInfoEnabled; applyDebugInfo(); saveSettings(); }
    if (gameState === 'playing' && !inventoryOpen) {
      const num = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];
      const ni = num.indexOf(e.code);
      if (ni >= 0) { hotbarSel = ni; renderHotbar(); }
      if (e.code === 'Space') {
        e.preventDefault();
        // 双击空格开启/关闭飞行（忽略自动重复，长按不触发）
        if (!e.repeat) handleSpaceTap();
      }
      // 聊天/指令
      if (e.code === 'KeyT') { e.preventDefault(); openChat(false); }
      if (e.code === 'Slash') { e.preventDefault(); openChat(true); }
    }
  });
  document.addEventListener('keyup', (e) => {
    keys.delete(e.code);
    if (e.code === 'Space') handleSpaceRelease();
  });
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas && gameState === 'playing' && !inventoryOpen) {
      player.yaw -= e.movementX * 0.0023 * sensitivity;
      player.pitch -= e.movementY * 0.0023 * sensitivity;
      player.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, player.pitch));
    }
    if (inventoryOpen) {
      el.inventoryTooltip.style.left = (e.clientX + 14) + 'px';
      el.inventoryTooltip.style.top = (e.clientY + 14) + 'px';
    }
  });
  document.addEventListener('mousedown', (e) => {
    if (e.button === 2) e.preventDefault();
    if (gameState !== 'playing' || inventoryOpen) return;
    // 指针未锁定时点击只用于进入游戏
    if (!isTouch && document.pointerLockElement !== canvas) return;
    ensureAudio();
    if (e.button === 0) breakBlock();
    else if (e.button === 2) interactBlock();
  });
  document.addEventListener('contextmenu', (e) => { if (gameState === 'playing') e.preventDefault(); });
  document.addEventListener('wheel', (e) => {
    if (gameState !== 'playing' || inventoryOpen) return;
    hotbarSel = (hotbarSel + (e.deltaY > 0 ? 1 : -1) + 9) % 9;
    renderHotbar();
  });
  document.addEventListener('pointerlockchange', () => {
    // 指针解锁时不再弹出遮罩，玩家可直接移动视角（未锁定时用鼠标移动）
  });

  // 触控
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    isTouch = true;
    el.touchControls.classList.remove('hidden');
    bindTouch();
  }
}

function bindTouch() {
  const joy = el.touchJoystick, knob = el.touchJoystickKnob;
  let joyId = null;
  joy.addEventListener('touchstart', (e) => {
    e.preventDefault();
    joyId = e.changedTouches[0].identifier;
    const t = e.changedTouches[0];
    updateJoy(t);
  }, { passive: false });
  joy.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === joyId) updateJoy(t);
  }, { passive: false });
  joy.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) if (t.identifier === joyId) { joyId = null; touch.move.x = 0; touch.move.y = 0; knob.style.transform = 'translate(-50%,-50%)'; }
  });
  function updateJoy(t) {
    const r = joy.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = (t.clientX - cx) / (r.width / 2), dy = (t.clientY - cy) / (r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    touch.move.x = dx; touch.move.y = dy;
    knob.style.transform = `translate(calc(-50% + ${dx * 34}px), calc(-50% + ${dy * 34}px))`;
  }
  const look = el.touchLook;
  let lookId = null, lastX = 0, lastY = 0;
  look.addEventListener('touchstart', (e) => { e.preventDefault(); lookId = e.changedTouches[0].identifier; lastX = e.changedTouches[0].clientX; lastY = e.changedTouches[0].clientY; }, { passive: false });
  look.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === lookId) {
      player.yaw -= (t.clientX - lastX) * 0.006 * sensitivity;
      player.pitch -= (t.clientY - lastY) * 0.006 * sensitivity;
      player.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, player.pitch));
      lastX = t.clientX; lastY = t.clientY;
    }
  }, { passive: false });
  look.addEventListener('touchend', (e) => { for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null; });

  const bindBtn = (elId, prop) => {
    const b = el[elId];
    b.addEventListener('touchstart', (e) => { e.preventDefault(); touch[prop] = true; if (prop === 'jump' || prop === 'fly' || prop === 'place' || prop === 'breaking') act(prop); }, { passive: false });
    b.addEventListener('touchend', (e) => { e.preventDefault(); touch[prop] = false; }, { passive: false });
  };
  bindBtn('touchJump', 'jump');
  bindBtn('touchFly', 'fly');
  bindBtn('touchInv', 'inv');
  bindBtn('touchPlace', 'place');
  bindBtn('touchBreak', 'breaking');
  el.touchInv.addEventListener('touchstart', (e) => { e.preventDefault(); if (gameState === 'playing') { if (inventoryOpen) closeInventory(); else openInventory(); } });
  function act(prop) {
    if (gameState !== 'playing' || inventoryOpen) return;
    ensureAudio();
    if (prop === 'jump') { if (!player.flying && player.onGround) player.vy = 8.6; }
    else if (prop === 'fly') { setFlying(!player.flying); }
    else if (prop === 'place') placeBlock();
    else if (prop === 'breaking') breakBlock();
  }
}

/* ============================ 破坏 / 放置 ============================ */
function cameraDir() {
  const cp = Math.cos(player.pitch);
  return new THREE.Vector3(
    -Math.sin(player.yaw) * cp,
    Math.sin(player.pitch),
    -Math.cos(player.yaw) * cp
  );
}

function breakBlock() {
  const origin = new THREE.Vector3(player.x, player.y + EYE, player.z);
  const hit = raycast(origin, cameraDir(), REACH);
  if (!hit) return;
  const id = getBlock(hit.x, hit.y, hit.z);
  if (BLOCKS[id] && BLOCKS[id].unbreakable) { showToast('基岩无法破坏'); return; }
  setBlock(hit.x, hit.y, hit.z, AIR);
  spawnBreakParticles(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, id, hit.face);
  playBreak(id);
}

// 右键交互：拉杆/按钮等切换状态，否则放置方块
function interactBlock() {
  const origin = new THREE.Vector3(player.x, player.y + EYE, player.z);
  const hit = raycast(origin, cameraDir(), REACH);
  if (!hit) return;
  const id = getBlock(hit.x, hit.y, hit.z);
  const def = BLOCKS[id];
  if (def) {
    if (def.lever) {
      const s = rsGet(hit.x, hit.y, hit.z);
      if (s) { s.on = !s.on; markBlockDirty(hit.x, hit.y, hit.z); rsOnBlockChange(hit.x, hit.y, hit.z); playPlace(); }
      return;
    }
    if (def.button) {
      const s = rsGet(hit.x, hit.y, hit.z);
      if (s && !s.on) { s.on = true; markBlockDirty(hit.x, hit.y, hit.z); rsSchedule(hit.x, hit.y, hit.z, 'button_off', 20); rsOnBlockChange(hit.x, hit.y, hit.z); playPlace(); }
      return;
    }
  }
  placeBlock();
}

function placeBlock() {
  const item = inventory[hotbarSel];
  if (!item) { showToast('请先选择物品'); return; }
  // 只有注册为方块（或液体）的物品才可放置；木棍等纯物品不可放置
  const blockDef = BLOCKS[item.id];
  if (!blockDef) { showToast('该物品无法放置'); return; }
  const origin = new THREE.Vector3(player.x, player.y + EYE, player.z);
  const hit = raycast(origin, cameraDir(), REACH);
  if (!hit) return;
  const px = hit.prev[0], py = hit.prev[1], pz = hit.prev[2];
  // 不能放在玩家身体里
  const ex = player.x, ey = player.y, ez = player.z;
  if (px >= ex - PHW && px <= ex + PHW && py >= ey && py <= ey + PHH && pz >= ez - PHW && pz <= ez + PHW) return;
  const id = item.id;
  const existing = getBlock(px, py, pz);
  if (existing !== AIR && existing !== WATER && !(BLOCKS[existing] && BLOCKS[existing].cross)) return;
  // 花草等 cross 方块只能放在实体方块上
  if (blockDef.cross && !isSolid(getBlock(px, py - 1, pz))) { showToast('只能放在方块上面'); return; }
  setBlock(px, py, pz, id);
  // 红石方块：设置朝向（facing = 面朝玩家放置的方向的反方向）
  if (blockDef.redstone) {
    const facing = facingFromDir(-hit.face[0], -hit.face[1], -hit.face[2]);
    rsSet(px, py, pz, { facing, on: false, power: 0 });
  }
  if (item.count > 0) { item.count--; if (item.count <= 0) inventory[hotbarSel] = null; }
  renderHotbar(); renderInventory();
  playPlace();
}

/* ============================ 粒子系统 ============================ */
// 设计要点：固定容量池，杜绝无限增长；每帧批量更新；
// 用 THREE.Points 一次绘制全部粒子，材质在初始化时创建一次；
// 生命周期结束的粒子回收进空闲槽位，彻底避免内存/GPU 泄漏。
const MAX_PARTICLES = 512;
let particleGeom = null;
let particlePoints = null;
const particlePos = new Float32Array(MAX_PARTICLES * 3);   // 世界坐标
const particleVel = new Float32Array(MAX_PARTICLES * 3);
const particleLife = new Float32Array(MAX_PARTICLES);      // 剩余寿命（秒）
const particleMaxLife = new Float32Array(MAX_PARTICLES);
const particleCol = new Float32Array(MAX_PARTICLES * 3);   // RGB
let particleCount = 0;   // 已占用的槽位（紧凑排列在数组前端）

function initParticles() {
  particleGeom = new THREE.BufferGeometry();
  particleGeom.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
  particleGeom.setAttribute('color', new THREE.BufferAttribute(particleCol, 3));
  particleGeom.setDrawRange(0, 0);
  const mat = new THREE.PointsMaterial({
    size: 0.09,
    vertexColors: true,
    sizeAttenuation: true,
    transparent: true,
    depthWrite: false,
  });
  particlePoints = new THREE.Points(particleGeom, mat);
  particlePoints.frustumCulled = false;
  scene.add(particlePoints);
}

function spawnBreakParticles(cx, cy, cz, blockId, face) {
  const def = BLOCKS[blockId];
  let baseColor = [0.65, 0.65, 0.65];
  if (def) {
    // 用方块顶面纹理的平均色近似（避免读像素，直接用色表）
    baseColor = blockColor(blockId);
  }
  const n = 14; // 每个方块破坏时喷出的粒子数
  for (let i = 0; i < n; i++) {
    if (particleCount >= MAX_PARTICLES) break;
    const idx = particleCount++;
    // 从方块中心向破坏面方向散射
    const ox = face[0] * 0.35 + (Math.random() - 0.5) * 0.5;
    const oy = face[1] * 0.35 + (Math.random() - 0.5) * 0.5;
    const oz = face[2] * 0.35 + (Math.random() - 0.5) * 0.5;
    particlePos[idx * 3] = cx + ox;
    particlePos[idx * 3 + 1] = cy + oy;
    particlePos[idx * 3 + 2] = cz + oz;
    const speed = 1.5 + Math.random() * 2.5;
    particleVel[idx * 3] = face[0] * speed * 0.6 + (Math.random() - 0.5) * 2.2;
    particleVel[idx * 3 + 1] = Math.random() * 3.2 + 1.2;
    particleVel[idx * 3 + 2] = face[2] * speed * 0.6 + (Math.random() - 0.5) * 2.2;
    const life = 0.5 + Math.random() * 0.7;
    particleLife[idx] = life;
    particleMaxLife[idx] = life;
    const shade = 0.75 + Math.random() * 0.5;
    particleCol[idx * 3] = baseColor[0] * shade;
    particleCol[idx * 3 + 1] = baseColor[1] * shade;
    particleCol[idx * 3 + 2] = baseColor[2] * shade;
  }
  particleGeom.setDrawRange(0, particleCount);
  particleGeom.attributes.position.needsUpdate = true;
  particleGeom.attributes.color.needsUpdate = true;
}

// 方块 → 近似粒子颜色表
const PARTICLE_COLORS = {
  [GRASS]: [0.34, 0.71, 0.29], [DIRT]: [0.48, 0.34, 0.2], [STONE]: [0.54, 0.54, 0.54],
  [COBBLE]: [0.47, 0.47, 0.47], [PLANK]: [0.61, 0.42, 0.25], [LOG]: [0.36, 0.26, 0.16],
  [LEAVES]: [0.24, 0.48, 0.18], [SAND]: [0.86, 0.82, 0.6], [GRAVEL]: [0.55, 0.5, 0.44],
  [GLASS]: [0.8, 0.9, 1.0], [BRICK]: [0.65, 0.31, 0.23], [SNOW]: [0.93, 0.96, 0.97],
  [SNOW_GRASS]: [0.93, 0.96, 0.97], [BEDROCK]: [0.18, 0.18, 0.18], [COAL_ORE]: [0.3, 0.3, 0.3],
  [IRON_ORE]: [0.85, 0.71, 0.6], [GOLD_ORE]: [0.95, 0.82, 0.29], [DIAMOND_ORE]: [0.36, 0.88, 0.86],
  [CRAFTING]: [0.61, 0.42, 0.25], [FURNACE]: [0.47, 0.47, 0.47], [STONE_BRICK]: [0.49, 0.49, 0.49],
  [SANDSTONE]: [0.85, 0.81, 0.6], [POPPY]: [0.79, 0.22, 0.22], [DANDELION]: [0.95, 0.82, 0.29],
  [TALL_GRASS]: [0.3, 0.54, 0.23], [WATER]: [0.22, 0.4, 0.85],
};
function blockColor(id) {
  return PARTICLE_COLORS[id] || [0.65, 0.65, 0.65];
}

function updateParticles(dt) {
  if (!particlePoints || particleCount === 0) return;
  const gravity = -14;
  // 从后向前扫描，死的粒子与最后一个活粒子交换，紧凑化
  for (let i = particleCount - 1; i >= 0; i--) {
    particleLife[i] -= dt;
    if (particleLife[i] <= 0) {
      // 与最后一个粒子交换（若 i 不是最后一个）
      const last = particleCount - 1;
      if (i !== last) {
        for (let k = 0; k < 3; k++) {
          particlePos[i * 3 + k] = particlePos[last * 3 + k];
          particleVel[i * 3 + k] = particleVel[last * 3 + k];
          particleCol[i * 3 + k] = particleCol[last * 3 + k];
        }
        particleLife[i] = particleLife[last];
        particleMaxLife[i] = particleMaxLife[last];
      }
      particleCount--;
      continue;
    }
    // 更新速度与位置
    particleVel[i * 3 + 1] += gravity * dt;
    particlePos[i * 3] += particleVel[i * 3] * dt;
    particlePos[i * 3 + 1] += particleVel[i * 3 + 1] * dt;
    particlePos[i * 3 + 2] += particleVel[i * 3 + 2] * dt;
    // 与地面简单碰撞（下沉到固体方块则停在表面并衰减）
    const bx = Math.floor(particlePos[i * 3]);
    const by = Math.floor(particlePos[i * 3 + 1]);
    const bz = Math.floor(particlePos[i * 3 + 2]);
    if (isSolid(getBlock(bx, by, bz))) {
      particlePos[i * 3 + 1] = by + 1.01;
      particleVel[i * 3] *= 0.3;
      particleVel[i * 3 + 2] *= 0.3;
      particleVel[i * 3 + 1] = 0;
    }
  }
  particleGeom.setDrawRange(0, particleCount);
  particleGeom.attributes.position.needsUpdate = true;
  if (particleCount === 0) particlePoints.visible = false;
  else particlePoints.visible = true;
}

/* ============================ 主循环 ============================ */
let lastTime = performance.now();
let fpsFrames = 0, fpsTime = 0, fps = 0;
let sensitivity = 1.0;
let fov = 75;
let debugInfoEnabled = false;
let autoSaveEnabled = true;
const SETTINGS_KEY = 'luminya_mc_settings';
let rsAccum = 0;  // 红石刻计时器

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  // 上下文丢失时跳过渲染，等待恢复
  if (glLost || !renderer) return;

  // 云飘动（跟随玩家，保持水平放置）
  for (const c of clouds) {
    c.userData.offset.x += dt * 1.2;
    if (c.userData.offset.x > 300) c.userData.offset.x = -300;
    c.position.set(player.x + c.userData.offset.x, player.y + c.userData.offset.y, player.z + c.userData.offset.z);
  }

  if (gameState === 'playing') {
    movePlayer(dt);
    updateChunks();
    updateHighlight();
    updateDebug();
    // 红石刻：约每 100ms 一个刻（10 tick/s）
    rsAccum += dt;
    while (rsAccum >= 0.1) { rsAccum -= 0.1; rsTick(); }
    // 自动保存
    if (autoSaveEnabled && now - lastAutoSave > 30000 && activeSaveName) { lastAutoSave = now; saveGame(true); }
  }
  // 粒子更新（暂停时也更新，避免视觉冻结不自然）
  updateParticles(dt);

  // 水下渲染：入水时切换为蓝雾近距离，出水恢复
  updateWaterEffect(dt);

  camera.position.set(player.x, player.y + EYE, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  // 更新相机矩阵与视锥体，供区块剔除使用
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  updateViewFrustum();

  // 天空/太阳/云跟随玩家，保证始终可见
  skyMesh.position.set(player.x, player.y, player.z);
  sunMesh.position.set(player.x + 180, player.y + 260, player.z - 120);
  sunMesh.lookAt(player.x, player.y, player.z);

  renderer.render(scene, camera);

  // FPS
  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 0.5) { fps = Math.round(fpsFrames / fpsTime); fpsFrames = 0; fpsTime = 0; }
}

function updateHighlight() {
  const origin = new THREE.Vector3(player.x, player.y + EYE, player.z);
  const hit = raycast(origin, cameraDir(), REACH);
  if (hit) {
    highlightMesh.visible = true;
    highlightMesh.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    const id = getBlock(hit.x, hit.y, hit.z);
    el.blockInfo.textContent = itemName(id);
    el.blockInfo.classList.remove('hidden');
  } else {
    highlightMesh.visible = false;
    el.blockInfo.classList.add('hidden');
  }
}
const FACING_CN = ['南', '西', '北', '东'];
let fpsHistory = [];

/* ============================ 水下渲染效果 ============================ */
let waterFogTarget = 0;   // 0 = 正常，1 = 水下
let waterFogCurrent = 0;
function updateWaterEffect(dt) {
  const underwater = playerInWater();
  waterFogTarget = underwater ? 1 : 0;
  // 平滑过渡，避免入水/出水瞬间闪烁
  const speed = 6;
  if (Math.abs(waterFogTarget - waterFogCurrent) < 0.001) {
    waterFogCurrent = waterFogTarget;
  } else {
    waterFogCurrent += (waterFogTarget - waterFogCurrent) * Math.min(1, speed * dt);
  }
  if (waterFogCurrent > 0.001) {
    // 水下蓝雾
    const far = Math.max(18, renderDistance * CHUNK * 0.95 * (1 - waterFogCurrent * 0.82));
    scene.fog.color.setHex(0x2a5fa8);
    scene.fog.near = far * 0.15;
    scene.fog.far = far;
    if (waterFogCurrent < 0.5) {
      // 过渡期间混合颜色
      scene.fog.color.setHex(0xbfd7ee).lerp(new THREE.Color(0x2a5fa8), waterFogCurrent * 2);
    }
  } else {
    scene.fog.color.setHex(0xbfd7ee);
    scene.fog.near = renderDistance * CHUNK * 0.45;
    scene.fog.far = renderDistance * CHUNK * 0.95;
  }
}

function updateDebug() {
  if (!debugInfoEnabled) return;
  const px = Math.floor(player.x), py = Math.floor(player.y), pz = Math.floor(player.z);
  el.debugPos.textContent = `XYZ: ${player.x.toFixed(1)} / ${player.y.toFixed(1)} / ${player.z.toFixed(1)}`;
  el.debugFps.textContent = fps + ' FPS';
  const b = biomeAt(px, pz);
  el.debugBiome.textContent = `生物群系: ${BIOME_CN[b] || b}`;
  const cx = Math.floor(player.x / CHUNK), cz = Math.floor(player.z / CHUNK);
  el.debugChunk.textContent = `区块: ${cx}, ${cz} (本地 ${((player.x % CHUNK) + CHUNK) % CHUNK | 0}, ${((player.z % CHUNK) + CHUNK) % CHUNK | 0})`;
  const facing = FACING_CN[Math.round(((player.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 2)) % 4];
  el.debugFacing.textContent = `朝向: ${facing} (yaw ${(player.yaw * 180 / Math.PI).toFixed(1)}°)`;
  el.debugSeed.textContent = `种子: ${worldSeed}`;
  el.debugExtra.textContent = `飞行: ${player.flying ? '开' : '关'} · 着地: ${player.onGround ? '是' : '否'} · 粒子: ${particleCount} · 已加载区块: ${chunks.size}`;
  drawDebugChart();
}

function drawDebugChart() {
  const canvas = el.debugChart;
  if (!canvas) return;
  fpsHistory.push(fps);
  if (fpsHistory.length > 110) fpsHistory.shift();
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const maxFps = 120;
  ctx.strokeStyle = 'rgba(242,193,78,0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < fpsHistory.length; i++) {
    const x = (i / 109) * w;
    const y = h - (Math.min(fpsHistory[i], maxFps) / maxFps) * h;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // 参考线
  ctx.strokeStyle = 'rgba(20,34,48,0.15)';
  ctx.lineWidth = 1;
  for (const pct of [0.5, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, h * pct);
    ctx.lineTo(w, h * pct);
    ctx.stroke();
  }
}
function applyDebugInfo() {
  el.debugInfo.style.display = debugInfoEnabled ? 'flex' : 'none';
}

/* ============================ 启动 ============================ */
function init() {
  el.loadingScreen = $('#loadingScreen');
  el.loadingBarFill = $('#loadingBarFill');
  el.loadingText = $('#loadingText');
  el.menuScreen = $('#menuScreen');
  el.pauseScreen = $('#pauseScreen');
  el.newWorldModal = $('#newWorldModal');
  el.slotsModal = $('#slotsModal');
  el.settingsModal = $('#settingsModal');
  el.hud = $('#hud');
  el.hotbarSlots = $('#hotbarSlots');
  el.inventoryScreen = $('#inventoryScreen');
  el.inventoryGrid = $('#inventoryGrid');
  el.trashSlot = $('#trashSlot');
  el.creativeGrid = $('#creativeGrid');
  el.creativeSide = $('#creativeSide');
  el.inventoryTooltip = $('#inventoryTooltip');
  el.blockInfo = $('#blockInfo');
  el.hoverTooltip = $('#hoverTooltip');
  el.debugInfo = $('#debugInfo');
  el.debugPos = $('#debugPos');
  el.debugFps = $('#debugFps');
  el.debugBiome = $('#debugBiome');
  el.debugChunk = $('#debugChunk');
  el.debugFacing = $('#debugFacing');
  el.debugSeed = $('#debugSeed');
  el.debugExtra = $('#debugExtra');
  el.debugChart = $('#debugChart');
  el.toast = $('#toast');
  el.chat = $('#chat');
  el.chatLog = $('#chatLog');
  el.chatBar = $('#chatBar');
  el.chatInput = $('#chatInput');
  el.chatPrompt = $('#chatPrompt');
  el.slotList = $('#slotList');
  el.touchControls = $('#touchControls');
  el.touchJoystick = $('#touchJoystick');
  el.touchJoystickKnob = $('#touchJoystickKnob');
  el.touchLook = $('#touchLook');
  el.touchJump = $('#touchJump');
  el.touchFly = $('#touchFly');
  el.touchInv = $('#touchInv');
  el.touchPlace = $('#touchPlace');
  el.touchBreak = $('#touchBreak');
  el.renderDistValue = $('#renderDistValue');
  el.sensitivityValue = $('#sensitivityValue');
  el.renderDistance = $('#renderDistance');
  el.sensitivity = $('#sensitivity');
  el.soundEnabled = $('#soundEnabled');
  el.fov = $('#fov');
  el.fovValue = $('#fovValue');
  el.debugInfoEnabled = $('#debugInfoEnabled');
  el.autoSaveEnabled = $('#autoSaveEnabled');
  el.aboutModal = $('#aboutModal');
  el.errorScreen = $('#errorScreen');

  loadSettings();
  loadChatHistory();
  buildAtlas();
  try {
    initThree();
    initParticles();
  } catch (e) {
    console.error('WebGL 初始化失败：', e);
    showGLErrorScreen();
    return;
  }
  bindInput();
  renderHotbar(); renderCreative();
  applyDebugInfo();

  // 菜单按钮
  $('#btnNewWorld').onclick = () => { el.newWorldModal.classList.remove('hidden'); };
  $('#btnCancelNew').onclick = () => el.newWorldModal.classList.add('hidden');
  $('#btnConfirmNew').onclick = () => {
    const name = ($('#worldName').value || '我的世界').trim();
    const seedStr = ($('#worldSeed').value || '').trim();
    const seed = seedStr ? hashString(seedStr) : (Math.random() * 2 ** 31) | 0;
    el.newWorldModal.classList.add('hidden');
    startGame(null, name, seed);
  };
  $('#btnContinue').onclick = () => {
    const saves = getSaves();
    const slot = saves.slots.find(s => s.name === saves.active);
    if (slot && slot.data) startGame(slot.data, slot.name, slot.seed);
    else showToast('没有可继续的存档');
  };
  $('#btnLoadSlots').onclick = () => { renderSlotList(); el.slotsModal.classList.remove('hidden'); };
  $('#btnCloseSlots').onclick = () => el.slotsModal.classList.add('hidden');
  $('#btnSettings').onclick = openSettings;
  $('#btnPauseSettings').onclick = openSettings;
  $('#btnCancelSettings').onclick = () => el.settingsModal.classList.add('hidden');
  $('#btnConfirmSettings').onclick = () => {
    fov = parseInt(el.fov.value, 10);
    renderDistance = parseInt(el.renderDistance.value, 10);
    sensitivity = parseFloat(el.sensitivity.value);
    soundOn = el.soundEnabled.checked;
    debugInfoEnabled = el.debugInfoEnabled.checked;
    autoSaveEnabled = el.autoSaveEnabled.checked;
    applyFov();
    applyDebugInfo();
    scene.fog.near = renderDistance * CHUNK * 0.45;
    scene.fog.far = renderDistance * CHUNK * 0.95;
    saveSettings();
    el.settingsModal.classList.add('hidden');
    showToast('设置已保存');
  };
  $('#btnResume').onclick = resumeGame;
  $('#btnSaveGame').onclick = () => saveGame(false);
  $('#btnQuitToMenu').onclick = () => { saveGame(true); showMenu(); };
  $('#btnAbout').onclick = () => el.aboutModal.classList.remove('hidden');
  $('#btnCloseAbout').onclick = () => el.aboutModal.classList.add('hidden');
  $('#btnInventory').onclick = () => { if (inventoryOpen) closeInventory(); else openInventory(); };
  $('#btnMenu').onclick = () => { if (gameState === 'playing') pauseGame(); };
  $('#btnCloseInventory').onclick = closeInventory;

  // 物品悬停气泡：鼠标悬停在槽位上时显示物品名，跟随鼠标
  document.addEventListener('mouseover', (e) => {
    const slot = e.target.closest('.slot');
    if (!slot) return;
    const grid = slot.dataset.grid, idx = Number(slot.dataset.index);
    let name = null;
    if (grid === 'creative') {
      name = itemName(Number(idx));
    } else if (grid === 'inv' || grid === 'hotbar') {
      const it = inventory[idx];
      if (it) name = itemName(it.id);
    }
    if (name) {
      el.hoverTooltip.textContent = name;
      el.hoverTooltip.classList.remove('hidden');
      el.hoverTooltip.style.left = (e.clientX + 12) + 'px';
      el.hoverTooltip.style.top = (e.clientY + 12) + 'px';
    }
  });
  document.addEventListener('mouseout', (e) => {
    const slot = e.target.closest('.slot');
    if (slot) el.hoverTooltip.classList.add('hidden');
  });
  document.addEventListener('mousemove', (e) => {
    if (!el.hoverTooltip.classList.contains('hidden')) {
      el.hoverTooltip.style.left = (e.clientX + 12) + 'px';
      el.hoverTooltip.style.top = (e.clientY + 12) + 'px';
    }
  });

  // 槽位点击
  document.addEventListener('mousedown', (e) => {
    // 销毁格
    if (e.target.closest('#trashSlot')) {
      e.preventDefault();
      onSlotMouseDown(e, 'trash', 0);
      return;
    }
    const slot = e.target.closest('.slot');
    if (!slot) return;
    const grid = slot.dataset.grid, idx = Number(slot.dataset.index);
    // HUD 快捷栏点击：直接切换选中
    if (grid === 'hotbar' && !inventoryOpen) {
      hotbarSel = idx;
      renderHotbar();
      return;
    }
    // 物品栏内的快捷栏格：空光标左键 → 选中该格；右键或带光标 → 整理物品
    if (grid === 'inv' && inventoryOpen && e.button === 0 && !cursorItem) {
      hotbarSel = idx;
      renderHotbar();
      renderInventory();
      return;
    }
    onSlotMouseDown(e, grid, idx);
  });

  el.renderDistance.addEventListener('input', () => el.renderDistValue.textContent = el.renderDistance.value);
  el.sensitivity.addEventListener('input', () => el.sensitivityValue.textContent = parseFloat(el.sensitivity.value).toFixed(1));
  el.fov.addEventListener('input', () => el.fovValue.textContent = el.fov.value);

  function openSettings() {
    el.fov.value = fov;
    el.fovValue.textContent = fov;
    el.renderDistance.value = renderDistance;
    el.sensitivity.value = sensitivity;
    el.soundEnabled.checked = soundOn;
    el.debugInfoEnabled.checked = debugInfoEnabled;
    el.autoSaveEnabled.checked = autoSaveEnabled;
    el.renderDistValue.textContent = renderDistance;
    el.sensitivityValue.textContent = sensitivity.toFixed(1);
    el.settingsModal.classList.remove('hidden');
  }

  showMenu();
  el.loadingScreen.classList.add('hidden');
  requestAnimationFrame(animate);

  // 错误遮罩按钮
  $('#btnRetryGL').onclick = () => {
    el.errorScreen.classList.add('hidden');
    location.reload();
  };
  $('#btnReloadPage').onclick = () => location.reload();
}

/* WebGL 初始化失败时显示错误遮罩 */
function showGLErrorScreen() {
  el.loadingScreen.classList.add('hidden');
  el.menuScreen.classList.add('hidden');
  el.pauseScreen.classList.add('hidden');
  el.hud.classList.add('hidden');
  if (el.errorScreen) el.errorScreen.classList.remove('hidden');
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* ============================ 设置持久化 ============================ */
function applyFov() {
  camera.fov = fov;
  camera.updateProjectionMatrix();
}
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (typeof s.renderDistance === 'number') renderDistance = s.renderDistance;
    if (typeof s.sensitivity === 'number') sensitivity = s.sensitivity;
    if (typeof s.fov === 'number') fov = s.fov;
    if (typeof s.soundOn === 'boolean') soundOn = s.soundOn;
    if (typeof s.debugInfo === 'boolean') debugInfoEnabled = s.debugInfo;
    if (typeof s.autoSave === 'boolean') autoSaveEnabled = s.autoSave;
  } catch (e) { /* 忽略损坏的设置 */ }
}
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      renderDistance, sensitivity, fov, soundOn, debugInfo: debugInfoEnabled, autoSave: autoSaveEnabled,
    }));
  } catch (e) { /* 忽略 */ }
}

init();
