import { hasPassphrase, json } from './_utils.js';

/** GET /api/uploadfiles/status —— 上传页用来判断口令是否已设置 */
export async function onRequestGet({ env }) {
    if (!env.DB) {
        return json({ error: '服务未配置' }, 500);
    }

    try {
        return json({ configured: await hasPassphrase(env.DB) });
    } catch (error) {
        console.error(error);
        return json({ error: '服务器处理失败' }, 500);
    }
}
