# LumiNya Web

## 项目结构说明

- index.html：当前主站首页，使用 index.json 驱动内容
- jump.html：跳转校验页，使用 jump.json 驱动文案与白名单
- chat.html：AI 陪伴聊天页（纯前端），使用 chat.json 作为云端智能体预设，聊天记录与本地智能体存于浏览器 localStorage
- chat.json：云端智能体预设列表，由 chat.html 动态抓取，与用户本地存储互不干扰
- css/chat.css：聊天页样式（Anthropic 风格，适配移动端）
- css/：主站与聊天页样式文件
- chat_files/prompt.json：旧版聊天预设（已迁移至 chat.json，保留备查）
- archive/legacy/：旧版网页归档目录
- redirect/：asy.wiki 私有短链接分发系统，包含 Pages 前端、Functions API 和 D1 配置

## 已清理内容

- 删除了根目录下的测试页和实验性目录，如 test.html、testeng、zkcx、chars、000032.html
- 保留了当前主站实际使用的入口与数据文件

## 维护建议

- 新增页面优先放在项目根目录，避免散落在旧版目录中
- 旧版本内容如需保留请继续放入 archive/legacy
- 资源文件路径尽量使用相对路径，方便本地预览和部署
- 短链接系统的部署和维护步骤见 [redirect/README.md](redirect/README.md)
