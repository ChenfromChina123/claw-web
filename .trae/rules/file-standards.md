/**
 * 项目代码规范 - 文件组织与大小限制
 *
 * 目的：防止 God Class/大文件问题，提升代码可维护性
 *
 * 核心原则：
 * - 单一职责原则：每个文件只负责一个明确的功能领域
 * - 文件大小限制：严格控制单文件行数
 * - 模块化设计：大功能必须拆分为多个子模块
 *
 * 强制执行时间：2026-04-18 起
 */

## 📏 **文件大小硬性限制**

### **绝对上限（禁止违反）**
```
❌ 单个 TypeScript 文件不得超过 500 行
⚠️ 建议控制在 300 行以内
✅ 最佳实践：200-300 行
```

### **违规处理**
- **CI/CD 检查**: 自动拒绝超过 500 行的 PR
- **Code Review**: 必须说明为何需要 > 400 行
- **技术债务标记**: 超过 400 行的文件必须标注 TODO: REFACTOR

---

## 🎯 **模块化拆分标准**

### **何时必须拆分**
当文件满足以下任一条件时，**必须**立即拆分：

1. **📏 行数超标**
   - 超过 400 行 → 应该考虑拆分
   - 超过 500 行 → **必须拆分**

2. **🔀 职责过多**（单一职责原则违反）
   - 包含 3 个及以上独立功能模块
   - 例如：同时包含"类型定义 + 业务逻辑 + 工具函数"

3. **📦 可独立测试的部分**
   - 如果某段逻辑可以独立编写单元测试
   - 说明它应该被提取为单独模块

4. **🔄 循环依赖风险**
   - 多个类/函数之间相互引用复杂
   - 需要通过接口抽象解耦

---

## 📐 **推荐的文件结构模式**

### **模式 1: 主协调器 + 子模块（推荐用于大型功能）**

```
feature/
├── index.ts              # 主协调器 (~200-300 行)
├── types.ts              # 类型定义 (~100-200 行)
├── core/
│   ├── moduleA.ts        # 功能模块 A (~200-300 行)
│   ├── moduleB.ts        # 功能模块 B (~200-300 行)
│   └── moduleC.ts        # 功能模块 C (~200-300 行)
└── utils/
    └── helpers.ts        # 辅助函数 (~150-200 行)
```

**适用场景**:
- ✅ 容器编排系统 (containerOrchestrator)
- ✅ 工具执行引擎 (enhancedToolExecutor)
- ✅ WebSocket 通信桥接 (wsBridge)

### **模式 2: 按职责分层**

```
module/
├── types.ts              # 接口与类型
├── service.ts            # 业务逻辑层
├── repository.ts         # 数据访问层
├── validator.ts          # 验证逻辑
└── constants.ts          # 常量配置
```

**适用场景**:
- ✅ 用户管理系统
- ✅ 会话管理器
- ✅ 数据库 Repository

### **模式 3: 按功能域垂直拆分**

```
tools/
├── fileTools.ts          # 文件操作工具集
├── shellTools.ts         # Shell 执行工具集
├── webTools.ts           # Web 相关工具集
└── agentTools.ts         # Agent 管理工具集
```

**适用场景**:
- ✅ 工具注册中心
- ✅ 路由处理器集合
- ✅ 中间件组

---

## 🚫 **禁止的反模式（Anti-Patterns）**

### ❌ **God Class / God File**
```typescript
// 错误示例：一个文件包含所有功能
class EverythingManager {
  // 500+ 行代码，混合了：
  // - 数据库操作
  // - HTTP 请求处理
  // - 文件 I/O
  // - 业务逻辑
  // - 缓存管理
}
```

### ❌ **Utility Dump（工具函数垃圾场）**
```typescript
// 错误示例：所有辅助函数堆在一个文件
export function helper1() { /* ... */ }
export function helper2() { /* ... */ }
// ... 50+ 个不相关的函数
export function helper50() { /* ... */ }
```

### ❌ **Copy-Paste 编程**
```typescript
// 错误示例：在多个文件中重复相同逻辑
// file1.ts
function validateUser(user) { /* 20 行验证逻辑 */ }

// file2.ts  
function validateUser(user) { /* 相同的 20 行逻辑 */ }

// 正确做法：提取到 shared/validation.ts
```

---

## ✅ **最佳实践清单**

### **新文件创建前检查**
- [ ] 这个文件的**唯一职责**是什么？（用一句话描述）
- [ ] 预计会超过 **300 行** 吗？如果是，提前规划拆分
- [ ] 是否可以复用已有的**类型定义或工具模块**？
- [ ] 文件名是否清晰表达了它的**职责**？

### **代码审查时检查**
- [ ] 文件行数是否 < 400 行？(强制)
- [ ] 是否遵循了**单一职责原则**？
- [ ] 导入依赖是否合理（< 10 个 import）？
- [ ] 函数/方法数量是否合理（< 15 个）？

---

## 🔧 **自动化检查工具配置**

### **ESLint 规则（推荐添加到 .eslintrc.js）**
```javascript
{
  "rules": {
    // 文件复杂度限制
    "max-lines-per-function": ["error", { "max": 50, "skipBlankLines": true }],
    "max-lines": ["warn", { "max": 450, "skipComments": true }],
    
    // 圈复杂度限制
    "complexity": ["error", { "max": 10 }],
    
    // 参数数量限制
    "max-params": ["error", { "max": 5 }]
  }
}
```

### **Pre-commit Hook（使用 husky + lint-staged）**
```json
{
  "*.ts": [
    "eslint --max-warnings=0",
    "tsc --noEmit"
  ]
}
```

---

## 📊 **项目当前状态监控**

### **已识别的大文件（需尽快处理）**

| 文件 | 当前行数 | 目标行数 | 状态 |
|------|---------|---------|------|
| `integration/enhancedToolExecutor.ts` | 1900 | < 400 | ✅ 已拆分 |
| `integrations/toolRegistry.ts` | 1198 | < 400 | ⏳ 待拆分 |
| `server/httpServer.ts` | 1116 | < 400 | ⏳ 待拆分 |
| `integration/wsBridge.ts` | 1115 | < 400 | ⏳ 计划中 |

### **拆分进度跟踪**
- ✅ **已完成**: containerOrchestrator.ts (2124→486 行, 减少 77%)
- ✅ **已完成**: enhancedToolExecutor.ts (1900→376 行, 减少 80%)
- ⏳ **进行中**: toolRegistry.ts, httpServer.ts
- 📋 **计划中**: wsBridge.ts, cliToolLoader.ts 等 8 个文件

---

## 🎓 **培训与指导**

### **新人入职必读**
1. 阅读本规范文档
2. 学习成功的拆分案例（containerOrchestrator.ts 重构）
3. 理解模块化设计的优势
4. 掌握 ESLint 配置和自动化检查

### **Code Review 模板**
```markdown
## 文件大小检查
- [ ] 新增文件行数 < 400 行?
- [ ] 是否符合单一职责原则?

## 模块化评估
- [ ] 是否需要进一步拆分?
- [ ] 依赖关系是否清晰?
```

---

## 📞 **违规报告与改进建议**

### **发现大文件时**
1. **不要直接修改** - 先分析职责边界
2. **制定拆分计划** - 参考本文档的模式
3. **渐进式重构** - 分阶段实施，每阶段可独立测试
4. **更新本文档** - 将经验教训补充进来

### **寻求帮助**
- 查看 `containerOrchestrator.ts` 的重构案例作为参考
- 咨询资深开发者获取拆分建议
- 使用 AI 辅助工具分析代码结构

---

## 🔄 **版本历史**

| 版本 | 日期 | 更新内容 |
|------|------|----------|
| v1.0 | 2026-04-18 | 初始版本，基于 containerOrchestrator.ts 和 enhancedToolExecutor.ts 的成功重构经验 |

---

**最后更新**: 2026-04-18  
**维护者**: AI Assistant  
**下次审查**: 2026-07-18（3个月后）

> 💡 **记住**: 小文件 = 高可维护性 = 快速开发 = 少 Bug  
> 🎯 **目标**: 所有文件 < 400 行，理想状态 < 300 行
