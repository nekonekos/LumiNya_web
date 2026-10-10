# /uploadfiles 临时文件上传器

给 LumiNya 主站（`main/`，Cloudflare Pages 项目 `luminya-web`）加的一个「应急上传」入口：
在外面需要临时传资料时，打开 `https://luminya.cc/uploadfiles`，输入口令即可上传；
上传的文件与上传来源信息都收在后台 `https://luminya.cc/uploadfiles/admin`。

- 上传页：`/uploadfiles` → `main/uploadfiles.html`
- 后台页：`/uploadfiles/admin` → `main/uploadfiles-admin.html`（由 `main/functions/uploadfiles/admin.js` 转发，保持地址栏不变）
- 文件存储：**R2** 桶 `luminya-uploader`
- 元数据 / 口令哈希：**D1** 数据库 `luminya-uploader`
- 接口：`main/functions/api/uploadfiles/`

## 已创建的 Cloudflare 资源

| 资源 | 名称 | 绑定 |
|---|---|---|
| R2 桶 | `luminya-uploader` | `FILES` |
| D1 数据库 | `luminya-uploader`（`67a758fc-47ca-42ef-8fdd-e75d124d1c85`） | `DB` |
| Pages Secret | `ADMIN_TOKEN` | 后台登录口令 |

绑定写在 `main/wrangler.toml`，Pages 的「根目录」是 `main`，所以 Wrangler 会自动读取它。

## 接口一览

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/api/uploadfiles/status` | 无 | 上传口令是否已设置 |
| PUT | `/api/uploadfiles/put?name=&type=` | `X-Upload-Pass` 头 | 请求体即文件原始流，直写 R2 |
| POST | `/api/uploadfiles/login` | 无 | 校验 `ADMIN_TOKEN` |
| GET | `/api/uploadfiles/files?limit=&offset=` | `Authorization: Bearer` | 文件清单（分页） |
| GET | `/api/uploadfiles/file/<id>` | `Authorization: Bearer` | 下载文件 |
| DELETE | `/api/uploadfiles/files/<id>` | `Authorization: Bearer` | 删除文件（R2 + D1） |
| GET/PUT/DELETE | `/api/uploadfiles/passphrase` | `Authorization: Bearer` | 查询状态 / 重设 / 清除上传口令 |

> 上传接口刻意不用 multipart：`request.formData()` 会把整个文件读进内存，
> 接近 100MB 时容易撞上 Workers 的 128MB 内存上限。改成「一个文件一个 PUT + 裸流」后，
> 数据直接从请求体流进 R2。前端因此是**串行**上传，逐个文件推进度。

## 本地开发

```sh
cd main
npx wrangler pages dev . --binding ADMIN_TOKEN=dev-token-123
# 打开 http://localhost:8787/uploadfiles
```

`wrangler pages dev` 会依据 `main/wrangler.toml` 自动准备本地版 D1 与 R2。
首次需要初始化本地表结构：

```sh
npx wrangler d1 execute luminya-uploader --file=schema.sql --local
```

## 首次使用

1. 打开 `/uploadfiles/admin`，用 `ADMIN_TOKEN` 登录
2. 在「上传口令」卡片里设置一个上传口令（只保存 SHA-256 哈希，忘记只能重置）
3. 把 `/uploadfiles` 和口令告诉需要上传的人即可

## 运维说明

- **不会自动过期**：文件会一直留在 R2 里，需要时在后台点「删除」，或到 Cloudflare 控制台清理。
- 想自动过期的话，可以给 R2 桶加一条生命周期规则，例如自动清理 30 天前上传的对象：
  ```sh
  npx wrangler r2 bucket lifecycle add luminya-uploader expire-30d --expire-days 30
  npx wrangler r2 bucket lifecycle list luminya-uploader
  ```
- 单文件上限 **100MB**（Cloudflare 免费版单请求体上限），前端与后端都会拦截。
- 上传来源会记录 `CF-Connecting-IP` 以及 Cloudflare 附带的国家/城市；本地开发时没有真实 IP。

## 改动表结构的流程

1. 修改 `main/schema.sql`（保持 `CREATE TABLE IF NOT EXISTS` 幂等写法）
2. 执行 `npx wrangler d1 execute luminya-uploader --file=schema.sql --remote`
3. 重新部署 Pages

## 安全说明

- 上传口令只存 SHA-256 哈希，后台看不到原文，只能重置
- 后台口令 `ADMIN_TOKEN` 存在 Pages Secret 里，不写进任何静态文件，也不进 git
- 后台与文件清单接口都要求 `Authorization: Bearer <ADMIN_TOKEN>`，且用恒定时间比较
- 站点没有加导航入口：只有知道地址的人才会访问 `/uploadfiles`
- 上传页与后台页都带 `noindex, nofollow`
