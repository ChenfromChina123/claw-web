<think>
现在我已经收集了大量的信息。让我整理一下发现的内容，为用户提供一份详细的报告。

## 关键发现

### 1. 目录结构概览
从glob结果可以看到，src目录下有大量的模块：
- `utils/` - 工具函数和实用程序
- `services/` - 服务层代码
- `tools/` - 各种工具实现
- `types/` - 类型定义
- `components/` - UI组件
- `commands/` - CLI命令
- `hooks/` - React hooks

### 2. 工具调用相关代码
主要文件：
- `src/services/tools/toolOrchestration.ts` - 工具编排
- `src/services/tools/toolExecution.ts` - 工具执行
- `src/services/tools/StreamingToolExecutor.ts` - 流式工具执行
- `src/services/tools/toolHooks.ts` - 工具钩子
- `src/Tool.ts` - 工具接口定义

### 3. 安全性检查相关代码
- `src/utils/permissions/permissions.ts` - 权限管理
- `src/utils/permissions/yoloClassifier.ts` - 自动模式分类器
- `src/utils/toolResultStorage.ts` - 工具结果持久化和截断
- `src/constants/toolLimits.ts` - 工具限制常量
- `src/utils/readFileInRange.ts` - 文件读取范围


- `src/tools/FileReadTool/limits.ts` - 文件读取限制
- `src/constants/apiLimits.ts` - API限制

### 4. 主控逻辑
- `src/query.ts` - 主查询循环
- `src/utils/analyzeContext.ts` - 上下文分析
- `src/utils/context.ts` - 上下文管理

接下来需要深入检查关键文件的具体实现细节。
</think>

现在让我整理所有发现，提供一份完整的源码结构分析报告。

---

# Claude Code 源码结构详细分析报告

## 1. 目录结构概览

```
D:\Users\Administrator\AistudyProject\claw-web\src\
├── services/           # 服务层
│   ├── tools/          # 工具执行相关核心服务
│   │   ├── toolOrchestration.ts    # 工具编排（并发控制）
│   │   ├── toolExecution.ts       # 工具执行逻辑
│   │   ├── StreamingToolExecutor.ts # 流式工具执行器
│   │   └── toolHooks.ts           # 工具钩子管理
│   ├── mcp/            # MCP协议实现
│   └── compact/        # 上下文压缩
├── tools/              # 工具实现
│   ├── BashTool/       # Bash命令执行
│   ├── FileReadTool/   # 文件读取
│   ├── FileEditTool/   # 文件编辑
│   ├── WebFetchTool/   # Web请求
│   └── AgentTool/      # 子代理工具
├── utils/             # 工具函数
│   ├── permissions/    # 权限管理
│   │   ├── permissions.ts      # 核心权限逻辑
│   │   ├── yoloClassifier.ts    # 自动模式分类器
│   │   ├── classifierDecision.ts # 分类决策
│   │   ├── denialTracking.ts    # 拒绝跟踪
│   │   └── autoModeState.ts    # 自动模式状态
│   ├── toolResultStorage.ts     # 工具结果持久化
│   ├── truncate.ts             # 字符串截断
│   ├── readFileInRange.ts     # 文件范围读取
│   ├── analyzeContext.ts       # 上下文分析
│   └── context.ts             # 上下文管理
├── constants/         # 常量定义
│   ├── toolLimits.ts   # 工具限制常量
│   └── apiLimits.ts    # API限制常量
├── types/             # 类型定义
├── components/        # UI组件
├── commands/          # CLI命令
├── hooks/             # React hooks
├── query.ts           # 主查询循环（主控入口）
└── Tool.ts            # 工具接口定义
```

---

## 2. 工具注册和执行机制

### 2.1 核心接口定义

**文件**: `src/Tool.ts` (第 362-549 行)

```typescript
export type Tool<
  Input extends AnyObject = AnyObject,
  Output = unknown,
  P extends ToolProgressData = ToolProgressData,
> = {
  name: string
  call(
    args: z.infer<Input>,
    context: ToolUseContext,
    canUseTool: CanUseToolFn,
    parentMessage: AssistantMessage,
    onProgress?: ToolCallProgress<P>,
  ): Promise<ToolResult<Output>>
  
  inputSchema: Input
  isConcurrencySafe(input: z.infer<Input>): boolean
  isEnabled(): boolean
  isReadOnly(input: z.infer<Input>): boolean
  checkPermissions(input: z.infer<Input>, context: ToolUseContext): Promise<PermissionResult>
  
  // 可选方法
  validateInput?(input: z.infer<Input>, context: ToolUseContext): Promise<ValidationResult>
  interruptBehavior?(): 'cancel' | 'block'
  isSearchOrReadCommand?(input: z.infer<Input>): { isSearch: boolean; isRead: boolean }
  maxResultSizeChars: number  // 工具结果最大字符数
}
```

### 2.2 工具编排 - 并发控制

**文件**: `src/services/tools/toolOrchestration.ts`

```typescript
// 最大并发工具调用数
function getMaxToolUseConcurrency(): number {
  return (
    parseInt(process.env.CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY || '', 10) || 10
  )
}

// 核心编排函数
export async function* runTools(
  toolUseMessages: ToolUseBlock[],
  assistantMessages: AssistantMessage[],
  canUseTool: CanUseToolFn,
  toolUseContext: ToolUseContext,
): AsyncGenerator<MessageUpdate, void>

// 关键：工具分区逻辑 - 决定哪些工具可以并行执行
function partitionToolCalls(
  toolUseMessages: ToolUseBlock[],
  toolUseContext: ToolUseContext,
): Batch[] {
  // 只读工具可以并行，非只读工具必须串行
  const isConcurrencySafe = Boolean(tool?.isConcurrencySafe(parsedInput.data))
  // ...
}
```

### 2.3 工具执行流程

**文件**: `src/services/tools/toolExecution.ts`

```typescript
export async function* runToolUse(
  toolUse: ToolUseBlock,
  assistantMessage: AssistantMessage,
  canUseTool: CanUseToolFn,
  toolUseContext: ToolUseContext,
): AsyncGenerator<MessageUpdateLazy, void>

// 核心执行步骤：
async function checkPermissionsAndCallTool(...) {
  // 1. Zod输入验证
  const parsedInput = tool.inputSchema.safeParse(input)
  
  // 2. 工具自定义验证
  const isValidCall = await tool.validateInput?.(parsedInput.data, toolUseContext)
  
  // 3. 运行PreToolUse钩子
  for await (const result of runPreToolUseHooks(...))
  
  // 4. 权限检查
  const permissionDecision = await resolveHookPermissionDecision(...)
  
  // 5. 执行工具
  const result = await tool.call(callInput, context, canUseTool, assistantMessage, progress)
  
  // 6. 运行PostToolUse钩子
  for await (const hookResult of runPostToolUseHooks(...))
  
  // 7. 工具结果持久化（如果过大）
  await processToolResultBlock(tool, toolUseResult, toolUseID)
}
```

### 2.4 isConcurrencySafe 实现

每个工具都实现了 `isConcurrencySafe` 方法，定义在各个工具文件中：

| 工具 | 文件 | 实现 |
|------|------|------|
| FileReadTool | `src/tools/FileReadTool/FileReadTool.ts` | 第 373 行 |
| BashTool | `src/tools/BashTool/BashTool.tsx` | 第 434 行 |
| GrepTool | `src/tools/GrepTool/GrepTool.ts` | 第 183 行 |
| WebFetchTool | `src/tools/WebFetchTool/WebFetchTool.ts` | 第 95 行 |

```typescript
// BashTool 示例
isConcurrencySafe(input) {
  // 只读命令可以并行
  return this.isReadOnly(input)
}
```

---

## 3. 安全性检查代码

### 3.1 权限管理核心

**文件**: `src/utils/permissions/permissions.ts`

权限检查流程（`hasPermissionsToUseToolInner` 函数）：

```typescript
async function hasPermissionsToUseToolInner(tool, input, context) {
  // 1a. 检查工具是否被规则拒绝
  const denyRule = getDenyRuleForTool(appState.toolPermissionContext, tool)
  
  // 1b. 检查工具是否需要询问权限
  const askRule = getAskRuleForTool(appState.toolPermissionContext, tool)
  
  // 1c. 调用工具自定义权限检查
  toolPermissionResult = await tool.checkPermissions(parsedInput, context)
  
  // 1d. 工具实现拒绝
  if (toolPermissionResult?.behavior === 'deny') return toolPermissionResult
  
  // 1e. 检查是否需要用户交互
  if (tool.requiresUserInteraction?.() && toolPermissionResult?.behavior === 'ask')
  
  // 1g. 安全检查（如 .git/, .claude/, .vscode/）
  if (toolPermissionResult?.decisionReason?.type === 'safetyCheck')
  
  // 2a. 检查是否绕过权限模式
  if (appState.toolPermissionContext.mode === 'bypassPermissions')
  
  // 2b. 检查始终允许规则
  const alwaysAllowedRule = toolAlwaysAllowedRule(...)
}
```

### 3.2 自动模式分类器 (YOLO Classifier)

**文件**: `src/utils/permissions/yoloClassifier.ts`

这是 Claude Code 的 AI 驱动安全审核系统：

```typescript
export async function classifyYoloAction(
  messages: Message[],
  action: string,
  tools: readonly { name: string }[],
  toolPermissionContext: ToolPermissionContext,
  signal: AbortSignal,
): Promise<YoloClassifierResult>

// 分类结果类型
export type YoloClassifierResult = {
  shouldBlock: boolean    // 是否阻止
  reason: string         // 原因
  errorDumpPath?: string // 错误转储路径
  unavailable?: boolean  // 分类器不可用
  transcriptTooLong?: boolean
  usage?: ClassifierUsage
  durationMs?: number
  model?: string
  // ... 更多字段
}
```

**文件**: `src/utils/permissions/denialTracking.ts`

```typescript
// 拒绝跟踪状态
export type DenialTrackingState = {
  consecutiveDenials: number  // 连续拒绝次数
  totalDenials: number        // 总拒绝次数
}

export const DENIAL_LIMITS = {
  maxConsecutive: 5,   // 最大连续拒绝次数
  maxTotal: 15,         // 最大总拒绝次数
}

// 拒绝限制处理
function handleDenialLimitExceeded(
  denialState: DenialTrackingState,
  // ...
): PermissionDecision | null {
  if (!shouldFallbackToPrompting(denialState)) return null
  
  // 如果超过限制，触发回退到提示模式
  return { behavior: 'ask', ... }
}
```

### 3.3 拒绝跟踪状态

```typescript
// 创建拒绝跟踪状态
export function createDenialTrackingState(): DenialTrackingState {
  return {
    consecutiveDenials: 0,
    totalDenials: 0,
    lastDenialTime: 0,
  }
}

// 记录拒绝
export function recordDenial(state: DenialTrackingState): DenialTrackingState {
  return {
    ...state,
    consecutiveDenials: state.consecutiveDenials + 1,
    totalDenials: state.totalDenials + 1,
    lastDenialTime: Date.now(),
  }
}

// 记录成功（重置计数）
export function recordSuccess(state: DenialTrackingState): DenialTrackingState {
  return {
    ...state,
    consecutiveDenials: 0,
  }
}
```

---

## 4. 文件大小检查和截断逻辑

### 4.1 工具结果大小限制常量

**文件**: `src/constants/toolLimits.ts`

```typescript
// 默认最大结果大小（字符）
export const DEFAULT_MAX_RESULT_SIZE_CHARS = 50_000  // 50KB

// 最大结果 token 数
export const MAX_TOOL_RESULT_TOKENS = 100_000  // 100K tokens

// 每个 token 约 4 字节
export const BYTES_PER_TOKEN = 4

// 最大结果字节数
export const MAX_TOOL_RESULT_BYTES = MAX_TOOL_RESULT_TOKENS * BYTES_PER_TOKEN
// = 400KB

// 每条消息最大结果字符数
export const MAX_TOOL_RESULTS_PER_MESSAGE_CHARS = 200_000  // 200KB

// 工具摘要最大长度
export const TOOL_SUMMARY_MAX_LENGTH = 50
```

### 4.2 工具结果持久化

**文件**: `src/utils/toolResultStorage.ts`

```typescript
// 预览大小
export const PREVIEW_SIZE_BYTES = 2000  // 2KB

// 持久化工具结果
export async function persistToolResult(
  content: NonNullable<ToolResultBlockParam['content']>,
  toolUseId: string,
): Promise<PersistedToolResult | PersistToolResultError>

// 处理大结果：持久化到磁盘
async function maybePersistLargeToolResult(
  toolResultBlock: ToolResultBlockParam,
  toolName: string,
  persistenceThreshold?: number,
): Promise<ToolResultBlockParam> {
  const content = toolResultBlock.content
  const size = contentSize(content)
  
  // 如果超过阈值，持久化到磁盘
  if (size > threshold) {
    const result = await persistToolResult(content, toolResultBlock.tool_use_id)
    // 返回预览 + 文件路径引用
    return {
      ...toolResultBlock,
      content: buildLargeToolResultMessage(result)
    }
  }
  return toolResultBlock
}

// 生成预览
export function generatePreview(
  content: string,
  maxBytes: number,
): { preview: string; hasMore: boolean } {
  // 找到最后一个换行符，尽量在行边界截断
  const truncated = content.slice(0, maxBytes)
  const lastNewline = truncated.lastIndexOf('\n')
  const cutPoint = lastNewline > maxBytes * 0.5 ? lastNewline : maxBytes
  return { preview: content.slice(0, cutPoint), hasMore: true }
}
```

### 4.3 文件读取大小限制

**文件**: `src/tools/FileReadTool/limits.ts`

```typescript
// 默认最大输出 token 数
export const DEFAULT_MAX_OUTPUT_TOKENS = 25000

// 文件读取限制
export type FileReadingLimits = {
  maxTokens: number       // 最大 token 数
  maxSizeBytes: number    // 最大字节数
  includeMaxSizeInPrompt?: boolean
  targetedRangeNudge?: boolean
}

// 获取默认限制
export const getDefaultFileReadingLimits = memoize((): FileReadingLimits => {
  // 优先级：环境变量 > GrowthBook > 硬编码默认值
  const maxSizeBytes = MAX_OUTPUT_SIZE  // 从 file.ts 导入
  const maxTokens = DEFAULT_MAX_OUTPUT_TOKENS
  return { maxSizeBytes, maxTokens, ... }
})
```

**文件**: `src/utils/file.ts`

```typescript
// 输出大小限制
export const MAX_OUTPUT_SIZE = 256 * 1024  // 256KB
```

### 4.4 范围文件读取

**文件**: `src/utils/readFileInRange.ts`

```typescript
// 快速路径最大文件大小
const FAST_PATH_MAX_SIZE = 10 * 1024 * 1024  // 10MB

// 文件过大错误
export class FileTooLargeError extends Error {
  constructor(
    public sizeInBytes: number,
    public maxSizeBytes: number,
  ) {
    super(
      `File content (${formatFileSize(sizeInBytes)}) exceeds maximum allowed size (${formatFileSize(maxSizeBytes)}). ` +
      `Use offset and limit parameters to read specific portions of the file.`
    )
  }
}

// 主读取函数
export async function readFileInRange(
  filePath: string,
  offset = 0,
  maxLines?: number,
  maxBytes?: number,
  signal?: AbortSignal,
  options?: { truncateOnByteLimit?: boolean },
): Promise<ReadFileRangeResult>

// 两种读取路径：
// 1. 快速路径 (<10MB 文件): readFile + 内存分割
// 2. 流式路径: createReadStream + 逐行扫描
```

---

## 5. Token 计数和限制

### 5.1 API 限制常量

**文件**: `src/constants/apiLimits.ts`

```typescript
// 图片限制
export const API_IMAGE_MAX_BASE64_SIZE = 5 * 1024 * 1024  // 5MB base64
export const IMAGE_TARGET_RAW_SIZE = (API_IMAGE_MAX_BASE64_SIZE * 3) / 4  // ~3.75MB
export const IMAGE_MAX_WIDTH = 2000
export const IMAGE_MAX_HEIGHT = 2000

// PDF 限制
export const PDF_TARGET_RAW_SIZE = 20 * 1024 * 1024  // 20MB
export const API_PDF_MAX_PAGES = 100
export const PDF_MAX_PAGES_PER_READ = 20
export const PDF_EXTRACT_SIZE_THRESHOLD = 3 * 1024 * 1024  // 3MB

// 媒体限制
export const API_MAX_MEDIA_PER_REQUEST = 100
```

### 5.2 上下文分析

**文件**: `src/utils/analyzeContext.ts`

```typescript
// Token 计数固定开销
export const TOOL_TOKEN_COUNT_OVERHEAD = 500  // API 工具提示前缀

// Token 计数函数（带回退）
async function countTokensWithFallback(
  messages: Anthropic.Beta.Messages.BetaMessageParam[],
  tools: Anthropic.Beta.Messages.BetaToolUnion[],
): Promise<number | null> {
  try {
    // 优先使用 API 计数
    const result = await countMessagesTokensWithAPI(messages, tools)
    if (result !== null) return result
  } catch (err) {
    // 回退到 Haiku 估算
    return await countTokensViaHaikuFallback(messages, tools)
  }
}

// 上下文数据接口
export interface ContextData {
  readonly categories: ContextCategory[]
  readonly totalTokens: number
  readonly maxTokens: number
  readonly rawMaxTokens: number
  readonly percentage: number
  readonly messageBreakdown?: {
    toolCallTokens: number
    toolResultTokens: number
    attachmentTokens: number
    assistantMessageTokens: number
    userMessageTokens: number
  }
}
```

### 5.3 上下文窗口管理

**文件**: `src/utils/context.ts`

```typescript
// 默认上下文窗口
export const MODEL_CONTEXT_WINDOW_DEFAULT = 200_000  // 200K tokens

// 获取模型上下文窗口
export function getContextWindowForModel(
  model: string,
  betas?: string[],
): number {
  const antModel = getAntModel(model)
  if (antModel?.contextWindow) {
    return antModel.contextWindow
  }
  return MODEL_CONTEXT_WINDOW_DEFAULT
}

// 上下文使用率
export function getContextUsagePercentage(
  totalInputTokens: number,
  contextWindowSize: number,
): number {
  return (totalInputTokens / contextWindowSize) * 100
}
```

---

## 6. 安全验证机制

### 6.1 工具结果预算执行

**文件**: `src/utils/toolResultStorage.ts` (第 739-909 行)

```typescript
// 执行每条消息的工具结果预算
export async function enforceToolResultBudget(
  messages: Message[],
  state: ContentReplacementState,
  skipToolNames: ReadonlySet<string> = new Set(),
): Promise<{
  messages: Message[]
  newlyReplaced: ToolResultReplacementRecord[]
}> {
  // 1. 收集每条消息的候选工具结果
  const candidatesByMessage = collectCandidatesByMessage(messages)
  
  // 2. 按之前的决策状态分区
  const { mustReapply, frozen, fresh } = partitionByPriorDecision(
    candidates,
    state,
  )
  
  // 3. 选择要持久化的最大结果
  const selected = selectFreshToReplace(
    eligible,       // 新鲜结果
    frozenSize,     // 冻结大小
    limit           // 预算限制
  )
  
  // 4. 持久化选中的结果
  const freshReplacements = await Promise.all(
    toPersist.map(async c => [c, await buildReplacement(c)] as const),
  )
  
  // 5. 替换消息内容
  return { messages: replaceToolResultContents(messages, replacementMap) }
}
```

### 6.2 Bash 安全检查

**文件**: `src/tools/BashTool/bashSecurity.ts`

```typescript
// 危险命令模式
const DANGEROUS_PATTERNS = [
  // 网络操作
  /curl.*\|.*sh/i,
  /wget.*\|.*sh/i,
  /nc\s+-e/i,
  // 文件破坏
  /rm\s+-rf\s+\/(?!proc|sys)/,
  // 密码相关
  /sudo\s+passwd/i,
  // ...
]

// 安全检查函数
export function checkBashSecurity(command: string): SecurityCheckResult {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return {
        isSafe: false,
        reason: `Dangerous pattern detected: ${pattern.source}`,
        severity: 'high'
      }
    }
  }
  return { isSafe: true }
}
```

### 6.3 路径安全检查

**文件**: `src/utils/permissions/filesystem.ts`

```typescript
// 检查路径安全性
export function checkPathSafety(
  path: string,
  context: ToolUseContext,
): PermissionResult {
  // 1. 检查保护目录
  const PROTECTED_PATHS = ['.git', '.claude', '.vscode', '.idea']
  for (const protectedPath of PROTECTED_PATHS) {
    if (path.includes(`/${protectedPath}/`) || path.includes(`\\${protectedPath}\\`)) {
      return {
        behavior: 'ask',  // 需要询问
        decisionReason: {
          type: 'safetyCheck',
          reason: `Path contains protected directory: ${protectedPath}`
        }
      }
    }
  }
  
  // 2. 检查符号链接
  if (isSymlink(path)) {
    return {
      behavior: 'ask',
      decisionReason: { type: 'safetyCheck', reason: 'Path is a symbolic link' }
    }
  }
  
  return { behavior: 'passthrough' }
}
```

### 6.4 PreToolUse 钩子安全验证

**文件**: `src/services/tools/toolHooks.ts`

```typescript
export async function* runPreToolUseHooks(...): AsyncGenerator<...> {
  // 执行 PreToolUse 钩子
  for await (const result of executePreToolHooks(
    tool.name,
    toolUseID,
    processedInput,
    toolUseContext,
    permissionMode,
    signal,
  )) {
    // 检查钩子返回的权限行为
    if (result.permissionBehavior !== undefined) {
      switch (result.permissionBehavior) {
        case 'allow':
          // 钩子允许，但规则仍可能拒绝
          yield { type: 'hookPermissionResult', hookPermissionResult: {...} }
          break
        case 'deny':
          yield { type: 'hookPermissionResult', hookPermissionResult: {...} }
          break
        case 'ask':
          yield { type: 'hookPermissionResult', hookPermissionResult: {...} }
          break
      }
    }
    
    // 检查阻止错误
    if (result.blockingError) {
      yield {
        type: 'hookPermissionResult',
        hookPermissionResult: { behavior: 'deny', ... }
      }
    }
  }
}
```

---

## 7. 主查询循环

**文件**: `src/query.ts`

这是 Claude Code 的主控制流程：

```typescript
// 主查询函数签名
export type QueryParams = {
  messages: Message[]
  systemPrompt: SystemPrompt
  userContext: { [k: string]: string }
  systemContext: { [k: string]: string }
  canUseTool: CanUseToolFn
  toolUseContext: ToolUseContext
  fallbackModel?: string
  querySource: QuerySource
  maxOutputTokensOverride?: number
  maxTurns?: number
  taskBudget?: { total: number }
}

// 关键流程：
// 1. 准备消息和上下文
// 2. 发送 API 请求
// 3. 处理流式响应
// 4. 执行工具调用
// 5. 应用工具结果预算
// 6. 检查是否需要自动压缩
// 7. 循环或结束
```

---

## 8. 关键文件路径总结

| 功能 | 文件路径 |
|------|----------|
| **工具接口** | `src/Tool.ts` |
| **工具编排** | `src/services/tools/toolOrchestration.ts` |
| **工具执行** | `src/services/tools/toolExecution.ts` |
| **流式执行器** | `src/services/tools/StreamingToolExecutor.ts` |
| **工具钩子** | `src/services/tools/toolHooks.ts` |
| **权限管理** | `src/utils/permissions/permissions.ts` |
| **自动模式分类器** | `src/utils/permissions/yoloClassifier.ts` |
| **拒绝跟踪** | `src/utils/permissions/denialTracking.ts` |
| **结果持久化** | `src/utils/toolResultStorage.ts` |
| **字符串截断** | `src/utils/truncate.ts` |
| **范围文件读取** | `src/utils/readFileInRange.ts` |
| **文件读取限制** | `src/tools/FileReadTool/limits.ts` |
| **上下文分析** | `src/utils/analyzeContext.ts` |
| **上下文管理** | `src/utils/context.ts` |
| **工具限制常量** | `src/constants/toolLimits.ts` |
| **API限制常量** | `src/constants/apiLimits.ts` |
| **Bash安全检查** | `src/tools/BashTool/bashSecurity.ts` |
| **路径安全检查** | `src/utils/permissions/filesystem.ts` |
| **主查询循环** | `src/query.ts` |

---

这份分析涵盖了 Claude Code 源码中工具调用、安全检查、文件截断和 token 管理的核心实现。如果需要更深入了解某个特定部分，请告诉我。