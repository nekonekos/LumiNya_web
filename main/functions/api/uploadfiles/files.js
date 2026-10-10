import { adminAuthorized, json } from './_utils.js';

/** GET /api/uploadfiles/files?limit=&offset= —— 后台文件清单 */
export async function onRequestGet({ request, env }) {
    if (!adminAuthorized(request, env)) {
        return json({ error: '未授权' }, 401);
    }

    try {
        const url = new URL(request.url);
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 100);
        const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

        const totalRow = await env.DB.prepare('SELECT COUNT(*) AS total FROM files').first();
        const { results } = await env.DB.prepare(
            'SELECT id, name, size, content_type, ip, country, city, created_at FROM files ORDER BY created_at DESC LIMIT ?1 OFFSET ?2'
        ).bind(limit, offset).all();

        return json({ files: results, total: totalRow?.total || 0, limit, offset });
    } catch (error) {
        console.error(error);
        return json({ error: '服务器处理失败' }, 500);
    }
}
