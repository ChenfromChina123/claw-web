# Claude Code Web

基于 Claude Code HAHA 的 Web 可视化界面，支持多用户、多会话、AI 对话和工具执行。

## 功能特性

- 🤖 **AI 对话** - 支持多种 AI 模型，流畅的流式响应
- 💻 **工具执行** - 内置代码编辑、Shell 命令、文件搜索等工具
- 📁 **会话管理** - 多会话支持，会话历史保存
- 🔧 **命令系统** - 丰富的命令支持 (/help, /clear, /config 等)
- 🔌 **MCP 支持** - MCP 服务器集成 (开发中)
- 📱 **响应式设计** - 适配桌面和移动端

## 快速开始

### 开发模式

```bash
# 1. 安装依赖
cd claude-code-haha
npm install

# 2. 安装 server 依赖
cd server
npm install

# 3. 安装 web 依赖
cd ../web
npm install

# 4. 启动 server (在 server 目录)
cd ../server
npm run dev

# 5. 启动 web (在新终端)
cd web
npm run dev
```

### Docker 部署

```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f app

# 停止
docker-compose down
```

## 环境变量

### Server (.env)

```env
# 数据库
DATABASE_URL=postgresql://user:password@localhost:5432/claude_code

# Redis
REDIS_URL=redis://localhost:6379

# AI API
ANTHROPIC_API_KEY=your-api-key
ANTHROPIC_AUTH_TOKEN=your-auth-token
ANTHROPIC_BASE_URL=https://api.anthropic.com

# JWT
JWT_SECRET=your-secret-key

# 邮件服务 (可选)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=password
```

## API 文档

### REST API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/auth/register/send-code` | POST | 发送注册验证码 |
| `/api/auth/register` | POST | 用户注册 |
| `/api/auth/login` | POST | 用户登录 |
| `/api/auth/forgot-password` | POST | 重置密码 |
| `/api/auth/me` | GET | 获取当前用户 |
| `/api/health` | GET | 健康检查 |
| `/api/models` | GET | 获取可用模型 |
| `/api/tools` | GET | 获取可用工具 |

### WebSocket API

连接到 `ws://localhost:3000/ws`

#### 消息类型

| 类型 | 描述 |
|------|------|
| `register` | 注册用户 |
| `login` | 登录 |
| `create_session` | 创建会话 |
| `load_session` | 加载会话 |
| `list_sessions` | 获取会话列表 |
| `user_message` | 发送消息 |
| `delete_session` | 删除会话 |
| `rename_session` | 重命名会话 |
| `clear_session` | 清除会话 |

## 目录结构

```
claude-code-haha/
├── src/                    # 核心模块 (CLI)
├── server/                 # API 服务器
│   └── src/
│       ├── integrations/   # 核心模块集成
│       ├── api/            # API 路由
│       ├── db/             # 数据库层
│       └── services/       # 业务服务
├── web/                    # Vue 3 前端
│   └── src/
│       ├── views/          # 页面视图
│       ├── components/     # 组件
│       ├── stores/         # 状态管理
│       └── api/            # API 客户端
└── docker-compose.yml      # Docker 配置
```

## 技术栈

- **前端**: Vue 3 + TypeScript + Pinia + Naive UI
- **后端**: Bun/Node.js + TypeScript
- **数据库**: PostgreSQL + Redis
- **AI**: Anthropic Claude API / 通义千问 API

## 许可证

MIT
