// ============================================================
// 管理 API：/api/admin/*
// 鉴权：管理员登录返回 JWT（role=admin），后续请求 Bearer 携带
// ============================================================
import {
  json, error, readJson, authUser,
  randomId, verifyPassword, signJwt
} from '../utils.js';
import { safeJson, publicProduct } from '../db.js';

export async function handleAdmin(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;

  // ---- 登录（公开） ----
  if (path === '/api/admin/login' && method === 'POST') return adminLogin(request, env);

  // ---- 以下需要管理员鉴权 ----
  const admin = await requireAdmin(request, env);
  if (admin === null) return error('未授权', 401);

  // 看板
  if (path === '/api/admin/dashboard' && method === 'GET') return dashboard(env);

  // 商品
  if (path === '/api/admin/products' && method === 'GET') return adminProducts(env);
  if (path === '/api/admin/products' && method === 'POST') return adminCreateProduct(request, env);
  const productMatch = path.match(/^\/api\/admin\/products\/([^/]+)$/);
  if (productMatch && method === 'GET') return adminGetProduct(env, productMatch[1]);
  if (productMatch && method === 'PUT') return adminUpdateProduct(request, env, productMatch[1]);
  if (productMatch && method === 'DELETE') return adminDeleteProduct(env, productMatch[1]);

  // 分类
  if (path === '/api/admin/categories' && method === 'GET') return adminCategories(env);
  if (path === '/api/admin/categories' && method === 'POST') return adminCreateCategory(request, env);
  const catMatch = path.match(/^\/api\/admin\/categories\/([^/]+)$/);
  if (catMatch && method === 'PUT') return adminUpdateCategory(request, env, catMatch[1]);
  if (catMatch && method === 'DELETE') return adminDeleteCategory(env, catMatch[1]);

  // 订单
  if (path === '/api/admin/orders' && method === 'GET') return adminOrders(env, url);
  const orderMatch = path.match(/^\/api\/admin\/orders\/([^/]+)$/);
  if (orderMatch && method === 'GET') return adminOrderDetail(env, orderMatch[1]);
  const orderStatusMatch = path.match(/^\/api\/admin\/orders\/([^/]+)\/status$/);
  if (orderStatusMatch && method === 'PUT') {
    return adminSetOrderStatus(request, env, orderStatusMatch[1]);
  }

  // 用户
  if (path === '/api/admin/users' && method === 'GET') return adminUsers(env);
  const userMatch = path.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (userMatch && method === 'PUT') return adminUpdateUser(request, env, userMatch[1]);

  // 激活码池
  if (path === '/api/admin/codes' && method === 'GET') return adminCodes(env, url);
  if (path === '/api/admin/codes' && method === 'POST') return adminAddCodes(request, env);
  const codeMatch = path.match(/^\/api\/admin\/codes\/([^/]+)$/);
  if (codeMatch && method === 'DELETE') return adminDeleteCode(env, codeMatch[1]);

  return error('Not Found', 404);
}

async function requireAdmin(request, env) {
  const payload = await authUser(request, env);
  if (!payload) return null;
  if (payload.role !== 'admin') return null;
  const user = await env.DB.prepare('SELECT id FROM users WHERE id = ?1 AND role = ?2 AND disabled = 0')
    .bind(payload.sub, 'admin').first();
  return user || null;
}

// ---------- 登录 ----------

async function adminLogin(request, env) {
  const body = await readJson(request);
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');

  const user = await env.DB.prepare(
    'SELECT * FROM users WHERE email = ?1 AND role = ?2'
  ).bind(email, 'admin').first();
  if (!user) return error('账号或密码错误', 401);
  if (user.disabled) return error('账号已被禁用', 403);

  const ok = await verifyPassword(password, user.password_hash, user.salt);
  if (!ok) return error('账号或密码错误', 401);

  const token = await signJwt({ sub: user.id, email: user.email, role: 'admin' }, env.JWT_SECRET);
  return json({ token, user: { id: user.id, email: user.email, role: 'admin' } });
}

// ---------- 看板 ----------

async function dashboard(env) {
  const now = Math.floor(Date.now() / 1000);
  const dayAgo = now - 86400;

  const ordersTotal = await env.DB.prepare('SELECT COUNT(*) AS c FROM orders').first();
  const ordersToday = await env.DB.prepare('SELECT COUNT(*) AS c FROM orders WHERE created_at >= ?1').bind(dayAgo).first();
  const paidOrders = await env.DB.prepare("SELECT COUNT(*) AS c FROM orders WHERE status IN ('paid','shipped','completed')").first();
  const revenue = await env.DB.prepare(
    "SELECT COALESCE(SUM(total), 0) AS s FROM orders WHERE status IN ('paid','shipped','completed')"
  ).first();
  const usersTotal = await env.DB.prepare('SELECT COUNT(*) AS c FROM users WHERE role = ?1').bind('user').first();
  const productsTotal = await env.DB.prepare('SELECT COUNT(*) AS c FROM products').first();
  const pendingOrders = await env.DB.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'pending'").first();

  return json({
    dashboard: {
      orders_total: ordersTotal.c,
      orders_today: ordersToday.c,
      paid_orders: paidOrders.c,
      revenue: revenue.s,
      users_total: usersTotal.c,
      products_total: productsTotal.c,
      pending_orders: pendingOrders.c
    }
  });
}

// ---------- 商品 ----------

async function adminProducts(env) {
  const { results } = await env.DB.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  return json({ products: results.map((p) => ({ ...publicProduct(p), status: p.status })) });
}

async function adminGetProduct(env, id) {
  const product = await env.DB.prepare('SELECT * FROM products WHERE id = ?1').bind(id).first();
  if (!product) return error('商品不存在', 404);
  const { results: variants } = await env.DB.prepare(
    'SELECT * FROM product_variants WHERE product_id = ?1 ORDER BY created_at'
  ).bind(id).all();
  return json({ product: { ...publicProduct(product), status: product.status, shipping_template_id: product.shipping_template_id }, variants });
}

async function adminCreateProduct(request, env) {
  const body = await readJson(request);
  const data = normalizeProduct(body);
  if (data.error) return error(data.error, 400);

  const now = Math.floor(Date.now() / 1000);
  const id = randomId('p');
  await env.DB.prepare(
    `INSERT INTO products
     (id, category_id, title, slug, summary, description, images, type, price, status, stock, resource_url, shipping_template_id, sold, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 0, ?14, ?14)`
  ).bind(
    id, data.category_id, data.title, data.slug, data.summary, data.description,
    JSON.stringify(data.images), data.type, data.price, data.status, data.stock,
    data.resource_url, data.shipping_template_id, now
  ).run();

  // 可选 SKU
  if (Array.isArray(body?.variants)) {
    for (const v of body.variants) {
      await insertVariant(env, id, v);
    }
  }

  return json({ id }, 201);
}

async function adminUpdateProduct(request, env, id) {
  const exists = await env.DB.prepare('SELECT id FROM products WHERE id = ?1').bind(id).first();
  if (!exists) return error('商品不存在', 404);

  const body = await readJson(request);
  const data = normalizeProduct(body);
  if (data.error) return error(data.error, 400);

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE products SET
       category_id = ?1, title = ?2, slug = ?3, summary = ?4, description = ?5,
       images = ?6, type = ?7, price = ?8, status = ?9, stock = ?10,
       resource_url = ?11, shipping_template_id = ?12, updated_at = ?13
     WHERE id = ?14`
  ).bind(
    data.category_id, data.title, data.slug, data.summary, data.description,
    JSON.stringify(data.images), data.type, data.price, data.status, data.stock,
    data.resource_url, data.shipping_template_id, now, id
  ).run();

  return json({ ok: true });
}

async function adminDeleteProduct(env, id) {
  await env.DB.prepare('DELETE FROM product_variants WHERE product_id = ?1').bind(id).run();
  const res = await env.DB.prepare('DELETE FROM products WHERE id = ?1').bind(id).run();
  return res.meta.changes ? json({ ok: true }) : error('商品不存在', 404);
}

function normalizeProduct(body) {
  const title = String(body?.title || '').trim();
  if (!title) return { error: '商品标题不能为空' };
  const slug = String(body?.slug || '').trim() || slugify(title);
  const type = body?.type === 'physical' ? 'physical' : 'virtual';
  const status = ['draft', 'on', 'off'].includes(body?.status) ? body.status : 'draft';
  return {
    category_id: body?.category_id || null,
    title,
    slug,
    summary: String(body?.summary || '').slice(0, 300),
    description: String(body?.description || ''),
    images: Array.isArray(body?.images) ? body.images.map(String).slice(0, 10) : [],
    type,
    price: int(body?.price),
    status,
    stock: Math.max(0, int(body?.stock)),
    resource_url: type === 'virtual' ? String(body?.resource_url || '').trim() : '',
    shipping_template_id: body?.shipping_template_id || null
  };
}

function slugify(s) {
  return s.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\u4e00-\u9fa5-]/g, '').slice(0, 64) || 'item';
}

function int(v) {
  const n = parseInt(v, 10);
  return isNaN(n) ? 0 : n;
}

async function insertVariant(env, productId, v) {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO product_variants (id, product_id, name, sku, price, stock, enabled, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
  ).bind(
    randomId('v'), productId,
    String(v?.name || '').trim(),
    String(v?.sku || '').trim(),
    int(v?.price),
    Math.max(0, int(v?.stock)),
    v?.enabled === false ? 0 : 1,
    now
  ).run();
}

// ---------- 分类 ----------

async function adminCategories(env) {
  const { results } = await env.DB.prepare('SELECT * FROM categories ORDER BY sort, created_at').all();
  return json({ categories: results });
}

async function adminCreateCategory(request, env) {
  const body = await readJson(request);
  const name = String(body?.name || '').trim();
  if (!name) return error('分类名不能为空', 400);
  const slug = String(body?.slug || '').trim() || slugify(name);
  const now = Math.floor(Date.now() / 1000);
  const id = randomId('c');
  try {
    await env.DB.prepare(
      'INSERT INTO categories (id, name, slug, sort, enabled, created_at) VALUES (?1, ?2, ?3, ?4, 1, ?5)'
    ).bind(id, name, slug, int(body?.sort), now).run();
  } catch (e) {
    if (String(e.message || '').includes('UNIQUE')) return error('分类标识已存在', 409);
    throw e;
  }
  return json({ id }, 201);
}

async function adminUpdateCategory(request, env, id) {
  const body = await readJson(request);
  const name = String(body?.name || '').trim();
  const slug = String(body?.slug || '').trim();
  if (!name && !slug) return error('无更新内容', 400);
  const existing = await env.DB.prepare('SELECT * FROM categories WHERE id = ?1').bind(id).first();
  if (!existing) return error('分类不存在', 404);
  await env.DB.prepare(
    'UPDATE categories SET name = ?1, slug = ?2, sort = ?3, enabled = ?4 WHERE id = ?5'
  ).bind(
    name || existing.name,
    slug || existing.slug,
    body?.sort !== undefined ? int(body.sort) : existing.sort,
    body?.enabled !== undefined ? (body.enabled ? 1 : 0) : existing.enabled,
    id
  ).run();
  return json({ ok: true });
}

async function adminDeleteCategory(env, id) {
  const res = await env.DB.prepare('DELETE FROM categories WHERE id = ?1').bind(id).run();
  return res.meta.changes ? json({ ok: true }) : error('分类不存在', 404);
}

// ---------- 订单 ----------

async function adminOrders(env, url) {
  const status = url.searchParams.get('status');
  const conditions = [];
  const params = [];
  if (status) {
    conditions.push('status = ?' + (params.length + 1));
    params.push(status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { results } = await env.DB.prepare(
    `SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT 200`
  ).bind(...params).all();
  return json({ orders: results.map((o) => ({ ...o, items: safeJson(o.items_json, []), address: safeJson(o.address_json, {}) })) });
}

async function adminOrderDetail(env, id) {
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?1').bind(id).first();
  if (!order) return error('订单不存在', 404);
  const { results: items } = await env.DB.prepare('SELECT * FROM order_items WHERE order_id = ?1').bind(id).all();
  const { results: codes } = await env.DB.prepare('SELECT * FROM order_codes WHERE order_id = ?1').bind(id).all();
  return json({
    order: {
      ...order,
      items_json: undefined,
      items,
      address: safeJson(order.address_json, {}),
      codes
    }
  });
}

/** 订单状态流转（含取消回补库存） */
async function adminSetOrderStatus(request, env, id) {
  const body = await readJson(request);
  const status = String(body?.status || '');
  const allowed = ['pending', 'paid', 'shipped', 'completed', 'cancelled', 'expired'];
  if (!allowed.includes(status)) return error('非法状态', 400);

  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?1').bind(id).first();
  if (!order) return error('订单不存在', 404);

  const now = Math.floor(Date.now() / 1000);

  // 取消：回补库存
  if (status === 'cancelled' && order.status !== 'cancelled') {
    if (order.status === 'paid' || order.status === 'shipped') {
      await restock(env, order.id);
    }
  }

  await env.DB.prepare(
    'UPDATE orders SET status = ?1, updated_at = ?2 WHERE id = ?3'
  ).bind(status, now, id).run();

  return json({ ok: true });
}

async function restock(env, orderId) {
  const { results: items } = await env.DB.prepare('SELECT * FROM order_items WHERE order_id = ?1').bind(orderId).all();
  for (const item of items) {
    if (item.variant_id) {
      await env.DB.prepare('UPDATE product_variants SET stock = stock + ?1 WHERE id = ?2')
        .bind(item.qty, item.variant_id).run();
    } else {
      await env.DB.prepare('UPDATE products SET stock = stock + ?1, sold = MAX(sold - ?1, 0) WHERE id = ?2')
        .bind(item.qty, item.product_id).run();
    }
  }
}

// ---------- 用户 ----------

async function adminUsers(env) {
  const { results } = await env.DB.prepare(
    'SELECT id, email, role, display_name, disabled, created_at FROM users ORDER BY created_at DESC'
  ).all();
  return json({ users: results });
}

async function adminUpdateUser(request, env, id) {
  const body = await readJson(request);
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?1').bind(id).first();
  if (!user) return error('用户不存在', 404);

  const disabled = body?.disabled !== undefined ? (body.disabled ? 1 : 0) : user.disabled;
  const displayName = body?.display_name !== undefined ? String(body.display_name).slice(0, 40) : user.display_name;

  await env.DB.prepare(
    'UPDATE users SET disabled = ?1, display_name = ?2, updated_at = unixepoch() WHERE id = ?3'
  ).bind(disabled, displayName, id).run();
  return json({ ok: true });
}

// ---------- 激活码池 ----------

async function adminCodes(env, url) {
  const productId = url.searchParams.get('product_id');
  let rows;
  if (productId) {
    const { results } = await env.DB.prepare(
      'SELECT * FROM activation_codes WHERE product_id = ?1 ORDER BY created_at DESC LIMIT 500'
    ).bind(productId).all();
    rows = results;
  } else {
    const { results } = await env.DB.prepare(
      'SELECT * FROM activation_codes ORDER BY created_at DESC LIMIT 500'
    ).all();
    rows = results;
  }
  return json({ codes: rows });
}

async function adminAddCodes(request, env) {
  const body = await readJson(request);
  const productId = String(body?.product_id || '');
  const codes = Array.isArray(body?.codes) ? body.codes.map(String).filter((c) => c.trim()) : [];
  if (!productId) return error('缺少商品', 400);
  if (!codes.length) return error('缺少激活码', 400);

  const product = await env.DB.prepare('SELECT id FROM products WHERE id = ?1').bind(productId).first();
  if (!product) return error('商品不存在', 404);

  const now = Math.floor(Date.now() / 1000);
  for (const code of codes) {
    await env.DB.prepare(
      'INSERT INTO activation_codes (id, product_id, code, used, created_at) VALUES (?1, ?2, ?3, 0, ?4)'
    ).bind(randomId('ac'), productId, code.slice(0, 200), now).run();
  }
  return json({ added: codes.length }, 201);
}

async function adminDeleteCode(env, id) {
  const res = await env.DB.prepare('DELETE FROM activation_codes WHERE id = ?1').bind(id).run();
  return res.meta.changes ? json({ ok: true }) : error('激活码不存在', 404);
}
