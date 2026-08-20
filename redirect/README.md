# asy.wiki 短链接分发

这是一个部署到 Cloudflare Pages 的私有短链接管理页。公开端只有已知短码能查询目标，后台位于 `/admin`，真实链接不放在静态文件中。

## Cloudflare 初始化

在 `redirect` 目录执行以下命令。需要先安装 Wrangler，并登录 Cloudflare：

```sh
npx wrangler d1 create asy-wiki-links
npx wrangler d1 execute asy-wiki-links --file=schema.sql --remote
npx wrangler pages secret put ADMIN_TOKEN --project-name asy-wiki-redirect
```

把第一条命令返回的 `database_id` 填入 `wrangler.toml`。`ADMIN_TOKEN` 是后台口令，不要写进 HTML、JSON 或 git。

## Pages 部署

创建 Pages 项目时选择 `redirect` 作为项目根目录，静态构建命令留空，输出目录填写 `.`。绑定域名 `asy.wiki` 后：

- `https://asy.wiki/docs`：访问短码 `docs`
- `https://asy.wiki/admin`：打开后台管理

每次新增或修改链接后重新部署 Pages 不需要重新导入数据，链接保存在 D1 中。

## 本地开发

```sh
npx wrangler pages dev . --d1=DB=asy-wiki-links
```

本地开发时可在 Wrangler 的本地提示中设置 `ADMIN_TOKEN`，或使用 `.dev.vars`（不要提交该文件）：

```text
ADMIN_TOKEN=replace-with-a-local-secret
```