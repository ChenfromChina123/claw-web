# Claude Code Haha Web 服务改造计划

## 项目概述
将 `claude-code-haha` 从终端 CLI 模式改造成 Web 服务形式，使用 Vue.js 作为前端框架。

## 核心技术栈
- **前端**: Vue 3 + Vite + TypeScript
- **后端**: Node.js/Bun + Express/Fastify (或使用 Bun 原生 HTTP)
- **通信**: REST API + Server-Sent Events (SSE) 实现流式响应
- **AI SDK**: @anthropic-ai/sdk (保持不变)

## 架构设计

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Vue 3 前端     │────▶│   Bun API 服务   │────▶│  百炼/Anthropic  │
│   (Web UI)      │◀────│   (REST + SSE)  │◀────│     API         │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## 实施步骤

### 阶段 1: 项目结构搭建
1. 创建 `web/` 目录存放 Vue 前端项目
2. 创建 `server/` 目录存放 API 服务
3. 配置文件结构

### 阶段 2: 后端 API 服务开发
1. 创建 Express/Fastify 服务
2. 实现聊天 API 端点:
   - `POST /api/chat` - 发送消息并获取响应
   - `GET /api/models` - 获取可用模型列表
3. 集成 SSE 实现流式响应
4. 复用 `localRecoveryCli.ts` 中的 Anthropic SDK 逻辑

### 阶段 3: Vue 前端开发
1. 初始化 Vue 3 + Vite + TypeScript 项目
2. 实现聊天界面组件
3. 实现消息列表组件
4. 实现输入框组件
5. 集成 SSE 流式响应显示

### 阶段 4: 环境配置与启动
1. 配置 API 服务环境变量
2. 配置前端 API 代理
3. 实现 CORS 配置
4. 编写启动脚本

## 关键文件清单

### 新增文件
```
web/                          # Vue 前端
├── src/
│   ├── components/
│   │   ├── ChatMessage.vue      # 消息组件
│   │   ├── ChatInput.vue         # 输入框组件
│   │   └── ChatContainer.vue     # 聊天容器
│   ├── App.vue
│   ├── main.ts
│   └── style.css
├── index.html
├── vite.config.ts
├── package.json
└── tsconfig.json

server/                        # API 服务
├── src/
│   ├── index.ts               # 服务入口
│   ├── routes/
│   │   └── chat.ts            # 聊天路由
│   └── services/
│       └── anthropic.ts        # Anthropic SDK 封装
├── package.json
└── tsconfig.json
```

### 修改文件
- `.env` - 添加 API 服务相关配置
- `package.json` - 添加 workspaces 支持

## 启动方式

```bash
# 1. 启动 API 服务 (端口 3000)
cd server && bun install && bun run index.ts

# 2. 启动 Vue 前端 (端口 5173)
cd web && npm install && npm run dev
```

## 注意事项
1. 保持与现有 CLI 模式兼容
2. API 服务复用 `localRecoveryCli.ts` 中的 SDK 逻辑
3. 支持流式响应以提供更好的用户体验
4. CORS 配置允许前端开发服务器访问

---

## API 文档

### 基础信息
- **Base URL**: `http://localhost:3000/api`
- **Content-Type**: `application/json`
- **认证方式**: 通过 `ANTHROPIC_AUTH_TOKEN` 环境变量配置（已在 `.env` 文件中设置）

---

### 端点列表

#### 1. 聊天接口

**端点**: `POST /api/chat`

**描述**: 发送消息给 AI 并获取回复（支持流式响应）

**请求头**:
| Header | 类型 | 必填 | 说明 |
|--------|------|------|------|
| Content-Type | string | 是 | `application/json` |

**请求体**:
```json
{
  "model": "qwen-plus",
  "messages": [
    {
      "role": "user",
      "content": "你好，请介绍一下自己"
    }
  ],
  "stream": true,
  "max_tokens": 4096,
  "system_prompt": "你是一个友好的AI助手"
}
```

**请求参数说明**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| model | string | 否 | qwen-plus | 模型名称 |
| messages | array | 是 | - | 消息数组 |
| messages[].role | string | 是 | - | 角色: `user` 或 `assistant` |
| messages[].content | string | 是 | - | 消息内容 |
| stream | boolean | 否 | false | 是否启用流式响应 |
| max_tokens | number | 否 | 4096 | 最大生成 token 数 |
| system_prompt | string | 否 | - | 系统提示词 |

**响应（非流式）**:
```json
{
  "success": true,
  "data": {
    "content": "你好！我是...",
    "model": "qwen-plus",
    "usage": {
      "input_tokens": 10,
      "output_tokens": 50
    }
  }
}
```

**响应（流式，SSE 格式）**:
```
data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"你"}}
data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"好"}}
data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"！"}}
data: {"type":"message_stop"}
```

**流式事件类型**:
| 事件 | 说明 |
|------|------|
| `content_block_delta` | 文本内容增量更新 |
| `message_start` | 消息开始 |
| `message_stop` | 消息结束 |
| `error` | 错误信息 |

---

#### 2. 获取可用模型

**端点**: `GET /api/models`

**描述**: 获取当前可用的模型列表

**响应**:
```json
{
  "success": true,
  "data": {
    "models": [
      {
        "id": "qwen-plus",
        "name": "通义千问 Plus",
        "provider": "aliyun"
      },
      {
        "id": "qwen-turbo",
        "name": "通义千问 Turbo",
        "provider": "aliyun"
      },
      {
        "id": "qwen-max",
        "name": "通义千问 Max",
        "provider": "aliyun"
      }
    ]
  }
}
```

---

#### 3. 健康检查

**端点**: `GET /api/health`

**描述**: 检查 API 服务是否正常运行

**响应**:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

---

#### 4. 清除会话

**端点**: `POST /api/clear`

**描述**: 清除当前会话历史（可选，保留会话上下文）

**响应**:
```json
{
  "success": true,
  "message": "会话已清除"
}
```

---

### 错误响应格式

所有错误响应的格式如下：

```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "错误描述信息"
  }
}
```

**错误码说明**:
| 错误码 | HTTP 状态码 | 说明 |
|--------|-------------|------|
| INVALID_REQUEST | 400 | 请求参数无效 |
| UNAUTHORIZED | 401 | 认证失败 |
| MODEL_NOT_FOUND | 404 | 指定的模型不存在 |
| API_ERROR | 500 | AI API 调用失败 |
| INTERNAL_ERROR | 500 | 服务器内部错误 |

---

### 前端调用示例

**使用 fetch + SSE**:
```typescript
async function chat(messages: Array<{role: string, content: string}>) {
  const response = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen-plus',
      messages,
      stream: true
    })
  });

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value);
    const lines = text.split('\n').filter(line => line.startsWith('data: '));

    for (const line of lines) {
      const data = JSON.parse(line.slice(6));
      if (data.type === 'content_block_delta') {
        console.log(data.delta.text);
      }
    }
  }
}
```

**使用 Vue 3 组合式 API**:
```typescript
import { ref } from 'vue';

const messages = ref<Array<{role: string, content: string}>>([]);
const streamingContent = ref('');

async function sendMessage(content: string) {
  messages.value.push({ role: 'user', content });

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen-plus',
      messages: messages.value,
      stream: true
    })
  });

  // 处理流式响应...
}
```

---

### 部署注意事项

1. **CORS 配置**: 生产环境需要配置正确的 CORS 策略
2. **API Key 安全**: 不要将 API Key 暴露在前端代码中
3. **流式响应**: 确保代理服务器（如 Nginx）支持 SSE 分块传输
4. **超时设置**: 建议设置合理的请求超时时间（当前配置 300000ms）

