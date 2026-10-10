import { json, readJson, safeEqual } from './_utils.js';

/** POST /api/uploadfiles/login —— 后台登录，校验 ADMIN_TOKEN */
export async function onRequestPost({ request, env }) {
    const body = await readJson(request);
    const token = String(body?.token || '');

    if (!env.ADMIN_TOKEN || !safeEqual(token, env.ADMIN_TOKEN)) {
        return json({ error: '口令错误' }, 401);
    }

    return json({ ok: true });
}
