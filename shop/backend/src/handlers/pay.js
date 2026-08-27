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
import { fulfillOrder } from '../orderService.js';

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
    await fulfillOrder(env, order.id, tradeNo);
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
