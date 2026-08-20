export async function onRequestPost({ request, env }) {
    const body = await readJson(request);

    if (!body || !body.token || !env.ADMIN_TOKEN || body.token !== env.ADMIN_TOKEN) {
        return json({ error: '口令错误' }, 401);
    }

    return json({ ok: true });
}

async function readJson(request) {
    try {
        return await request.json();
    } catch {
        return null;
    }
}

function json(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        }
    });
}