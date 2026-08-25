// ============================================================
// 公开 API：/api/auth /api/products /api/categories /api/orders
// ============================================================
import {
  json, error, readJson, authUser,
  randomId, hashPassword, verifyPassword, signJwt, genOrderNo
} from '../utils.js';
import {
  listProducts, getProduct, publicProduct, safeJson
} from '../db.js';

export async function handlePublic(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;

  // ---- 认证 ----
  if (path === '/api/auth/register' && method === 'POST') return register(request, env);
  if (path === '/api/auth/login' && method === 'POST') return login(request, env);
  if (path === '/api/auth/me' && method === 'GET') return me(request, env);

  // ---- 商品 ----
  if (path === '/api/products' && method === 'GET') return productsList(request, env, url);
  const productMatch = path.match(/^\/api\/products\/([^/]+)$/);
  if (productMatch && method === 'GET') return productDetail(env, productMatch[1]);

  // ---- 分类 ----
  if (path === '/api/categories' && method === 'GET') return categories(env);

  // ---- 用户订单 ----
  if (path === '/api/orders' && method === 'GET') return myOrders(request, env);
  if (path === '/api/orders' && method === 'POST') return createOrder(request, env);
  const orderMatch = path.match(/^\/api\/orders\/([^/]+)$/);
  if (orderMatch && method === 'GET') return myOrderDetail(request, env, orderMatch[1]);

  return error('Not Found', 404);
}

// ---------- 认证 ----------

async function register(request, env) {
  const body = await readJson(request);
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  const displayName = String(body?.display_name || '').trim().slice(0, 40);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error('邮箱格式不正确', 400);
  if (password.length < 6) return error('密码至少 6 位', 400);

  const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?1')
    .bind(email).first();
  if (exists) return error('该邮箱已注册', 409);

  const { hash, salt } = await hashPassword(password);
  const now = Math.floor(Date.now() / 1000);
  const id = randomId('u');
  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, salt, role, display_name, disabled, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, 'user', ?5, 0, ?6, ?6)`
  ).bind(id, email, hash, salt, displayName, now).run();

  const token = await signJwt({ sub: id, email, role: 'user' }, env.JWT_SECRET);
  return json({ token, user: { id, email, display_name: displayName, role: 'user' } }, 201);
}

async function login(request, env) {
  const body = await readJson(request);
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');

  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?1')
    .bind(email).first();
  if (!user) return error('邮箱或密码错误', 401);
  if (user.disabled) return error('账号已被禁用', 403);

  const ok = await verifyPassword(password, user.password_hash, user.salt);
  if (!ok) return error('邮箱或密码错误', 401);

  const token = await signJwt({ sub: user.id, email: user.email, role: user.role }, env.JWT_SECRET);
  return json({
    token,
    user: {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      role: user.role
    }
  });
}

async function me(request, env) {
  const payload = await authUser(request, env);
  if (!payload) return error('未登录', 401);
  const user = await env.DB.prepare('SELECT id, email, display_name, role, disabled, created_at FROM users WHERE id = ?1')
    .bind(payload.sub).first();
  if (!user || user.disabled) return error('账号不可用', 403);
  return json({ user });
}

// ---------- 商品 / 分类 ----------

async function productsList(request, env, url) {
  const result = await listProducts(env, {
    category: url.searchParams.get('category') || undefined,
    search: url.searchParams.get('q') || undefined,
    page: url.searchParams.get('page') || 1,
    size: url.searchParams.get('size') || 12
  });
  return json(result);
}

async function productDetail(env, id) {
  const product = await getProduct(env, id);
  if (!product) return error('商品不存在或已下架', 404);
  return json({ product });
}

async function categories(env) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, slug, sort FROM categories WHERE enabled = 1 ORDER BY sort, created_at'
  ).all();
  return json({ categories: results });
}

// ---------- 订单 ----------

async function myOrders(request, env) {
  const payload = await authUser(request, env);
  if (!payload) return error('未登录', 401);
  const { results } = await env.DB.prepare(
    `SELECT id, order_no, status, subtotal, shipping_fee, total, pay_channel, created_at, paid_at
     FROM orders WHERE user_id = ?1 ORDER BY created_at DESC`
  ).bind(payload.sub).all();
  return json({ orders: results.map((o) => ({ ...o, items: safeJson(o.items_json, []) })) });
}

async function myOrderDetail(request, env, id) {
  const payload = await authUser(request, env);
  if (!payload) return error('未登录', 401);

  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?1').bind(id).first();
  if (!order || order.user_id !== payload.sub) return error('订单不存在', 404);

  const { results: items } = await env.DB.prepare(
    'SELECT * FROM order_items WHERE order_id = ?1'
  ).bind(id).all();
  const { results: codes } = await env.DB.prepare(
    'SELECT * FROM order_codes WHERE order_id = ?1'
  ).bind(id).all();

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

/**
 * 创建订单（结算）
 * body: { items:[{product_id, variant_id?, qty}], remark, address, pay_channel }
 * 不扣减库存（支付成功后扣减），仅做库存预校验防止超卖。
 */
async function createOrder(request, env) {
  const payload = await authUser(request, env);
  if (!payload) return error('未登录', 401);
  const body = await readJson(request);
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) return error('订单为空', 400);

  let subtotal = 0;
  const orderItems = [];

  for (const item of items) {
    const qty = Math.max(1, parseInt(item.qty, 10) || 1);
    const product = await env.DB.prepare('SELECT * FROM products WHERE id = ?1').bind(item.product_id).first();
    if (!product || product.status !== 'on') return error('商品不存在或已下架', 400);

    let unitPrice = product.price;
    let variant = null;
    let skuName = '';

    if (item.variant_id) {
      variant = await env.DB.prepare('SELECT * FROM product_variants WHERE id = ?1 AND product_id = ?2')
        .bind(item.variant_id, item.product_id).first();
      if (!variant || !variant.enabled) return error('商品规格不存在', 400);
      unitPrice = variant.price;
      skuName = variant.name;
      if (variant.stock < qty) return error(`「${product.title} · ${variant.name}」库存不足`, 409);
    } else {
      if (product.stock < qty) return error(`「${product.title}」库存不足`, 409);
    }

    subtotal += unitPrice * qty;
    orderItems.push({
      id: randomId('oi'),
      product_id: product.id,
      variant_id: variant ? variant.id : null,
      title: product.title,
      sku_name: skuName,
      qty,
      unit_price: unitPrice
    });
  }

  // 运费计算：按商品中第一个实物商品的运费模板取基础运费（简化），满额包邮
  let shippingFee = 0;
  let hasPhysical = false;
  for (const oi of orderItems) {
    const product = await env.DB.prepare('SELECT * FROM products WHERE id = ?1').bind(oi.product_id).first();
    if (product.type === 'physical') {
      hasPhysical = true;
      if (product.shipping_template_id) {
        const tpl = await env.DB.prepare('SELECT * FROM shipping_templates WHERE id = ?1')
          .bind(product.shipping_template_id).first();
        if (tpl) {
          const fee = subtotal >= tpl.free_threshold && tpl.free_threshold > 0 ? 0 : tpl.base_fee;
          shippingFee = Math.max(shippingFee, fee);
        }
      }
    }
  }
  if (!hasPhysical) shippingFee = 0;

  const total = subtotal + shippingFee;
  const now = Math.floor(Date.now() / 1000);
  const orderId = randomId('o');
  const orderNo = genOrderNo();

  await env.DB.prepare(
    `INSERT INTO orders
     (id, order_no, user_id, status, items_json, subtotal, shipping_fee, total, remark, address_json, pay_channel, created_at, updated_at)
     VALUES (?1, ?2, ?3, 'pending', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)`
  ).bind(
    orderId, orderNo, payload.sub, JSON.stringify(orderItems),
    subtotal, shippingFee, total,
    String(body?.remark || '').slice(0, 500),
    JSON.stringify(body?.address || {}),
    String(body?.pay_channel || 'alipay'),
    now
  ).run();

  for (const oi of orderItems) {
    await env.DB.prepare(
      `INSERT INTO order_items (id, order_id, product_id, variant_id, title, sku_name, qty, unit_price, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
    ).bind(oi.id, orderId, oi.product_id, oi.variant_id, oi.title, oi.sku_name, oi.qty, oi.unit_price, now).run();
  }

  return json({ order: { id: orderId, order_no: orderNo, total } }, 201);
}
