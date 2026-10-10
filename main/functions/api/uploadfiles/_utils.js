/**
 * /api/uploadfiles/* 共享工具：JSON 响应、后台鉴权、口令哈希、随机 ID。
 * 以下划线开头，不会被 Pages Functions 注册为路由。
 */

export const MAX_SIZE = 100 * 1024 * 1024;
export const MAX_NAME = 200;
export const MIN_PASSPHRASE = 6;
export const MAX_PASSPHRASE = 128;
export const PASSPHRASE_KEY = 'passphrase_hash';

export function json(payload, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            ...extraHeaders
        }
    });
}

export async function readJson(request) {
    try {
        return await request.json();
    } catch {
        return null;
    }
}

/** 后台鉴权：Authorization: Bearer <ADMIN_TOKEN> */
export function adminAuthorized(request, env) {
    if (!env.ADMIN_TOKEN) return false;
    const header = request.headers.get('Authorization') || '';
    return safeEqual(header, `Bearer ${env.ADMIN_TOKEN}`);
}

/** 明文口令 -> SHA-256 十六进制串 */
export async function sha256Hex(text) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    const bytes = new Uint8Array(digest);
    let out = '';
    for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
    return out;
}

/** 恒定时间比较，避免用响应耗时推测口令 */
export function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

/** 32 位十六进制随机串，同时用作 R2 对象 key */
export function randomId() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    let out = '';
    for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
    return out;
}

export function isId(value) {
    return typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
}

/** 去掉路径与不可见字符，避免下载时被 Content-Disposition 注入 */
export function cleanFileName(raw) {
    const name = String(raw || '')
        .split(/[\\/]/)
        .pop()
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim();
    return name.slice(0, MAX_NAME) || 'unnamed';
}

/** 下载时的 Content-Disposition，兼容中文文件名 */
export function contentDisposition(name) {
    const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** 上传来源信息：IP 与 Cloudflare 提供的国家/城市 */
export function clientMeta(request) {
    const cf = request.cf || {};
    return {
        ip: request.headers.get('CF-Connecting-IP') || '',
        country: typeof cf.country === 'string' ? cf.country : '',
        city: typeof cf.city === 'string' ? cf.city : ''
    };
}

export async function hasPassphrase(db) {
    const row = await db.prepare('SELECT value FROM settings WHERE key = ?1').bind(PASSPHRASE_KEY).first();
    return Boolean(row && row.value);
}

export async function checkPassphrase(db, passphrase) {
    if (!passphrase) return false;
    const row = await db.prepare('SELECT value FROM settings WHERE key = ?1').bind(PASSPHRASE_KEY).first();
    if (!row || !row.value) return false;
    return safeEqual(await sha256Hex(String(passphrase)), row.value);
}
