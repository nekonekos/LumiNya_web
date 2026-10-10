import { MAX_PASSPHRASE, MIN_PASSPHRASE, PASSPHRASE_KEY, adminAuthorized, hasPassphrase, json, readJson, sha256Hex } from './_utils.js';

async function guard(request, env) {
    return adminAuthorized(request, env) ? null : json({ error: '未授权' }, 401);
}

/** GET /api/uploadfiles/passphrase —— 口令是否已设置 */
export async function onRequestGet({ request, env }) {
    const denied = await guard(request, env);
    if (denied) return denied;

    try {
        return json({ configured: await hasPassphrase(env.DB) });
    } catch (error) {
        console.error(error);
        return json({ error: '服务器处理失败' }, 500);
    }
}

/** PUT /api/uploadfiles/passphrase —— 重设上传口令（只存哈希） */
export async function onRequestPut({ request, env }) {
    const denied = await guard(request, env);
    if (denied) return denied;

    const body = await readJson(request);
    const passphrase = String(body?.passphrase || '');
    if (passphrase.length < MIN_PASSPHRASE || passphrase.length > MAX_PASSPHRASE) {
        return json({ error: `口令长度需为 ${MIN_PASSPHRASE}-${MAX_PASSPHRASE} 位` }, 400);
    }

    try {
        await env.DB.prepare(
            'INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
        ).bind(PASSPHRASE_KEY, await sha256Hex(passphrase)).run();

        return json({ ok: true });
    } catch (error) {
        console.error(error);
        return json({ error: '服务器处理失败' }, 500);
    }
}

/** DELETE /api/uploadfiles/passphrase —— 清除口令，暂停上传入口 */
export async function onRequestDelete({ request, env }) {
    const denied = await guard(request, env);
    if (denied) return denied;

    try {
        await env.DB.prepare('DELETE FROM settings WHERE key = ?1').bind(PASSPHRASE_KEY).run();
        return json({ ok: true });
    } catch (error) {
        console.error(error);
        return json({ error: '服务器处理失败' }, 500);
    }
}
