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

## 上传结果怎么自己核对（不用登后台）

在外面传完文件，如果不方便登录后台确认，上传页本身就能给出完整凭证：

- 每个文件上传后都会显示 `✓ 上传成功 · HTTP 201 Created`，失败则显示具体原因（如 `✗ 口令错误（HTTP 401）`）
- 点开文件下方的「请求 / 响应详情」，可以看到：
  - **请求**：`PUT` 地址（含文件名与类型）、`X-Upload-Pass`（不回显）、`Content-Type`、`Content-Length`，以及文本文件的**请求体预览**（前 300 字符；二进制只列类型与大小）
  - **响应**：返回码 + 人话解释（201/401/413/500…）、耗时、以及服务端返回的 JSON 原文
- 上传按钮下方会汇总本次结果（成功 / 失败 / 未尝试各几个）
- 点「复制这份报告」可以把整份请求 + 响应文本复制走，方便事后核对或存档

上传成功的响应体会带上服务端实际记录的信息，可以直接和后台对账：

```json
{
  "ok": true,
  "id": "2e86e4c3f1297dd9c1b2bccbba83ba69",
  "name": "紧急说明.txt",
  "size": 58,
  "created_at": 1791640828158,
  "source": { "ip": "1.2.3.4", "country": "CN", "city": "Wuhan" }
}
```

只要拿到 `id`，就说明 R2 与 D1 都已写入成功；同一条记录在后台文件清单里能按 `id` 对上。

## 在公共电脑（机房）上使用

- 上传口令框用了 `autocomplete="new-password"`，并被排除在密码管理器之外
  （`data-lpignore` / `data-1p-ignore` / `data-bwignore`），浏览器不会自动填充，也不会追问「要保存密码吗？」
- 口令框初始是 `readonly`，鼠标点一下或按 Tab 聚焦后才可输入 —— 这是为了挡住浏览器在页面加载时回填旧口令
- **刷新页面、前进 / 后退、关闭标签页都会立刻清空**口令与文件列表：
  `pagehide`（离开时抹掉，避免留在往返缓存里）与 `pageshow`（刷新或恢复时再抹一次）都会重置
- 想手动立刻清空，点「清空全部」：口令和列表一起清掉
- 文件本身只存在内存里，从不写入本机存储，页面一刷新就没了；上传内容也只发往本站

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
