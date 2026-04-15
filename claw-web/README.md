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
- 🐲 **悬浮电子宠物** - IDE工作台中的互动宠物，支持气泡对话和多种宠物切换
- 🔌 **插件系统** - 支持第三方开发插件，扩展系统功能

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
| `/api/plugins` | GET | 获取插件列表 |
| `/api/plugins/install` | POST | 安装插件 |
| `/api/plugins/:id` | GET | 获取插件详情 |
| `/api/plugins/:id/enable` | POST | 启用插件 |
| `/api/plugins/:id/disable` | POST | 禁用插件 |
| `/api/plugins/:id/config` | PUT | 更新插件配置 |
| `/api/plugins/tools` | GET | 获取插件工具列表 |
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

## 架构安全

### Master-Worker 网络隔离

本项目采用 Master-Worker 架构，并实现了严格的网络层隔离：

```
┌─────────────────────────────────────────────────────────────────┐
│                        Docker 网络架构                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────────┐         ┌──────────────┐                    │
│   │   MySQL      │◄────────┤    Master    │                    │
│   │              │         │   (backend)  │                    │
│   └──────────────┘         └──────┬───────┘                    │
│         ▲                         │                            │
│         │ claude-network          │ worker-network             │
│         │                         ▼                            │
│         │                  ┌──────────────┐                    │
│         │                  │    Worker    │                    │
│         │                  │  (sandbox)   │                    │
│         │                  └──────────────┘                    │
│         │                                                      │
│         │  ❌ Worker 无法直接访问 MySQL                         │
│         │  ✅ 只能通过 Master 中转                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**安全特性：**

- **网络层隔离**：Worker 容器运行在独立的 `worker-network` 中，无法直接访问 MySQL
- **应用层隔离**：Worker 模式下数据库连接被禁用（`getPool()` 返回 `null`）
- **凭证隔离**：Worker 容器不接收任何数据库连接凭据
- **API 隔离**：Worker 只响应带有 Master Token 的内部 API 请求

**验证网络隔离：**

```bash
# 运行验证脚本
node scripts/verify-network-isolation.mjs
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

## 插件系统

Claw Web 支持插件系统，允许第三方开发者扩展系统功能。

### 插件目录结构

```
claw-web/
├── plugins/                    # 插件目录
│   └── [plugin-id]/
│       ├── plugin.json          # 插件清单
│       └── index.js             # 插件入口文件
└── .config/
    └── plugins/                 # 插件配置目录
```

### 插件清单 (plugin.json)

```json
{
  "id": "my-plugin",
  "name": "我的插件",
  "version": "1.0.0",
  "description": "插件描述",
  "author": "开发者名称",
  "type": "tool",  // tool | skill | theme | integration | enhancement
  "main": "index.js"
}
```

### 插件类型

- **tool** - 提供新工具
- **skill** - 提供技能/命令
- **theme** - 提供UI主题
- **integration** - 集成外部服务
- **enhancement** - 增强现有功能

### 插件接口

```javascript
// 获取工具列表
export function getTools() {
  return [
    {
      name: 'my_tool',
      description: '工具描述',
      inputSchema: {
        type: 'object',
        properties: {
          param: { type: 'string', description: '参数描述' }
        },
        required: ['param']
      },
      handler: async (params) => {
        return { success: true, output: '结果' }
      }
    }
  ]
}

// 获取技能列表
export function getSkills() {
  return [
    {
      type: 'prompt',
      name: 'my-skill',
      description: '技能描述',
      source: 'plugin',
      loadedFrom: 'plugin',
      contentLength: 100,
      progressMessage: 'running',
      getPromptForCommand: async (args) => {
        return [{ type: 'text', text: '# 技能内容' }]
      }
    }
  ]
}

// 生命周期钩子
export function onLoad(config) { /* 加载时调用 */ }
export function onEnable() { /* 启用时调用 */ return true }
export function onDisable() { /* 禁用时调用 */ }
export function onUninstall() { /* 卸载时调用 */ }
```

### 示例插件

项目自带两个示例插件：

1. **天气查询插件** (`example-weather-plugin`)
   - 提供 `weather_query` 和 `weather_forecast` 工具

2. **代码审查助手插件** (`example-code-review-plugin`)
   - 提供 `code-review` 技能
   - 提供 `code_review` 和 `review_config` 工具

## 许可证

MIT
