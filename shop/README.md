# LumiNya Shop 网店

一个与主站视觉风格一致的现代网店，前后端分离：

- `frontend/` — 纯原生 HTML/CSS/JS 前端，部署到 **Cloudflare Pages**
- `backend/` — **Cloudflare Worker**（原生 fetch + 简单路由），数据存 **D1**

商品支持 **虚拟**（激活码池自动发货 + 资源链接）与 **实物**（收货地址 + 运费模板）双流程；支付为**支付宝「AI 付」预留接口 + 回调**，真实凭证后续填入即可。

---

## 目录结构

```
shop/
├── frontend/               # 前端（Pages 输出目录）
│   ├── index.html          # 主页（商品网格 + 分类筛选）
│   ├── product.html        # 商品详情（多图 / SKU / 加购 / 立即购买）
│   ├── cart.html           # 购物车
│   ├── checkout.html       # 结算 + 确认订单
│   ├── orders.html         # 我的订单（订单历史 + 发货内容）
│   ├── login.html          # 登录
│   ├── register.html       # 注册
│   ├── pay-result.html     # 支付结果页
│   ├── admin.html          # 管理后台 SPA
│   ├── config.json         # 站点配置（店铺名 / 导航 / apiBase）
│   ├── css/shop.css        # 样式（复用主站设计令牌）
│   └── js/shop.js          # 公共工具（API / 主题 / 购物车）
└── backend/                # Worker
    ├── wrangler.toml
    ├── schema.sql          # D1 建表
    └── src/
        ├── index.js        # 入口 + 路由分发
        ├── utils.js        # 哈希 / JWT / CORS / 响应
        ├── db.js           # 数据访问辅助
        └── handlers/
            ├── public.js   # 公开 API（auth / products / categories / orders）
            ├── admin.js    # 管理 API
            └── pay.js      # 支付预留端点
```

---

## 一、后端初始化（Worker + D1）

在 `shop/backend` 目录执行，需要先安装 Wrangler 并登录 Cloudflare：

```sh
cd shop/backend

# 1. 创建 D1 数据库（记下返回的 database_id）
npx wrangler d1 create luminya-shop

# 2. 把 database_id 填入 wrangler.toml 的 database_id

# 3. 导入表结构（远程）
npx wrangler d1 execute luminya-shop --file=schema.sql --remote

# 4. 设置密钥（务必改成自己的强密码 / 随机串）
npx wrangler secret put JWT_SECRET
npx wrangler secret put ADMIN_PASSWORD
# 可选：
npx wrangler secret put ALIPAY_APP_ID
npx wrangler secret put ALIPAY_PRIVATE_KEY
npx wrangler secret put ALIPAY_PUBLIC_KEY

# 5. 部署 Worker
npx wrangler deploy
```

管理员账号：默认邮箱 `admin@luminya.cc`（`ADMIN_EMAIL`），密码为 `ADMIN_PASSWORD`，首次请求时自动播种。

---

## 二、前端部署（Cloudflare Pages）

1. 在 Cloudflare Pages 新建项目，选择 `shop/frontend` 作为项目根目录。
2. **构建命令留空**，**输出目录填 `.`**（或直接选 `frontend` 子目录）。
3. 部署完成后，编辑 `shop/frontend/config.json`，把 `apiBase` 改为你的 Worker 域名，例如：

```json
{ "apiBase": "https://luminya-shop-api.your-name.workers.dev" }
```

> 留空 `apiBase` 时前端会调用同源 `/api/*`；若希望 Worker 与 Pages 同域名，可将 Worker 路由挂到 Pages 自定义域名的 `/api/*` 下，此时 `apiBase` 保持空即可。

---

## 三、本地开发

### 后端

```sh
cd shop/backend
npx wrangler dev --local
# D1 本地需要先导入表结构：
npx wrangler d1 execute luminya-shop --file=schema.sql --local
```

本地可用 `.dev.vars`（不要提交）设置环境变量：

```text
JWT_SECRET=dev-secret
ADMIN_EMAIL=admin@luminya.cc
ADMIN_PASSWORD=dev-password
```

### 前端

任意静态服务器即可，例如：

```sh
cd shop/frontend
python3 -m http.server 8080
```

然后把 `config.json` 里的 `apiBase` 改成 `http://localhost:8787`（Wrangler 默认端口）。

---

## 四、API 一览

### 公开

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/register` | 注册 |
| POST | `/api/auth/login` | 登录 |
| GET | `/api/auth/me` | 当前用户 |
| GET | `/api/products` | 商品列表（`?category=&q=&page=&size=`） |
| GET | `/api/products/:id` | 商品详情（含 SKU） |
| GET | `/api/categories` | 分类列表 |
| GET | `/api/orders` | 我的订单 |
| POST | `/api/orders` | 创建订单（结算） |
| GET | `/api/orders/:id` | 订单详情（含发货内容） |
| GET | `/api/site` | 站点信息 |

### 支付（预留）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/pay/create` | 创建支付（占位，返回 `pay_url` 等） |
| POST | `/api/pay/notify` | 支付宝异步回调（幂等，**验签 TODO**） |
| GET | `/api/pay/return` | 支付同步跳转（302 → `pay-result.html`） |

### 管理（需管理员 JWT）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/admin/login` | 管理员登录 |
| GET | `/api/admin/dashboard` | 数据看板 |
| GET/POST | `/api/admin/products` | 商品列表 / 新建 |
| GET/PUT/DELETE | `/api/admin/products/:id` | 商品详情 / 更新 / 删除 |
| GET/POST | `/api/admin/categories` | 分类列表 / 新建 |
| PUT/DELETE | `/api/admin/categories/:id` | 更新 / 删除分类 |
| GET | `/api/admin/orders` | 订单列表（`?status=`） |
| GET | `/api/admin/orders/:id` | 订单详情 |
| PUT | `/api/admin/orders/:id/status` | 订单状态流转（取消自动回补库存） |
| GET | `/api/admin/users` | 用户列表 |
| PUT | `/api/admin/users/:id` | 更新用户（禁用/启用） |
| GET | `/api/admin/codes` | 激活码列表 |
| POST | `/api/admin/codes` | 批量导入激活码 |
| DELETE | `/api/admin/codes/:id` | 删除激活码 |

---

## 五、支付宝「AI 付」接入说明

当前支付为**预留**状态，已在 `backend/src/handlers/pay.js` 中留好三个端点。真实接入步骤：

1. 在 `notify` 端点中实现支付宝 **RSA2 签名验签**（使用 `ALIPAY_PUBLIC_KEY`）。
2. 在 `create` 端点中调用支付宝**统一收单下单**接口，返回真实的 `pay_url` / `orderStr`。
3. 确保 `ALIPAY_NOTIFY_URL` / `ALIPAY_RETURN_URL` 指向你的 Worker 域名。
4. 订单状态、库存扣减、虚拟商品发放已在 `markPaid` 中实现，验签通过后调用即可。

---

## 六、安全注意

- `JWT_SECRET`、`ADMIN_PASSWORD`、支付宝密钥一律用 `wrangler secret` 管理，**不要**写进代码或 git。
- 支付 `notify` 端点在完成验签前**不要**在真实环境对外暴露。
- 前端仅存 JWT（localStorage），请确保站点点部署在 HTTPS 下。
