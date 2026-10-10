import { adminAuthorized, isId, json } from '../_utils.js';

/** DELETE /api/uploadfiles/files/<id> —— 后台删除，同时清理 R2 与 D1 */
export async function onRequestDelete({ params, request, env }) {
    if (!adminAuthorized(request, env)) {
        return json({ error: '未授权' }, 401);
    }

    const id = String(params.id || '');
    if (!isId(id)) {
        return json({ error: '文件不存在' }, 404);
    }

    try {
        const row = await env.DB.prepare('SELECT id FROM files WHERE id = ?1').bind(id).first();
        if (!row) {
            return json({ error: '文件不存在' }, 404);
        }

        await env.FILES.delete(id);
        await env.DB.prepare('DELETE FROM files WHERE id = ?1').bind(id).run();

        return json({ ok: true });
    } catch (error) {
        console.error(error);
        return json({ error: '服务器处理失败' }, 500);
    }
}
