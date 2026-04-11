# 规则注入功能说明

## 概述

规则注入器（RuleInjector）自动将用户规则和项目规则注入到 Agent 的系统提示词中，确保 AI 助手始终遵守所有约束和指导原则。

## 功能特性

### 1. 自动规则加载

**用户规则（全局规则）**
- 位置：`~/.trae/rules/*.md`
- 适用于所有项目
- 优先级最高

**项目规则**
- 位置：`{projectRoot}/.trae/rules/*.md`
- 仅适用于当前项目
- 优先级次之

### 2. 智能缓存机制

- 规则加载后会自动缓存 5 秒
- 避免频繁读取文件系统
- 支持手动清除缓存

### 3. 上下文压缩后重新注入

当系统自动压缩上下文时，规则会自动重新注入到系统提示中，确保：
- 规则始终存在于上下文中
- AI 不会因为上下文压缩而遗忘约束
- 持续遵守所有指导原则

### 4. 变更检测

- 通过文件最后修改时间检测规则变更
- 规则变更时自动重新加载
- 避免不必要的重复注入

## 使用方法

### 在系统提示中使用

```typescript
import { buildCompleteSystemPrompt } from './prompts/contextBuilder'

// 构建包含规则的系统提示
const systemPrompt = await buildCompleteSystemPrompt({
  cwd: process.cwd(),
  modelId: 'qwen-plus',
  injectRules: true, // 启用规则注入（默认开启）
})
```

### 手动管理规则

```typescript
import { ruleInjector } from './services/ruleInjector'

// 加载规则
const result = await ruleInjector.loadRules(cwd)

// 构建规则注入字符串
const rulesInjection = await ruleInjector.buildRulesInjection(cwd)

// 检查是否需要重新注入
const needsReinject = await ruleInjector.needsReInjection(cwd)

// 清除缓存
ruleInjector.clearCache()
```

## 规则文件格式

规则文件应该是 Markdown 格式（`.md`），内容应该清晰、简洁。

### 示例：用户规则

```markdown
# ~/.trae/rules/ai-pro.md

1. 本项目是基于 claw-web\src 这个项目开发的，请你在修改代码之前务必参考 claw-web\src 的代码规范和注释。
2. 出现网络问题，请你使用代理端口 9674 访问互联网。
3. 本项目的项目名称是 claw-web，不是 claw-web，遇到命名或者看到之前的 claw-web，请做好重新命名。
```

### 示例：项目规则

```markdown
# {projectRoot}/.trae/rules/coding-standards.md

## 代码规范

- 使用 TypeScript 严格模式
- 所有函数必须添加 JSDoc 注释
- 遵循 ESLint 配置
- 单元测试覆盖率不低于 80%
```

## 注入位置

规则会被注入到系统提示的以下位置：

```
1. 简介部分（静态）
2. 系统规则部分（静态）
3. 任务执行指南（静态）
4. 操作谨慎性（静态）
5. 语调和风格（静态）
6. === 动态边界 ===
7. 会话特定指导（动态）
8. **规则与约束** ← 规则注入位置
9. 环境信息（动态）
10. MCP 指令（动态）
```

## 系统提示中的规则说明

当规则被成功注入时，系统提示中会包含以下说明：

```
# 规则与约束
你必须严格遵守以下规则：

# 用户规则（全局规则）
以下规则来自用户主目录，适用于所有项目：

## ai-pro
[规则内容...]

# 项目规则
以下规则来自当前项目的 .trae/rules 目录：

## coding-standards
[规则内容...]

**重要说明**: 这些规则已永久注入到你的系统提示中。当系统自动压缩上下文时，这些规则会自动重新注入，确保你始终遵守所有约束。
```

## 调试与监控

### 查看规则加载日志

```typescript
// 启用详细日志
const stats = ruleInjector.getRuleStats()
console.log('规则统计:', stats)
// 输出：
// {
//   userRules: 2,
//   projectRules: 3,
//   totalRules: 5,
//   cacheSize: 5
// }
```

### 常见问题排查

1. **规则未加载**
   - 检查规则文件路径是否正确
   - 确认文件扩展名为 `.md`
   - 检查文件内容是否为空

2. **规则未注入**
   - 确认 `injectRules: true` 参数已设置
   - 查看日志中是否有 "已注入规则到系统提示" 的消息
   - 检查系统提示中是否包含 "规则与约束" 部分

3. **缓存问题**
   - 使用 `ruleInjector.clearCache()` 清除缓存
   - 等待 5 秒缓存自动过期
   - 修改规则文件触发重新加载

## 性能优化建议

1. **规则文件数量**
   - 建议用户规则不超过 5 个
   - 项目规则不超过 10 个
   - 单个文件大小不超过 10KB

2. **缓存策略**
   - 默认缓存 5 秒，适用于大多数场景
   - 如需调整，修改 `cacheExpirationMs` 属性

3. **避免频繁调用**
   - `buildRulesInjection` 会自动管理缓存
   - 无需手动预加载规则

## API 参考

### RuleInjector 类

#### 方法

- `loadRules(cwd?: string): Promise<RuleLoadResult>` - 加载所有规则
- `buildRulesInjection(cwd?: string): Promise<string>` - 构建规则注入字符串
- `needsReInjection(cwd?: string): Promise<boolean>` - 检查是否需要重新注入
- `clearCache(): void` - 清除缓存
- `getRuleStats(): object` - 获取规则统计信息

#### 属性

- `ruleCache: Map<string, RuleItem>` - 规则缓存（私有）
- `cacheExpirationMs: number` - 缓存过期时间（私有）

### RuleItem 接口

```typescript
interface RuleItem {
  type: RuleType          // 规则类型
  filePath: string        // 文件路径
  content: string         // 规则内容
  name: string            // 规则名称
  lastModified: Date      // 最后修改时间
}
```

### RuleLoadResult 接口

```typescript
interface RuleLoadResult {
  userRules: RuleItem[]   // 用户规则列表
  projectRules: RuleItem[] // 项目规则列表
  totalRules: number      // 总规则数
  errors: string[]        // 加载错误
}
```

## 总结

规则注入器提供了强大的规则管理能力，确保 AI 助手始终遵守用户和项目的约束。通过自动加载、智能缓存和压缩后重新注入等机制，实现了无缝的规则集成体验。
