# AgentSkills 模块分析与 Android 手动触发增强计划

## 一、分析结论

### 1. 后端 Skills 模块实现状态

**结论：后端 Skills 模块已完整实现，功能完备。**

| 层级 | 状态 | 说明 |
|------|------|------|
| 技能加载与注册 | ✅ 已实现 | `skillLoader.ts` + `skillRegistry.ts` + `skillsAdapter.ts` |
| 内置技能 | ✅ 10个 | debug, verify, simplify, batch, remember, stuck, lorem-ipsum, update-config, skillify, keybindings |
| HTTP API 路由 | ✅ 已实现 | `/api/skills` 列表/详情/启禁用/分类/统计/导入/验证 |
| MCP 工具集成 | ✅ 已实现 | `SkillTool` 注册到 `EnhancedToolExecutor`，Agent 可通过 `Skill` 工具调用 |
| Agent 类型映射 | ✅ 已实现 | `SkillRegistry.getSkillsForAgentType()` 按 Agent 类型分配技能 |
| 条件技能激活 | ✅ 已实现 | `activateConditionalSkillsForPaths()` 根据文件路径 glob 匹配自动激活 |
| 插件系统 | ✅ 已实现 | 插件可通过 `getSkills()` 注册技能 |

### 2. 自动触发机制分析

**结论：Skills 模块不支持关键词自动触发，而是采用 LLM 语义决策模式。**

触发方式：
- **`whenToUse` 语义注入**：每个技能定义包含 `whenToUse` 描述字段，被注入到 Agent 的系统提示词中，LLM 自主判断何时使用该技能
- **条件技能（paths 过滤）**：当用户打开的文件路径匹配技能的 `paths` glob 模式时自动激活
- **Agent 类型映射**：根据 Agent 类型自动分配相关技能类别
- **显式 MCP 工具调用**：Agent 通过 `Skill` MCP 工具显式调用

**不存在关键词匹配或正则表达式触发机制。** 如需实现关键词自动触发，需要新增功能。

### 3. Android 应用当前状态

**结论：Android 端 Skills 功能几乎为零，仅有 UI 壳。**

| 组件 | 状态 | 说明 |
|------|------|------|
| "+" 按钮 | ❌ 仅文件上传 | 点击直接打开 `FilePickerDialog` |
| `ToolBottomSheet` | ⚠️ UI已实现但未接入 | 包含"添加技能"选项，但 `showBottomSheet` 从未被设为 true |
| `onAddSkillClick` | ❌ 空实现 | ChatScreen 中未传入实际回调 |
| Skills API 客户端 | ❌ 不存在 | `ApiService.kt` 中无任何 skill 方法 |
| Skills 数据模型 | ❌ 不存在 | 无 `SkillModels.kt` |
| Skills Repository | ❌ 不存在 | 无技能数据仓库 |

### 4. Web 前端参考实现

Web 端 IDE 变体已实现完整的 Skills 选择功能：
- `ChatInput.vue` 中通过 `NDropdown` + 芯片(Chip)方式选择技能
- 选择后以蓝色渐变芯片显示在输入框上方
- 发送时将技能引用拼接为 `### 使用 Skill: {name}\n{description}` 格式嵌入消息体
- `SkillMarket.vue` 提供完整的技能市场管理页面

---

## 二、实施计划

### 阶段 1：Android 端 "+" 按钮改造 — 接入 ToolBottomSheet

**目标**：将 "+" 按钮从直接打开文件选择器改为打开 ToolBottomSheet 工具面板。

**修改文件**：
- `chat_application/app/src/main/java/com/example/claw_code_application/ui/chat/ChatScreen.kt`

**具体步骤**：
1. 修改 `AddButton` 的 `onClick` 回调：从 `showFilePicker = true` 改为 `showBottomSheet = true`
2. 在 `ToolBottomSheet` 调用中传入 `onFileClick = { showFilePicker = true }` 回调，使文件上传功能通过工具面板中的"添加文件"入口触发
3. 传入 `onImageClick` 回调处理图片选择
4. 传入 `onAddSkillClick = { showSkillPicker = true }` 回调（新增状态）

### 阶段 2：新增 Skills 数据层

**目标**：建立 Android 端的 Skills API 客户端、数据模型和仓库。

**新建/修改文件**：
- `data/api/models/SkillModels.kt`（新建）— 技能数据模型
- `data/api/ApiService.kt`（修改）— 添加 Skills API 方法
- `data/repository/SkillRepository.kt`（新建）— 技能数据仓库

**SkillModels.kt 数据模型**：
```kotlin
data class SkillDefinition(
    val id: String,
    val name: String,
    val description: String,
    val category: SkillCategory,
    val tags: List<String>,
    val version: String,
    val author: String?,
    val filePath: String,
    val isEnabled: Boolean,
    val loadedAt: Long?
)

data class SkillCategory(
    val id: String,
    val name: String,
    val icon: String?,
    val description: String?
)

data class SkillListResponse(
    val skills: List<SkillDefinition>,
    val categories: List<SkillCategory>,
    val total: Int
)
```

**ApiService.kt 新增方法**：
```kotlin
@GET("api/skills")
suspend fun listSkills(@Query("category") category: String? = null): SkillListResponse

@GET("api/skills/{id}")
suspend fun getSkill(@Path("id") id: String): SkillDefinition

@POST("api/skills/{id}/toggle")
suspend fun toggleSkill(@Path("id") id: String): SkillDefinition
```

**SkillRepository.kt**：
- 封装 ApiService 调用
- 提供缓存机制（内存缓存 + 过期策略）
- 暴露 `getSkills()`、`getSkillDetail()`、`toggleSkill()` 方法

### 阶段 3：新增 Skills 选择 UI

**目标**：实现技能选择器界面，用户可浏览和选择技能附加到消息中。

**新建文件**：
- `ui/chat/components/SkillPickerSheet.kt`（新建）— 技能选择底部弹窗

**SkillPickerSheet 设计**：
- 底部弹窗（ModalBottomSheet）形式
- 顶部搜索栏
- 按类别分组的技能列表
- 每个技能项显示：名称、描述、启用状态
- 点击技能项 → 添加到已选列表 → 以芯片形式显示在输入框上方
- 已选技能芯片可移除

**修改文件**：
- `ui/chat/ChatScreen.kt`（修改）— 添加 `showSkillPicker` 状态和芯片展示
- `ui/chat/components/InputBar.kt`（修改）— 添加技能芯片显示区域

### 阶段 4：技能引用集成到消息发送

**目标**：将选中的技能引用嵌入到发送的消息中，与 Web 端保持一致。

**修改文件**：
- `viewmodel/ChatViewModel.kt`（修改）— 处理技能引用拼接
- `ui/chat/ChatScreen.kt`（修改）— 传递技能引用到发送逻辑

**消息格式**（与 Web 端一致）：
```
### 使用 Skill: {name}
{description}

{用户实际输入的消息}
```

### 阶段 5：验证与收尾

1. 端到端测试：点击 "+" → 打开工具面板 → 点击"添加技能" → 选择技能 → 芯片显示 → 发送消息 → 验证后端收到技能引用
2. 文件上传回归测试：通过工具面板中的"添加文件"入口上传文件
3. Git 提交

---

## 三、文件变更清单

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| 修改 | `chat_application/.../ui/chat/ChatScreen.kt` | "+" 按钮接入 ToolBottomSheet，添加技能选择状态和芯片展示 |
| 修改 | `chat_application/.../ui/chat/components/InputBar.kt` | 添加技能芯片显示区域 |
| 修改 | `chat_application/.../data/api/ApiService.kt` | 添加 Skills API 方法 |
| 新建 | `chat_application/.../data/api/models/SkillModels.kt` | 技能数据模型 |
| 新建 | `chat_application/.../data/repository/SkillRepository.kt` | 技能数据仓库 |
| 新建 | `chat_application/.../ui/chat/components/SkillPickerSheet.kt` | 技能选择底部弹窗 |

---

## 四、风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| "+" 按钮行为变更影响用户习惯 | 中 | ToolBottomSheet 中保留"添加文件"入口，操作路径仅增加一步 |
| Skills API 可能与后端不完全对齐 | 低 | 参考后端 `skills.routes.ts` 的实际接口定义 |
| 技能芯片占用输入框空间 | 低 | 限制最多选择 3 个技能，芯片可横向滚动 |
