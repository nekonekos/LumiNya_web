# LumiDrone 无人机运营监管平台

面向低空经济的**只读**无人机运营监管平台：ArduPilot + MAVLink2 + 4G DTU 遥测接入，多机管理、用户鉴权、单机姿态单独查看、实时告警与运维日志。后端 Python（FastAPI）部署在阿里云，前端静态站点部署在 Cloudflare Pages（HTML/CSS/JSON 分离，后端地址由用户手动填写）。

## 目录结构

```
lumidroneplatform/
├── backend/                 # FastAPI 后端（阿里云 ECS）
│   ├── requirements.txt
│   ├── run.py               # uvicorn 启动入口
│   ├── manage.py            # 管理 CLI（建账号/列无人机）
│   └── app/
│       ├── config.py        # 环境变量/端口/JWT/ALLOW_COMMANDS
│       ├── db.py            # SQLite 建表与访问
│       ├── auth.py          # JWT + bcrypt + 角色
│       ├── main.py          # REST + WebSocket 路由
│       ├── dtu/server.py    # asyncio TCP 服务端（DTU 接入）
│       ├── mavlink/         # MAVLink2 解析 + 在线注册表
│       ├── alerts/          # 告警引擎（低电量/链路丢失/GPS/姿态/失控保护）
│       └── control/         # 远控预留层（当前只读拒绝）
├── frontend/                # 静态前端（Cloudflare Pages）
│   ├── index.html           # 入口/跳转
│   ├── login.html           # 登录 + 后端地址填写
│   ├── dashboard.html       # 多机总览
│   ├── drone.html           # 单机详情（姿态 + 地图 + 告警 + 历史）
│   ├── css/                 # main / auth / dashboard / drone
│   ├── js/                  # common / api / auth / dashboard / drone
│   └── json/                # UI 文案（HTML/CSS/JSON 分离）
└── DEPLOY.md                # 部署与联调指南
```

## 快速开始

### 后端

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate   Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
python manage.py create-admin admin     # 预建管理员
python run.py                           # API :8000，DTU TCP :5760
```

### 前端

任意静态服务器托管 `frontend/`：

```bash
python -m http.server 8080 --directory frontend
```

浏览器打开 `http://127.0.0.1:8080`，登录页填写后端地址（如 `127.0.0.1:8000`）与账号密码。

## 说明

- **只读**：`ALLOW_COMMANDS=false`，指令接口一律拒绝；`control/` 层预留了未来回写 MAVLink 指令的路径。
- **鉴权**：仅管理员预建账号，不开放注册；角色 `admin` / `viewer`。
- **告警**：链路丢失、低电量、GPS 丢星、模式失控保护、姿态越限，实时推送并持久化。

完整部署步骤见 [DEPLOY.md](./DEPLOY.md)。
