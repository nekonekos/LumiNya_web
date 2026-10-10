/**
 * GET /uploadfiles/admin —— 后台管理页。
 * 直接用 Pages 的资源绑定返回静态页，避免 _redirects 的 200 重写
 * 与 Pages 的 .html 规范化互相打架（/uploadfiles 本身由静态资源自动处理）。
 */
export async function onRequest(context) {
    const url = new URL(context.request.url);
    url.pathname = '/uploadfiles-admin';
    url.search = '';
    return context.env.ASSETS.fetch(new Request(url.toString(), context.request));
}
