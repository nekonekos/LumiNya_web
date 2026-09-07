/**
 * LumiDrone — Cloudflare Pages Function：把前端的 WebSocket /ws 代理到后端。
 *
 * 前端以 wss://<当前域名>/ws?token=<jwt> 连接；本函数把该升级请求转发到后端
 * 的 ws://<backend>/ws?token=<jwt>，并把双向消息在浏览器与后端之间隧道转发。
 *
 * 依赖环境变量 BACKEND_URL（同 functions/api/[[path]].js）。
 */
export async function onRequest(context) {
    const { request, env } = context;

    const upgrade = request.headers.get('Upgrade');
    if (upgrade !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const backend = (env && env.BACKEND_URL) || 'http://8.138.29.44:8000';
    const url = new URL(request.url);
    const wsBackend = backend.replace(/^http/i, 'ws');
    const target = wsBackend + url.pathname + url.search;

    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.set('Upgrade', 'websocket');
    headers.set('Connection', 'Upgrade');

    return fetch(target, { method: 'GET', headers: headers });
}
