// ============================================================
// LumiNya Shop · UI 组件库
// 依赖：js/shop.js 中的 Store / toast / showModal / escapeHtml / formatPrice
// ============================================================

/* ---------- 移动端检测 ---------- */
const MOBILE_BP = 820;
function isMobileView() {
  return window.matchMedia(`(max-width: ${MOBILE_BP}px)`).matches;
}

/* ---------- 底部弹层（Mobile bottom sheet） ---------- */
function openSheet(html) {
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  overlay.innerHTML = `<div class="sheet">${html}</div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSheet(overlay);
  });
  return overlay;
}
function closeSheet(overlay) {
  if (overlay) overlay.remove();
  else {
    const el = document.querySelector('.sheet-overlay');
    if (el) el.remove();
  }
}

/* ---------- 确认对话框（替代 window.confirm） ---------- */
function confirmDialog({ title = '确认', message = '', okText = '确定', cancelText = '取消', danger = false } = {}) {
  return new Promise((resolve) => {
    const modal = showModal(`
      <h3>${escapeHtml(title)}</h3>
      <p style="color:var(--text-medium);margin-bottom:1.2rem;">${escapeHtml(message)}</p>
      <div class="btn-group">
        <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-ok>${escapeHtml(okText)}</button>
        <button class="btn btn--ghost" data-close>${escapeHtml(cancelText)}</button>
      </div>`);
    modal.querySelector('[data-close]').addEventListener('click', () => { modal.remove(); resolve(false); });
    modal.querySelector('[data-ok]').addEventListener('click', () => { modal.remove(); resolve(true); });
  });
}

/* ---------- 骨架屏 ---------- */
function skeletonCard() {
  return `<div class="skeleton-card"><div class="sk sk-img"></div><div class="sk sk-line"></div><div class="sk sk-line short"></div></div>`;
}
function skeletonRows(n = 3) {
  let s = '';
  for (let i = 0; i < n; i++) s += `<div class="skeleton-row"><div class="sk sk-thumb"></div><div class="sk sk-line"></div></div>`;
  return s;
}

/* ---------- 空态 / 错误态（带重试） ---------- */
function emptyState(message = '暂无数据', { icon = '🛍️', retry = null } = {}) {
  const btn = retry ? `<button class="btn btn--ghost btn--small" data-retry>重试</button>` : '';
  return `<div class="empty-state">${icon}<div style="margin:0.6rem 0 1rem;">${escapeHtml(message)}</div>${btn}</div>`;
}
function bindRetry(container, fn) {
  const btn = container.querySelector('[data-retry]');
  if (btn) btn.addEventListener('click', () => fn());
}

/* ---------- 飞入购物车动画 ---------- */
function flyToCart(thumbEl) {
  const cartBtn = document.querySelector('.cart-badge[href="cart.html"], .cart-badge');
  if (!thumbEl || !cartBtn) return;
  const s = thumbEl.getBoundingClientRect();
  const e = cartBtn.getBoundingClientRect();
  const x = s.left + s.width / 2;
  const y = s.top + s.height / 2;
  const ex = e.left + e.width / 2;
  const ey = e.top + e.height / 2;
  const dot = document.createElement('div');
  dot.className = 'fly-dot';
  dot.style.left = x + 'px';
  dot.style.top = y + 'px';
  document.body.appendChild(dot);
  requestAnimationFrame(() => {
    dot.style.transform = `translate(${ex - x}px, ${ey - y}px) scale(0.4)`;
    dot.style.opacity = '0.3';
  });
  setTimeout(() => dot.remove(), 700);
}

/* ---------- 复制到剪贴板 ---------- */
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  return Promise.reject(new Error('浏览器不支持剪贴板'));
}

/* ---------- 迷你购物车抽屉 ---------- */
function openCartDrawer() {
  const items = Store.cart || [];
  const subtotal = items.reduce((s, i) => s + i.unit_price * i.qty, 0);
  const rows = items.length
    ? items.map(i => `
        <div class="drawer-item">
          <div class="thumb">${i.image ? `<img src="${escapeHtml(i.image)}" alt="" />` : '🛍️'}</div>
          <div class="info">
            <div class="name">${escapeHtml(i.title)}</div>
            ${i.sku_name ? `<div class="sku">${escapeHtml(i.sku_name)}</div>` : ''}
            <div class="unit">${formatPrice(i.unit_price)} × ${i.qty}</div>
          </div>
          <div class="subtotal">${formatPrice(i.unit_price * i.qty)}</div>
        </div>`).join('')
    : `<div class="empty-state">购物车是空的</div>`;

  const overlay = document.createElement('div');
  overlay.className = 'drawer-overlay';
  overlay.innerHTML = `
    <aside class="cart-drawer">
      <div class="drawer-head">
        <strong>购物车</strong>
        <button class="drawer-close" aria-label="关闭">✕</button>
      </div>
      <div class="drawer-body">${rows}</div>
      <div class="drawer-foot">
        <div class="row"><span>合计</span><strong>${formatPrice(subtotal)}</strong></div>
        <button class="btn btn--primary" data-checkout>去结算</button>
      </div>
    </aside>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('.drawer-close').addEventListener('click', () => overlay.remove());
  overlay.querySelector('[data-checkout]').addEventListener('click', () => {
    if (!isLoggedIn()) {
      toast('请先登录', 'err');
      setTimeout(() => { location.href = 'login.html?redirect=checkout.html'; }, 600);
      return;
    }
    location.href = 'checkout.html';
  });
}
