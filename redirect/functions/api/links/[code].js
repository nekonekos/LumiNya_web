export async function onRequestGet({ params, env }) {
    const code = String(params.code || '').trim().toLowerCase();

    if (!/^[a-z0-9][a-z0-9-_]{1,63}$/.test(code)) {
        return json({ error: '短码不存在' }, 404);
    }

    const link = await env.DB.prepare(
        'SELECT target, title FROM links WHERE code = ?1 AND enabled = 1'
    ).bind(code).first();

    if (!link) {
        return json({ error: '短码不存在或已停用' }, 404);
    }

    return json({ target: link.target, title: link.title || '' }, 200, {
        'Cache-Control': 'no-store'
    });
}

function json(payload, status, extraHeaders = {}) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...extraHeaders
        }
    });
}