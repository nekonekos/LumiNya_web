// ============================================================
// LumiNya Shop · 工具函数（零 npm 依赖，仅用 Web Crypto API）
// ============================================================

const encoder = new TextEncoder();

/** 生成随机 ID（URL 安全） */
export function randomId(prefix = '') {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return prefix + hex;
}

/** 生成订单号，例如 LN20260825 + 12 位随机 */
export function genOrderNo() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = crypto.getRandomValues(new Uint8Array(6));
  const suffix = Array.from(rand)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `LN${y}${m}${d}${suffix}`;
}

/** 十六进制转 ArrayBuffer */
function hexToBuf(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes.buffer;
}

function bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** PBKDF2-SHA256 密码哈希（返回 { hash, salt }） */
export async function hashPassword(password, saltHex) {
  const salt = saltHex
    ? hexToBuf(saltHex)
    : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations: 100000
    },
    keyMaterial,
    256
  );
  return {
    hash: bufToHex(bits),
    salt: saltHex || bufToHex(salt)
  };
}

/** 校验密码 */
export async function verifyPassword(password, storedHash, storedSalt) {
  const { hash } = await hashPassword(password, storedSalt);
  return hash === storedHash;
}

// ---------- JWT (HMAC-SHA256, 纯手工 Base64URL) ----------

function base64UrlFromString(str) {
  const bytes = encoder.encode(str);
  return base64UrlFromBytes(bytes);
}

function base64UrlFromBytes(bytes) {
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToString(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function signBase64(data, secret) {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return base64UrlFromBytes(new Uint8Array(sig));
}

/** 签发 JWT。payload 建议包含 { sub, email, role } */
export async function signJwt(payload, secret, expiresInSec = 60 * 60 * 24 * 7) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + expiresInSec };
  const headStr = base64UrlFromString(JSON.stringify(header));
  const payStr = base64UrlFromString(JSON.stringify(fullPayload));
  const signature = await signBase64(`${headStr}.${payStr}`, secret);
  return `${headStr}.${payStr}.${signature}`;
}

/** 校验 JWT，成功返回 payload，失败返回 null */
export async function verifyJwt(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headStr, payStr, sig] = parts;
    const expected = await signBase64(`${headStr}.${payStr}`, secret);
    if (expected !== sig) return null;
    const payload = JSON.parse(base64UrlToString(payStr));
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------- 响应辅助 ----------

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

export function error(message, status = 400) {
  return json({ error: message }, status);
}

/** CORS 头（前端与 Worker 跨域） */
export function corsHeaders(origin = '*') {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** 从 Authorization: Bearer xxx 提取 token */
export function bearerToken(request) {
  const header = request.headers.get('Authorization') || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return '';
}

/** 从请求中解析用户（需 secret），返回 payload 或 null */
export async function authUser(request, env) {
  const token = bearerToken(request);
  if (!token) return null;
  return verifyJwt(token, env.JWT_SECRET);
}
