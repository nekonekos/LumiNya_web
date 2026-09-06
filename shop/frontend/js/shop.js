// ============================================================
// LumiNya Shop · 前端公共工具
// 包含：配置加载、API 封装、主题切换、购物车、Toast、Header
// ============================================================

const Store = {
  config: null,
  apiBase: '',
  cart: JSON.parse(localStorage.getItem('luminya-shop-cart') || '[]')
};

/* ---------- 配置 ---------- */
async function loadConfig() {
  try {
    const res = await fetch('./config.json');
    Store.config = await res.json();
    Store.apiBase = Store.config.apiBase || '';
    document.title = Store.config.site.title;
    return Store.config;
  } catch (e) {
    console.error('config load failed', e);
    Store.config = { site: { title: 'LumiNya Shop' } };
    return Store.config;
  }
}

/* ---------- API 封装 ---------- */
function getToken() {
  return localStorage.getItem('luminya-shop-token') || '';
}
function setToken(t) {
  if (t) localStorage.setItem('luminya-shop-token', t);
  else localStorage.removeItem('luminya-shop-token');
}
function getUser() {
  try {
    return JSON.parse(localStorage.getItem('luminya-shop-user') || 'null');
  } catch {
    return null;
  }
}
function setUser(u) {
  if (u) localStorage.setItem('luminya-shop-user', JSON.stringify(u));
  else localStorage.removeItem('luminya-shop-user');
}
function isLoggedIn() {
  return !!getToken();
}
function isAdmin() {
  const u = getUser();
  return !!u && u.role === 'admin';
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${Store.apiBase}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error(data.error || `请求失败 (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ---------- 主题 ---------- */
const STORAGE_KEY = 'theme-preference';
function initTheme() {
  const root = document.documentElement;
  const stored = localStorage.getItem(STORAGE_KEY);
  const theme = stored === 'dark' || stored === 'light'
    ? stored
    : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  setTheme(theme);
  document.querySelectorAll('.theme-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cur = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      setTheme(cur === 'dark' ? 'light' : 'dark');
    });
  });
}
function setTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
  localStorage.setItem(STORAGE_KEY, theme);
}

/* ---------- 购物车 ---------- */
function saveCart() {
  localStorage.setItem('luminya-shop-cart', JSON.stringify(Store.cart));
  updateCartBadge();
}
function cartCount() {
  return Store.cart.reduce((sum, i) => sum + i.qty, 0);
}
function addToCart(product, variant, qty) {
  const key = variant ? `${product.id}:${variant.id}` : product.id;
  const found = Store.cart.find((i) => i.key === key);
  if (found) found.qty += qty;
  else {
    Store.cart.push({
      key,
      product_id: product.id,
      variant_id: variant ? variant.id : null,
      title: product.title,
      sku_name: variant ? variant.name : '',
      unit_price: variant ? variant.price : product.price,
      qty,
      image: (product.images && product.images[0]) || '',
      type: product.type,
      _stock: variant ? variant.stock : product.stock
    });
  }
  saveCart();
}
function removeFromCart(key) {
  Store.cart = Store.cart.filter((i) => i.key !== key);
  saveCart();
}
function setCartQty(key, qty) {
  const item = Store.cart.find((i) => i.key === key);
  if (!item) return;
  let q = Math.max(1, qty);
  if (item._stock !== undefined) q = Math.min(q, Math.max(1, item._stock));
  item.qty = q;
  saveCart();
}
function clearCart() {
  Store.cart = [];
  saveCart();
}
function updateCartBadge() {
  document.querySelectorAll('.cart-count').forEach((el) => {
    const n = cartCount();
    el.textContent = n;
    el.style.display = n > 0 ? 'flex' : 'none';
  });
}

/* ---------- Toast ---------- */
function toast(message, type = 'ok') {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

/* ---------- 价格格式化 ---------- */
function formatPrice(cents) {
  return `¥${(cents / 100).toFixed(2)}`;
}
function formatTime(unix) {
  if (!unix) return '-';
  const d = new Date(unix * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---------- 安全跳转（防开放重定向） ---------- */
function safeRedirect(url) {
  if (!url) return 'index.html';
  // 禁用带协议或协议相对地址
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return 'index.html';
  if (url.startsWith('//')) return 'index.html';
  if (url.startsWith('\\')) return 'index.html';
  return url;
}

/* ---------- HTML 转义 ---------- */
function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function bindLogout() {
  const btn = document.getElementById('logoutBtn');
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      setToken('');
      setUser(null);
      toast('已退出登录');
      setTimeout(() => { window.location.href = 'index.html'; }, 600);
    });
  }
}

/* ---------- 初始化公共 UI ---------- */
async function initCommon() {
  await loadConfig();
  document.body.insertAdjacentHTML(
    'afterbegin',
    `<div class="blob blob--1"></div>
     <div class="blob blob--2"></div>
     <div class="blob blob--3"></div>`
  );
  renderHeader();
  renderFooter();
  renderMobileTabBar();
  bindHeaderActions();
  initTheme();
  updateCartBadge();
  updateSelectedBadge();
}

/* 购物车勾选状态（localStorage 记录选中项 key） */
const SELECTED_KEY = 'luminya-shop-selected';
function getSelected() {
  try { return JSON.parse(localStorage.getItem(SELECTED_KEY) || '[]'); }
  catch { return []; }
}
function saveSelected(keys) {
  localStorage.setItem(SELECTED_KEY, JSON.stringify(keys));
  updateSelectedBadge();
}
function toggleSelect(key) {
  const sel = getSelected();
  const i = sel.indexOf(key);
  if (i >= 0) sel.splice(i, 1); else sel.push(key);
  saveSelected(sel);
  return sel;
}
function selectedItems() {
  const sel = getSelected();
  return Store.cart.filter(i => sel.includes(i.key));
}
function updateSelectedBadge() {
  const n = selectedItems().reduce((s, i) => s + i.qty, 0);
  document.querySelectorAll('.selected-count').forEach(el => { el.textContent = n; });
}

/* ---------- 收货地址簿（localStorage） ---------- */
const ADDR_KEY = 'luminya-shop-addresses';
function getAddresses() {
  try { return JSON.parse(localStorage.getItem(ADDR_KEY) || '[]'); }
  catch { return []; }
}
function saveAddresses(list) {
  localStorage.setItem(ADDR_KEY, JSON.stringify(list));
}
function defaultAddress() {
  const list = getAddresses();
  return list.find(a => a.isDefault) || list[0] || null;
}
function saveAddress(a) {
  const list = getAddresses();
  if (!a.id) a.id = 'a' + Date.now().toString(36);
  const i = list.findIndex(x => x.id === a.id);
  if (i >= 0) list[i] = a; else list.push(a);
  if (a.isDefault) list.forEach(x => x.isDefault = x.id === a.id);
  saveAddresses(list);
  return list;
}
function removeAddress(id) {
  saveAddresses(getAddresses().filter(a => a.id !== id));
}

/* 购物车回验：批量拉取商品（含 SKU），刷新价格与库存 */
async function revalidateCart() {
  const ids = [...new Set(Store.cart.map(i => i.product_id))];
  if (!ids.length) return;

  let products = [];
  try {
    const res = await api('/products/batch', { method: 'POST', body: { ids } });
    products = res.products || [];
  } catch (e) {
    // 降级：逐个请求详情
    for (const pid of ids) {
      try { const { product } = await api(`/products/${encodeURIComponent(pid)}`); products.push(product); } catch {}
    }
  }
  const map = {};
  products.forEach(p => { map[p.id] = p; });

  Store.cart.forEach(c => {
    const p = map[c.product_id];
    if (!p) { c._invalid = true; return; }
    const v = c.variant_id ? (p.variants || []).find(v => v.id === c.variant_id) : null;
    c.unit_price = v ? v.price : p.price;
    c._stock = v ? v.stock : p.stock;
    delete c._invalid;
  });
  saveCart();
}

/* 商品卡片 HTML（供多个页面复用） */
function productCardHTML(p) {
  const image = p.images && p.images[0];
  const badges = [];
  if (p.stock === 0) badges.push('<span class="badge badge--soldout">已售罄</span>');
  if ((p.sold || 0) >= 50) badges.push('<span class="badge badge--hot">热卖</span>');
  if (p.created_at && Date.now() / 1000 - p.created_at < 7 * 86400) badges.push('<span class="badge badge--new">新品</span>');
  if (p.type === 'physical') badges.push('<span class="badge badge--virtual">实物</span>');
  return `
    <div class="product-card" data-id="${escapeHtml(p.id)}" role="button" tabindex="0">
      <div class="thumb">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(p.title)}" loading="lazy" />` : '🛍️'}
        <button class="card-action btn btn--primary btn--small" data-add title="加入购物车">+</button>
      </div>
      <div class="body">
        ${badges.length ? `<div class="badges">${badges.join('')}</div>` : ''}
        <div class="title">${escapeHtml(p.title)}</div>
        <div class="summary">${escapeHtml(p.summary || '')}</div>
        <div class="meta">
          <span class="price">${formatPrice(p.price)}</span>
          <span class="type-tag">${p.type === 'physical' ? '实物' : '虚拟'}</span>
        </div>
        <div class="sold">已售 ${p.sold || 0}</div>
      </div>
    </div>`;
}

const STATUS_TEXT = {
  pending: '待支付',
  paid: '已支付',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
  expired: '已过期'
};
function statusBadge(status) {
  return `<span class="status-badge status-${status}">${STATUS_TEXT[status] || status}</span>`;
}

/* ---------- 弹窗 ---------- */
/** 创建通用弹窗，返回 modal 根节点（点遮罩关闭） */
function showModal(html) {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  return modal;
}

/** 「去支付」占位弹窗：支付接口未接入 */
function payUnavailableModal() {
  const modal = showModal(`
    <h3>去支付</h3>
    <p style="color:var(--text-medium); margin-bottom:1.2rem;">当前支付接口未接入！</p>
    <div class="btn-group">
      <button class="btn btn--primary" data-close>我知道了</button>
    </div>`);
  modal.querySelector('[data-close]').addEventListener('click', () => modal.remove());
  return modal;
}
