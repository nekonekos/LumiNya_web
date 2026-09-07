/* ==========================================================================
 * LumiDrone API 客户端
 * 依赖 common.js（window.LD）。自动附带 JWT，401 时跳转登录。
 * ========================================================================== */
(function () {
    'use strict';

    function authHeaders() {
        const token = window.LD.getToken();
        const h = { 'Content-Type': 'application/json' };
        if (token) h['Authorization'] = 'Bearer ' + token;
        return h;
    }

    async function request(path, options) {
        const base = window.LD.getApiBase();
        const opts = options || {};
        const headers = Object.assign(authHeaders(), opts.headers || {});
        let res;
        try {
            res = await fetch(base + path, {
                method: opts.method || 'GET',
                headers: headers,
                body: opts.body ? JSON.stringify(opts.body) : undefined
            });
        } catch (e) {
            window.LD.toast(window.LD.i18n.errors.network, 'error');
            throw e;
        }

        if (res.status === 401) {
            window.LD.setToken('');
            window.LD.setUser(null);
            window.LD.toast(window.LD.i18n.errors.unauthorized, 'error');
            setTimeout(() => { window.location.href = './login.html'; }, 600);
            throw new Error('unauthorized');
        }

        let data = null;
        try { data = await res.json(); } catch (e) { /* empty body */ }

        if (!res.ok) {
            const detail = (data && data.detail) ? data.detail : ('HTTP ' + res.status);
            const err = new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
            err.status = res.status;
            err.detail = detail;
            throw err;
        }
        return data;
    }

    window.LD.api = {
        request: request,
        get: (p) => request(p),
        post: (p, body) => request(p, { method: 'POST', body: body }),
        patch: (p, body) => request(p, { method: 'PATCH', body: body }),
        del: (p) => request(p, { method: 'DELETE' }),

        login: (server, username, password) => {
            window.LD.setServer(server);
            return request('/api/auth/login', {
                method: 'POST',
                body: { username: username, password: password }
            });
        },
        me: () => request('/api/me'),
        health: () => request('/api/health'),
        drones: () => request('/api/drones'),
        drone: (sysid) => request('/api/drones/' + sysid),
        history: (sysid, limit) => request('/api/drones/' + sysid + '/history?limit=' + (limit || 300)),
        alerts: (sysid, active) => request('/api/drones/' + sysid + '/alerts' + (active ? '?active=1' : '')),
        command: (sysid, command, params) => request('/api/drones/' + sysid + '/command', {
            method: 'POST',
            body: { command: command, params: params || {} }
        })
    };
})();
