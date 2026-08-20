export async function onRequest(context) {
    if (!authorized(context.request, context.env)) {
        return json({ error: '未授权' }, 401);
    }

    try {
        switch (context.request.method) {
            case 'GET':
                return listLinks(context.env.DB);
            case 'POST':
                return createLink(context.request, context.env.DB);
            case 'PUT':
                return updateLink(context.request, context.env.DB);
            case 'DELETE':
                return deleteLink(context.request, context.env.DB);
            default:
                return json({ error: '不支持的请求方法' }, 405);
        }
    } catch (error) {
        console.error(error);
        return json({ error: '服务器处理失败' }, 500);
    }
}

async function listLinks(db) {
    const { results } = await db.prepare(
        'SELECT code, target, title, enabled, created_at, updated_at FROM links ORDER BY updated_at DESC'
    ).all();
    return json({ links: results });
}

async function createLink(request, db) {
    const link = normalizeLink(await readJson(request));
    if (link.error) return json({ error: link.error }, 400);

    try {
        await db.prepare(
            'INSERT INTO links (code, target, title, enabled, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, unixepoch(), unixepoch())'
        ).bind(link.code, link.target, link.title, link.enabled ? 1 : 0).run();
    } catch (error) {
        if (String(error.message || '').includes('UNIQUE')) {
            return json({ error: '这个短码已经存在' }, 409);
        }
        throw error;
    }

    return json({ ok: true }, 201);
}

async function updateLink(request, db) {
    const body = await readJson(request);
    const link = normalizeLink(body);
    if (link.error) return json({ error: link.error }, 400);

    const result = await db.prepare(
        'UPDATE links SET target = ?1, title = ?2, enabled = ?3, updated_at = unixepoch() WHERE code = ?4'
    ).bind(link.target, link.title, link.enabled ? 1 : 0, link.code).run();

    return result.meta.changes ? json({ ok: true }) : json({ error: '短码不存在' }, 404);
}

async function deleteLink(request, db) {
    const body = await readJson(request);
    const code = String(body?.code || '').trim().toLowerCase();
    if (!code) return json({ error: '缺少短码' }, 400);

    const result = await db.prepare('DELETE FROM links WHERE code = ?1').bind(code).run();
    return result.meta.changes ? json({ ok: true }) : json({ error: '短码不存在' }, 404);
}

function normalizeLink(body) {
    const code = String(body?.code || '').trim().toLowerCase();
    const target = String(body?.target || '').trim();
    const title = String(body?.title || '').trim().slice(0, 120);

    if (!/^[a-z0-9][a-z0-9-_]{1,63}$/.test(code)) {
        return { error: '短码需为 2-64 位小写字母、数字、短横线或下划线' };
    }

    let parsedTarget;
    try {
        parsedTarget = new URL(target);
    } catch {
        return { error: '目标地址格式不正确' };
    }

    if (!['http:', 'https:'].includes(parsedTarget.protocol)) {
        return { error: '目标地址只能使用 HTTP 或 HTTPS' };
    }

    return {
        code,
        target: parsedTarget.toString(),
        title,
        enabled: body?.enabled !== false
    };
}

function authorized(request, env) {
    const header = request.headers.get('Authorization') || '';
    return Boolean(env.ADMIN_TOKEN && header === `Bearer ${env.ADMIN_TOKEN}`);
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