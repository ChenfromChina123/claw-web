# Claw Web

基于 Claude Code HAHA 的 Web 可视化界面，支持多用户、多会话、AI 对话和工具执行。

## 功能特性

- 🤖 **AI 对话** - 支持多种 AI 模型，流畅的流式响应
- 💻 **工具执行** - 内置代码编辑、Shell 命令、文件搜索等工具
- 📸 **图片查看** - Agent 可读取和分析图片（PNG/JPG/GIF/WebP 等），自动压缩优化
- 📁 **会话管理** - 多会话支持，会话历史保存
- 🔧 **命令系统** - 丰富的命令支持 (/help, /clear, /config 等)
- 🔌 **MCP 支持** - MCP 服务器集成 (开发中)
- 📱 **响应式设计** - 适配桌面和移动端
- 🔐 **OAuth 登录** - 支持 GitHub OAuth 登录

## 快速开始

### 开发模式

```bash
# 1. 安装依赖
cd claw-web
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

# GitHub OAuth (可选)
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=http://localhost:3000/api/auth/github/callback
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
| `/api/auth/github` | GET | GitHub OAuth 登录 |
| `/api/auth/github/callback` | GET | GitHub OAuth 回调 |
| `/api/health` | GET | 健康检查 |
| `/api/models` | GET | 获取可用模型 |
| `/api/tools` | GET | 获取可用工具 |
| `/api/sessions` | GET | 获取用户会话列表 |
| `/api/sessions` | POST | 创建新会话 |
| `/api/sessions/:id` | GET | 加载会话详情 |
| `/api/sessions/:id` | PUT | 更新会话信息 |
| `/api/sessions/:id` | DELETE | 删除会话 |
| `/api/sessions/:id/clear` | POST | 清空会话消息 |

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
claw-web/
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

## 开发工具配置

### 代码质量检查

项目已配置以下工具用于实时代码检查：

- **TypeScript ESLint** - TypeScript 代码检查
- **ESLint** - JavaScript/TypeScript/Vue 代码规范
- **Prettier** - 代码格式化

### VS Code 推荐插件

为获得最佳开发体验，请安装以下 VS Code 插件：

1. **ESLint** (`dbaeumer.vscode-eslint`) - 实时 ESLint 错误检查
2. **Prettier - Code formatter** (`esbenp.prettier-vscode`) - 代码格式化
3. **Volar** (`Vue.volar`) - Vue 3 语言支持
4. **TypeScript Hero** (`rbbit.typescript-hero`) - TypeScript 导入管理

### 自动检查功能

配置完成后，VS Code 将自动：

- ✅ 保存时自动格式化代码
- ✅ 保存时自动修复 ESLint 错误
- ✅ 实时显示 TypeScript 类型错误
- ✅ 实时显示 ESLint 规范错误
- ✅ 自动组织导入语句

### 手动运行检查

```bash
# 进入 web 目录
cd web

# 运行 ESLint 检查
npm run lint

# 修复可自动修复的问题
npm run lint -- --fix
```

## 许可证

MIT
