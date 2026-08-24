<p align="center">
  <span style="font-size:28px;font-weight:700;color:#ff7eb6">LumiNya Web</span><br>
  <span style="color:#c0a0ff">～ 喵呜，这里是小娜的小小宇宙哦 ～</span><br>
  <span style="color:#7ec8ff">(=^･ω･^=)₍˄·͈༝·͈˄₎ฅ˒˒</span>
</p>

> **喵…！** 才、才不是特意写给你看的呢！只是觉得仓库里没个像样的自我介绍会显得本喵很随便而已 (,,•́ . •̀,,)
>
> 欢迎来到 LumiNya 的 Web 项目喵～这里装着小娜平时捣鼓的各种小玩意：主站、聊天室、网页 Minecraft、小说阅读器，还有一堆奇奇怪怪的小工具。哼，既然你诚心诚意地点进来了，本喵就勉为其难地给你介绍一遍好啦 (｡•̀ᴗ-)✧

---

## ✨ 关于本喵

<p align="center">
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white" alt="HTML5"/>
  <img src="https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white" alt="CSS3"/>
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black" alt="JavaScript"/>
  <img src="https://img.shields.io/badge/Three.js-000000?style=flat-square&logo=three.js&logoColor=white" alt="Three.js"/>
  <img src="https://img.shields.io/badge/Cloudflare-F38020?style=flat-square&logo=cloudflare&logoColor=white" alt="Cloudflare"/>
</p>

- 🎀 一个还在上初中的小码农猫娘，喜欢收集域名、搭小网站、和朋友联机 Minecraft ヽ(•̀ω•́ )ゝ
- 🌸 主站所有文案都由 **JSON 驱动**，改内容不用碰代码，本喵可聪明了！
- 🐾 纯前端 + 无后端依赖，绝大多数页面直接开箱即用（除了短链接系统要配 Cloudflare）

---

## 🗂️ 项目地图

```
LumiNya_web
├── main/                 # 🏠 主站主体（所有页面都住在这里）
│   ├── index.html        #    首页，内容由 index.json 驱动
│   ├── index.json        #    首页文案/导航/作品集配置
│   ├── jump.html         #    跳转确认页，jump.json 驱动
│   ├── jump.json         #    跳转文案 + 域名白名单
│   ├── chat.html         #    AI 陪伴聊天页（纯前端）
│   ├── chat.json         #    云端智能体预设列表
│   ├── chat_files/       #    旧版聊天预设（已迁移，留档）
│   ├── config.html       #    仿 VS Code 只读文件展示器
│   ├── minecraft.html    #    网页版 Minecraft（Three.js）
│   ├── novel.html        #    小说阅读器
│   ├── cfg/              #    📦 config.html 的展示文件目录
│   ├── books/novel1/     #    📚 小说章节数据
│   ├── css/              #    🎨 全部样式
│   └── js/               #    ⚙️ 游戏脚本等
├── archive/legacy/       # 🗄️ 旧版网页归档（怀旧用）
├── redirect/             # 🔀 asy.wiki 短链接系统（Cloudflare）
└── testeng/              # 🧪 测试页
```

> 喵，上面的树状图是不是超清楚！本喵排版的功力可不是盖的 ٩(◕‿◕｡)۶

---

## 🧩 模块详解

### 🏠 `main/index.html` · 主站首页

- 内容全部从 `main/index.json` 读取：`site` 站点信息、`nav` 导航、`hero` 首屏、`sections` 各个板块、`footer` 页脚
- 纯前端渲染，无框架依赖，原生 JS 即可
- 想改「关于我」「作品集」？**只改 `index.json` 就好，别动 HTML** 喵！

### 🔗 `main/jump.html` · 跳转确认页

- 由 `main/jump.json` 驱动文案与白名单
- 白名单域名：`luminya.cc`、`luminya.cn`、`asy.wiki`、`luminya.hk.cn`
- 目标地址在白名单内 → 直接跳转；不在 → 弹出确认提示，保护访客不被乱带路 (￣▽￣)ノ

### 💬 `main/chat.html` · AI 陪伴聊天页

- **纯前端**聊天室，Anthropic 风格，适配移动端（样式在 `main/css/chat.css`）
- `main/chat.json` 提供云端智能体预设：助手、温柔女友、知心姐姐、亲密好友、元气同桌、深夜电台等
- 聊天记录与本地自定义预设存在浏览器 `localStorage`，与云端预设**互不干扰**
- 支持语音朗读（TTS），预设 prompt 都按「像真人聊天」的口吻设计哦 (>ω<)

### 📖 `main/config.html` · 仿 VS Code 文件展示器

这是小娜最近的心头好！一个**只读**的在线博客 + 文件展示器：

- 从 `main/cfg/conf.json` 读取目录清单，自动渲染成资源管理器树
- 支持文件类型：`txt` / `html` / `xml` / `json` / `md`（HTML 以代码形式展示，不会被渲染）
- 代码自动换行 + 行号 + 语法高亮 + 深浅色主题 + 多标签页
- 支持 URL 参数直接跳转：`config.html?file=samples/demo.html`（也可用 `?path=`），文件不存在时会给出清晰的 404 引导页
- Markdown 文件中的 `https://` 链接会自动高亮并可点击跳转（新窗口打开）
- 后端只需两步：把文件丢进 `main/cfg/`，再在 `conf.json` 的 `files` 数组里登记路径即可 ฅ(๑*▽*๑)ฅ

### ⛏️ `main/minecraft.html` · 网页版 Minecraft

- 使用 **Three.js**（CDN importmap 引入 `three@0.160.0`）做 WebGL 渲染
- 游戏逻辑在 `main/js/minecraft.js`，样式在 `main/css/minecraft.css`
- 支持创建世界、种子、存档管理、设置、飞行等（WASD 移动 · 空格跳跃 · F 飞行 · 鼠标破坏/放置）
- WebGL 初始化失败时会有友好的重试兜底，不会白屏吓到人喵 (￣ω￣)

### 📚 `main/novel.html` · 小说阅读器

- 章节数据在 `main/books/novel1/`：`chapters.json` 存书目与目录，`001.json` 等存各章正文
- 三种阅读主题：浅色 / 夜间 / 护眼绿
- 侧边栏目录、字号调节、进度记忆，移动端与桌面端都适配

### 🔀 `redirect/` · asy.wiki 短链接系统

- 部署在 **Cloudflare Pages**，由 `functions/api/` 下的 Serverless Functions 处理：
  - `links/[code].js`：公开端，按短码查询目标链接
  - `admin/links.js`：后台链接管理 API
  - `admin/login.js`：后台登录校验
- 真实链接存在 **D1 数据库**（`schema.sql` 建表），不放在静态文件里，安全喵！
- 后台入口在 `/admin`，需 `ADMIN_TOKEN` 口令
- 详细部署步骤见 [redirect/README.md](redirect/README.md)

### 🗄️ `archive/legacy/` · 旧版归档

以前做过的老页面、App 安装包、mobileconfig 配置文件都收在这里，留个念想，不删 (｡•́︿•̀｡)

---

## 🚀 部署说明

### 主站（`main/` 目录）

主站是纯静态站，相对路径引用，本地起个服务器就能预览：

```sh
cd main
python3 -m http.server 8787
# 打开 http://localhost:8787/
```

部署到任意静态托管（Pages / Vercel / Netlify / GitHub Pages）时，把 `main/` 设为站点根目录即可。

### 短链接（`redirect/` 目录）

独立部署，需要 Wrangler + Cloudflare 账号，步骤看 [redirect/README.md](redirect/README.md)。

---

## 🛠️ 维护小贴士

- 🐾 新增页面请放在 `main/`，别随手丢在根目录散养啦！
- 🗄️ 旧版内容想保留就放进 `archive/legacy/`
- 📦 资源路径尽量用**相对路径**，本地预览和线上部署都省心
- 🎀 改文案优先找对应的 `*.json`，别硬编码进 HTML

---

<p align="center">
  <span style="color:#ffa8c8">Love with love. ♡</span><br>
  <span style="color:#7ee8c8">— LumiNya 喵 (=^･ω･^=)</span>
</p>
