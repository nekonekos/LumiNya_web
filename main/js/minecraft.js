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
  'poppy', 'dandelion', 'tall_grass', 'stick'
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
const RECIPES = [
  { shapeless: true, input: [LOG], result: { id: PLANK, count: 4 } },
  { shapeless: true, input: [SAND], result: { id: GLASS, count: 1 } },
  {
    pattern: ['P', 'P'], key: { P: PLANK }, result: { id: STICK, count: 4 }
  },
  {
    pattern: ['PP', 'PP'], key: { P: PLANK }, result: { id: CRAFTING, count: 1 }
  },
  {
    pattern: ['SS', 'SS'], key: { S: STONE }, result: { id: STONE_BRICK, count: 4 }
  },
  {
    pattern: ['CCC', 'C C', 'CCC'], key: { C: COBBLE }, result: { id: FURNACE, count: 1 }
  },
  {
    pattern: ['C', 'S'], key: { C: COAL_ORE, S: STICK }, result: { id: TORCH, count: 4 }
  },
];

/* ============================ 世界数据 ============================ */
const chunks = new Map();        // key "cx,cz" -> chunk
const editsByChunk = new Map();  // key -> Map(localIdx -> blockId)
let noise = null;
let worldSeed = 0;
let player = { x: 8, y: 40, z: 8, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, onGround: false, flying: false };
let inventory = new Array(36).fill(null);
let hotbarSel = 0;
let renderDistance = 4;

const ckey = (cx, cz) => cx + ',' + cz;
const cidx = (lx, ly, lz) => (ly * CHUNK + lz) * CHUNK + lx;

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
}
function markDirty(cx, cz) {
  const c = chunks.get(ckey(cx, cz));
  if (c && c.generated) c.dirty = true;
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
  return !!(b && b.transparent);
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
        if (def.cross) {
          addCross(builders.cutout, px, py, pz, def.top);
          continue;
        }
        const isWater = id === WATER;
        const isGlass = id === GLASS;
        const isCutout = !!def.cutout;
        const target = isWater ? builders.water : isGlass ? builders.glass : isCutout ? builders.cutout : builders.opaque;
        for (const face of FACES) {
          const nx = face.n[0], ny = face.n[1], nz = face.n[2];
          const nb = getBlock(wx + nx, wy + ny, wz + nz);
          if (!shouldRenderFace(id, nb)) continue;
          const tile = face.d === 1 ? (ny > 0 ? def.top : def.bottom) : def.side;
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
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(chunk.cx * CHUNK, 0, chunk.cz * CHUNK);
    group.add(mesh);
  }
  scene.add(group);
  chunk.group = group;
  chunk.dirty = false;
}

/* ============================ 玩家碰撞 ============================ */
const PHW = 0.3, PHH = 1.8, EYE = 1.62;
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
  const speed = player.flying ? 11 : 4.4;
  const sprint = keys.has('ControlLeft') || keys.has('ControlRight');
  const k = 1 - Math.exp(-11 * dt);

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
    player.vx += (mx * sp - player.vx) * k;
    player.vz += (mz * sp - player.vz) * k;
  }

  if (player.flying) {
    const up = (keys.has('Space') ? 1 : 0) - (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : 0);
    player.vy += (up * speed - player.vy) * k;
  } else {
    player.vy -= 26 * dt;
    if (player.vy < -40) player.vy = -40;
    if (player.onGround && (keys.has('Space') || touch.jump)) { player.vy = 8.6; player.onGround = false; touch.jump = false; }
  }

  // X 轴
  player.x += player.vx * dt;
  if (boxCollides(player.x, player.y, player.z)) { player.x -= player.vx * dt; player.vx = 0; }
  // Z 轴
  player.z += player.vz * dt;
  if (boxCollides(player.x, player.y, player.z)) { player.z -= player.vz * dt; player.vz = 0; }
  // Y 轴
  player.y += player.vy * dt;
  if (boxCollides(player.x, player.y, player.z)) {
    if (player.vy < 0) player.onGround = true;
    player.y -= player.vy * dt; player.vy = 0;
  } else {
    player.onGround = false;
  }
  if (player.flying) player.onGround = false;
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

function initThree() {
  const canvas = document.getElementById('gameCanvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

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

  // 太阳
  sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(16, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff2bf, fog: false })
  );
  sunMesh.position.set(180, 260, -120);
  scene.add(sunMesh);

  // 云
  const cloudTex = makeCloudTexture();
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(60 + Math.random() * 50, 24 + Math.random() * 16),
      new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.55, fog: false, side: THREE.DoubleSide })
    );
    m.userData.offset = new THREE.Vector3((Math.random() - 0.5) * 500, 80 + Math.random() * 20, (Math.random() - 0.5) * 500);
    m.position.copy(m.userData.offset);
    m.rotation.z = (Math.random() - 0.5) * 0.2;
    clouds.push(m);
    scene.add(m);
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
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/* ============================ 区块流式加载 ============================ */
function updateChunks() {
  const pcx = Math.floor(player.x / CHUNK), pcz = Math.floor(player.z / CHUNK);
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
  let genBudget = 1, meshBudget = 3;
  for (const [cx, cz] of wanted) {
    const k = ckey(cx, cz);
    let chunk = chunks.get(k);
    if (!chunk) {
      chunk = { cx, cz, generated: false, data: new Uint8Array(CHUNK * CHUNK * HEIGHT), group: null, dirty: true };
      chunks.set(k, chunk);
    }
    if (!chunk.generated && genBudget > 0) { generateChunk(chunk); genBudget--; markDirty(cx - 1, cz); markDirty(cx + 1, cz); markDirty(cx, cz - 1); markDirty(cx, cz + 1); }
    if (chunk.generated && chunk.dirty && meshBudget > 0) { meshChunk(chunk); meshBudget--; }
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
  // 主背包 9..35 排三行，快捷栏 0..8 排最后一行
  const order = [];
  for (let i = 9; i < 36; i++) order.push(i);
  for (let i = 0; i < 9; i++) order.push(i);
  order.forEach((idx) => {
    const s = makeSlot(el.inventoryGrid, idx, 'inv');
    slotContent(s, inventory[idx]);
    if (idx === hotbarSel && idx < 9) s.classList.add('selected');
  });
}

function renderCrafting() {
  el.craftingGrid.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const s = makeSlot(el.craftingGrid, i, 'craft');
    slotContent(s, craftingGrid[i]);
  }
  renderCraftResult();
}
function renderCraftResult() {
  el.craftingResult.innerHTML = '';
  const r = matchRecipe(craftingGrid);
  if (r) {
    const s = document.createElement('div');
    s.className = 'slot';
    s.dataset.grid = 'result';
    slotContent(s, { id: r.id, count: r.count });
    el.craftingResult.appendChild(s);
  }
}

function renderCreative() {
  el.creativeGrid.innerHTML = '';
  const ids = Object.keys(BLOCKS).map(Number).filter(id => id !== AIR).sort((a, b) => a - b);
  for (const id of ids) {
    const s = makeSlot(el.creativeGrid, id, 'creative');
    slotContent(s, { id, count: -1 });
    const name = document.createElement('span');
    name.className = 'slot-index';
    name.textContent = BLOCKS[id].name;
    s.title = BLOCKS[id].name;
  }
}

/* ============================ 合成匹配 ============================ */
let craftingGrid = new Array(9).fill(null);
function matchRecipe(grid) {
  const ids = grid.map(s => (s ? s.id : 0));
  for (const r of RECIPES) {
    if (r.shapeless) {
      const have = ids.filter(id => id !== 0).sort();
      const need = [...r.input].sort();
      if (have.length === need.length && have.every((v, i) => v === need[i])) return r.result;
    } else {
      const h = r.pattern.length, w = Math.max(...r.pattern.map(p => p.length));
      for (let dy = 0; dy + h <= 3; dy++) for (let dx = 0; dx + w <= 3; dx++) {
        let ok = true;
        for (let gy = 0; gy < 3; gy++) for (let gx = 0; gx < 3; gx++) {
          const inPat = gy >= dy && gy < dy + h && gx >= dx && gx < dx + w;
          const patChar = inPat ? r.pattern[gy - dy][gx - dx] : ' ';
          const wantId = patChar === ' ' ? 0 : r.key[patChar];
          const haveId = ids[gy * 3 + gx];
          if (wantId !== haveId) { ok = false; break; }
        }
        if (ok) return r.result;
      }
    }
  }
  return null;
}

function doCraft() {
  const r = matchRecipe(craftingGrid);
  if (!r) return;
  const consumed = [];
  for (let i = 0; i < 9; i++) {
    const s = craftingGrid[i];
    if (!s) continue;
    if (s.count > 0) { s.count--; if (s.count <= 0) craftingGrid[i] = null; }
    // count === -1（无限）不消耗
  }
  giveItem(r.id, r.count);
  renderCrafting();
}

function giveItem(id, count) {
  // 先放入光标，其次堆叠，再找空位
  if (cursorItem && cursorItem.id === id && cursorItem.count > 0) {
    const space = MAX_STACK - cursorItem.count;
    const add = Math.min(space, count);
    cursorItem.count += add; count -= add;
  }
  for (let i = 0; i < 36 && count > 0; i++) {
    const s = inventory[i];
    if (s && s.id === id && s.count > 0 && s.count < MAX_STACK) {
      const add = Math.min(MAX_STACK - s.count, count);
      s.count += add; count -= add;
    }
  }
  for (let i = 0; i < 36 && count > 0; i++) {
    if (!inventory[i]) { inventory[i] = { id, count: Math.min(count, MAX_STACK) }; count -= Math.min(count, MAX_STACK); }
  }
  if (count > 0) showToast('背包已满');
  renderHotbar(); renderInventory();
}

/* ============================ 背包交互 ============================ */
let cursorItem = null;

function slotItems(grid, idx) {
  if (grid === 'inv' || grid === 'hotbar') return inventory;
  if (grid === 'craft') return craftingGrid;
  return null;
}
function setSlotItems(grid, idx, val) {
  if (grid === 'inv' || grid === 'hotbar') { inventory[idx] = val; renderHotbar(); renderInventory(); }
  else if (grid === 'craft') { craftingGrid[idx] = val; renderCrafting(); }
}

function onSlotMouseDown(e, grid, idx) {
  e.preventDefault();
  if (grid === 'creative') {
    const id = Number(idx);
    const target = hotbarSel;
    inventory[target] = { id, count: -1 };
    renderHotbar(); renderInventory();
    showToast(BLOCKS[id].name);
    return;
  }
  if (grid === 'result') {
    if (e.button === 0) doCraft();
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
  if (saveData) {
    player = {
      x: saveData.player.pos[0], y: saveData.player.pos[1], z: saveData.player.pos[2],
      yaw: saveData.player.yaw, pitch: saveData.player.pitch, vx: 0, vy: 0, vz: 0, onGround: false, flying: false
    };
    inventory = saveData.inventory.map(s => (s && s.id ? { id: s.id, count: s.count } : null));
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
    inventory = new Array(36).fill(null);
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
  // 初始加载区块（异步，带进度）
  initialLoad(() => {
    el.loadingScreen.classList.add('hidden');
    // 通过点击遮罩获取用户手势后再锁定指针
    if (!isTouch) {
      el.clickCatcher.classList.remove('hidden');
    }
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
  el.clickCatcher.classList.add('hidden');
  exitPointerLock();
}
function resumeGame() {
  if (gameState !== 'paused') return;
  el.pauseScreen.classList.add('hidden');
  gameState = 'playing';
  if (!isTouch) { el.clickCatcher.classList.remove('hidden'); }
  else requestPointerLock();
}
function openInventory() {
  if (gameState !== 'playing') return;
  inventoryOpen = true;
  el.inventoryScreen.classList.remove('hidden');
  el.touchControls.classList.add('hidden');
  renderInventory(); renderCrafting();
  exitPointerLock();
}
function closeInventory() {
  inventoryOpen = false;
  el.inventoryScreen.classList.add('hidden');
  el.inventoryTooltip.classList.add('hidden');
  if (isTouch) el.touchControls.classList.remove('hidden');
  if (gameState === 'playing') {
    if (isTouch) requestPointerLock();
    else el.clickCatcher.classList.remove('hidden');
  }
}
function requestPointerLock() {
  if (!isTouch && gameState === 'playing') {
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

function bindInput() {
  const canvas = document.getElementById('gameCanvas');
  canvas.addEventListener('mousedown', () => {
    if (gameState === 'playing' && !inventoryOpen) requestPointerLock();
  });

  el.clickCatcher.addEventListener('click', () => {
    if (gameState !== 'playing') return;
    el.clickCatcher.classList.add('hidden');
    requestPointerLock();
  });

  document.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'KeyE' && gameState === 'playing') { if (inventoryOpen) closeInventory(); else openInventory(); }
    if (e.code === 'KeyF' && gameState === 'playing' && !inventoryOpen) { player.flying = !player.flying; showToast(player.flying ? '飞行模式：开' : '飞行模式：关'); }
    if (e.code === 'Escape') {
      if (inventoryOpen) { closeInventory(); return; }
      if (gameState === 'playing') pauseGame();
      else if (gameState === 'paused') resumeGame();
    }
    if (e.code === 'F3') { e.preventDefault(); debugInfoEnabled = !debugInfoEnabled; applyDebugInfo(); saveSettings(); }
    if (gameState === 'playing' && !inventoryOpen) {
      const num = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];
      const ni = num.indexOf(e.code);
      if (ni >= 0) { hotbarSel = ni; renderHotbar(); }
      if (e.code === 'Space') e.preventDefault();
    }
  });
  document.addEventListener('keyup', (e) => keys.delete(e.code));
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
    else if (e.button === 2) placeBlock();
  });
  document.addEventListener('contextmenu', (e) => { if (gameState === 'playing') e.preventDefault(); });
  document.addEventListener('wheel', (e) => {
    if (gameState !== 'playing' || inventoryOpen) return;
    hotbarSel = (hotbarSel + (e.deltaY > 0 ? 1 : -1) + 9) % 9;
    renderHotbar();
  });
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    if (!locked && gameState === 'playing' && !inventoryOpen) {
      // 指针解锁：显示点击继续遮罩，而不是直接暂停
      el.clickCatcher.classList.remove('hidden');
    }
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
    else if (prop === 'fly') { player.flying = !player.flying; showToast(player.flying ? '飞行模式：开' : '飞行模式：关'); }
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
  playBreak(id);
}

function placeBlock() {
  const item = inventory[hotbarSel];
  if (!item || item.id === STICK) { showToast('请先选择要放置的方块'); return; }
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
  setBlock(px, py, pz, id);
  if (item.count > 0) { item.count--; if (item.count <= 0) inventory[hotbarSel] = null; }
  renderHotbar(); renderInventory();
  playPlace();
}

/* ============================ 主循环 ============================ */
let lastTime = performance.now();
let fpsFrames = 0, fpsTime = 0, fps = 0;
let sensitivity = 1.0;
let fov = 75;
let debugInfoEnabled = false;
let autoSaveEnabled = true;
const SETTINGS_KEY = 'luminya_mc_settings';

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  // 云飘动（跟随玩家）
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
    // 自动保存
    if (autoSaveEnabled && now - lastAutoSave > 30000 && activeSaveName) { lastAutoSave = now; saveGame(true); }
  }

  camera.position.set(player.x, player.y + EYE, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);

  // 天空/太阳/云跟随玩家，保证始终可见
  skyMesh.position.set(player.x, player.y, player.z);
  sunMesh.position.set(player.x + 180, player.y + 260, player.z - 120);

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
  } else {
    highlightMesh.visible = false;
  }
}
function updateDebug() {
  if (!debugInfoEnabled) return;
  el.debugPos.textContent = `XYZ: ${player.x.toFixed(1)} / ${player.y.toFixed(1)} / ${player.z.toFixed(1)}`;
  el.debugFps.textContent = fps + ' FPS';
  const b = biomeAt(Math.floor(player.x), Math.floor(player.z));
  el.debugBiome.textContent = BIOME_CN[b] || b;
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
  el.craftingGrid = $('#craftingGrid');
  el.craftingResult = $('#craftingResult');
  el.creativeGrid = $('#creativeGrid');
  el.creativeSide = $('#creativeSide');
  el.inventoryTooltip = $('#inventoryTooltip');
  el.debugInfo = $('#debugInfo');
  el.debugPos = $('#debugPos');
  el.debugFps = $('#debugFps');
  el.debugBiome = $('#debugBiome');
  el.toast = $('#toast');
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
  el.clickCatcher = $('#clickCatcher');
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

  loadSettings();
  buildAtlas();
  initThree();
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

  // 槽位点击
  document.addEventListener('mousedown', (e) => {
    const slot = e.target.closest('.slot');
    if (!slot) return;
    const grid = slot.dataset.grid, idx = Number(slot.dataset.index);
    // HUD 快捷栏点击：直接切换选中
    if (grid === 'hotbar' && !inventoryOpen) {
      hotbarSel = idx;
      renderHotbar();
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
