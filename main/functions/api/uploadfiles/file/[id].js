import { adminAuthorized, contentDisposition, isId, json } from '../_utils.js';

/** GET /api/uploadfiles/file/<id> —— 后台下载，从 R2 流式返回 */
export async function onRequestGet({ params, request, env }) {
    if (!adminAuthorized(request, env)) {
        return json({ error: '未授权' }, 401);
    }

    const id = String(params.id || '');
    if (!isId(id)) {
        return json({ error: '文件不存在' }, 404);
    }

    try {
        const row = await env.DB.prepare('SELECT name, content_type FROM files WHERE id = ?1').bind(id).first();
        if (!row) {
            return json({ error: '文件不存在' }, 404);
        }

        const object = await env.FILES.get(id);
        if (!object) {
            return json({ error: '文件已从存储中移除' }, 404);
        }

        const headers = new Headers();
        headers.set('Content-Type', row.content_type || 'application/octet-stream');
        headers.set('Content-Disposition', contentDisposition(row.name));
        headers.set('Content-Length', String(object.size));
        headers.set('Cache-Control', 'no-store');

        return new Response(object.body, { headers });
    } catch (error) {
        console.error(error);
        return json({ error: '服务器处理失败' }, 500);
    }
}
