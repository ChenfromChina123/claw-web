# Claude Code Haha 完整 Web 复刻计划

## 项目概述
将 `claude-code-haha` 完全改造为支持完整工具调用的 Web 应用，保持与官方 Claude Code 一致的功能体验。

## 核心技术方案

### 架构设计
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Vue 3 前端    │◄──►│   Bun API 服务   │◄──►│  百炼 API       │
│   (Web UI)      │     │   + 工具执行    │     │                 │
├─────────────────┤     ├─────────────────┤     └─────────────────┘
│  - 消息显示     │     │  - WebSocket   │
│  - 输入框       │     │  - 工具调度     │
│  - 终端模拟    │     │  - Bash执行     │
│  - 文件浏览器  │     │  - 文件操作     │
│  - 工具进度    │     │  - 权限管理     │
└─────────────────┘     └─────────────────┘
```

## 实施步骤

### 阶段 1: WebSocket 通信层
1. 实现 WebSocket 服务端
2. 定义消息协议
3. 实现工具调用事件传输

### 阶段 2: 核心工具实现
1. BashTool - 命令执行
2. FileReadTool - 文件读取
3. FileWriteTool - 文件写入
4. FileEditTool - 文件编辑
5. GrepTool - 代码搜索

### 阶段 3: Vue 前端
1. 聊天消息组件（支持 Markdown）
2. 工具调用显示组件
3. 终端输出组件
4. 文件浏览器组件

### 阶段 4: 集成测试

## 消息协议定义

### 客户端 -> 服务端
```typescript
// 发送消息
{ type: 'user_message', content: string }

// 工具结果
{ type: 'tool_result', tool_use_id: string, result: any }
```

### 服务端 -> 客户端
```typescript
// AI 消息
{ type: 'assistant_message', content: string }

// 工具调用
{ type: 'tool_use', id: string, name: string, input: any }

// 工具执行进度
{ type: 'tool_progress', id: string, progress: string }

// 工具执行完成
{ type: 'tool_result', id: string, result: any }

// 错误
{ type: 'error', message: string }
```

## 工具列表

| 工具 | 功能 | 状态 |
|------|------|------|
| Bash | 执行 Shell 命令 | 待实现 |
| FileRead | 读取文件内容 | 待实现 |
| FileWrite | 写入文件内容 | 待实现 |
| FileEdit | 编辑文件（替换） | 待实现 |
| Grep | 代码搜索 | 待实现 |
| Glob | 文件模式匹配 | 待实现 |
| WebSearch | 网络搜索 | 待实现 |
| WebFetch | 获取网页内容 | 待实现 |

## 文件结构

```
server/
├── src/
│   ├── index.ts              # HTTP + WebSocket 入口
│   ├── websocket.ts          # WebSocket 处理
│   ├── tools/
│   │   ├── index.ts          # 工具注册表
│   │   ├── BashTool.ts       # Bash 执行
│   │   ├── FileReadTool.ts   # 文件读取
│   │   ├── FileWriteTool.ts  # 文件写入
│   │   ├── FileEditTool.ts   # 文件编辑
│   │   └── GrepTool.ts       # 代码搜索
│   ├── executor.ts           # 工具执行器
│   └── anthropic.ts          # Anthropic API 封装
```

## 前端组件

```
web/src/components/
├── ChatMessage.vue           # 消息显示
├── ToolUse.vue              # 工具调用显示
├── ToolResult.vue           # 工具结果显示
├── Terminal.vue             # 终端输出模拟
├── FileTree.vue             # 文件树
└── StatusBar.vue            # 状态栏
```

## 启动方式

```bash
# 终端 1: 启动 API 服务
cd server && bun run src/index.ts

# 终端 2: 启动前端
cd web && npm run dev
```

## 技术要点

1. **流式响应**: 使用 SSE + WebSocket 实时传输
2. **工具并发**: 借鉴 StreamingToolExecutor 的并发控制
3. **安全**: 服务端执行所有危险操作，权限验证
4. **跨平台**: Windows/Linux 命令兼容处理
