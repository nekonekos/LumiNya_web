/* ==========================================================================
 * LumiDrone 前端公共库
 * 职责：主题、后端地址管理、格式化工具、导航、提示、i18n 文案加载。
 * 所有页面共享；页面 JS 通过 window.LD 调用。
 * ========================================================================== */
(function () {
    'use strict';

    const LS_SERVER = 'lumidrone-server';
    const LS_THEME = 'lumidrone-theme';
    const LS_TOKEN = 'lumidrone-token';
    const LS_USER = 'lumidrone-user';

    const root = document.documentElement;

    const DEFAULT_I18N = {
        appName: 'LumiDrone',
        nav: {
            dashboard: '机队总览',
            logout: '退出登录'
        },
        status: {
            online: '在线',
            offline: '离线',
            armed: '已解锁',
            disarmed: '已上锁'
        },
        alertLevels: {
            info: { label: '提示' },
            warning: { label: '警告' },
            critical: { label: '严重' }
        },
        alertRules: {
            link_lost: '链路丢失',
            low_battery: '低电量',
            gps_lost: 'GPS 丢星',
            mode_failsafe: '失控保护',
            attitude_limit: '姿态越限'
        },
        modes: {
            STABILIZE: '自稳', ACRO: '特技', ALT_HOLD: '定高', AUTO: '自动',
            GUIDED: '引导', LOITER: '悬停', RTL: '返航', CIRCLE: '绕圈',
            LAND: '降落', DRIFT: '漂移', SPORT: '运动', FLIP: '翻转',
            AUTOTUNE: '自动调参', POSHOLD: '定点', BRAKE: '刹车', THROW: '抛飞',
            AVOID_ADSB: '避让', GUIDED_NOGPS: '无GPS引导', SMART_RTL: '智能返航',
            FLOWHOLD: '光流悬停', FOLLOW: '跟随', ZIGZAG: 'Z字形',
            SYSTEMID: '系统识别', AUTOROTATE: '自旋降落', UNKNOWN: '未知'
        },
        errors: {
            network: '无法连接到后端服务器，请检查地址与网络',
            unauthorized: '登录已过期，请重新登录',
            serverRequired: '请先填写后端服务器地址'
        }
    };

    const LD = {
        i18n: DEFAULT_I18N,
        jsonBase: './json'
    };

    // ---------------------------------------------------------------- server
    function normalizeServer(url) {
        if (!url) return '';
        let u = String(url).trim();
        if (!u) return '';
        if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
        return u.replace(/\/+$/, '');
    }

    LD.getServer = function () {
        return normalizeServer(localStorage.getItem(LS_SERVER) || '');
    };
    LD.setServer = function (url) {
        const u = normalizeServer(url);
        if (u) localStorage.setItem(LS_SERVER, u);
        else localStorage.removeItem(LS_SERVER);
        return u;
    };
    // 后端 API 基址：
    //  - 若用户在登录页手工填写了服务器地址，则用该地址（兼容直连）。
    //  - 否则返回空串，前端用相对路径 /api/... 走本站同源代理
    //    （Cloudflare Pages Functions 会把 /api/* 转发到后端），
    //    从而避免 HTTPS 页面请求 HTTP 的混合内容错误。
    LD.getApiBase = function () {
        return LD.getServer();
    };

    LD.wsUrl = function () {
        const s = LD.getServer();
        if (s) return s.replace(/^http/i, 'ws') + '/ws';
        // 未填服务器 => 走同源代理：wss://<当前域名>/ws
        const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
        return proto + '://' + window.location.host + '/ws';
    };

    // ---------------------------------------------------------------- auth
    LD.getToken = function () { return localStorage.getItem(LS_TOKEN) || ''; };
    LD.setToken = function (t) { t ? localStorage.setItem(LS_TOKEN, t) : localStorage.removeItem(LS_TOKEN); };
    LD.getUser = function () {
        try { return JSON.parse(localStorage.getItem(LS_USER) || 'null'); }
        catch (e) { return null; }
    };
    LD.setUser = function (u) { u ? localStorage.setItem(LS_USER, JSON.stringify(u)) : localStorage.removeItem(LS_USER); };
    LD.logout = function () {
        LD.setToken('');
        LD.setUser(null);
        window.location.href = './login.html';
    };

    // ---------------------------------------------------------------- theme
    function getPreferredTheme() {
        const stored = localStorage.getItem(LS_THEME);
        if (stored === 'dark' || stored === 'light') return stored;
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    LD.applyTheme = function (theme) {
        if (theme === 'dark') root.setAttribute('data-theme', 'dark');
        else root.removeAttribute('data-theme');
        localStorage.setItem(LS_THEME, theme);
    };
    LD.getTheme = function () {
        return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    };
    LD.toggleTheme = function () {
        LD.applyTheme(LD.getTheme() === 'dark' ? 'light' : 'dark');
    };
    LD.initTheme = function () {
        LD.applyTheme(getPreferredTheme());
        const toggle = document.getElementById('themeToggle');
        if (toggle) toggle.addEventListener('click', LD.toggleTheme);
    };

    // ---------------------------------------------------------------- utils
    LD.escapeHtml = function (value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    LD.modeLabel = function (mode) {
        const m = LD.i18n.modes || {};
        return m[mode] || mode || '未知';
    };
    LD.alertRuleLabel = function (rule) {
        return (LD.i18n.alertRules || {})[rule] || rule;
    };
    LD.alertLevelMeta = function (level) {
        const meta = (LD.i18n.alertLevels || {})[level] || {};
        return { label: meta.label || level, color: meta.color || '#64748b' };
    };

    LD.fmt = function (value, digits) {
        if (value == null || isNaN(value)) return '--';
        const d = digits == null ? 1 : digits;
        return Number(value).toFixed(d);
    };
    LD.fmtInt = function (value) {
        if (value == null || isNaN(value)) return '--';
        return Math.round(Number(value));
    };
    LD.fmtVolt = function (v) { return v == null ? '--' : LD.fmt(v, 1) + ' V'; };
    LD.fmtCurr = function (c) { return c == null ? '--' : LD.fmt(c, 1) + ' A'; };
    LD.fmtAlt = function (a) { return a == null ? '--' : LD.fmt(a, 1) + ' m'; };
    LD.fmtSpeed = function (s) { return s == null ? '--' : LD.fmt(s, 1) + ' m/s'; };

    LD.fmtTime = function (ts) {
        if (!ts) return '--';
        const d = new Date(ts * 1000);
        const p = (n) => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
            ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    };
    LD.relTime = function (ts) {
        if (!ts) return '--';
        const diff = Math.max(0, Date.now() / 1000 - ts);
        if (diff < 5) return '刚刚';
        if (diff < 60) return Math.floor(diff) + ' 秒前';
        if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
        return Math.floor(diff / 3600) + ' 小时前';
    };

    // ---------------------------------------------------------------- toast
    LD.toast = function (message, type) {
        let host = document.getElementById('toastHost');
        if (!host) {
            host = document.createElement('div');
            host.id = 'toastHost';
            host.className = 'toast-host';
            document.body.appendChild(host);
        }
        const el = document.createElement('div');
        el.className = 'toast toast--' + (type || 'info');
        el.textContent = message;
        host.appendChild(el);
        setTimeout(() => {
            el.classList.add('toast--out');
            setTimeout(() => el.remove(), 300);
        }, 3200);
    };

    // ---------------------------------------------------------------- i18n
    LD.loadI18n = async function (extraJson) {
        try {
            const res = await fetch(LD.jsonBase + '/common.json', { cache: 'no-cache' });
            if (res.ok) {
                const data = await res.json();
                LD.i18n = Object.assign({}, DEFAULT_I18N, data);
            }
        } catch (e) { /* keep defaults */ }
        if (extraJson) {
            try {
                const res = await fetch(LD.jsonBase + '/' + extraJson, { cache: 'no-cache' });
                if (res.ok) {
                    LD.i18n = Object.assign({}, LD.i18n, await res.json());
                }
            } catch (e) { /* keep defaults */ }
        }
        return LD.i18n;
    };

    // ---------------------------------------------------------------- nav
    LD.renderNav = function (active) {
        const nav = document.getElementById('topNav');
        if (!nav) return;
        const user = LD.getUser();
        const i18n = LD.i18n;
        nav.innerHTML =
            '<a class="nav__brand" href="./dashboard.html">' +
                '<span class="nav__brand-dot"></span>' + LD.escapeHtml(i18n.appName) +
            '</a>' +
            '<div class="nav__links">' +
                '<a class="nav__link' + (active === 'dashboard' ? ' is-active' : '') + '" href="./dashboard.html">' +
                    LD.escapeHtml(i18n.nav.dashboard) + '</a>' +
            '</div>' +
            '<div class="nav__right">' +
                '<button id="themeToggle" class="btn btn--ghost" type="button" title="切换主题">' +
                    '<span class="theme-icon" aria-hidden="true"></span></button>' +
                '<span class="nav__user">' + LD.escapeHtml(user ? user.username : '') + '</span>' +
                '<button id="logoutBtn" class="btn btn--ghost" type="button">' +
                    LD.escapeHtml(i18n.nav.logout) + '</button>' +
            '</div>';
        const lg = document.getElementById('logoutBtn');
        if (lg) lg.addEventListener('click', LD.logout);
        const tt = document.getElementById('themeToggle');
        if (tt) tt.addEventListener('click', LD.toggleTheme);
    };

    window.LD = LD;
})();
