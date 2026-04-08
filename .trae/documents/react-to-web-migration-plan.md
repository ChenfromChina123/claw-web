# Claude Code HAHA - React CLI 到 Web 前端改造计划

## 📋 项目现状分析

### 1. 项目架构概览

```
claude-code-haha/
├── server/          # ✅ 已完成 - Bun 后端服务器
│   ├── src/
│   │   ├── index.ts              # 主服务器入口
│   │   ├── integration/          # WebSocket RPC 桥接
│   │   ├── integrations/         # 业务集成层
│   │   ├── services/             # 服务层（认证、会话）
│   │   ├── db/                   # 数据库层
│   │   └── models/               # 数据模型
│   └── package.json
│
├── src/             # ⚠️ 待改造 - React + Ink CLI 应用
│   ├── components/           # 200+ React 组件
│   │   ├── messages/          # 消息相关组件
│   │   ├── permissions/       # 权限管理组件
│   │   ├── tools/             # 工具 UI 组件
│   │   └── ...
│   ├── screens/               # REPL 主界面
│   ├── hooks/                 # 100+ 自定义 Hooks
│   ├── state/                 # 状态管理
│   ├── commands/              # 命令系统
│   ├── tools/                 # 工具定义和提示词
│   └── ink/                   # Ink 终端渲染引擎
│
└── web/             # 🔧 基础版本 - Vue 3 Web 前端
    ├── src/
    │   ├── views/             # 页面（Chat, Login, Register, Settings）
    │   ├── components/        # 15 个基础组件
    │   ├── stores/            # Pinia 状态管理
    │   ├── composables/       # 组合式函数
    │   └── api/               # API 客户端
    └── package.json
```

### 2. 技术栈对比

| 维度 | Server | Src (CLI) | Web (现有) |
|------|--------|-----------|------------|
| **框架** | Bun (Runtime) | React + Ink | Vue 3 + Vite |
| **UI 库** | - | Ink (终端) | Naive UI |
| **状态管理** | 内存/MemoryStore | React Context + Store | Pinia |
| **通信协议** | HTTP + WebSocket | 直接调用 | WebSocket |
| **构建工具** | Bun | Bun | Vite |

### 3. 当前集成状态

#### ✅ Server 已实现的功能
- [x] 用户认证系统（注册、登录、JWT）
- [x] 会话 CRUD 操作
- [x] 实时消息流式传输
- [x] 工具执行系统（15+ 内置工具）
- [x] MCP 服务器集成
- [x] WebSocket RPC 框架
- [x] 命令桥接系统
- [x] 多模型支持（通义千问、Claude）

#### ⚠️ Web 前端已实现的功能
- [x] 用户登录/注册界面
- [x] 基础聊天界面
- [x] 会话侧边栏
- [x] WebSocket 连接管理
- [x] 消息发送和接收
- [x] 基础工具结果显示

#### ❌ Web 前端缺失的功能（Src 中有但未迁移）
- [ ] 高级消息渲染（Markdown、代码高亮、思维链）
- [ ] 工具使用可视化（文件编辑、命令执行、Web 搜索）
- [ ] 权限请求交互（确认/拒绝工具调用）
- [ ] 文件差异展示（Diff 视图）
- [ ] 任务管理系统（后台任务、Agent 任务）
- [ ] MCP 服务器配置界面
- [ ] Agent 创建和管理向导
- [ ] 设置页面完善（模型选择、API Key 配置）
- [ ] 命令面板增强（/help, /config, /model 等）
- [ ] 键盘快捷键支持
- [ ] 主题切换（暗色/亮色）
- [ ] 导出功能（对话导出、分享）
- [ ] 成本追踪显示
- [ ] 语音输入集成
- [ ] 多语言支持

---

## 🎯 改造目标

### 核心目标
将 `src/` 中的 **React + Ink CLI 组件**改造为 **Web 友好的 Vue 3 组件**，复用其成熟的业务逻辑和交互设计，与现有的 `server/` 后端深度集成。

### 设计原则
1. **渐进式改造**: 保留现有 `web/` 基础架构，逐步增强
2. **逻辑复用**: 提取 `src/` 中的核心逻辑为平台无关模块
3. **体验优先**: 保持 CLI 的强大功能，提升 Web 交互体验
4. **类型安全**: 使用 TypeScript，保持类型一致性

---

## 📐 改造方案详细计划

### 阶段一：基础设施增强（预计工作量：中等）

#### 1.1 类型定义统一
**目标**: 统一前后端类型定义，确保数据结构一致

**任务清单**:
- [ ] 在 `web/src/types/` 中补充完整的数据类型
  - 从 `server/src/models/types.ts` 迁移
  - 从 `src/types/` 迁移通用类型
  - 添加前端特有的 UI 状态类型
- [ ] 创建共享类型包（可选：发布到私有 npm 或 monorepo）
- [ ] 为 WebSocket 消息添加完整的类型守卫

**涉及文件**:
```
web/src/types/
├── index.ts              # 导出所有类型
├── session.ts            # 会话相关类型
├── message.ts            # 消息类型（文本、工具、权限）
├── tool.ts               # 工具类型（定义、结果、状态）
├── auth.ts               # 认证类型
├── websocket.ts          # WebSocket 消息类型
└── ui.ts                 # UI 状态类型
```

**参考源码**:
- [server/src/models/types.ts](../server/src/models/types.ts)
- [server/src/integration/wsBridge.ts](../server/src/integration/wsBridge.ts) (WebSocketMessage)
- [src/types/](../src/types/) (各种类型定义)

---

#### 1.2 API 客户端增强
**目标**: 封装完整的 REST 和 WebSocket API 调用

**任务清单**:
- [ ] 扩展 `web/src/api/client.ts`
  - 实现 REST API 封装（axios 实例配置）
  - 添加请求/响应拦截器（Token 注入、错误处理）
  - 实现 API 重试机制
- [ ] 创建服务模块
  - `authApi.ts` - 认证相关（登录、注册、密码重置）
  - `sessionApi.ts` - 会话 CRUD
  - `toolApi.ts` - 工具列表和执行历史
  - `modelApi.ts` - 模型信息
  - `mcpApi.ts` - MCP 服务器管理
- [ ] 添加 API 缓存策略（模型列表、工具列表等静态数据）

**参考源码**:
- [server/src/index.ts](../server/src/index.ts) (路由定义)
- [web/src/api/client.ts](../web/src/api/client.ts) (现有实现)

---

#### 1.3 WebSocket 服务升级
**目标**: 完善 WebSocket 连接管理和事件处理

**任务清单**:
- [ ] 升级 `web/src/composables/useWebSocket.ts`
  - 实现自动重连（指数退避）
  - 添加心跳检测
  - 消息队列（断线重发）
  - 事件订阅/取消订阅机制
- [ ] 实现 RPC 调用封装
  - 支持 request-response 模式
  - 超时处理
  - 并发控制
- [ ] 添加连接状态可视化
  - 连接中、已连接、断线、重连中状态
  - 网络延迟显示

**参考源码**:
- [server/src/integration/wsBridge.ts](../server/src/integration/wsBridge.ts) (WebSocketManager)
- [web/src/composables/useWebSocket.ts](../web/src/composables/useWebSocket.ts) (现有实现)

---

### 阶段二：核心组件迁移（预计工作量：大）

#### 2.1 消息系统重构
**目标**: 实现丰富的消息展示能力

**任务清单**:

##### 2.1.1 消息类型扩展
从 `src/components/messages/` 迁移以下组件：
- [ ] `UserTextMessage` → `UserMessage.vue`
- [ ] `AssistantTextMessage` → `AssistantMessage.vue`
- [ ] `AssistantToolUseMessage` → `ToolUseMessage.vue`
- [ ] `UserToolResultMessage` → `ToolResultMessage.vue`
- [ ] `AssistantThinkingMessage` → `ThinkingMessage.vue`
- [ ] `SystemTextMessage` → `SystemMessage.vue`

##### 2.1.2 Markdown 渲染增强
- [ ] 集成 `marked` + `highlight.js`（已有依赖）
- [ ] 支持代码块语法高亮
- [ ] 支持表格、数学公式（可选 KaTeX）
- [ ] 支持任务列表（checkbox）
- [ ] 添加复制代码按钮
- [ ] 实现代码折叠（长代码块）

##### 2.1.3 流式输出优化
- [ ] 打字机效果（逐字显示）
- [ ] 思维链展示（thinking tags）
- [ ] 工具调用实时进度条
- [ ] 流式中止按钮

**参考源码**:
- [src/components/Messages.tsx](../src/components/Messages.tsx)
- [src/components/Markdown.tsx](../src/components/Markdown.tsx)
- [src/components/messages/](../src/components/messages/) (所有消息子组件)

---

#### 2.2 工具可视化系统
**目标**: 展示工具调用的完整生命周期

**任务清单**:

##### 2.2.1 通用工具 UI
- [ ] `ToolUseCard.vue` - 工具调用卡片（名称、参数、状态）
- [ ] `ToolResultCard.vue` - 结果展示（成功/失败/进行中）
- [ ] `ToolProgress.vue` - 进度指示器

##### 2.2.2 特定工具 UI（从 `src/tools/` 迁移）
- [ ] **BashTool UI**
  - 命令预览（语法高亮）
  - 输出实时流式显示
  - 退出码显示
  - 输出折叠/展开
- [ ] **FileEditTool UI**
  - Diff 视图展示（新增/删除/修改行高亮）
  - 文件路径链接
  - 编辑前后对比
- [ ] **FileReadTool UI**
  - 代码高亮显示
  - 行号显示
  - 文件信息（大小、修改时间）
- [ ] **GlobTool/GrepTool UI**
  - 结果列表
  - 匹配行高亮
  - 文件树视图
- [ ] **WebFetchTool/WebSearchTool UI**
  - URL 预览卡片
  - 内容摘要
  - 搜索结果列表
- [ ] **LSPTool UI**
  - 诊断信息展示
  - 代码跳转提示
- [ ] **MCPTool UI**
  - 动态表单渲染（根据 inputSchema）
  - 服务器标识

##### 2.2.3 权限请求系统
从 `src/components/permissions/` 迁移：
- [ ] `PermissionDialog.vue` - 通用权限对话框
- [ ] `BashPermissionRequest.vue` - Shell 命令确认
- [ ] `FileEditPermissionRequest.vue` - 文件编辑确认
- [ ] `FileWritePermissionRequest.vue` - 文件写入确认
- [ ] `WebFetchPermissionRequest.vue` - 网络请求确认
- [ ] `AskUserQuestionPermissionRequest.vue` - 自定义问题确认

**参考源码**:
- [src/tools/](../src/tools/) (所有工具 UI 组件)
- [src/components/permissions/](../src/components/permissions/) (权限组件)
- [web/src/components/ToolUse.vue](../web/src/components/ToolUse.vue) (现有简单实现)

---

#### 2.3 会话管理增强
**目标**: 完善会话的生命周期管理

**任务清单**:
- [ ] **SessionSidebar 增强**
  - [ ] 会话搜索/过滤
  - [ ] 会话分组（按日期、按模型）
  - [ ] 会话拖拽排序
  - [ ] 会话右键菜单（重命名、删除、导出、固定）
  - [ ] 未读消息计数
  - [ ] 最后消息预览
- [ ] **Session 创建向导**
  - [ ] 选择 AI 模型
  - [ ] 设置系统提示词（模板选择）
  - [ ] 配置可用工具
  - [ ] 选择 MCP 服务器
- [ ] **Session 切换动画**
  - [ ] 平滑过渡效果
  - [ ] 滚动位置记忆
  - [ ] 输入框状态保存

**参考源码**:
- [web/src/components/SessionSidebar.vue](../web/src/components/SessionSidebar.vue)
- [server/src/services/sessionManager.ts](../server/src/services/sessionManager.ts)

---

### 阶段三：高级功能迁移（预计工作量：大）

#### 3.1 命令系统
**目标**: 实现 `/command` 命令面板

**任务清单**:
- [ ] **CommandPalette 增强**
  - [ ] 模糊搜索命令
  - [ ] 命令分类显示
  - [ ] 最近使用命令
  - [ ] 快捷键提示
- [ ] **核心命令实现**
  - [ ] `/help` - 显示帮助信息
  - [ ] `/clear` - 清空当前会话
  - [ ] `/new` - 新建会话
  - [ ] `/model <name>` - 切换模型
  - [ ] `/config` - 打开设置
  - [ ] `/compact` - 压缩上下文
  - [ ] `/cost` - 显示成本统计
  - [ ] `/export` - 导出对话
  - [ ] `/theme` - 切换主题
  - [ ] `/login` / `/logout` - 认证管理
- [ ] **命令参数补全**
  - [ ] 模型名称补全
  - [ ] 文件路径补全
  - [ ] 命令历史记录

**参考源码**:
- [src/commands/](../src/commands/) (所有命令定义)
- [src/cli/handlers/](../src/cli/handlers/) (命令处理器)
- [web/src/components/CommandPalette.vue](../web/src/components/CommandPalette.vue)

---

#### 3.2 Agent 系统
**目标**: 实现 Agent 创建和管理

**任务清单**:
- [ ] **Agent 列表页**
  - [ ] Agent 卡片展示（名称、描述、颜色、模型）
  - [ ] 创建新 Agent 按钮
  - [ ] Agent 搜索/过滤
- [ ] **Agent 创建向导**（从 `src/components/agents/new-agent-creation/` 迁移）
  - [ ] Step 1: 基本信息（名称、描述、图标颜色）
  - [ ] Step 2: 类型选择（单轮、多轮、长时间运行）
  - [ ] Step 3: 模型选择
  - [ ] Step 4: 系统提示词编辑器
  - [ ] Step 5: 工具选择（勾选可用工具）
  - [ ] Step 6: 记忆配置
  - [ ] Step 7: 确认并创建
- [ ] **Agent 编辑器**
  - [ ] 提示词编辑（Markdown + 变量插入）
  - [ ] 工具权限配置
  - [ ] 测试运行
  - [ ] 版本历史

**参考源码**:
- [src/components/agents/](../src/components/agents/)
- [server/src/integrations/agentRunner.ts](../server/src/integrations/agentRunner.ts)

---

#### 3.3 MCP 集成界面
**目标**: 提供 MCP 服务器配置和管理 UI

**任务清单**:
- [ ] **MCP 服务器列表**
  - [ ] 服务器状态指示（已连接/断开/错误）
  - [ ] 服务器信息（名称、类型 stdio/http）
  - [ ] 启用/禁用开关
  - [ ] 添加/删除/编辑操作
- [ ] **MCP 服务器配置表单**
  - [ ] Stdio 类型：命令 + 参数 + 环境变量
  - [ ] HTTP 类型：URL + Headers + 认证
  - [ ] 配置验证（测试连接）
- [ ] **MCP 工具浏览器**
  - [ ] 按服务器分组显示工具
  - [ ] 工具详情（描述、参数 schema）
  - [ ] 手动测试工具调用

**参考源码**:
- [src/components/mcp/](../src/components/mcp/)
- [server/src/integrations/mcpBridge.ts](../server/src/integrations/mcpBridge.ts)

---

#### 3.4 设置页面完善
**目标**: 实现完整的用户设置界面

**任务清单**:
- [ ] **账户设置**
  - [ ] 个人资料（头像、用户名、邮箱）
  - [ ] 修改密码
  - [ ] API Key 管理
- [ ] **模型配置**
  - [ ] 默认模型选择
  - [ ] 自定义模型端点（Base URL + API Key）
  - [ ] 模型参数调整（temperature, max_tokens 等）
- [ ] **外观设置**
  - [ ] 主题切换（亮色/暗色/系统跟随）
  - [ ] 字体大小调整
  - [ ] 消息密度（舒适/紧凑）
  - [ ] 代码字体选择
- [ ] **高级设置**
  - [ ] 语言选择
  - [ ] 通知偏好
  - [ ] 数据导出/删除
  - [ ] 调试模式开关

**参考源码**:
- [src/components/Settings/](../src/components/Settings/)
- [web/src/views/Settings.vue](../web/src/views/Settings.vue)

---

### 阶段四：体验优化（预计工作量：中等）

#### 4.1 交互优化
**任务清单**:
- [ ] **键盘快捷键系统**
  - [ ] 全局快捷键注册表
  - [ ] 快捷键冲突检测
  - [ ] 自定义快捷键（可选）
  - [ ] 快捷键提示浮层（Cmd/Ctrl + ?）
  
  推荐快捷键：
  - `Ctrl/Cmd + K`: 命令面板
  - `Ctrl/Cmd + N`: 新建会话
  - `Ctrl/Cmd + Shift + N`: 新建窗口
  - `Ctrl/Cmd + ,`: 设置
  - `Ctrl/Cmd + /`: 切换主题
  - `Esc`: 关闭弹窗/侧边栏
  - `↑/↓`: 历史消息导航
  - `Enter`: 发送消息
  - `Shift + Enter`: 换行

- [ ] **拖拽上传**
  - [ ] 图片拖拽到输入框
  - [ ] 文件拖拽（触发 FileRead/FileEdit）
  - [ ] 多文件批量上传

- [ ] **响应式布局**
  - [ ] 移动端适配（侧边栏收起）
  - [ ] 平板模式（双栏布局）
  - [ ] 桌面端宽屏优化

---

#### 4.2 性能优化
**任务清单**:
- [ ] **虚拟滚动**
  - [ ] 长消息列表虚拟化（复用 DOM）
  - [ ] 无限滚动加载历史消息
  - [ ] 滚动位置记忆（刷新后恢复）
- [ ] **懒加载**
  - [ ] 代码高亮语言包按需加载
  - [ ] Markdown 渲染器延迟初始化
  - [ ] 图片懒加载
- [ ] **缓存策略**
  - [ ] 会话列表本地缓存（IndexedDB）
  - [ ] 模型/工具列表内存缓存
  - [ ] 静态资源 Service Worker 缓存

---

#### 4.3 可访问性（A11y）
**任务清单**:
- [ ] 键盘导航支持（Tab 序序）
- [ ] ARIA 标签完整覆盖
- [ ] 高对比度模式
- [ ] 屏幕阅读器兼容
- [ ] 焦点可见性指示

---

## 🗂️ 推荐目录结构（改造后）

```
web/
├── public/
│   └── favicon.ico
├── src/
│   ├── api/                        # API 层
│   │   ├── client.ts               # Axios 实例 + 拦截器
│   │   ├── index.ts                # 统一导出
│   │   ├── authApi.ts              # 认证 API
│   │   ├── sessionApi.ts           # 会话 API
│   │   ├── toolApi.ts              # 工具 API
│   │   ├── modelApi.ts             # 模型 API
│   │   └── mcpApi.ts               # MCP API
│   │
│   ├── assets/                     # 静态资源
│   │   ├── main.css                # 全局样式
│   │   └── icons/                  # 图标资源
│   │
│   ├── components/                 # 通用组件
│   │   ├── common/                 # 基础 UI 组件
│   │   │   ├── LoadingSpinner.vue
│   │   │   ├── EmptyState.vue
│   │   │   ├── ErrorBoundary.vue
│   │   │   └── ConfirmDialog.vue
│   │   │
│   │   ├── chat/                   # 聊天相关组件
│   │   │   ├── ChatLayout.vue      # 聊天布局容器
│   │   │   ├── ChatSidebar.vue     # 会话侧边栏（增强版）
│   │   │   ├── ChatMessageList.vue # 消息列表（虚拟滚动）
│   │   │   ├── ChatInput.vue       # 输入框（增强版）
│   │   │   └── CommandPalette.vue  # 命令面板（增强版）
│   │   │
│   │   ├── messages/               # 消息类型组件
│   │   │   ├── UserMessage.vue
│   │   │   ├── AssistantMessage.vue
│   │   │   ├── ToolUseMessage.vue
│   │   │   ├── ToolResultMessage.vue
│   │   │   ├── ThinkingMessage.vue
│   │   │   ├── SystemMessage.vue
│   │   │   └── MessageActions.vue  # 消息操作菜单
│   │   │
│   │   ├── tools/                  # 工具可视化组件
│   │   │   ├── ToolCard.vue        # 通用工具卡片
│   │   │   ├── BashOutput.vue      # Shell 输出
│   │   │   ├── DiffViewer.vue      # 文件差异视图
│   │   │   ├── CodeBlock.vue       # 代码块（带高亮）
│   │   │   ├── SearchResult.vue    # 搜索结果
│   │   │   ├── WebPreview.vue      # 网页预览
│   │   │   └── McpForm.vue         # MCP 动态表单
│   │   │
│   │   ├── permissions/            # 权限请求组件
│   │   │   ├── PermissionDialog.vue
│   │   │   ├── BashPermission.vue
│   │   │   ├── FilePermission.vue
│   │   │   ├── WebPermission.vue
│   │   │   └── CustomQuestion.vue
│   │   │
│   │   ├── agents/                 # Agent 相关组件
│   │   │   ├── AgentList.vue
│   │   │   ├── AgentCard.vue
│   │   │   ├── CreateAgentWizard.vue
│   │   │   └── AgentEditor.vue
│   │   │
│   │   ├── mcp/                    # MCP 组件
│   │   │   ├── McpServerList.vue
│   │   │   ├── McpServerConfig.vue
│   │   │   └── McpToolBrowser.vue
│   │   │
│   │   └── settings/               # 设置组件
│   │       ├── ProfileSettings.vue
│   │       ├── ModelSettings.vue
│   │       ├── AppearanceSettings.vue
│   │       └── AdvancedSettings.vue
│   │
│   ├── composables/                # 组合式函数
│   │   ├── useWebSocket.ts         # WebSocket 管理（增强版）
│   │   ├── useAuth.ts              # 认证状态
│   │   ├── useSession.ts           # 会话操作
│   │   ├── useMessages.ts          # 消息管理
│   │   ├── useTools.ts             # 工具调用
│   │   ├── useCommands.ts          # 命令处理
│   │   ├── useKeyboardShortcuts.ts # 快捷键
│   │   ├── useTheme.ts             # 主题切换
│   │   └── useVirtualScroll.ts     # 虚拟滚动
│   │
│   ├── stores/                     # Pinia 状态仓库
│   │   ├── auth.ts                 # 认证状态
│   │   ├── chat.ts                 # 聊天状态（增强版）
│   │   ├── settings.ts             # 设置状态
│   │   ├── agent.ts                # Agent 状态
│   │   └── mcp.ts                  # MCP 状态
│   │
│   ├── types/                      # TypeScript 类型
│   │   ├── index.ts
│   │   ├── session.ts
│   │   ├── message.ts
│   │   ├── tool.ts
│   │   ├── auth.ts
│   │   ├── websocket.ts
│   │   └── ui.ts
│   │
│   ├── utils/                      # 工具函数
│   │   ├── markdown.ts             # Markdown 解析
│   │   ├── highlight.ts            # 代码高亮
│   │   ├── format.ts               # 格式化
│   │   ├── date.ts                 # 日期处理
│   │   └── storage.ts              # 本地存储
│   │
│   ├── views/                      # 页面视图
│   │   ├── Chat.vue                # 主聊天页（增强版）
│   │   ├── Login.vue               # 登录页
│   │   ├── Register.vue            # 注册页
│   │   ├── Settings.vue            # 设置页（增强版）
│   │   ├── Agents.vue              # Agent 管理页
│   │   └── McpSettings.vue         # MCP 配置页
│   │
│   ├── App.vue                     # 根组件
│   ├── main.ts                     # 入口文件
│   ├── router.ts                   # 路由配置
│   └── style.css                   # 全局样式
│
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

---

## 🔄 数据流架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (Vue 3)                       │
│                                                             │
│  ┌─────────┐   ┌─────────────┐   ┌──────────────────────┐  │
│  │  Views  │──▶│ Components  │◀──│ Composables/Hooks    │  │
│  └────┬────┘   └──────┬──────┘   └──────────┬───────────┘  │
│       │               │                      │              │
│       ▼               ▼                      ▼              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Pinia Stores                      │   │
│  │  (auth, chat, settings, agent, mcp)                  │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                         │                                   │
│  ┌──────────────────────▼──────────────────────────────┐   │
│  │              API Layer (Axios + WS)                  │   │
│  │  • REST: /api/auth/*, /api/sessions/*, ...          │   │
│  │  • WS:   rpc_call, user_message, events             │   │
│  └──────────────────────┬──────────────────────────────┘   │
└─────────────────────────┼───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Server (Bun Runtime)                      │
│                                                             │
│  ┌─────────────┐   ┌──────────────┐   ┌─────────────────┐  │
│  │ HTTP Routes │   │ WebSocket    │   │ RPC Methods     │  │
│  │ /api/*      │   │ Manager      │   │ (tool.*,        │  │
│  └──────┬──────┘   └──────┬───────┘   │  session.*,     │  │
│       │                │             │  auth.*, ...)    │  │
│       ▼                ▼             └────────┬────────┘  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Business Logic Layer                    │   │
│  │  • SessionConversationManager                       │   │
│  │  • EnhancedToolExecutor                             │   │
│  │  • AuthService                                     │   │
│  │  • WebMCPBridge / WebCommandBridge                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                         │                                   │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Data Layer                              │   │
│  │  • MySQL (Users, Sessions, Messages, ToolCalls)     │   │
│  │  • In-Memory Cache (Active Sessions)                │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 优先级排序建议

### P0 - 必须实现（核心功能）
1. ✅ 类型定义统一
2. ✅ WebSocket 服务升级（RPC、重连、心跳）
3. ✅ 消息系统重构（Markdown、流式输出、工具调用展示）
4. ✅ 权限请求交互（至少 Bash 和文件操作）
5. ✅ 基础命令系统（/new, /clear, /model, /help）

### P1 - 重要功能（用户体验关键）
6. 会话管理增强（搜索、分组、右键菜单）
7. 工具可视化完整（Bash、FileEdit、Grep、WebFetch）
8. 设置页面完善（模型配置、外观）
9. 键盘快捷键系统
10. 响应式布局适配

### P2 - 增强功能（差异化竞争）
11. Agent 创建向导
12. MCP 配置界面
13. 虚拟滚动性能优化
14. 导出/分享功能
15. 成本追踪显示

### P3 - 锦上添花（未来迭代）
16. 语音输入
17. 多语言国际化
18. 插件系统
19. 协作功能（多用户）
20. 移动端 App（PWA）

---

## ⚠️ 注意事项和风险

### 技术风险
1. **Ink 依赖强耦合**: `src/` 中的大量组件依赖 Ink 的 `Box`, `Text`, `useInput` 等 API，不能直接在 Web 使用，必须重写
2. **终端特性无法迁移**: 
   - 终端颜色/样式（ANSI escape codes）
   - 键盘原始输入捕获（Vim 模式）
   - 终端尺寸感知（useTerminalSize）
   - 光标位置控制
3. **性能考量**: 
   - 大量组件可能导致初始加载体积增大
   - 需要合理的代码分割和懒加载策略

### 兼容性问题
1. **React → Vue 转换成本**: 需要重新实现组件逻辑，不能直接复制粘贴
2. **Hooks → Composables**: 思维模式转换，但整体模式相似
3. **状态管理差异**: React Context → Pinia，需要重新设计状态结构

### 建议的应对策略
1. **分阶段交付**: 不要试图一次性迁移所有功能
2. **MVP 优先**: 先保证核心聊天流程可用，再逐步增强
3. **组件库复用**: 优先使用 Naive UI 组件，减少自定义开发量
4. **测试驱动**: 为每个迁移的组件编写单元测试
5. **用户反馈**: 每个阶段发布后收集用户反馈，调整优先级

---

## 🚀 实施路线图

### 第 1 周：基础设施
- Day 1-2: 类型定义统一 + API 客户端
- Day 3-4: WebSocket 服务升级
- Day 5: 单元测试框架搭建

### 第 2-3 周：核心聊天功能
- Week 2: 消息系统重构（Markdown + 流式输出）
- Week 3: 工具可视化 + 权限请求

### 第 4 周：会话和命令
- Week 4: 会话管理增强 + 命令系统实现

### 第 5-6 周：高级功能
- Week 5: Agent 系统 + MCP 界面
- Week 6: 设置页面完善 + 性能优化

### 第 7 周：打磨和测试
- Week 7: 响应式适配 + 可访问性 + 用户测试

---

## 📝 总结

这个改造计划将把一个功能强大的 **CLI 应用** 转变为现代化的 **Web 应用**，同时保留其核心价值：

✅ **保留的核心能力**:
- 强大的 AI 对话系统
- 丰富的工具生态系统
- 灵活的权限控制
- 完整的会话管理

✅ **新增的 Web 优势**:
- 更直观的可视化界面
- 更好的协作潜力
- 跨平台访问能力
- 更现代的交互模式

通过 **7 周的分阶段实施**，我们可以打造出一个既强大又易用的 Web 版 Claude Code HAHA！
