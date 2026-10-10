import { MAX_SIZE, checkPassphrase, cleanFileName, clientMeta, json, randomId } from './_utils.js';

/**
 * PUT /api/uploadfiles/put?name=<文件名>&type=<MIME>
 * 请求体就是文件原始字节流，直接流式写入 R2，不解析 multipart，
 * 避免把整个文件读进内存（Workers 内存上限 128MB）。
 * 口令通过 X-Upload-Pass 头传入。
 */
export async function onRequestPut({ request, env }) {
    if (!env.DB || !env.FILES) {
        return json({ error: '服务未配置' }, 500);
    }

    const passphrase = request.headers.get('X-Upload-Pass') || '';
    if (!(await checkPassphrase(env.DB, passphrase))) {
        return json({ error: '口令错误' }, 401);
    }

    const declared = Number(request.headers.get('Content-Length') || '0');
    if (declared > MAX_SIZE) {
        return json({ error: '文件超过 100MB 上限' }, 413);
    }
    if (!declared || !request.body) {
        return json({ error: '缺少文件内容' }, 400);
    }

    const url = new URL(request.url);
    const name = cleanFileName(url.searchParams.get('name'));
    const contentType = String(url.searchParams.get('type') || request.headers.get('Content-Type') || 'application/octet-stream').slice(0, 200);

    const id = randomId();
    const meta = clientMeta(request);
    const createdAt = Date.now();

    try {
        const object = await env.FILES.put(id, request.body, {
            httpMetadata: { contentType },
            customMetadata: {
                name,
                ip: meta.ip,
                created_at: String(createdAt)
            }
        });

        const size = object?.size ?? declared;
        await env.DB.prepare(
            'INSERT INTO files (id, name, size, content_type, ip, country, city, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)'
        ).bind(id, name, size, contentType, meta.ip, meta.country, meta.city, createdAt).run();

        return json({ ok: true, id, name, size }, 201);
    } catch (error) {
        console.error(error);
        // 写入 D1 失败时回滚已落地的对象，避免留下「孤儿文件」
        try {
            await env.FILES.delete(id);
        } catch (cleanupError) {
            console.error(cleanupError);
        }
        return json({ error: '上传失败，请重试' }, 500);
    }
}
