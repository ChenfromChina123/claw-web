# 检查后端 Agent 是否真正在 Worker 内进行工具执行

## 📋 调查结论（已完成代码搜索）

经过对代码库的全面搜索，**当前 Agent 工具执行存在两条路径，且存在严重架构违规问题**。

---

## 🔍 当前实际执行状态

### ✅ 已正确实现：工具级 Worker 转发

危险工具（Bash、FileRead、FileWrite、FileEdit、Glob、Grep、PowerShell、Exec）通过以下链路正确转发到 Worker：

```
Master: toolRegistry.executeTool()
  → shouldExecuteOnWorker(toolName)? → Yes
  → WorkerToolExecutor.executeTool()
  → HTTP POST → Worker /internal/exec (携带 X-Master-Token)
  → Worker: workerSandbox.exec() / workerSandbox.execTool()
```

**关键文件**：
- [workerToolExecutor.ts:22-31](server/src/master/integrations/workerToolExecutor.ts) - 危险工具列表定义
- [toolRegistry.ts:392](server/src/master/integrations/toolRegistry.ts) - Worker 转发判断逻辑
- [worker/server/index.ts:300-309](server/src/worker/server/index.ts) - Worker 端 tool_exec 处理

### ❌ 架构违规：Agent 思考循环在 Master 本地运行

**违反架构铁律**："Agent 执行：所有 Agent 命令必须转发到 Worker 容器执行"

当前主流程（路径 A）中，Agent 的 LLM 调用和工具编排都在 Master 端执行：

```
前端 → Master: runAgent() → callAI() (本地 LLM 调用)
                        → toolRegistry.executeTool() (工具编排在 Master)
                           → 危险工具: 转发到 Worker ✅
                           → 非危险工具: Master 本地执行 ✅ (合理)
```

### ❌ 路径 B 不可用：Worker 端 Agent 执行器缺失

`executeAgentOnWorker()` 已设计但 Worker 端的 `agents/executor.ts` 模块**不存在**，调用会抛出模块未找到错误。

### ❌ WebToolExecutor 在 Master 本地执行危险操作

[integrations/toolExecutor.ts](server/src/master/integrations/toolExecutor.ts) 中的 `executeBash()` 直接在 Master 上 `spawn` 子进程，绕过了 Worker 沙箱。

---

## 🛠️ 修复计划

### 步骤 1：修复类型定义不一致
- **文件**：[shared/types/index.ts](server/src/shared/types/index.ts)
- **问题**：`InternalAPIRequest.type` 缺少 `'tool_exec'`，但 Worker 端已实现该分支
- **操作**：在类型定义中补充 `'tool_exec'`

### 步骤 2：审查 WebToolExecutor 的本地执行问题
- **文件**：[integrations/toolExecutor.ts](server/src/master/integrations/toolExecutor.ts)
- **问题**：`executeBash()` 等方法直接在 Master 本地 spawn 子进程
- **操作**：确认该执行器是否仍在使用，如果使用则必须改为通过 WorkerToolExecutor 转发

### 步骤 3：评估路径 B（Agent 整体转发到 Worker）的可行性
- **文件**：[server/agentApi.ts](server/src/master/server/agentApi.ts)、[workerHandlers.ts](server/src/master/server/workerHandlers.ts)
- **问题**：Worker 端缺少 `agents/executor.ts` 模块
- **操作**：评估是否需要实现该模块，还是当前路径 A（工具级转发）已满足安全需求

### 步骤 4：确认当前路径 A 的安全性
- **分析**：当前路径 A 中，Agent 思考循环（LLM 调用）在 Master 端运行，但 LLM 调用本身不涉及文件/命令操作，不构成安全风险
- **真正危险的操作**（Bash、文件读写等）已通过 WorkerToolExecutor 正确转发到 Worker 沙箱
- **结论**：路径 A 在安全层面可能是可接受的，但需要确认 WebToolExecutor 是否绕过了转发机制

### 步骤 5：添加运行时验证日志
- **操作**：在 `workerToolExecutor.ts` 和 `toolRegistry.ts` 中添加日志，记录工具执行的路径（Worker vs 本地）
- **目的**：便于运行时验证工具是否真正在 Worker 中执行

---

## 📊 问题严重程度评估

| 问题 | 严重程度 | 是否违反架构铁律 | 修复优先级 |
|------|---------|-----------------|-----------|
| 类型定义缺少 `tool_exec` | 低 | 否 | P3 |
| WebToolExecutor 本地执行 Bash | **高** | **是** | P1 |
| Agent 思考循环在 Master | 中 | 是（但 LLM 调用本身无安全风险） | P2 |
| Worker 端 executor.ts 缺失 | 中 | 否（路径 B 未启用） | P2 |

---

## ✅ 验证标准

1. **类型完整性**：`InternalAPIRequest.type` 包含所有已实现的请求类型
2. **无本地危险操作**：Master 端不存在直接 spawn/执行 Bash 命令的代码路径
3. **工具转发覆盖**：所有危险工具（Bash/FileRead/FileWrite/FileEdit/Glob/Grep/PowerShell）都通过 WorkerToolExecutor 转发
4. **运行时验证**：通过日志确认工具执行确实发生在 Worker 容器内
