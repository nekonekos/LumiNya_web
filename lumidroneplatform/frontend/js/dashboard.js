/* ==========================================================================
 * LumiDrone 机队总览逻辑：REST 首屏 + WebSocket 实时刷新。
 * ========================================================================== */
(function () {
    'use strict';

    let drones = [];
    let alerts = [];
    let ws = null;
    let wsRetry = 0;

    function severityRank(level) {
        return level === 'critical' ? 3 : level === 'warning' ? 2 : 1;
    }

    function droneAlerts(sysid) {
        return alerts.filter(function (a) { return a.sysid === sysid; });
    }

    function droneMaxLevel(sysid) {
        let rank = 0;
        droneAlerts(sysid).forEach(function (a) { rank = Math.max(rank, severityRank(a.level)); });
        return rank;
    }

    function sortDrones(list) {
        return list.slice().sort(function (a, b) {
            if (a.online !== b.online) return a.online ? -1 : 1;
            const ra = droneMaxLevel(a.sysid), rb = droneMaxLevel(b.sysid);
            if (ra !== rb) return rb - ra;
            return a.sysid - b.sysid;
        });
    }

    function renderStats() {
        const i18n = window.LD.i18n;
        const online = drones.filter(function (d) { return d.online; }).length;
        const known = drones.length;
        const alerting = alerts.length;
        const bar = document.getElementById('statsBar');
        bar.innerHTML =
            '<div class="stat stat--ok"><div class="stat__value">' + online + '</div><div class="stat__label">' +
                window.LD.escapeHtml(i18n.stats.online) + '</div></div>' +
            '<div class="stat"><div class="stat__value">' + known + '</div><div class="stat__label">' +
                window.LD.escapeHtml(i18n.stats.known) + '</div></div>' +
            '<div class="stat ' + (alerting ? 'stat--danger' : 'stat--ok') + '"><div class="stat__value">' + alerting +
                '</div><div class="stat__label">' + window.LD.escapeHtml(i18n.stats.alerting) + '</div></div>';
    }

    function badge(html, cls) {
        return '<span class="badge ' + cls + '"><span class="badge__dot"></span>' + html + '</span>';
    }

    function renderCard(d) {
        const i18n = window.LD.i18n;
        const esc = window.LD.escapeHtml;
        const alertsForDrone = droneAlerts(d.sysid);
        const maxLevel = droneMaxLevel(d.sysid);

        let badgesHtml = '';
        if (d.online) {
            badgesHtml += badge(esc(i18n.status.online), 'badge--ok');
            badgesHtml += d.armed ? badge(esc(i18n.status.armed), 'badge--warn') : badge(esc(i18n.status.disarmed), 'badge--muted');
        } else {
            badgesHtml += badge(esc(i18n.status.offline), 'badge--muted');
        }
        if (maxLevel >= 3) badgesHtml += badge(esc(i18n.alertLevels.critical.label), 'badge--danger');
        else if (maxLevel >= 2) badgesHtml += badge(esc(i18n.alertLevels.warning.label), 'badge--warn');

        const battery = d.battery >= 0 ? d.battery : null;
        const batteryCls = battery == null ? '' : (battery <= 10 ? 'metric__value--danger' : battery <= 20 ? 'metric__value--warn' : '');

        const altTxt = d.rel_alt != null ? window.LD.fmtAlt(d.rel_alt) : window.LD.fmtAlt(d.alt);
        const modeTxt = window.LD.modeLabel(d.mode);

        return '<article class="drone-card' + (maxLevel ? ' is-alert' : '') + (d.online ? '' : ' is-offline') + '">' +
            '<div class="drone-card__top">' +
                '<div class="drone-card__avatar">' + esc((d.name || '?').charAt(0)) + '</div>' +
                '<div class="drone-card__title">' +
                    '<h3 class="drone-card__name" title="' + esc(d.name) + '">' + esc(d.name) + '</h3>' +
                    '<div class="drone-card__sysid">SYSID ' + esc(d.sysid) + '</div>' +
                '</div>' +
            '</div>' +
            '<div class="drone-card__badges">' + badgesHtml + '</div>' +
            '<div class="drone-card__metrics">' +
                '<div class="metric"><div class="metric__label">' + esc(i18n.card.battery) + '</div>' +
                    '<div class="metric__value ' + batteryCls + '">' + (battery == null ? '--' : battery + '%') + '</div></div>' +
                '<div class="metric"><div class="metric__label">' + esc(i18n.card.alt) + '</div>' +
                    '<div class="metric__value">' + altTxt + '</div></div>' +
                '<div class="metric"><div class="metric__label">' + esc(i18n.card.mode) + '</div>' +
                    '<div class="metric__value">' + esc(modeTxt) + '</div></div>' +
                '<div class="metric"><div class="metric__label">' + esc(i18n.card.satellites) + '</div>' +
                    '<div class="metric__value">' + (d.satellites || 0) + '</div></div>' +
            '</div>' +
            '<div class="drone-card__foot">' +
                '<span class="drone-card__last">' + esc(i18n.card.lastSeen) + '：' +
                    window.LD.relTime(d.last_seen) + '</span>' +
                '<a class="btn btn--sm btn--primary" href="./drone.html?sysid=' + esc(d.sysid) + '">' +
                    esc(i18n.actions.detail) + '</a>' +
            '</div>' +
        '</article>';
    }

    function renderGrid() {
        const grid = document.getElementById('droneGrid');
        const i18n = window.LD.i18n;
        if (!drones.length) {
            grid.innerHTML =
                '<div class="empty"><div class="empty__icon">🛩️</div>' +
                '<div class="empty__title">' + window.LD.escapeHtml(i18n.empty.title) + '</div>' +
                '<p class="empty__desc">' + window.LD.escapeHtml(i18n.empty.desc) + '</p></div>';
            return;
        }
        grid.innerHTML = sortDrones(drones).map(renderCard).join('');
    }

    function render() {
        renderStats();
        renderGrid();
    }

    function setConnHint(live) {
        const hint = document.getElementById('connHint');
        hint.innerHTML = '<span class="conn-dot' + (live ? ' is-live' : '') + '"></span>' +
            (live ? '实时连接中' : '连接断开，重试中…');
    }

    function connectWs() {
        const url = window.LD.wsUrl();
        if (!url) return;
        const token = window.LD.getToken();
        if (!token) { window.location.href = './login.html'; return; }
        try {
            ws = new WebSocket(url + '?token=' + encodeURIComponent(token));
        } catch (e) {
            scheduleReconnect();
            return;
        }
        ws.onopen = function () { wsRetry = 0; setConnHint(true); };
        ws.onmessage = function (event) {
            let msg;
            try { msg = JSON.parse(event.data); } catch (e) { return; }
            if (msg.type === 'snapshot') {
                drones = msg.drones || [];
                alerts = msg.alerts || [];
                render();
            }
        };
        ws.onclose = function () { setConnHint(false); scheduleReconnect(); };
        ws.onerror = function () { try { ws.close(); } catch (e) { /* noop */ } };
    }

    function scheduleReconnect() {
        wsRetry++;
        setTimeout(connectWs, Math.min(10000, 1000 * wsRetry));
    }

    async function loadInitial() {
        const grid = document.getElementById('droneGrid');
        grid.innerHTML = '<div class="skeleton" style="height:180px;grid-column:1/-1"></div>';
        try {
            const data = await window.LD.api.drones();
            drones = data.drones || [];
            // 首次用 REST 的告警数据兜底（后续由 WS 覆盖）。
            render();
        } catch (err) {
            if (err.status !== 401) {
                grid.innerHTML = '<div class="empty"><div class="empty__icon">⚠️</div>' +
                    '<div class="empty__title">加载失败</div>' +
                    '<p class="empty__desc">' + window.LD.escapeHtml(window.LD.i18n.errors.loadFailed) + '</p></div>';
            }
        }
    }

    document.addEventListener('DOMContentLoaded', async function () {
        await window.LD.loadI18n('dashboard.json');
        window.LD.initTheme();
        window.LD.renderNav('dashboard');

        document.getElementById('pageTitle').textContent = window.LD.i18n.title;
        document.getElementById('pageSubtitle').textContent = window.LD.i18n.subtitle;

        document.getElementById('refreshBtn').addEventListener('click', function () {
            window.LD.api.drones().then(function (data) {
                drones = data.drones || [];
                render();
            }).catch(function () { /* WS 会兜底 */ });
        });

        await loadInitial();
        connectWs();
    });
})();
