// ============================================================
// LumiNya Shop · 布局组件（头部 / 分类导航 / 页脚 / 移动端 TabBar）
// 依赖：js/shop.js 中的 Store / api / getUser / isAdmin / escapeHtml / updateCartBadge
// ============================================================

let _catsCache = null;
async function _loadCategories() {
  if (_catsCache) return _catsCache;
  try {
    const { categories } = await api('/categories');
    _catsCache = categories || [];
  } catch (e) { _catsCache = []; }
  return _catsCache;
}

/* ---------- 头部（桌面 + 移动吸顶） ---------- */
function renderHeader() {
  const mount = document.querySelector('.container') || document.body;
  // 避免重复注入
  if (mount.querySelector('.app-header')) return;

  const cfg = Store.config || {};
  const site = cfg.site || {};
  const nav = (cfg.nav || []).map(n => `<a href="${escapeHtml(n.href)}">${escapeHtml(n.label)}</a>`).join('');
  const user = getUser();

  const userChip = user
    ? `<div class="user-chip" id="userChip">
         <a href="user.html" class="user-label">${escapeHtml(user.display_name || user.email)}</a>
         ${isAdmin() ? '<a href="admin.html">后台</a>' : ''}
         <a href="#" id="logoutBtn">退出</a>
       </div>`
    : `<a href="login.html" class="btn btn--small btn--ghost">登录 / 注册</a>`;

  const html = `
    <header class="app-header">
      <div class="header-top">
        <a href="index.html" class="logo">
          ${escapeHtml(site.logoPrefix || 'Lumi')}<span class="accent">${escapeHtml(site.logoAccent || 'Nya')}</span>
          ${site.logoTag ? `<span class="tag">${escapeHtml(site.logoTag)}</span>` : ''}
        </a>
        <form class="search-box" id="searchForm" action="index.html" role="search">
          <span class="search-icon">🔍</span>
          <input class="search-input" name="q" type="search" placeholder="搜索商品" autocomplete="off" />
          <button class="btn btn--primary btn--small" type="submit">搜索</button>
        </form>
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
      <nav class="category-nav" id="categoryNav">
        <button class="cat-nav-toggle" id="catToggle">☰ 全部分类</button>
        <div class="cat-nav-links">${nav}</div>
      </nav>
      <div class="category-dropdown" id="categoryDropdown" hidden></div>
    </header>

    <header class="mobile-topbar">
      <a href="javascript:history.back()" class="topbar-back" aria-label="返回">‹</a>
      <form class="search-box search-box--mini" action="index.html" role="search">
        <span class="search-icon">🔍</span>
        <input class="search-input" name="q" type="search" placeholder="搜索商品" />
      </form>
      <a href="cart.html" class="cart-badge" aria-label="购物车">
        🛒<span class="count cart-count" style="display:none">0</span>
      </a>
    </header>`;

  mount.insertAdjacentHTML('afterbegin', html);
  _renderCategoryDropdown();
}

async function _renderCategoryDropdown() {
  const dd = document.getElementById('categoryDropdown');
  if (!dd) return;
  const cats = await _loadCategories();
  if (!cats.length) return;
  dd.innerHTML = cats.map(c => `<a href="index.html?category=${encodeURIComponent(c.id)}">${escapeHtml(c.name)}</a>`).join('');
  const toggle = document.getElementById('catToggle');
  if (toggle) {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      dd.hidden = !dd.hidden;
    });
    document.addEventListener('click', (e) => {
      if (!dd.hidden && !dd.contains(e.target) && e.target !== toggle) dd.hidden = true;
    });
  }
}

/* ---------- 页脚 ---------- */
function renderFooter() {
  const mount = document.querySelector('.container') || document.body;
  if (mount.querySelector('.site-footer')) return;
  const cfg = Store.config || {};
  const site = cfg.site || {};
  const footer = site.footer || {};
  mount.insertAdjacentHTML('beforeend', `
    <footer class="site-footer">
      <div class="footer-inner">
        <p class="footer-brand">${escapeHtml(footer.brandDesc || '')}</p>
        <p class="footer-links">
          <a href="index.html">首页</a> · <a href="cart.html">购物车</a> · <a href="orders.html">订单</a> · <a href="privacy.html">隐私</a> · <a href="terms.html">条款</a>
        </p>
        <p class="footer-copy">${escapeHtml(footer.copyright || '')}</p>
      </div>
    </footer>`);
}

/* ---------- 移动端底部 TabBar ---------- */
function renderMobileTabBar() {
  if (document.querySelector('.bottom-tabbar')) return;
  const tabbar = document.createElement('nav');
  tabbar.className = 'bottom-tabbar';
  tabbar.innerHTML = `
    <a href="index.html" class="tab-item"><span>🏠</span><label>首页</label></a>
    <a href="index.html#products" class="tab-item"><span>🧭</span><label>分类</label></a>
    <a href="cart.html" class="tab-item"><span>🛒<b class="count cart-count" style="display:none">0</b></span><label>购物车</label></a>
    <a href="user.html" class="tab-item"><span>👤</span><label>我的</label></a>`;
  document.body.appendChild(tabbar);
}

/* ---------- 头部交互（搜索 / 退出 / 移动状态） ---------- */
function bindHeaderActions() {
  // 退出登录
  const logout = document.getElementById('logoutBtn');
  if (logout) {
    logout.addEventListener('click', (e) => {
      e.preventDefault();
      setToken('');
      setUser(null);
      toast('已退出登录');
      setTimeout(() => { window.location.href = 'index.html'; }, 600);
    });
  }
  // 移动端滚动隐藏顶栏 / 显示 TabBar
  updateMobileState();
  window.addEventListener('resize', updateMobileState);
}

function updateMobileState() {
  const mobile = isMobileView();
  document.body.classList.toggle('is-mobile', mobile);
}

/* ---------- 兼容旧页面/后台的无障碍导航 ---------- */
function bindProductCards(container) {
  container.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => {
      window.location.href = `product.html?id=${encodeURIComponent(card.dataset.id)}`;
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        window.location.href = `product.html?id=${encodeURIComponent(card.dataset.id)}`;
      }
    });
  });
}
