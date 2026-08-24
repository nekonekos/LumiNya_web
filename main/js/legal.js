/* ===== LumiNya 条款/政策页共用渲染器 =====
 * 通过 data-legal-json 属性指定内容 JSON 路径，
 * 复用 css/main.css 的基础样式与 css/legal.css 的文档样式。
 * 若 JSON 加载失败，回退到页面内嵌的 #fallback 内容。
 */
(function () {
    'use strict';

    const SCRIPT_SRC = document.currentScript;
    const DATA_URL = (SCRIPT_SRC && SCRIPT_SRC.dataset.legalJson) || '';
    const THEME_KEY = 'theme-preference';
    const root = document.documentElement;

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // 将 **加粗** 文本转换为 <strong>
    function renderInline(text) {
        return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    }

    // ===== 主题 =====
    function getPreferredTheme() {
        const stored = localStorage.getItem(THEME_KEY);
        if (stored === 'dark' || stored === 'light') return stored;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    function setTheme(theme) {
        if (theme === 'dark') root.setAttribute('data-theme', 'dark');
        else root.removeAttribute('data-theme');
        localStorage.setItem(THEME_KEY, theme);
    }
    function initTheme() {
        setTheme(getPreferredTheme());
        const toggle = document.getElementById('themeToggle');
        if (toggle) {
            toggle.addEventListener('click', function () {
                const current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
                setTheme(current === 'dark' ? 'light' : 'dark');
            });
        }
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        if (mq.addEventListener) {
            mq.addEventListener('change', function (event) {
                if (!localStorage.getItem(THEME_KEY)) {
                    setTheme(event.matches ? 'dark' : 'light');
                }
            });
        }
    }

    // ===== 构建 =====
    function buildNav() {
        const nav = document.createElement('nav');
        nav.className = 'legal-nav';
        nav.innerHTML = `
            <a href="./index.html" class="legal-nav-back">← 返回首页</a>
            <div class="legal-nav-tabs">
                <a href="./privacy.html" data-role="privacy">隐私政策</a>
                <a href="./terms.html" data-role="terms">使用条款</a>
            </div>
            <button class="theme-toggle" id="themeToggle" aria-label="切换深浅色">
                <span class="icon-sun">☀️</span>
                <span class="icon-moon">🌙</span>
            </button>
        `;
        return nav;
    }

    function buildDoc(data) {
        const meta = data.meta || {};
        const article = document.createElement('article');
        article.className = 'legal-doc';

        const sectionsHtml = (data.sections || []).map(function (section) {
            const paragraphs = (section.paragraphs || [])
                .map(function (p) { return '<p>' + renderInline(p) + '</p>'; })
                .join('');
            const list = section.list
                ? '<ul>' + section.list.map(function (li) {
                    return '<li>' + renderInline(li) + '</li>';
                }).join('') + '</ul>'
                : '';
            const note = section.note
                ? '<p class="legal-note">' + renderInline(section.note) + '</p>'
                : '';
            return `
                <section class="legal-section">
                    <h2>${escapeHtml(section.title || '')}</h2>
                    ${paragraphs}
                    ${list}
                    ${note}
                </section>
            `;
        }).join('');

        const email = data.contact && data.contact.email;

        article.innerHTML = `
            <div class="legal-hero">
                <div class="legal-hero-icon">${escapeHtml(meta.icon || '📄')}</div>
                <h1>${escapeHtml(meta.heading || meta.title || '')}</h1>
                <p class="subhead">${escapeHtml(meta.subtitle || '')}</p>
                <div class="legal-updated">${escapeHtml(meta.updated ? '最后更新：' + meta.updated : '')}</div>
            </div>
            <div class="legal-body">
                <p class="legal-intro">${renderInline(data.intro || '')}</p>
                ${sectionsHtml}
                <div class="legal-contact">
                    <p>${escapeHtml((data.contact && data.contact.text) || '如有任何疑问，请联系：')}</p>
                    ${email ? '<a href="mailto:' + escapeHtml(email) + '">' + escapeHtml(email) + '</a>' : ''}
                </div>
            </div>
        `;
        return article;
    }

    function buildFooter() {
        const footer = document.createElement('footer');
        footer.className = 'legal-footer';
        footer.innerHTML = `
            <div class="footer-bottom">
                <span class="copy">© 2026 LumiNya · 个人网站</span>
                <div class="legal">
                    <a href="./privacy.html">隐私政策</a>
                    <a href="./terms.html">使用条款</a>
                </div>
            </div>
        `;
        return footer;
    }

    function render(data) {
        const mount = document.getElementById('legalContent');
        if (!mount) return;
        const fragment = document.createDocumentFragment();
        fragment.appendChild(buildNav());
        fragment.appendChild(buildDoc(data));
        fragment.appendChild(buildFooter());
        mount.innerHTML = '';
        mount.appendChild(fragment);

        // 高亮当前标签
        const pageRole = (SCRIPT_SRC && SCRIPT_SRC.dataset.legalPage) || '';
        if (pageRole) {
            const active = mount.querySelector('.legal-nav-tabs a[data-role="' + pageRole + '"]');
            if (active) active.classList.add('active');
        }
        initTheme();
    }

    function fallback() {
        const mount = document.getElementById('legalContent');
        const fb = document.getElementById('fallback');
        if (!mount) return;
        // 保留导航与主题，内容回退到内嵌静态内容
        const fragment = document.createDocumentFragment();
        fragment.appendChild(buildNav());
        const fbHtml = fb && fb.content ? fb.content.innerHTML.trim() : (fb ? fb.innerHTML.trim() : '');
        if (fbHtml) {
            const wrapper = document.createElement('div');
            wrapper.className = 'legal-doc legal-fallback';
            wrapper.innerHTML = fbHtml;
            fragment.appendChild(wrapper);
        } else {
            const wrapper = document.createElement('div');
            wrapper.className = 'legal-doc';
            wrapper.innerHTML = '<p style="text-align:center;padding:2rem 0;">内容加载失败，请稍后重试或返回首页。</p>';
            fragment.appendChild(wrapper);
        }
        fragment.appendChild(buildFooter());
        mount.innerHTML = '';
        mount.appendChild(fragment);
        const pageRole = (SCRIPT_SRC && SCRIPT_SRC.dataset.legalPage) || '';
        if (pageRole) {
            const active = mount.querySelector('.legal-nav-tabs a[data-role="' + pageRole + '"]');
            if (active) active.classList.add('active');
        }
        initTheme();
    }

    if (!DATA_URL) {
        fallback();
        return;
    }

    fetch(DATA_URL)
        .then(function (response) {
            if (!response.ok) throw new Error('加载失败');
            return response.json();
        })
        .then(function (data) {
            document.title = (data.meta && data.meta.title) || document.title;
            render(data);
        })
        .catch(fallback);
})();
