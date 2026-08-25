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
      type: product.type
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
  item.qty = Math.max(1, qty);
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

/* ---------- HTML 转义 ---------- */
function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---------- Header 构建 ---------- */
function buildHeader() {
  const cfg = Store.config || {};
  const site = cfg.site || {};
  const nav = (cfg.nav || []).map((n) => `<li><a href="${escapeHtml(n.href)}">${escapeHtml(n.label)}</a></li>`).join('');
  const user = getUser();

  const userChip = user
    ? `<div class="user-chip">
         <span>${escapeHtml(user.display_name || user.email)}</span>
         ${isAdmin() ? '<a href="admin.html">后台</a>' : ''}
         <a href="#" id="logoutBtn">退出</a>
       </div>`
    : `<a href="login.html" class="btn btn--small btn--ghost">登录</a>`;

  return `
    <header>
      <a href="index.html" class="logo">
        ${escapeHtml(site.logoPrefix || 'Lumi')}<span class="accent">${escapeHtml(site.logoAccent || 'Nya')}</span>
        ${site.logoTag ? `<span class="tag">${escapeHtml(site.logoTag)}</span>` : ''}
      </a>
      <div class="nav-wrapper">
        <ul class="nav-links">${nav}</ul>
        <div class="header-actions">
          ${userChip}
          <a href="cart.html" class="cart-badge" aria-label="购物车">
            🛒<span class="count cart-count" style="display:none">0</span>
          </a>
          <button class="theme-toggle" aria-label="切换深浅色">
            <span class="icon-sun">☀️</span>
            <span class="icon-moon">🌙</span>
          </button>
        </div>
      </div>
    </header>`;
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
  const mount = document.querySelector('.container') || document.body;
  mount.insertAdjacentHTML('afterbegin', buildHeader());
  bindLogout();
  initTheme();
  updateCartBadge();
}

/* 商品卡片 HTML（供多个页面复用） */
function productCardHTML(p) {
  const image = p.images && p.images[0];
  return `
    <div class="product-card" data-id="${escapeHtml(p.id)}" role="button" tabindex="0">
      <div class="thumb">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(p.title)}" loading="lazy" />` : '🛍️'}</div>
      <div class="body">
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
