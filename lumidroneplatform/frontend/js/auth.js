/* ==========================================================================
 * LumiDrone 登录页逻辑
 * ========================================================================== */
(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', async function () {
        await window.LD.loadI18n();
        window.LD.initTheme();

        const appName = document.getElementById('authAppName');
        const tagline = document.getElementById('authTagline');
        appName.textContent = window.LD.i18n.appName;
        tagline.textContent = window.LD.i18n.tagline || '无人机运营监管平台';

        const serverInput = document.getElementById('serverInput');
        serverInput.value = window.LD.getServer().replace(/^https?:\/\//, '') || '';

        const form = document.getElementById('loginForm');
        const errorBox = document.getElementById('loginError');
        const loginBtn = document.getElementById('loginBtn');

        function showError(msg) {
            errorBox.textContent = msg;
            errorBox.hidden = false;
        }
        function clearError() {
            errorBox.hidden = true;
        }

        form.addEventListener('submit', async function (event) {
            event.preventDefault();
            clearError();

            const server = serverInput.value.trim();
            const username = document.getElementById('usernameInput').value.trim();
            const password = document.getElementById('passwordInput').value;

            if (!username || !password) { showError('请输入用户名和密码'); return; }

            loginBtn.disabled = true;
            loginBtn.textContent = '登录中…';
            try {
                const data = await window.LD.api.login(server, username, password);
                window.LD.setToken(data.access_token);
                window.LD.setUser({ username: data.username, role: data.role });
                window.location.href = './dashboard.html';
            } catch (err) {
                const detail = err.detail;
                if (detail === 'invalid_credentials') showError('用户名或密码错误');
                else if (typeof detail === 'string') showError(detail);
                else showError(window.LD.i18n.errors.network);
                loginBtn.disabled = false;
                loginBtn.textContent = '登 录';
            }
        });
    });
})();
