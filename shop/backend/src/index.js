// ============================================================
// LumiNya Shop · Worker 入口（原生 fetch + 简单路由）
// ============================================================
import { json, corsHeaders, error } from './utils.js';
import { seedAdmin } from './db.js';
import { handlePublic } from './handlers/public.js';
import { handleAdmin } from './handlers/admin.js';
import { handlePay } from './handlers/pay.js';

export default {
  async fetch(request, env) {
    // 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    // 首次启动播种管理员
    try {
      await seedAdmin(env);
    } catch (e) {
      console.error('seedAdmin failed', e);
    }

    let response;
    try {
      if (path === '/api/site') {
        response = json({
          site: {
            name: env.SITE_NAME || 'LumiNya Shop',
            announcement: env.SITE_ANNOUNCEMENT || ''
          }
        });
      } else if (path.startsWith('/api/pay')) {
        response = await handlePay(request, env, url);
      } else if (path.startsWith('/api/admin')) {
        response = await handleAdmin(request, env, url);
      } else if (path.startsWith('/api/')) {
        response = await handlePublic(request, env, url);
      } else {
        response = error('Not Found', 404);
      }
    } catch (e) {
      console.error('unhandled', e);
      response = error('服务器处理失败', 500);
    }

    // 附加 CORS 头
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(corsHeaders(request.headers.get('Origin') || '*'))) {
      headers.set(k, v);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
