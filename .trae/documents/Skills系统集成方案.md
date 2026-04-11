# Skills系统集成方案

## 1. 背景分析

### 原项目（claw-code）Skills系统架构
原项目采用**Prompt-based Commands**架构，核心组件：

| 组件 | 路径 | 职责 |
|------|------|------|
| `commands.ts` | `src/commands.ts` | 导出 `getSkillToolCommands` (memoized)，统一入口 |
| `loadSkillsDir.ts` | `src/skills/loadSkillsDir.ts` | 核心加载器，解析 SKILL.md |
| `SkillTool.ts` | `src/tools/SkillTool/SkillTool.ts` | 工具实现，执行skills |
| `prompt.ts` | `src/tools/SkillTool/prompt.ts` | 生成skill描述prompt |
| `skillLoadedEvent.ts` | `src/utils/telemetry/skillLoadedEvent.ts` | Telemetry追踪 |

### 当前项目（claude-code-haha）现状
当前项目在 `server/src/integrations/` 有**独立实现**的skills系统，不兼容原项目架构。

## 2. 集成目标

1. **复用原项目** `src/skills/` 核心逻辑
2. **适配Server环境**：将原项目的Node.js/Bun环境代码适配到Express server
3. **Agent集成**：在agent系统中支持skill执行
4. **MCP支持**：保留原项目的MCP skills支持
5. **兼容性**：保留现有 `skillLoader.ts`/`skillRegistry.ts` 作为兼容层

## 3. 集成方案

### 3.1 创建适配层 `server/src/integrations/skillsAdapter.ts`

**职责**：适配原项目 `loadSkillsDir.ts` 到Server环境

```typescript
// 核心功能
- 复用 loadSkillsDir.ts 的核心逻辑（parseFrontmatter, createSkillCommand等）
- 适配文件系统操作为server环境
- 支持 .claude/skills 和 .claude/commands 目录
- 实现 skill 缓存和动态加载
```

**需要从原项目引入的函数**：
- `parseSkillFrontmatterFields()`
- `createSkillCommand()`
- `loadSkillsFromSkillsDir()`
- `getSkillDirCommands()`
- `onDynamicSkillsLoaded()`

### 3.2 创建统一入口 `server/src/commands.ts`

**职责**：仿照原项目 `commands.ts`，提供统一导出

```typescript
// 导出
- getSkillToolCommands(cwd: string): Promise<Command[]>
- getMcpSkillCommands(): Command[]
- findCommand(name: string, commands: Command[]): Command | undefined
- clearSkillCaches()
```

### 3.3 创建Skill工具 `server/src/tools/skillTool.ts`

**职责**：在 `EnhancedToolExecutor` 中添加 SkillTool 支持

```typescript
// 功能
- skill: string - skill名称
- args?: string - 可选参数
- 支持 inline 和 fork 两种执行模式
- 复用原项目 SkillTool.ts 的验证和执行逻辑
```

### 3.4 集成到Agent系统

**修改文件**：
- `server/src/agents/taskDecomposer.ts` - 使用新的commands接口
- `server/src/routes/agentApi.ts` - 支持skill参数传递

**功能**：
- Agent启动时加载skills
- Task分解时考虑requiredSkills
- Skill执行结果注入到agent上下文

### 3.5 创建Skill执行服务 `server/src/services/skillExecutionService.ts`

**职责**：处理skill的inline/fork执行

```typescript
// 功能
- executeInlineSkill(command, args, context): Promise<SkillResult>
- executeForkedSkill(command, args, context): Promise<SkillResult>  // 启动子agent
- prepareSkillContext(command): SkillContext
```

### 3.6 保留兼容层

**现有文件保持不变**：
- `server/src/integrations/skillLoader.ts` - 简化版加载器（可选使用）
- `server/src/integrations/skillRegistry.ts` - Agent技能注册（可选使用）

## 4. 实施步骤

### Step 1: 创建适配层
1. 创建 `server/src/integrations/skillsAdapter.ts`
2. 从 `claw-code/src/skills/loadSkillsDir.ts` 复制必要代码
3. 适配 `parseFrontmatter`, `createSkillCommand` 等函数
4. 实现文件系统操作适配

### Step 2: 创建统一入口
1. 创建 `server/src/commands.ts`
2. 实现 `getSkillToolCommands()` (带缓存)
3. 实现 `getMcpSkillCommands()`
4. 实现 `findCommand()` 辅助函数

### Step 3: 创建SkillTool
1. 创建 `server/src/tools/skillTool.ts`
2. 实现 `executeSkill()` 核心逻辑
3. 支持参数替换和shell命令执行
4. 集成到 `EnhancedToolExecutor`

### Step 4: 集成到Agent
1. 修改 `taskDecomposer.ts` 使用新commands接口
2. 修改 `agentApi.ts` 支持skill参数
3. 在 `builtInAgents.ts` 中添加skill加载

### Step 5: 创建执行服务
1. 创建 `skillExecutionService.ts`
2. 实现inline执行（直接展开skill内容）
3. 实现fork执行（启动子agent）

### Step 6: 测试验证
1. 测试skill加载（.claude/skills）
2. 测试skill执行（inline/fork）
3. 测试Agent集成

## 5. 技术要点

### 5.1 Frontmatter解析
原项目使用自定义 `parseFrontmatter()`，需要适配或复用：
```yaml
---
name: skill-name
description: Skill描述
allowed-tools: [Read, Edit, ...]
whenToUse: 使用时机
model: opus
effort: medium
---
```

### 5.2 参数替换
Skill内容支持 `$ARGUMENTS` 替换：
```markdown
请帮我 $ARGUMENTS
```

### 5.3 Shell命令执行
Skill内容支持 `!command` 语法执行shell命令

### 5.4 Conditional Skills
支持 `paths` frontmatter，匹配文件时自动激活

## 6. 文件变更清单

| 操作 | 文件路径 |
|------|----------|
| 新建 | `server/src/integrations/skillsAdapter.ts` |
| 新建 | `server/src/commands.ts` |
| 新建 | `server/src/tools/skillTool.ts` |
| 新建 | `server/src/services/skillExecutionService.ts` |
| 修改 | `server/src/integration/enhancedToolExecutor.ts` |
| 修改 | `server/src/agents/taskDecomposer.ts` |
| 修改 | `server/src/routes/agentApi.ts` |
| 修改 | `server/src/agents/builtInAgents.ts` |

## 7. 风险与注意事项

1. **环境差异**：原项目使用Bun，部分API可能需要适配
2. **路径处理**：Windows路径分隔符需要正确处理
3. **MCP依赖**：MCP skill依赖MCP服务器连接，需要处理
4. **性能**：大量skill加载可能影响启动性能，需要缓存
