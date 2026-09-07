# LumiDrone 平台部署指南

本平台为「只读」无人机运营监管平台：后端接收 4G DTU 转发的 MAVLink2 遥测并入库/告警/推送，前端部署在 Cloudflare Pages（含 Pages Functions 反向代理），后端地址默认走同源代理，也可手动填写。

## 架构

```
ArduPilot 飞控 → 4G DTU(串口转TCP客户端) ──TCP:5760──> 阿里云 ECS(FastAPI 后端)
                                                              │
                                              REST :8000 + WebSocket /ws
                                                              │
                              Cloudflare Pages Functions 同源代理 (/api/*, /ws)
                                                              │
                                       Cloudflare Pages(前端, 默认走代理)
```

- 后端：Python FastAPI + uvicorn + SQLite + pymavlink，部署在阿里云 ECS。
- 前端：原生 HTML/CSS/JS/JSON 分离，静态托管在 Cloudflare Pages。
- 数据流：DTU 连接后端 TCP 端口 → MAVLink2 分帧解析 → 在线注册表 + 遥测历史 + 告警引擎 → WebSocket 推送给前端。
- 当前**只读**：`ALLOW_COMMANDS=false`，所有指令接口返回 403，不会向飞控回写任何数据；`control/` 层已预留回写路径。

---

## 一、后端部署（阿里云 ECS）

### 1. 环境要求

- 系统：Ubuntu 20.04+ / Debian / CentOS / **Alibaba Cloud Linux 3**（推荐；示例以 Alibaba Cloud Linux 3 为准）
- Python：**3.8+**（推荐 3.10/3.11；代码已兼容 3.8）
- 开放端口（安全组入方向 + 实例内防火墙，见「5. 防火墙」）：
  - `8000`：REST/WebSocket API（如走反向代理 TLS，可仅对代理开放）
  - `5760`：DTU TCP 接入端口（仅限你的 DTU 出口 IP，尽量收紧）

#### Alibaba Cloud Linux 3 安装 Python/venv

Alibaba Cloud Linux 3 基于 RHEL 8，使用 `dnf`，默认 `python3` 版本较低，建议安装较新版本：

```bash
sudo dnf -y update
sudo dnf -y install python3 python3-pip python3-devel gcc gcc-c++
# 若需要更新 Python，可用 dnf 安装 python3.11：
#   sudo dnf -y install python3.11 python3.11-pip
python3 --version
```

### 2. 上传代码

将仓库中的 `lumidroneplatform/backend/` 上传到服务器，例如 `/opt/lumidrone/backend`。

### 3. 创建虚拟环境并安装依赖

```bash
cd /opt/lumidrone/backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -U pip
pip install -r requirements.txt
```

> 说明：`requirements.txt` 中 `pymavlink` 固定在 `>=2.4.40,<2.4.45`，避免新版 `fastcrc` 在无预编译轮子的环境编译失败。

### 4. 配置环境变量

编辑 `/opt/lumidrone/backend/.env`（或直接 export）。**环境变量名必须带 `LUMIDRONE_` 前缀**，与 `app/config.py` 一致：

> 注意：直接 `export` 的写法用于交互式 shell；若用下方 systemd 的 `EnvironmentFile=/opt/lumidrone/backend/.env`，该文件每行应**去掉 `export`**（即 `LUMIDRONE_API_PORT=8000` 这种 `KEY=value` 格式）。

```bash
export LUMIDRONE_API_HOST="0.0.0.0"
export LUMIDRONE_API_PORT="8000"
export LUMIDRONE_DTU_HOST="0.0.0.0"
export LUMIDRONE_DTU_PORT="5760"
export LUMIDRONE_JWT_SECRET="换成一段足够长的随机字符串"
export LUMIDRONE_DB_PATH="/opt/lumidrone/backend/lumidrone.db"
export LUMIDRONE_ALLOW_COMMANDS="false"        # 只读底线，勿随意开启
export LUMIDRONE_TELEMETRY_ENABLED="true"
export LUMIDRONE_TELEMETRY_INTERVAL="2"
export LUMIDRONE_LINK_LOST_SECONDS="15"        # 链路丢失告警阈值
```

`LUMIDRONE_JWT_SECRET` 必须为强随机值，勿使用默认值上线。生成随机密钥：

```bash
openssl rand -base64 48
```

### 5. 防火墙（Alibaba Cloud Linux 3）

除 ECS 控制台安全组放行 `8000`、`5760` 外，实例内需用 `firewalld` 放行：

```bash
sudo systemctl enable --now firewalld
sudo firewall-cmd --permanent --add-port=8000/tcp
# 仅放行 DTU 出口 IP（更安全），替换 <DTU_IP>：
sudo firewall-cmd --permanent --add-rich-rule='rule family=ipv4 source address=<DTU_IP> port port=5760 protocol=tcp accept'
sudo firewall-cmd --reload
sudo firewall-cmd --list-ports
```

### 6. 初始化管理员账号

`manage.py` 直接在命令行传入用户名与密码（非交互式）：

```bash
cd /opt/lumidrone/backend
.venv/bin/python manage.py create-admin admin '一个强密码'
```

也可创建只读账号：

```bash
.venv/bin/python manage.py create-user viewer '密码' viewer
.venv/bin/python manage.py list-drones      # 查看已登记无人机
```

### 7. 启动服务

开发调试：

```bash
.venv/bin/python run.py
```

生产建议用 systemd。创建 `/etc/systemd/system/lumidrone.service`：

> Alibaba Cloud Linux 3 默认无 `www-data` 用户，可用 `root` 或专设运行用户；若用 `root`，去掉下面 `User=` 行即可。

```ini
[Unit]
Description=LumiDrone backend
After=network.target

[Service]
WorkingDirectory=/opt/lumidrone/backend
EnvironmentFile=/opt/lumidrone/backend/.env
ExecStart=/opt/lumidrone/backend/.venv/bin/python run.py
Restart=always
RestartSec=3
# Alibaba Cloud Linux 3 无 www-data 用户：去掉下行注释则用 root 运行，
# 更推荐新建专用用户（useradd -r lumidrone）并取消注释 User=lumidrone。
# User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now lumidrone
systemctl status lumidrone
```

验证：

```bash
curl http://127.0.0.1:8000/api/health
# {"status":"ok","commands_enabled":false,"drones_online":0,"drones_known":0}
```

### 8. 让 HTTPS 前端访问后端（解决「混合内容」）

前端托管在 Cloudflare Pages（HTTPS），若后端用 HTTP，浏览器会因「混合内容（Mixed Content）」拦截 API 请求（前端是 HTTPS、目标是 `http://` 时，Chrome/Edge/Firefox 会直接阻止）。三种方案：

- **方案 C（推荐，不备案、直连 HTTP 后端）**：用 Cloudflare Pages Functions 把前端的 `/api/*`、`/ws` **同源代理**到后端。浏览器只与本站（HTTPS 同源）通信，Cloudflare 边缘节点再把请求转发到 `http://<后端IP>:8000`。后端无需对外暴露 80/443、无需备案、无需证书。详见下文「三、前端部署」。
- **方案 A（简单）**：后端套 Cloudflare 代理（橙色云朵）或已配 HTTPS，用户填 `https://drone-api.example.com`；Cloudflare 已提供 TLS。
- **方案 B**：ECS 上用 nginx + certbot 配置 HTTPS 反向代理到 `127.0.0.1:8000`，同时转发 WebSocket：

```nginx
server {
    listen 443 ssl;
    server_name drone-api.example.com;
    # ssl_certificate ... / ssl_certificate_key ... (certbot)

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /ws {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

DTU 的 `5760` 端口保持纯 TCP，勿走 HTTP 代理。

---

## 二、4G DTU 配置

将 DTU 配置为 **TCP 客户端**模式：

- 目标地址：后端公网 IP（或域名）
- 目标端口：`5760`
- 串口参数：与飞控一致（ArduPilot 常用 `57600` 波特率，MAVLink2）
- 透传模式：透明传输 / 原始 TCP，不要用 Modbus 等协议封装

接入后，飞控发出的 HEARTBEAT / ATTITUDE / GLOBAL_POSITION_INT / GPS_RAW_INT / VFR_HUD / SYS_STATUS / BATTERY_STATUS 会被解析入库并实时推送。未登记的 `sysid` 会自动以「无人机 N」注册，可在管理员接口改名。

---

## 三、前端部署（Cloudflare Pages）

前端为纯静态站点 + Cloudflare Pages Functions 反向代理：

1. 将 `lumidroneplatform/frontend/` 目录整个部署为站点根目录（`index.html` 位于根）。`functions/` 子目录会被 Cloudflare 识别为 Functions，不会作为静态文件下发。
2. Cloudflare Pages 两种方式：
   - **直接上传**：Dashboard → Workers & Pages → Create → Direct Upload，拖入 `frontend/` 内容。
   - **连接 Git**：构建命令留空，输出目录填 `lumidroneplatform/frontend`。
3. **配置后端地址（环境变量）**：项目 Settings → Environment variables 添加：
   ```
   BACKEND_URL = http://8.138.29.44:8000
   ```
   未设置时 Functions 回退到该默认值。
4. **绑定域名**（可选，推荐）：绑定 `api.drone.luminya.cn`（或任一自定义域名）为该 Page 的自定义域名；`functions/` 会在该域名上自动生效，前端与 `/api`、`/ws` 同源，无混合内容、无跨域问题。
5. **登录页后端地址**：默认**留空**即可，前端会自动走本站同源代理（`/api/...`、`/ws`）。若需直连某后端，可填 `https://...` 完整地址（请务必带 `https://`；填 `http://` 会被浏览器拦截）。

> 说明：`functions/api/[[path]].js` 代理 `/api/*`，`functions/ws.js` 代理 WebSocket `/ws`。它们将请求转发到 `BACKEND_URL`。若你的后端 IP/端口不同，只改环境变量即可，无需改代码。

> ⚠️ 后端防火请：既然前端通过 Pages Functions 访问后端，后端 `8000` 端口需允许来自 Cloudflare 边缘 IP 的入站（或临时全放行）；`5760` 端口仅放行 DTU 出口 IP。

---

## 四、模拟 MAVLink 联调

后端启动后，可用脚本模拟一架在线无人机，验证「接入 → 实时推送 → 告警」全链路：

```bash
# 在能访问后端 5760 端口的机器上（示例 IP 需替换）
python sim_drone.py   # 使用 pymavlink 向 DTU 端口发送 HEARTBEAT/ATTITUDE/GPS 等帧
```

脚本要点：

- 建立 TCP 连接 `backend_host:5760`
- 用 `pymavlink.dialects.v20.ardupilotmega` 发送 `heartbeat_send`、`attitude_send`、`global_position_int_send`、`gps_raw_int_send`、`vfr_hud_send`、`sys_status_send`
- 飞行器类型 `type=2`（四旋翼）、`autopilot=3`（ArduPilotMega）

预期结果：前端总览出现「在线」无人机卡片并实时刷新；停发后约 15 秒触发「链路丢失」严重告警。

---

## 五、安全注意事项

- `ALLOW_COMMANDS=false` 是只读底线；仅在确认需要远控、并完成 DTU 回写实现与审计后再开启。
- `JWT_SECRET` 必须强随机，且不要提交到仓库。
- 管理接口（`/api/admin/*`）仅 `admin` 角色可用；请通过 `manage.py` 预建账号，平台不开放注册。
- 遥测历史会持续增长，`TELEMETRY_INTERVAL_SECONDS` 控制采样间隔；数据库与日志保留策略见 `app/config.py`。
