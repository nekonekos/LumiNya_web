// ============================================================
// LumiNya Shop · 订单领域逻辑
// 支付成功流转、库存扣减/回补、虚拟商品发货
// 供 pay.js（真实支付回调）与 admin.js（后台手动标记）共用，
// 保证「视为已支付」时的库存与发货行为完全一致。
// ============================================================
import { randomId } from './utils.js';

/**
 * 视为支付成功：原子地把订单从 pending 流转为 paid，
 * 扣减库存（锁定库存）、累计销量，并为虚拟商品发放激活码/资源链接。
 * 返回 true 表示本次执行了流转；false 表示订单已被处理或状态不允许（幂等）。
 */
export async function fulfillOrder(env, orderId, payRef = '') {
  const now = Math.floor(Date.now() / 1000);

  const res = await env.DB.prepare(
    `UPDATE orders SET status = 'paid', pay_ref = ?1, paid_at = ?2, updated_at = ?2
     WHERE id = ?3 AND status = 'pending'`
  ).bind(payRef || '', now, orderId).run();

  if (!res.meta.changes) return false; // 并发或已被处理

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

    const product = await env.DB.prepare(
      'SELECT * FROM products WHERE id = ?1'
    ).bind(item.product_id).first();

    if (product && product.type === 'virtual') {
      await deliverVirtual(env, orderId, item, product, now);
    }
  }

  return true;
}

/** 取消已支付订单时回补库存（仅对已支付及之后状态的订单调用） */
export async function restockOrder(env, orderId) {
  const { results: items } = await env.DB.prepare(
    'SELECT * FROM order_items WHERE order_id = ?1'
  ).bind(orderId).all();

  for (const item of items) {
    if (item.variant_id) {
      await env.DB.prepare(
        'UPDATE product_variants SET stock = stock + ?1 WHERE id = ?2'
      ).bind(item.qty, item.variant_id).run();
    } else {
      await env.DB.prepare(
        'UPDATE products SET stock = stock + ?1, sold = MAX(sold - ?1, 0) WHERE id = ?2'
      ).bind(item.qty, item.product_id).run();
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
    ).bind(randomId('oc'), orderId, item.id, product.id, code.code, now).run();
  }

  // 2) 若商品带资源链接，也写入发货记录
  if (product.resource_url) {
    await env.DB.prepare(
      `INSERT INTO order_codes (id, order_id, order_item_id, product_id, code, kind, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 'resource', ?6)`
    ).bind(randomId('oc'), orderId, item.id, product.id, product.resource_url, now).run();
  }
}
