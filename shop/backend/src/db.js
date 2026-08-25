// ============================================================
// LumiNya Shop · 数据访问辅助
// ============================================================
import { randomId, hashPassword } from './utils.js';

/** 首次运行时播种管理员账号（由 env 提供） */
export async function seedAdmin(env) {
  const email = String(env.ADMIN_EMAIL || 'admin@luminya.cc').trim();
  const password = String(env.ADMIN_PASSWORD || 'change-me-now');
  if (!email || !password) return;

  const existing = await env.DB.prepare(
    'SELECT id FROM users WHERE role = ?1 LIMIT 1'
  ).bind('admin').first();
  if (existing) return;

  const { hash, salt } = await hashPassword(password);
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, salt, role, display_name, disabled, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, 'admin', '管理员', 0, ?5, ?5)`
  ).bind(randomId('u'), email, hash, salt, now).run();
}

/** 校验管理员邮箱在 users 表中是否存在且未禁用 */
export async function findAdmin(env, email) {
  return env.DB.prepare(
    'SELECT * FROM users WHERE email = ?1 AND role = ?2 AND disabled = 0 LIMIT 1'
  ).bind(email, 'admin').first();
}

/** 查询商品（带分类过滤/搜索/分页），只返回上架商品 */
export async function listProducts(env, { category, search, page = 1, size = 12 } = {}) {
  const conditions = [`status = 'on'`];
  const params = [];
  if (category) {
    conditions.push('category_id = ?' + (params.length + 1));
    params.push(category);
  }
  if (search) {
    conditions.push('(title LIKE ?' + (params.length + 1) + ' OR summary LIKE ?' + (params.length + 1) + ')');
    params.push(`%${search}%`, `%${search}%`);
  }
  const where = conditions.join(' AND ');
  const p = Math.max(1, parseInt(page, 10) || 1);
  const s = Math.min(50, Math.max(1, parseInt(size, 10) || 12));
  const offset = (p - 1) * s;

  const { results } = await env.DB.prepare(
    `SELECT * FROM products WHERE ${where} ORDER BY created_at DESC LIMIT ?${params.length + 1} OFFSET ?${params.length + 2}`
  ).bind(...params, s, offset).all();

  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM products WHERE ${where}`
  ).bind(...params).first();

  return { results: results.map(publicProduct), total: countRow.total };
}

/** 单个商品详情（含 SKU），仅上架可公开访问 */
export async function getProduct(env, id) {
  const product = await env.DB.prepare(
    `SELECT * FROM products WHERE id = ?1 AND status = 'on' LIMIT 1`
  ).bind(id).first();
  if (!product) return null;

  const { results: variants } = await env.DB.prepare(
    'SELECT * FROM product_variants WHERE product_id = ?1 AND enabled = 1 ORDER BY created_at'
  ).bind(id).all();

  return { ...publicProduct(product), variants };
}

/** 把 DB 行转成对外安全的商品结构 */
export function publicProduct(row) {
  return {
    id: row.id,
    category_id: row.category_id,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    description: row.description,
    images: safeJson(row.images, []),
    type: row.type,
    price: row.price,
    stock: row.stock,
    resource_url: row.resource_url,
    sold: row.sold,
    created_at: row.created_at
  };
}

export function safeJson(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
