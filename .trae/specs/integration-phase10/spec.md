# 集成工作台完善 Spec (Phase 10)

## Why
当前集成工作台已具备基本框架（工具/MCP/文件/监控四个 Tab），但缺少关键的可视化功能：
1. 无法直观看到系统各组件的健康状态
2. 工具执行过程是黑盒，用户不知道工具正在执行什么操作
3. MCP 服务器状态不够直观
4. 缺少技能发现和使用的便捷入口

这些缺失导致用户在调试和监控系统时效率低下，需要查看日志或手动测试才能了解系统状态。

## What Changes
- **新增集成诊断面板**：显示所有集成组件（ToolRegistry, MCPBridge, CLIToolLoader, SkillLoader 等）的健康状态
- **新增工具调用可视化**：实时显示工具执行流程，包括输入参数、执行中状态、输出结果
- **增强 MCP 服务器状态仪表盘**：实时显示连接状态、工具数量、最后心跳时间
- **新增技能市场界面**：浏览、搜索、一键启用/禁用技能

**BREAKING**: 无

## Impact
- Affected specs: 集成工作台、工具系统、MCP 集成、Skills 系统
- Affected code:
  - `web/src/views/IntegrationHub.vue` (主要修改)
  - `web/src/components/` (新增诊断面板组件)
  - `server/src/integration/performanceMonitor.ts` (扩展健康检查)
  - `server/src/integrations/toolRegistry.ts` (添加执行事件广播)
  - `server/src/index.ts` (新增诊断 API 端点)

## ADDED Requirements

### Requirement: 集成诊断面板
系统 SHALL 提供一个诊断面板，显示所有集成组件的实时健康状态。

#### Scenario: 用户打开集成工作台
- **WHEN** 用户导航到 `/integration` 页面
- **THEN** 诊断面板应该显示以下组件的状态：
  - ToolRegistry: 已注册工具数量、来源分布
  - MCPBridge: 连接的 MCP 服务器数量、活跃连接数
  - CLIToolLoader: 加载的 CLI 工具数量、最后扫描时间
  - SkillLoader: 已加载技能数量、技能类别分布
  - PerformanceMonitor: 内存使用率、CPU 使用率、WebSocket 连接数
- **AND** 每个组件状态用颜色标识（绿色=正常，黄色=警告，红色=错误）

### Requirement: 工具执行流程可视化
系统 SHALL 实时显示工具执行的完整流程。

#### Scenario: 工具开始执行
- **WHEN** 用户通过界面执行一个工具
- **THEN** 可视化工具应该显示：
  - 工具名称和图标
  - 执行开始时间
  - 输入参数（格式化显示）
  - 当前状态（执行中/成功/失败）
  - 执行耗时（实时更新）
  - 输出结果（支持折叠/展开）
- **AND** 对于流式工具，实时显示输出内容

#### Scenario: 工具执行失败
- **WHEN** 工具执行过程中发生错误
- **THEN** 可视化组件应该：
  - 立即更新状态为红色"失败"
  - 显示错误信息和堆栈跟踪（可折叠）
  - 提供"重试"按钮

### Requirement: MCP 服务器状态仪表盘
系统 SHALL 提供 MCP 服务器的详细状态信息。

#### Scenario: 查看 MCP 服务器状态
- **WHEN** 用户在 MCP 标签页查看服务器列表
- **THEN** 每个服务器卡片应该显示：
  - 服务器名称和描述
  - 连接状态（已连接/断开中/已断开）
  - 提供的工具数量
  - 最后心跳时间（相对时间，如"3 秒前"）
  - 平均响应时间
  - 启用/禁用切换开关
  - 测试连接按钮
  - 移除按钮

### Requirement: 技能市场界面
系统 SHALL 提供技能的浏览和发现界面。

#### Scenario: 浏览技能市场
- **WHEN** 用户在技能标签页浏览
- **THEN** 应该看到：
  - 按类别分组的技能列表
  - 每个技能的卡片显示：名称、描述、标签、作者、版本
  - 搜索框支持按名称/描述/标签搜索
  - 筛选器支持按类别筛选
  - 一键启用/禁用技能
  - 技能详情弹窗（完整内容预览）

### Requirement: 诊断 API 端点
系统 SHALL 提供获取系统健康状态的 REST API。

#### API: GET /api/diagnostics/health
- **响应格式**:
```json
{
  "success": true,
  "data": {
    "overall": "healthy",
    "components": {
      "toolRegistry": {
        "status": "healthy",
        "toolCount": 151,
        "sources": {
          "builtin": 10,
          "cli": 140,
          "mcp": 1,
          "custom": 0
        }
      },
      "mcpBridge": {
        "status": "healthy",
        "serverCount": 3,
        "activeConnections": 2
      },
      "cliToolLoader": {
        "status": "healthy",
        "loadedTools": 140,
        "lastScan": "2026-04-04T10:30:00Z"
      },
      "skillLoader": {
        "status": "healthy",
        "skillCount": 25,
        "categories": {
          "code": 10,
          "debug": 5,
          "productivity": 10
        }
      },
      "performanceMonitor": {
        "status": "healthy",
        "memoryUsage": "45%",
        "cpuUsage": "12%",
        "wsConnections": 5
      }
    },
    "timestamp": "2026-04-04T10:30:00Z"
  }
}
```

### Requirement: 工具执行事件广播
系统 SHALL 通过 WebSocket 广播工具执行的关键事件。

#### Event: tool.execution_started
- **触发时机**: 工具开始执行时
- **数据格式**:
```json
{
  "type": "event",
  "event": "tool.execution_started",
  "data": {
    "executionId": "uuid",
    "toolName": "Bash",
    "toolInput": {"command": "ls -la"},
    "userId": "user-uuid",
    "timestamp": "2026-04-04T10:30:00Z"
  }
}
```

#### Event: tool.execution_progress
- **触发时机**: 工具执行过程中（流式输出）
- **数据格式**:
```json
{
  "type": "event",
  "event": "tool.execution_progress",
  "data": {
    "executionId": "uuid",
    "output": "partial output",
    "isError": false,
    "timestamp": "2026-04-04T10:30:01Z"
  }
}
```

#### Event: tool.execution_completed
- **触发时机**: 工具执行完成时
- **数据格式**:
```json
{
  "type": "event",
  "event": "tool.execution_completed",
  "data": {
    "executionId": "uuid",
    "toolName": "Bash",
    "result": {"success": true, "output": "..."},
    "duration": 1234,
    "timestamp": "2026-04-04T10:30:02Z"
  }
}
```

#### Event: tool.execution_failed
- **触发时机**: 工具执行失败时
- **数据格式**:
```json
{
  "type": "event",
  "event": "tool.execution_failed",
  "data": {
    "executionId": "uuid",
    "toolName": "Bash",
    "error": {"message": "...", "stack": "..."},
    "duration": 567,
    "timestamp": "2026-04-04T10:30:02Z"
  }
}
```

## MODIFIED Requirements

### Requirement: IntegrationHub 页面结构
修改 `IntegrationHub.vue`，从单一 Tab 结构改为 Dashboard + Tab 结构：
- 顶部：诊断概览卡片（4-5 个关键指标）
- 中部：Tab 导航（工具/MCP/文件/监控/技能）
- 底部：当前 Tab 的详细内容

### Requirement: 监控面板 API 调用
修改 `MonitoringPanel.vue` 中的 API 调用，统一使用 axios 实例：
```typescript
// 修改前
const response = await fetch('/api/monitoring/stats')

// 修改后
const response = await apiClient.get('/monitoring/stats')
```

## REMOVED Requirements
无

## 技术实现要点

### 1. 诊断面板组件
- 新建 `DiagnosticPanel.vue` 组件
- 使用网格布局显示 5 个组件状态卡片
- 每个卡片包含图标、状态指示器、关键指标
- 支持自动刷新（每 5 秒）

### 2. 工具执行可视化
- 新建 `ToolExecutionFlow.vue` 组件
- 使用时间线（Timeline）展示执行流程
- 支持多个并发执行的并排显示
- 集成到 `ToolExecution.vue` 组件

### 3. MCP 状态仪表盘
- 增强现有 `MCPServers.vue` 组件
- 添加实时心跳显示（使用 WebSocket 事件）
- 添加响应时间图表（可选）

### 4. 技能市场
- 新建 `SkillMarket.vue` 组件
- 卡片网格布局
- 搜索和筛选功能
- 技能详情弹窗

### 5. 后端支持
- 扩展 `performanceMonitor.ts` 添加健康检查方法
- 在 `toolRegistry.ts` 中添加执行事件广播
- 新增 `/api/diagnostics/*` 路由
