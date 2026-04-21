<think>
Now I have a comprehensive understanding of the master directory structure and code. Let me compile a detailed report of my findings.
</think>

现在我已经深入探索了 `master` 目录的完整结构。以下是详细的分析报告：

---

# Master 目录结构探索报告

## 1. 目录结构概览

```
D:\Users\Administrator\AistudyProject\claw-web\server\src\master\
├── agents/                    # Agent 系统
│   ├── runAgent.ts           # Agent 执行入口
│   ├── types.ts              # Agent 类型定义
│   ├── builtInAgents.ts      # 内置 Agent 定义
│   ├── forkAgent.ts          # Fork 模式 Agent
│   └── ...
├── integrations/              # 核心集成模块
│   ├── toolRegistry.ts       # 工具注册中心 (~540行)
│   ├── agentRunner.ts        # Agent 运行器 (~420行)
│   ├── enhancedToolExecutor.ts # 工具执行器 (~400行)
│   ├── mcpBridge.ts         # MCP 协议桥接
│   ├── mcpSdkIntegration.ts  # MCP SDK 集成
│   ├── sessionBridge.ts     # 会话桥接
│   ├── wsBridge.ts           # WebSocket 桥接 (~1235行)
│   ├── wsPTYBridge.ts        # PTY WebSocket 桥接
│   ├── core/                # 核心子模块
│   │   ├── builtinTools.ts  # 内置工具定义
│   │   ├── toolLifecycle.ts # 生命周期事件
│   │   ├── toolDependency.ts # 依赖管理
│   │   └── toolTimeout.ts   # 超时控制
│   ├── tools/               # 工具实现
│   │   ├── fileTools.ts     # 文件操作工具 (~340行)
│   │   └── shellTools.ts    # Shell 执行工具 (~170行)
│   └── types/               # 类型定义
│       ├── toolTypes.ts      # 工具类型
│       └── toolRegistryTypes.ts # 注册表类型
├── security/                 # 安全模块
│   ├── pathSandbox.ts       # 路径沙箱 (~570行)
│   ├── scriptValidator.ts    # 脚本验证器
│   ├── securityMiddleware.ts # 安全中间件
│   ├── quotaService.ts       # 配额服务
│   ├── accessControlService.ts # 访问控制
│   ├── auditService.ts       # 审计服务
│   ├── anomalyDetector.ts    # 异常检测
│   └── monitoringService.ts  # 监控服务
├── services/                 # 业务服务
│   ├── llmService.ts         # LLM 服务 (~820行)
│   ├── sessionManager.ts      # 会话管理
│   ├── authService.ts        # 认证服务
│   ├── workspaceManager.ts    # 工作区管理
│   └── ...
├── websocket/                # WebSocket 处理
│   ├── index.ts             # WebSocket 入口
│   ├── wsMessageRouter.ts   # 消息路由
│   └── workerForwarder.ts   # Worker 转发
├── server/                   # 服务器核心
│   ├── httpServer.ts        # HTTP 服务器
│   ├── workerHandlers.ts    # Worker 处理器
│   └── agentApi.ts          # Agent API
├── utils/                    # 工具函数
│   ├── pathSecurity.ts      # 路径安全 (~410行)
│   └── ...
└── index.ts                 # 入口文件
```

---

## 2. 当前工具调用的实现方式

### 2.1 工具注册中心 (ToolRegistry)

**文件**: `integrations/toolRegistry.ts`

```12:196:server\src\master\integrations\toolRegistry.ts
  registerBuiltinTool(config: ToolRegistrationConfig): void {
    const id = uuidv4()
    const registeredTool: RegisteredTool = {
      id,
      source: 'builtin',
      isEnabled: true,
      permissions: [],
      dependencies: config.dependencies || [],
      timeout: config.timeout || this.timeoutManager.getToolTimeout(config.name),
      displayName: config.displayName || config.name,
      isReadOnly: config.isReadOnly ?? false,
      isConcurrencySafe: config.isConcurrencySafe ?? true,
      aliases: config.aliases || [],
      name: config.name,
      description: config.description,
      category: config.category,
      inputSchema: config.inputSchema,
    }
    
    this.builtinTools.set(config.name, registeredTool)
    // ... 处理别名和处理器注册
  }
```

**关键特性**:
- 按来源分类存储: `builtinTools`, `cliTools`, `mcpTools`, `customTools`
- 工具存储结构: `Map<string, RegisteredTool>`
- 处理器存储: `Map<string, handler>`
- 执行历史记录: 最多1000条

### 2.2 工具执行器 (EnhancedToolExecutor)

**文件**: `integration/enhancedToolExecutor.ts`

```49:70:server\src\master\integration\enhancedToolExecutor.ts
export class EnhancedToolExecutor {
  private tools: Map<string, ToolDefinition> = new Map()
  private executionHistory: ToolCall[] = []
  private maxHistory: number = 1000
  private context: ToolExecutionContext

  constructor(projectRoot?: string) {
    this.context = {
      userId: 'anonymous',
      projectRoot: projectRoot || this.getProjectRoot(),
    }
    this.registerBuiltInTools()
  }
```

**执行流程**:
1. 查找工具
2. 权限验证 (如果有用户权限)
3. 构建执行上下文
4. 调用工具处理函数
5. 记录执行历史
6. 添加元数据

### 2.3 工具调用执行 (ToolRegistry.executeTool)

```276:385:server\src\master\integrations\toolRegistry.ts
  async executeTool(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    const id = uuidv4()
    const startTime = Date.now()
    const timeout = request.timeout || this.timeoutManager.getToolTimeout(request.toolName)
    
    // 1. 查找工具
    const tool = this.getTool(request.toolName)
    if (!tool) { /* 错误处理 */ }
    
    // 2. 检查是否启用
    if (!tool.isEnabled) { /* 错误处理 */ }
    
    // 3. 检查依赖
    const depCheck = this.areDependenciesLoaded(request.toolName)
    if (!depCheck.loaded) { /* 错误处理 */ }
    
    // 4. 查找处理器
    const handler = this.toolHandlers.get(tool.name)
    if (!handler) { /* 错误处理 */ }
    
    // 5. 执行工具（带超时控制）
    const { result: response, timedOut, error: execError } = await this.timeoutManager.executeWithTimeout(
      () => handler(request.toolInput),
      request.toolName,
      timeout
    )
    
    // 6. 返回结果
    return result
  }
```

---

## 3. 现有的安全性检查机制

### 3.1 路径安全 (pathSecurity.ts)

**文件**: `utils/pathSecurity.ts`

```79:110:server\src\master\utils\pathSecurity.ts
export function validateCommandForTraversal(command: string): PathValidationResult {
  const trimmed = command.trim()

  // 1. 检测 cd/pushd + ..
  if (/^\s*(cd|pushd)\s+\.\./.test(trimmed)) {
    return {
      allowed: false,
      reason: '❌ 安全限制：禁止使用 "cd .." 切换到父目录。Agent 必须保持在当前工作目录内操作。',
      severity: 'block',
    }
  }

  // 2. 检测路径中的 ..
  if (/\.\.[\/\\]/.test(trimmed) || /[\/\\]\.\./.test(trimmed)) {
    return {
      allowed: false,
      reason: '❌ 安全限制：检测到路径包含 ".."（父目录引用）。Agent 只能访问当前工作目录及其子目录。',
      severity: 'block',
    }
  }
  // ...
}
```

**敏感路径模式**:
```47:59:server\src\master\utils\pathSecurity.ts
const SENSITIVE_PATH_PATTERNS = [
  /\/etc\//,
  /\/usr\/share\//,
  /\/windows\//i,
  /\\windows\\/i,
  /\.ssh\//,
  /.env$/,
  /credentials/i,
]
```

### 3.2 路径沙箱 (pathSandbox.ts)

**文件**: `security/pathSandbox.ts`

```150:185:server\src\master\security\pathSandbox.ts
export class PathSandbox {
  private userId: string
  private userRoot: string
  private strictMode: boolean
  private hideRealPath: boolean
  private allowedCommands: Set<string>
  private blockedCommands: Set<string>
  private currentPath: string
  private scriptValidator: ScriptValidator

  constructor(config: PathSandboxConfig) {
    // 危险命令黑名单
    const DANGEROUS_COMMANDS = [
      'sudo', 'su', 'pkexec', 'doas',      // 权限提升
      'mount', 'umount', 'fdisk', 'mkfs', 'dd',  // 系统操作
      'nc', 'netcat', 'ncat', 'telnet', 'ftp', 'sftp', // 网络
      'ssh', 'scp', 'rsync',
      'nmap', 'tcpdump', 'wireshark',
      'useradd', 'userdel', 'usermod',
      'passwd', 'chpasswd',
      'chmod', 'chown',
      'crontab', 'at',
      'kill', 'killall', 'pkill',
      'bash', 'sh', 'zsh',  // 防止启动新的 shell
    ]
  }
```

**关键方法**:
- `validateCommand()` - 同步命令验证
- `validateCommandAsync()` - 异步命令验证（含脚本内容分析）
- `checkInterpreterCalls()` - 检测解释器调用危险模式

### 3.3 权限验证 (EnhancedToolExecutor)

```267:287:server\src\master\integration\enhancedToolExecutor.ts
  private checkPermissions(
    tool: ToolDefinition,
    permissions: UserPermissions
  ): { allowed: boolean; reason?: string } {
    // 检查工具是否在禁止列表中
    if (permissions.deniedTools.includes(tool.name)) {
      return { allowed: false, reason: `Tool '${tool.name}' is explicitly denied` }
    }

    // 如果有允许列表，检查工具是否在其中
    if (permissions.allowedTools.length > 0 && !permissions.allowedTools.includes(tool.name)) {
      return { allowed: false, reason: `Tool '${tool.name}' is not in allowed list` }
    }

    // 检查危险工具权限
    if (tool.permissions?.dangerous && !permissions.canExecuteDangerous) {
      return { allowed: false, reason: `Tool '${tool.name}' requires dangerous operation permission` }
    }

    return { allowed: true }
  }
```

### 3.4 输入验证 (toolValidator.ts)

**文件**: `tools/toolValidator.ts`

```40:204:server\src\master\tools\toolValidator.ts
export function validateInputAgainstSchema(
  input: unknown,
  schema: JsonSchema
): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: string[] = []
  
  // 类型验证
  if (schema.type) {
    const actualType = getType(input)
    // ...
  }
  
  // 对象属性验证
  if (schema.type === 'object' && typeof input === 'object' && input !== null) {
    // 检查必需字段
    // 验证每个属性
  }
  
  // 字符串验证 (minLength, maxLength, pattern, enum)
  // 数字验证 (minimum, maximum, enum)
  
  return { valid: errors.length === 0, errors, warnings }
}
```

---

## 4. 文件处理逻辑

### 4.1 文件工具 (fileTools.ts)

**文件**: `integration/tools/fileTools.ts`

```22:80:server\src\master\integration\tools\fileTools.ts
export function createFileTools(resolvePathFn: (path: string) => string, ensureDirFn: (dir: string) => Promise<void>): ToolDefinition[] {
  return [
    {
      name: 'FileRead',
      description: 'Read contents of a file',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file' },
          limit: { type: 'number', description: 'Maximum number of lines to read' },
          offset: { type: 'number', description: 'Starting line number (0-indexed)' },
          encoding: { type: 'string', description: 'File encoding', default: 'utf-8' },
        },
        required: ['path'],
      },
      handler: async (input, context) => {
        const filePath = resolvePathFn(input.path as string)
        const limit = input.limit as number
        const offset = input.offset as number
        
        const st = await stat(filePath)
        if (st.isDirectory()) {
          return { success: false, error: '路径是文件夹...' }
        }
        
        const content = await readFile(filePath, encoding as BufferEncoding)
        
        if (limit || offset) {
          const lines = content.split('\n')
          return {
            success: true,
            result: {
              content: lines.slice(start, end).join('\n'),
              totalLines: lines.length,
              readLines: end - start,
            },
          }
        }
        // ...
      },
    },
    // ... FileWrite, FileEdit, FileDelete, FileRename, Glob, FileList
  ]
}
```

### 4.2 图片读取工具 (imageReadTool.ts)

**文件**: `tools/imageReadTool.ts`

```42:57:server\src\master\tools\imageReadTool.ts
const IMAGE_CONFIG = {
  // 最大输出宽度（像素）
  maxWidth: 2048,
  // 最大输出高度（像素）  
  maxHeight: 2048,
  // 默认 JPEG 质量 (0-100)
  defaultQuality: 80,
  // 压缩模式的质量 (用于大图)
  compressedQuality: 60,
  // 最大文件大小限制 (10MB)
  maxFileSize: 10 * 1024 * 1024,
  // Base64 后的最大大小估算 (约 2MB base64 = ~1.5MB 原始数据)
  maxBase64Size: 2 * 1024 * 1024
}
```

**处理流程**:
1. 验证文件存在、格式支持、大小限制 (10MB)
2. 使用 `sharp` 库处理图片
3. 如果超过 `maxWidth` 或 `maxHeight`，自动调整大小
4. 转换为 JPEG 格式（PNG特殊处理）
5. 激进压缩：如果 base64 仍超过 2MB，进一步压缩到 1024x1024
6. 调用 LLM 分析图片内容

---

## 5. 与 LLM 交互的代码

### 5.1 LLM 服务 (llmService.ts)

**文件**: `services/llmService.ts`

```119:139:server\src\master\services\llmService.ts
class LLMService {
  private anthropicClient: Anthropic | null = null
  private openAIClient: any = null
  private defaultConfig: LLMConfig

  constructor(defaultConfig?: Partial<LLMConfig>) {
    const detectedProvider = this.detectProvider()
    const detectedModel = this.detectModelByProvider(detectedProvider)
    
    this.defaultConfig = {
      provider: detectedProvider,
      model: detectedModel,
      maxTokens: 4096,
      temperature: 0.7,
      ...defaultConfig,
    }
  }
```

**支持的模型**:
```802:815:server\src\master\services\llmService.ts
getAvailableModels(): Array<{ id: string; name: string; provider: LLMProvider }> {
  return [
    // Anthropic 模型
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic' },
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', provider: 'anthropic' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
    // 通义千问模型
    { id: 'qwen-plus', name: '通义千问 Plus', provider: 'qwen' },
    { id: 'qwen-turbo', name: '通义千问 Turbo', provider: 'qwen' },
    { id: 'qwen-max', name: '通义千问 Max', provider: 'qwen' },
  ]
}
```

### 5.2 Agent 执行器 (agentRunner.ts)

**文件**: `integrations/agentRunner.ts`

```48:80:server\src\master\integrations\agentRunner.ts
export class WebAgentRunner {
  async processMessage(
    messages: AgentMessage[],
    config: AgentConfig,
    toolExecutor: {
      executeTool: (name: string, input: Record<string, unknown>, sendEvent?: EventSender) => Promise<{ success: boolean; result?: unknown; error?: string }>
    },
    sendEvent: EventSender
  ): Promise<AgentResult> {
    // 获取工具注册表
    const toolRegistry = getToolRegistry()
    const allTools = toolRegistry.getAllTools()
    
    // 转换工具格式
    const tools: ToolDefinition[] = allTools.map(tool => ({
      name: tool.name,
      description: tool.description || '',
      input_schema: tool.inputSchema as ToolDefinition['input_schema'],
    }))
    
    // 调用真实的 LLM 服务
    const response = await llmService.chat(
      chatMessages,
      {
        model: config.model,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        systemPrompt: config.systemPrompt,
      },
      tools,
      this.abortController.signal
    )
    
    // 处理工具调用
    if (response.toolCalls && response.toolCalls.length > 0) {
      for (const toolCall of result.toolCalls) {
        const toolResult = await toolExecutor.executeTool(toolCall.name, toolCall.input)
        // 递归处理
      }
    }
  }
}
```

### 5.3 runAgent 核心执行 (runAgent.ts)

**文件**: `agents/runAgent.ts`

```126:427:server\src\master\agents\runAgent.ts
export async function* runAgent(params: RunAgentParams): AsyncGenerator<RunAgentEvent> {
  // 初始化阶段
  const context = createRuntimeContext(params.agentDefinition, {...})
  
  // Query 循环
  context.run()
  
  while (!context.hasReachedMaxTurns()) {
    // 调用 AI API
    const response = await callAI({
      model: context.model || 'qwen-plus',
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      abortSignal: context.getAbortSignal(),
    })
    
    // 如果有工具调用，执行它们
    for (const toolCall of assistantMessage.toolCalls) {
      const toolResult = await executeTool(toolCall, context)
      // 将结果添加到消息
    }
  }
}
```

---

## 6. 需要改进的地方

### 6.1 安全性改进

| 问题 | 位置 | 建议 |
|------|------|------|
| **路径沙箱默认不阻止访问所有路径** | `pathSandbox.ts` L232-236 | `resolvePath` 方法中 `allowed: true` 被硬编码，应该验证最终路径是否在 `userRoot` 内 |
| **脚本验证器集成不完整** | `pathSandbox.ts` | `scriptValidator` 初始化但部分功能可能未完成 |
| **缺少文件大小硬限制** | `fileTools.ts` | `FileRead` 工具没有实现 `maxFileSize` 检查，应参考 `DEFAULT_SANDBOX_CONFIG.maxFileSize: 10MB` |

### 6.2 Token 管理改进

| 问题 | 位置 | 建议 |
|------|------|------|
| **没有 Token 计数服务** | `llmService.ts` | 响应中有 `usage` 但未持久化或统计 |
| **缺少 Token 预算控制** | `runAgent.ts` | 应在 `callAI` 中检查累计 token 消耗 |
| **文件内容截断依赖 `limit`** | `fileTools.ts` L54-68 | 大文件读取可能导致 token 溢出 |

### 6.3 工具系统改进

| 问题 | 位置 | 建议 |
|------|------|------|
| **工具处理函数签名不一致** | `fileTools.ts`, `shellTools.ts` | 部分返回 `output`，部分返回 `result`，应统一 |
| **工具执行无重试机制** | `toolRegistry.ts` | 临时失败（如网络超时）时没有重试 |
| **缺少工具调用限流** | `runAgent.ts` | 同类型工具连续调用应有限流 |

### 6.4 具体代码问题

**问题 1**: `FileRead` 工具缺少文件大小限制
```38:79:server\src\master\integration\tools\fileTools.ts
// 当前：直接读取文件，没有大小检查
const content = await readFile(filePath, encoding as BufferEncoding)
```

**建议**: 添加大小检查
```typescript
const stats = await stat(filePath)
if (stats.size > 10 * 1024 * 1024) {
  return { success: false, error: '文件超过 10MB 限制' }
}
```

**问题 2**: `pathSandbox.resolvePath` 返回 `allowed: true` 硬编码
```214:244:server\src\master\security\pathSandbox.ts
resolvePath(targetPath: string): PathValidationResult {
  // ...
  // 4. 允许访问所有路径（移除路径限制）
  return {
    allowed: true,
    resolvedPath: normalizedPath
  }
}
```

---

## 7. 关键文件路径总结

| 功能 | 文件路径 | 行数 |
|------|----------|------|
| 工具注册中心 | `integrations/toolRegistry.ts` | ~540 |
| 工具执行器 | `integration/enhancedToolExecutor.ts` | ~400 |
| 文件工具 | `integrations/tools/fileTools.ts` | ~340 |
| Shell 工具 | `integrations/tools/shellTools.ts` | ~170 |
| LLM 服务 | `services/llmService.ts` | ~820 |
| Agent 运行器 | `integrations/agentRunner.ts` | ~420 |
| Agent 执行 | `agents/runAgent.ts` | ~700 |
| 路径安全 | `utils/pathSecurity.ts` | ~410 |
| 路径沙箱 | `security/pathSandbox.ts` | ~570 |
| WebSocket 桥接 | `integrations/wsBridge.ts` | ~1235 |
| 工具验证器 | `tools/toolValidator.ts` | ~312 |
| 图片读取 | `tools/imageReadTool.ts` | ~465 |
| 工具类型 | `integrations/types/toolTypes.ts` | ~208 |
| 工具注册类型 | `integrations/types/toolRegistryTypes.ts` | - |
| 内置工具注册 | `integrations/core/builtinTools.ts` | ~506 |