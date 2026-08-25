// ============================================================
// 支付预留端点（支付宝「AI 付」）
//
// 说明：本项目仅预留 API 结构与后端回调骨架，
// 真实接入需要：
//   1) 支付宝商户凭证（app_id / 应用私钥 / 支付宝公钥）
//   2) 将「发起支付」的 TODO 替换为调用支付宝统一收单接口
//   3) 在 notify 中实现支付宝签名验签
//
// 端点：
//   POST /api/pay/create   创建支付（生成订单后调用，返回支付参数占位）
//   POST /api/pay/notify   支付宝异步通知回调（幂等，验签 TODO）
//   GET  /api/pay/return   支付完成同步跳转（重定向到前端结果页）
// ============================================================
import { json, error, readJson } from '../utils.js';

export async function handlePay(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '');

  if (path === '/api/pay/create' && request.method === 'POST') return create(request, env);
  if (path === '/api/pay/notify' && request.method === 'POST') return notify(request, env, url);
  if (path === '/api/pay/return' && request.method === 'GET') return payReturn(request, env, url);

  return error('Not Found', 404);
}

/**
 * 创建支付：为待支付订单构造支付参数。
 * 真实实现应调用支付宝 API，生成 trade_no 与支付二维码/跳转链接。
 */
async function create(request, env) {
  const body = await readJson(request);
  const orderNo = String(body?.order_no || '');
  if (!orderNo) return error('缺少订单号', 400);

  const order = await env.DB.prepare('SELECT * FROM orders WHERE order_no = ?1')
    .bind(orderNo).first();
  if (!order) return error('订单不存在', 404);
  if (order.status !== 'pending') return error('订单状态不可支付', 409);

  // TODO: 调用支付宝「AI 付」统一收单下单接口，获取真实支付参数。
  // 这里返回占位参数，前端据此跳转/渲染支付页。
  const payParams = {
    channel: 'alipay',
    order_no: orderNo,
    total: order.total,
    // 占位：真实场景为支付宝返回的 orderStr / qrCode / trade_no
    pay_url: '',   // TODO
    trade_no: '',  // TODO
    app_id: env.ALIPAY_APP_ID || '',
    preview: 'PAYMENT_API_PLACEHOLDER'
  };

  // 记录支付渠道
  await env.DB.prepare(
    `UPDATE orders SET pay_channel = 'alipay', updated_at = unixepoch() WHERE id = ?1`
  ).bind(order.id).run();

  return json({ pay: payParams });
}

/**
 * 支付宝异步通知（回调）。
 * 需幂等：同一笔订单重复通知只处理一次。
 */
async function notify(request, env, url) {
  // 支付宝通知可能以表单或 JSON 形式提交，兼容两种
  let body = {};
  const contentType = request.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    body = (await readJson(request)) || {};
  } else {
    const text = await request.text();
    body = Object.fromEntries(new URLSearchParams(text).entries());
  }

  const orderNo = String(body.out_trade_no || '');
  const tradeStatus = String(body.trade_status || '').toUpperCase();
  const tradeNo = String(body.trade_no || '');

  if (!orderNo) return error('缺少订单号', 400);

  // TODO: 使用 ALIPAY_PUBLIC_KEY 验证支付宝签名（RSA2 验签）。
  // 未验签前，此端点不应在真实环境中被信任。

  const order = await env.DB.prepare('SELECT * FROM orders WHERE order_no = ?1')
    .bind(orderNo).first();
  if (!order) return error('订单不存在', 404);

  // 幂等：已支付订单直接返回成功
  if (order.status !== 'pending') return json({ success: true });

  // 仅当交易成功 / 已完成时视为支付成功
  if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
    await markPaid(env, order.id, tradeNo);
    return json({ success: true });
  }

  // 关闭 / 失败：标记已取消（仅当仍为待支付）
  if (tradeStatus === 'TRADE_CLOSED') {
    await env.DB.prepare(
      `UPDATE orders SET status = 'cancelled', updated_at = unixepoch() WHERE id = ?1 AND status = 'pending'`
    ).bind(order.id).run();
  }

  return json({ success: true });
}

/** 支付成功：扣减库存、回填支付流水、发放虚拟商品 */
async function markPaid(env, orderId, tradeNo) {
  const now = Math.floor(Date.now() / 1000);

  // 原子性标记为已支付，防止并发重复处理
  const res = await env.DB.prepare(
    `UPDATE orders SET status = 'paid', pay_ref = ?1, paid_at = ?2, updated_at = ?2
     WHERE id = ?3 AND status = 'pending'`
  ).bind(tradeNo || '', now, orderId).run();

  if (!res.meta.changes) return; // 已被其他请求处理

  // 扣减库存
  const { results: items } = await env.DB.prepare(
    'SELECT * FROM order_items WHERE order_id = ?1'
  ).bind(orderId).all();

  for (const item of items) {
    if (item.variant_id) {
      await env.DB.prepare(
        `UPDATE product_variants SET stock = stock - ?1 WHERE id = ?2 AND stock >= ?1`
      ).bind(item.qty, item.variant_id).run();
    } else {
      await env.DB.prepare(
        `UPDATE products SET stock = stock - ?1, sold = sold + ?1 WHERE id = ?2 AND stock >= ?1`
      ).bind(item.qty, item.product_id).run();
    }

    // 虚拟商品发货：激活码池 + 资源链接
    const product = await env.DB.prepare('SELECT * FROM products WHERE id = ?1')
      .bind(item.product_id).first();
    if (product && product.type === 'virtual') {
      await deliverVirtual(env, orderId, item, product, now);
    }
  }
}

/** 虚拟商品发放：优先激活码池，其次资源链接 */
async function deliverVirtual(env, orderId, item, product, now) {
  // 1) 从激活码池取未使用激活码
  const codes = await env.DB.prepare(
    'SELECT * FROM activation_codes WHERE product_id = ?1 AND used = 0 LIMIT ?2'
  ).bind(product.id, item.qty).all();

  for (const code of codes.results) {
    await env.DB.prepare(
      `UPDATE activation_codes SET used = 1, used_order_id = ?1, used_at = ?2 WHERE id = ?3 AND used = 0`
    ).bind(orderId, now, code.id).run();
    await env.DB.prepare(
      `INSERT INTO order_codes (id, order_id, order_item_id, product_id, code, kind, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 'activation', ?6)`
    ).bind(
      'oc' + crypto.randomUUID().replace(/-/g, '').slice(0, 20),
      orderId, item.id, product.id, code.code, now
    ).run();
  }

  // 2) 若商品带资源链接，也写入发货记录
  if (product.resource_url) {
    await env.DB.prepare(
      `INSERT INTO order_codes (id, order_id, order_item_id, product_id, code, kind, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 'resource', ?6)`
    ).bind(
      'oc' + crypto.randomUUID().replace(/-/g, '').slice(0, 20),
      orderId, item.id, product.id, product.resource_url, now
    ).run();
  }
}

/** 同步跳转：带订单号重定向回前端结果页 */
async function payReturn(request, env, url) {
  const orderNo = url.searchParams.get('out_trade_no') || url.searchParams.get('order_no') || '';
  const status = url.searchParams.get('status') || 'unknown';
  const target = new URL(url.origin);
  target.pathname = '/pay-result.html';
  target.searchParams.set('order_no', orderNo);
  target.searchParams.set('status', status);
  return Response.redirect(target.toString(), 302);
}
