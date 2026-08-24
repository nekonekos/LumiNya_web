<p align="center">
  <span style="font-size:28px;font-weight:700;color:#ff7eb6">LumiNya Web</span><br>
  <span style="color:#c0a0ff">～ Nya~ This is LumiNya's little universe ～</span><br>
  <span style="color:#7ec8ff">(=^･ω･^=)₍˄·͈༝·͈˄₎ฅ˒˒</span>
</p>

<p align="center">
  🌸 <a href="README.md">简体中文</a> · <strong><a href="README_EN.md">English</a></strong> 🌸
</p>

> **Nya…!** I-it's not like I wrote this especially for you! I just thought a repo without a proper introduction would make me look careless, that's all (,,•́ . •̀,,)
>
> Welcome to LumiNya's Web project, nya~ It's full of little gadgets I tinker with: the main site, a chat room, web Minecraft, a novel reader, and a bunch of quirky little tools. Hmph, since you clicked in so sincerely, I'll *grudgingly* walk you through it (｡•̀ᴗ-)✧

---

## ✨ About Me

<p align="center">
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white" alt="HTML5"/>
  <img src="https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white" alt="CSS3"/>
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black" alt="JavaScript"/>
  <img src="https://img.shields.io/badge/Three.js-000000?style=flat-square&logo=three.js&logoColor=white" alt="Three.js"/>
  <img src="https://img.shields.io/badge/Cloudflare-F38020?style=flat-square&logo=cloudflare&logoColor=white" alt="Cloudflare"/>
</p>

- 🎀 A coding catgirl who loves collecting domains, building little websites, and playing Minecraft with friends ヽ(•̀ω•́ )ゝ
- 🌸 Every word on the main site is **JSON-driven** — change content without touching code, 'cause I'm clever like that!
- 🐾 Pure frontend, no backend dependencies — most pages work out of the box (except the short-link system, which needs Cloudflare)

---

## 🗂️ Project Map

```
LumiNya_web
├── main/                 # 🏠 Main site (all pages live here)
│   ├── index.html        #    Homepage, content driven by index.json
│   ├── index.json        #    Homepage copy / nav / portfolio config
│   ├── jump.html         #    Redirect confirmation page, driven by jump.json
│   ├── jump.json         #    Redirect copy + domain whitelist
│   ├── chat.html         #    AI companion chat page (pure frontend)
│   ├── chat.json         #    Cloud agent preset list
│   ├── chat_files/       #    Legacy chat presets (migrated, kept for reference)
│   ├── config.html       #    VS Code-style read-only file viewer
│   ├── minecraft.html    #    Web Minecraft (Three.js)
│   ├── novel.html        #    Novel reader
│   ├── cfg/              #    📦 Files displayed by config.html
│   ├── books/novel1/     #    📚 Novel chapter data
│   ├── css/              #    🎨 All stylesheets
│   └── js/               #    ⚙️ Game scripts and more
├── archive/legacy/       # 🗄️ Old page archive (for nostalgia)
├── redirect/             # 🔀 asy.wiki short-link system (Cloudflare)
└── testeng/              # 🧪 Test pages
```

> Nya, isn't that tree diagram crystal clear! My layout skills are no joke ٩(◕‿◕｡)۶

---

## 🧩 Module Breakdown

### 🏠 `main/index.html` · Main Site

- Content is fully loaded from `main/index.json`: `site` info, `nav` navigation, `hero` banner, `sections` blocks, `footer`
- Pure frontend rendering, no framework — plain vanilla JS
- Wanna change "About Me" or "Portfolio"? **Just edit `index.json`, don't touch the HTML**, nya!

### 🔗 `main/jump.html` · Redirect Confirmation

- Copy and whitelist driven by `main/jump.json`
- Whitelisted domains: `luminya.cc`, `luminya.cn`, `asy.wiki`, `luminya.hk.cn`
- Target in whitelist → redirect directly; otherwise → confirmation prompt to keep visitors safe (￣▽￣)ノ

### 💬 `main/chat.html` · AI Companion Chat

- **Pure frontend** chatroom, Anthropic-style, mobile-friendly (styles in `main/css/chat.css`)
- `main/chat.json` provides cloud agent presets: assistant, gentle girlfriend, caring big sister, close friend, energetic desk mate, late-night radio, and more
- Chat history and local custom presets live in the browser's `localStorage`, fully **separate** from cloud presets
- Supports text-to-speech (TTS); the preset prompts are all written to feel like chatting with a real person (>ω<)

### 📖 `main/config.html` · VS Code-Style File Viewer

My latest favorite! A **read-only** online blog + file viewer:

- Reads the directory manifest from `main/cfg/conf.json` and renders it as an explorer tree
- Supported file types: `txt` / `html` / `xml` / `json` / `md` (HTML is shown as code, never rendered)
- Auto line wrap + line numbers + syntax highlighting + light/dark themes + multi-tabs
- Direct deep-linking via URL params: `config.html?file=samples/demo.html` (also supports `?path=`), with a clear 404 guide page when the file is missing
- `https://` links inside Markdown are auto-highlighted and clickable (opens in a new tab)
- Backend only needs two steps: drop files into `main/cfg/`, then list their paths in `conf.json`'s `files` array ฅ(๑*▽*๑)ฅ

### ⛏️ `main/minecraft.html` · Web Minecraft

- Uses **Three.js** (CDN importmap, `three@0.160.0`) for WebGL rendering
- Game logic in `main/js/minecraft.js`, styles in `main/css/minecraft.css`
- Supports world creation, seeds, save slots, settings, flying (WASD move · Space jump · F fly · mouse break/place)
- Friendly retry fallback when WebGL init fails — no scary blank screen (￣ω￣)

### 📚 `main/novel.html` · Novel Reader

- Chapter data in `main/books/novel1/`: `chapters.json` holds book info & table of contents, `001.json` etc. hold chapter bodies
- Three reading themes: light / night / eye-care green
- Sidebar TOC, font-size controls, reading progress memory — works on mobile and desktop

### 🔀 `redirect/` · asy.wiki Short-Link System

- Deployed on **Cloudflare Pages**, handled by Serverless Functions under `functions/api/`:
  - `links/[code].js`: public endpoint, resolves target links by short code
  - `admin/links.js`: admin link management API
  - `admin/login.js`: admin authentication
- Real links live in a **D1 database** (`schema.sql` for schema), never in static files — safe, nya!
- Admin panel at `/admin`, requires an `ADMIN_TOKEN` secret
- See [redirect/README.md](redirect/README.md) for detailed deployment steps

### 🗄️ `archive/legacy/` · Legacy Archive

Old pages, app installers, and mobileconfig files from back in the day are all kept here as keepsakes — never deleted (｡•́︿•̀｡)

---

## 🚀 Deployment

### Main site (`main/` directory)

It's a pure static site with relative paths — just spin up a local server to preview:

```sh
cd main
python3 -m http.server 8787
# open http://localhost:8787/
```

To deploy on any static host (Pages / Vercel / Netlify / GitHub Pages), set `main/` as the site root.

### Short links (`redirect/` directory)

Deployed separately — requires Wrangler + a Cloudflare account. Steps in [redirect/README.md](redirect/README.md).

---

## 🛠️ Maintenance Tips

- 🐾 Put new pages in `main/`, don't leave them scattered at the repo root!
- 🗄️ If you want to keep old content, stash it in `archive/legacy/`
- 📦 Use **relative paths** for assets — easier for both local preview and deployment
- 🎀 When editing copy, look for the matching `*.json` first instead of hardcoding into HTML

---

<p align="center">
  <span style="color:#ffa8c8">Love with love. ♡</span><br>
  <span style="color:#7ee8c8">— LumiNya, nya (=^･ω･^=)</span>
</p>
