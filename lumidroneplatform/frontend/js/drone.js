/* ==========================================================================
 * LumiDrone 单机详情逻辑：姿态、地图、实时数据、告警、历史、只读控制区。
 * ========================================================================== */
(function () {
    'use strict';

    const params = new URLSearchParams(location.search);
    const SYSID = parseInt(params.get('sysid'), 10);

    let current = null;          // 当前无人机快照
    let map = null;
    let marker = null;
    let hasCentered = false;
    let liveAlerts = [];         // WS 推送的实时告警（本机）
    let alertTimes = {};         // rule -> triggered_at（来自 REST）
    let ws = null;
    let wsRetry = 0;

    const esc = function (v) { return window.LD.escapeHtml(v); };
    const i18n = () => window.LD.i18n;

    function sev(level) {
        return level === 'critical' ? 3 : level === 'warning' ? 2 : 1;
    }

    /* -------------------------------------------------------------- header */
    function renderHeader() {
        const d = current;
        document.getElementById('droneName').textContent = d.name;
        const status = d.online ? i18n().status.online : i18n().status.offline;
        document.getElementById('droneMeta').textContent =
            'SYSID ' + d.sysid + ' · ' + status +
            (d.online && d.mode ? ' · ' + window.LD.modeLabel(d.mode) : '');
        document.title = d.name + ' · ' + i18n().appName;
    }

    /* ------------------------------------------------------------ attitude */
    function renderAttitude(d) {
        const roll = Number(d.roll) || 0;
        const pitch = Number(d.pitch) || 0;
        const yaw = Number(d.yaw) || 0;
        const shift = Math.max(-45, Math.min(45, pitch)) * 3;

        document.getElementById('attitudeIndicator').innerHTML =
            '<div class="attitude__disc" style="position:absolute;inset:-45%;transform:rotate(' + (-roll).toFixed(1) + 'deg)">' +
                '<div class="attitude__sky"></div>' +
                '<div class="attitude__ground"></div>' +
                '<div class="attitude__horizon" style="top:calc(50% + ' + shift.toFixed(1) + 'px)"></div>' +
            '</div>' +
            '<div class="attitude__plane">➤</div>' +
            '<div class="attitude__ring"></div>' +
            '<div class="attitude__center-dot"></div>';

        const r = document.getElementById('attitudeReadouts');
        r.innerHTML =
            '<div class="attitude-readouts__item"><div class="attitude-readouts__label">' +
                esc(i18n().attitude.roll) + '</div><div class="attitude-readouts__value">' +
                window.LD.fmt(roll, 1) + '°</div></div>' +
            '<div class="attitude-readouts__item"><div class="attitude-readouts__label">' +
                esc(i18n().attitude.pitch) + '</div><div class="attitude-readouts__value">' +
                window.LD.fmt(pitch, 1) + '°</div></div>' +
            '<div class="attitude-readouts__item"><div class="attitude-readouts__label">' +
                esc(i18n().attitude.yaw) + '</div><div class="attitude-readouts__value">' +
                window.LD.fmt(yaw, 1) + '°</div></div>';
    }

    /* ----------------------------------------------------------------- map */
    function ensureMap() {
        if (map) return map;
        const el = document.getElementById('map');
        if (!window.L) {
            el.innerHTML = '<div class="map__placeholder">地图库加载失败</div>';
            return null;
        }
        map = L.map(el).setView([31.23, 121.47], 10);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
        }).addTo(map);
        return map;
    }

    function updateMap(d) {
        const el = document.getElementById('map');
        if (d.lat == null || d.lon == null) {
            if (!map) el.innerHTML = '<div class="map__placeholder">' + esc(i18n().map.noPosition) + '</div>';
            return;
        }
        const m = ensureMap();
        if (!m) return;
        const latlng = [d.lat, d.lon];
        if (!marker) {
            marker = L.circleMarker(latlng, {
                radius: 8, color: '#ef4444', weight: 2, fillColor: '#ef4444', fillOpacity: 0.9
            }).addTo(m).bindPopup(esc(d.name || ('SYSID ' + d.sysid)));
        } else {
            marker.setLatLng(latlng);
            marker.setPopupContent(esc(d.name || ('SYSID ' + d.sysid)));
        }
        if (!hasCentered) {
            m.setView(latlng, 16);
            hasCentered = true;
        }
    }

    /* ---------------------------------------------------------------- data */
    function kvRow(key, val, cls) {
        return '<div class="kv__row"><span class="kv__key">' + esc(key) + '</span>' +
            '<span class="kv__val ' + (cls || '') + '">' + val + '</span></div>';
    }

    function renderData(d) {
        const t = i18n().data;
        const batt = d.battery >= 0 ? d.battery : null;
        const battCls = batt == null ? '' : batt <= 10 ? 'kv__val--bad' : batt <= 20 ? 'kv__val--warn' : 'kv__val--ok';
        const fixLabel = (i18n().fixTypes || {})[String(d.fix_type)] || String(d.fix_type);

        let html = '';
        html += kvRow(t.armed, d.armed
            ? '<span class="badge badge--warn"><span class="badge__dot"></span>' + esc(i18n().status.armed) + '</span>'
            : '<span class="badge badge--muted"><span class="badge__dot"></span>' + esc(i18n().status.disarmed) + '</span>');
        html += kvRow(t.mode, esc(window.LD.modeLabel(d.mode)));
        html += kvRow(t.systemStatus, esc(d.system_status || '--'));
        html += kvRow(t.battery, batt == null ? '--' : batt + '%', battCls);
        html += kvRow(t.voltage, window.LD.fmtVolt(d.voltage));
        html += kvRow(t.current, window.LD.fmtCurr(d.current));
        html += kvRow(t.alt, window.LD.fmtAlt(d.alt));
        html += kvRow(t.relAlt, window.LD.fmtAlt(d.rel_alt));
        html += kvRow(t.heading, window.LD.fmt(d.heading, 0) + '°', 'kv__val--mono');
        html += kvRow(t.groundspeed, window.LD.fmtSpeed(d.groundspeed));
        html += kvRow(t.airspeed, window.LD.fmtSpeed(d.airspeed));
        html += kvRow(t.climb, window.LD.fmt(d.climb, 1) + ' m/s');
        html += kvRow(t.throttle, window.LD.fmtInt(d.throttle) + '%');
        html += kvRow(t.satellites, window.LD.fmtInt(d.satellites));
        html += kvRow(t.fixType, esc(fixLabel));
        html += kvRow(t.gps, d.gps_ok
            ? '<span class="kv__val--ok">' + esc(t.ok) + '</span>'
            : '<span class="kv__val--bad">' + esc(t.bad) + '</span>');
        html += kvRow(t.localPos,
            (d.local_x == null) ? '--'
                : 'X ' + window.LD.fmt(d.local_x, 2) + ' / Y ' + window.LD.fmt(d.local_y, 2) + ' / Z ' + window.LD.fmt(d.local_z, 2) + ' m',
            'kv__val--mono');
        html += kvRow(t.vibration,
            (d.vibration_x == null) ? '--'
                : 'X ' + window.LD.fmt(d.vibration_x, 2) + ' / Y ' + window.LD.fmt(d.vibration_y, 2) + ' / Z ' + window.LD.fmt(d.vibration_z, 2),
            'kv__val--mono');
        html += kvRow(t.range, d.range_m == null ? '--' : window.LD.fmt(d.range_m, 2) + ' m');
        html += kvRow(t.mcuTemp, d.mcu_temp == null ? '--' : window.LD.fmt(d.mcu_temp, 1) + ' °C', d.mcu_temp != null && d.mcu_temp > 75 ? 'kv__val--warn' : '');
        html += kvRow(t.mcuVoltage, d.mcu_voltage == null ? '--' : window.LD.fmt(d.mcu_voltage, 2) + ' V');
        html += kvRow(t.rssi, d.rssi == null ? '--' : window.LD.fmtInt(d.rssi) + ' dBm', d.rssi != null && d.rssi < -90 ? 'kv__val--bad' : '');
        html += kvRow(t.load, d.load == null ? '--' : window.LD.fmt(d.load, 1) + ' %');
        html += kvRow(t.windSpeed, window.LD.fmtSpeed(d.wind_speed));
        html += kvRow(t.ekf, d.ekf_ok
            ? '<span class="kv__val--ok">' + esc(t.ok) + '</span>'
            : (d.ekf_ok == null ? '--' : '<span class="kv__val--bad">' + esc(t.bad) + '</span>'));
        html += kvRow(t.groundDistance, d.ground_distance == null ? '--' : window.LD.fmt(d.ground_distance, 2) + ' m');
        html += kvRow(t.lastSeen, window.LD.relTime(d.last_seen));
        document.getElementById('dataList').innerHTML = html;
    }

    /* -------------------------------------------------------------- alerts */
    function renderAlerts(list) {
        const box = document.getElementById('alertList');
        if (!list || !list.length) {
            box.innerHTML = '<div class="alert-empty">' + esc(i18n().alerts.empty) + '</div>';
            return;
        }
        const sorted = list.slice().sort(function (a, b) {
            if (sev(a.level) !== sev(b.level)) return sev(b.level) - sev(a.level);
            return (b.triggered_at || 0) - (a.triggered_at || 0);
        });
        box.innerHTML = sorted.map(function (a) {
            const cls = a.level === 'critical' ? 'alert-item--critical'
                : a.level === 'warning' ? 'alert-item--warning' : '';
            const ts = a.triggered_at || alertTimes[a.rule];
            return '<div class="alert-item ' + cls + '">' +
                '<div class="alert-item__body">' +
                    '<div class="alert-item__title">' + esc(window.LD.alertRuleLabel(a.rule)) + '</div>' +
                    '<div class="alert-item__msg">' + esc(a.message) + '</div>' +
                    '<div class="alert-item__time">' + (ts ? window.LD.fmtTime(ts) : '刚刚') + '</div>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    /* ------------------------------------------------------------ commands */
    function renderCommands() {
        const t = i18n().commands;
        document.getElementById('commandsNote').textContent = t.readonlyNote;
        const cmds = [
            ['arm', t.arm], ['takeoff', t.takeoff], ['set_mode', t.set_mode],
            ['goto', t.goto], ['rtl', t.rtl], ['land', t.land], ['disarm', t.disarm]
        ];
        const host = document.getElementById('commandButtons');
        host.innerHTML = cmds.map(function (c) {
            return '<button type="button" class="command-btn" data-cmd="' + c[0] + '" disabled>' +
                '<span class="lock">🔒</span>' + esc(c[1]) + '</button>';
        }).join('');

        // 若后端开启指令，则启用按钮（当前默认只读，按钮保持禁用）。
        window.LD.api.health().then(function (h) {
            if (!h.commands_enabled) return;
            host.querySelectorAll('.command-btn').forEach(function (btn) {
                btn.disabled = false;
                btn.style.cursor = 'pointer';
                btn.style.opacity = '1';
                btn.addEventListener('click', function () {
                    if (!window.confirm('确认执行「' + btn.textContent.replace('🔒', '') + '」？')) return;
                    window.LD.api.command(SYSID, btn.dataset.cmd, {})
                        .then(function () { window.LD.toast('指令已发送', 'success'); })
                        .catch(function (e) { window.LD.toast(e.message || '指令失败', 'error'); });
                });
            });
        }).catch(function () { /* 保持只读 */ });
    }

    /* ------------------------------------------------------------- history */
    function renderHistory(history) {
        const body = document.getElementById('historyBody');
        if (!history || !history.length) {
            body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-faint)">' +
                esc(i18n().history.empty) + '</td></tr>';
            return;
        }
        const rows = history.slice().reverse().slice(0, 50);
        body.innerHTML = rows.map(function (r) {
            const batt = r.battery >= 0 ? r.battery + '%' : '--';
            return '<tr>' +
                '<td>' + window.LD.fmtTime(r.ts) + '</td>' +
                '<td>' + batt + '</td>' +
                '<td>' + window.LD.fmtAlt(r.alt) + '</td>' +
                '<td>' + esc(window.LD.modeLabel(r.mode)) + '</td>' +
                '<td>' + (r.armed ? '✔ 已解锁' : '—') + '</td>' +
            '</tr>';
        }).join('');
    }

    /* ----------------------------------------------------------------- ws */
    function onSnapshot(msg) {
        const list = msg.drones || [];
        const found = list.filter(function (d) { return d.sysid === SYSID; })[0];
        if (found) {
            current = found;
            renderHeader();
            renderAttitude(found);
            updateMap(found);
            renderData(found);
        }
        liveAlerts = (msg.alerts || []).filter(function (a) { return a.sysid === SYSID; });
        renderAlerts(liveAlerts);
    }

    function connectWs() {
        const url = window.LD.wsUrl();
        const token = window.LD.getToken();
        if (!url || !token) return;
        try {
            ws = new WebSocket(url + '?token=' + encodeURIComponent(token));
        } catch (e) { scheduleReconnect(); return; }
        ws.onopen = function () { wsRetry = 0; };
        ws.onmessage = function (event) {
            let msg;
            try { msg = JSON.parse(event.data); } catch (e) { return; }
            if (msg.type === 'snapshot') onSnapshot(msg);
        };
        ws.onclose = function () { scheduleReconnect(); };
        ws.onerror = function () { try { ws.close(); } catch (e) { /* noop */ } };
    }

    function scheduleReconnect() {
        wsRetry++;
        setTimeout(connectWs, Math.min(10000, 1000 * wsRetry));
    }

    /* --------------------------------------------------------------- init */
    async function init() {
        if (!SYSID) { window.location.href = './dashboard.html'; return; }
        await window.LD.loadI18n('drone.json');
        window.LD.initTheme();
        window.LD.renderNav('drone');
        document.getElementById('backLink').textContent = '← ' + i18n().back;

        try {
            current = await window.LD.api.drone(SYSID);
        } catch (err) {
            if (err.status === 404) {
                document.getElementById('droneName').textContent = i18n().notFound;
                document.getElementById('droneMeta').textContent = 'SYSID ' + SYSID;
                document.getElementById('dataList').innerHTML =
                    '<div class="alert-empty">' + esc(i18n().notFound) + '</div>';
                return;
            }
            window.LD.toast(i18n().errors.loadFailed, 'error');
            return;
        }

        renderHeader();
        renderAttitude(current);
        updateMap(current);
        renderData(current);
        renderCommands();

        window.LD.api.alerts(SYSID, true).then(function (data) {
            (data.alerts || []).forEach(function (a) { alertTimes[a.rule] = a.triggered_at; });
            if (!liveAlerts.length) renderAlerts(data.alerts || []);
        }).catch(function () { /* WS 会兜底 */ });

        window.LD.api.history(SYSID, 300).then(function (data) {
            renderHistory(data.history || []);
        }).catch(function () { renderHistory([]); });

        connectWs();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
